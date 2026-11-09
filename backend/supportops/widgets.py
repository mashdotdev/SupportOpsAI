"""Published website channels and capability-scoped anonymous visitor sessions."""
import hashlib
import hmac
import ipaddress
import re
import secrets
from datetime import datetime, timezone
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from psycopg.types.json import Jsonb

from . import activity, agent_store
from .config import settings
from .db import transaction


def origin(value):
    try:
        parsed = urlsplit(value.strip())
        port = parsed.port
        host = (parsed.hostname or '').lower().encode('idna').decode()
        try:
            host = str(ipaddress.ip_address(host))
        except ValueError:
            if len(host) > 253 or not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*', host):
                raise ValueError()
        local = host in {'localhost', '127.0.0.1', '[::1]', '::1'}
        if (parsed.scheme not in {'https', 'http'} or (parsed.scheme == 'http' and not local)
                or not host or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {'', '/'} or '*' in value or any(c.isspace() for c in value)):
            raise ValueError()
        host = '[' + host + ']' if ':' in host else host
        suffix = f':{port}' if port and port != (443 if parsed.scheme == 'https' else 80) else ''
        return f'{parsed.scheme}://{host}{suffix}'
    except (ValueError, UnicodeError):
        raise ValueError('Use an exact HTTPS website origin, such as https://example.com. HTTP is allowed only for localhost.') from None


class WidgetInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    version: int = Field(ge=1)
    agent_id: UUID | None = None
    business_name: str = Field(default='Support', min_length=1, max_length=80)
    welcome_message: str = Field(default='Hi! How can we help you today?', min_length=1, max_length=500)
    color: str = Field(default='#0593c6', pattern=r'^#[0-9a-fA-F]{6}$')
    position: str = Field(default='right', pattern=r'^(left|right)$')
    suggested_questions: list[str] = Field(default_factory=list, max_length=4)
    allowed_origins: list[str] = Field(default_factory=list, max_length=20)
    document_ids: list[UUID] = Field(default_factory=list, max_length=200)
    privacy_url: str = Field(default='', max_length=1000)
    support_email: str = Field(default='', max_length=254)
    daily_message_limit: int = Field(default=30, ge=1, le=1000)

    @field_validator('allowed_origins')
    @classmethod
    def origins(cls, values):
        return list(dict.fromkeys(origin(value) for value in values))

    @field_validator('suggested_questions')
    @classmethod
    def questions(cls, values):
        if any(not item.strip() or len(item) > 150 for item in values):
            raise ValueError('Suggested questions must contain 1–150 characters.')
        return list(dict.fromkeys(item.strip() for item in values))

    @field_validator('privacy_url')
    @classmethod
    def privacy(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or any(c.isspace() for c in value):
                raise ValueError('Use an HTTPS privacy policy URL.')
        return value

    @field_validator('support_email')
    @classmethod
    def email(cls, value):
        if value and not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', value):
            raise ValueError('Enter a valid support email address.')
        return value


def ensure_widget(connection, user_id):
    connection.execute('INSERT INTO website_widgets (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING', (user_id,))
    return connection.execute('SELECT * FROM website_widgets WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()


def owner_get(user_id):
    with transaction() as connection:
        widget = ensure_widget(connection, user_id)
        revision = connection.execute('SELECT number,configuration,created_at FROM widget_revisions WHERE id=%s',
                                      (widget['published_revision_id'],)).fetchone()
        count = connection.execute("SELECT count(*) AS messages FROM agent_turns t JOIN agent_conversations c ON c.id=t.conversation_id WHERE c.user_id=%s AND c.widget_revision_id IS NOT NULL AND t.created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'", (user_id,)).fetchone()['messages']
    return {'widget': activity.serialize(widget), 'published': activity.serialize(revision) if revision else None,
            'today_messages': count}


def validate_knowledge(connection, draft, user_id, *, publishing=False):
    agent_id = draft.get('agent_id')
    if not agent_id:
        if publishing:
            raise HTTPException(422, 'Select an agent before publishing.')
        return None
    agent = agent_store.find(connection, agent_id, user_id)
    ids = list(dict.fromkeys(draft['document_ids']))
    agent_store.check_documents(connection, ids, user_id)
    if agent['knowledge_mode'] == 'selected' and not set(ids).issubset(set(agent['document_ids'])):
        raise HTTPException(422, 'Website knowledge must also be permitted for the selected agent.')
    if publishing:
        if not draft['allowed_origins'] or not draft['privacy_url']:
            raise HTTPException(422, 'Add an allowed website origin and a privacy policy URL before publishing.')
        if ids:
            ready = connection.execute("SELECT id FROM knowledge_documents WHERE user_id=%s AND id=ANY(%s::uuid[]) AND status='ready'", (user_id, ids)).fetchall()
            if len(ready) != len(ids):
                raise HTTPException(422, 'Wait until every approved document is Ready before publishing.')
    return agent


def save(user_id, body):
    draft = body.model_dump(mode='json', exclude={'version'})
    with transaction() as connection:
        widget = ensure_widget(connection, user_id)
        if widget['version'] != body.version:
            raise HTTPException(409, 'Widget settings changed. Reload before saving.')
        validate_knowledge(connection, draft, user_id)
        connection.execute('UPDATE website_widgets SET draft=%s,version=version+1,updated_at=now() WHERE id=%s',
                           (Jsonb(draft), widget['id']))
    return owner_get(user_id)


def publish(user_id, version):
    with transaction() as connection:
        widget = ensure_widget(connection, user_id)
        if version != widget['version']:
            raise HTTPException(409, 'Widget settings changed. Reload before publishing.')
        draft = WidgetInput(version=version, **widget['draft']).model_dump(mode='json', exclude={'version'})
        agent = validate_knowledge(connection, draft, user_id, publishing=True)
        # Serialize UUIDs/dates before storing the immutable configuration.
        snapshot = agent_store.serialize(agent)
        snapshot['document_ids'] = draft['document_ids']
        snapshot['knowledge_mode'] = 'selected'
        number = connection.execute('SELECT COALESCE(max(number),0)+1 AS number FROM widget_revisions WHERE widget_id=%s', (widget['id'],)).fetchone()['number']
        revision = connection.execute('INSERT INTO widget_revisions(widget_id,user_id,number,configuration,agent) VALUES (%s,%s,%s,%s,%s) RETURNING id',
                                      (widget['id'], user_id, number, Jsonb(draft), Jsonb(snapshot))).fetchone()
        connection.execute('UPDATE website_widgets SET enabled=true,published_revision_id=%s,version=version+1,updated_at=now() WHERE id=%s',
                           (revision['id'], widget['id']))
    return owner_get(user_id)


def pause(user_id, version):
    with transaction() as connection:
        widget = ensure_widget(connection, user_id)
        if version != widget['version']:
            raise HTTPException(409, 'Widget settings changed. Reload before pausing.')
        connection.execute('UPDATE website_widgets SET enabled=false,version=version+1,updated_at=now() WHERE id=%s', (widget['id'],))
    return owner_get(user_id)


def published(connection, widget_id, *, active=True):
    row = connection.execute('SELECT w.id,w.user_id,w.enabled,w.draft,w.published_revision_id,r.configuration FROM website_widgets w JOIN widget_revisions r ON r.id=w.published_revision_id WHERE w.id=%s', (widget_id,)).fetchone()
    if not row:
        raise HTTPException(404, 'This chat widget is unavailable.')
    if active and not row['enabled']:
        raise HTTPException(503, 'Chat is temporarily unavailable. Please try again later.')
    return row


def public_config(widget_id):
    with transaction() as connection:
        widget = published(connection, widget_id, active=False)
    allowed = {'business_name', 'welcome_message', 'color', 'position', 'suggested_questions', 'privacy_url', 'support_email', 'allowed_origins'}
    return {**{key: value for key, value in widget['configuration'].items() if key in allowed}, 'enabled': widget['enabled']}


def check_site(widget, site):
    try:
        normalized = origin(site)
    except ValueError:
        raise HTTPException(403, 'Website origin is not allowed.') from None
    # Removing a domain from the draft revokes it immediately; additions require publication.
    if normalized not in widget['configuration']['allowed_origins'] or normalized not in widget['draft'].get('allowed_origins', []):
        raise HTTPException(403, 'Website origin is not allowed.')
    return normalized


def limit(connection, bucket, maximum, seconds=60, weight=1):
    window = datetime.fromtimestamp(int(datetime.now(timezone.utc).timestamp()) // seconds * seconds, timezone.utc)
    row = connection.execute('''INSERT INTO widget_rate_limits(bucket,window_start,used) VALUES (%s,%s,%s)
        ON CONFLICT(bucket,window_start) DO UPDATE SET used=widget_rate_limits.used+EXCLUDED.used
        WHERE widget_rate_limits.used+EXCLUDED.used<=%s RETURNING used''', (bucket, window, weight, maximum)).fetchone()
    if not row or row['used'] > maximum:
        raise HTTPException(429, 'Chat is busy or its usage limit has been reached. Please try again later.', headers={'Retry-After': str(seconds)})
    connection.execute("DELETE FROM widget_rate_limits WHERE window_start < now()-interval '2 days'")


def ip_bucket(ip):
    return hmac.new(settings().backend_api_token.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def new_session(widget_id, site, ip):
    token, conversation_id = secrets.token_urlsafe(32), uuid4()
    with transaction() as connection:
        widget = published(connection, widget_id)
        site = check_site(widget, site)
        limit(connection, 'session-ip:' + ip_bucket(ip), 10)
        limit(connection, 'session-widget:' + str(widget_id), 200, 86400)
        revision = connection.execute('SELECT * FROM widget_revisions WHERE id=%s', (widget['published_revision_id'],)).fetchone()
        agent = revision['agent']
        agent_store.find(connection, agent['id'], widget['user_id'])
        connection.execute("""INSERT INTO agent_conversations(id,user_id,source,agent_id,agent_name,agent_version,model_id,subject,widget_revision_id,page_origin)
            VALUES (%s,%s,'live',%s,%s,%s,%s,'Website visitor',%s,%s)""",
            (conversation_id, widget['user_id'], agent['id'], agent['name'], agent['version'], agent['model_id'], revision['id'], site))
        connection.execute('INSERT INTO widget_sessions(widget_id,user_id,conversation_id,token_hash,site_origin) VALUES (%s,%s,%s,%s,%s)',
                           (widget_id, widget['user_id'], conversation_id, hashlib.sha256(token.encode()).hexdigest(), site))
        connection.execute('UPDATE website_widgets SET last_seen_at=now() WHERE id=%s', (widget_id,))
    return {'token': token, 'conversation_id': str(conversation_id)}


def session(connection, widget_id, token, site, *, lock=False):
    widget = published(connection, widget_id)
    site = check_site(widget, site)
    row = connection.execute('''SELECT s.*,c.widget_revision_id FROM widget_sessions s JOIN agent_conversations c ON c.id=s.conversation_id
        WHERE s.widget_id=%s AND s.token_hash=%s AND s.site_origin=%s AND s.expires_at>now()''',
        (widget_id, hashlib.sha256(token.encode()).hexdigest(), site)).fetchone()
    if not row:
        raise HTTPException(401, 'Your chat session has expired. Start a new conversation.')
    if lock:
        activity.owned(connection, row['conversation_id'], row['user_id'], lock=True)
    return row, widget


def public_state(widget_id, token, site):
    with transaction() as connection:
        row, _ = session(connection, widget_id, token, site)
        activity.expire_stalled(connection, row['user_id'])
        conversation = activity.owned(connection, row['conversation_id'], row['user_id'])
        turns = connection.execute('SELECT id,question,answer,status,response_type FROM agent_turns WHERE conversation_id=%s ORDER BY created_at DESC,id DESC LIMIT 100', (row['conversation_id'],)).fetchall()
        job = connection.execute("SELECT status FROM notification_jobs WHERE conversation_id=%s AND cycle=%s AND mode='delivery' ORDER BY created_at DESC LIMIT 1", (row['conversation_id'], conversation['escalation_cycle'])).fetchone()
    return {'conversation_id': str(row['conversation_id']), 'status': conversation['status'],
            'turns': [activity.serialize(turn) for turn in reversed(turns)], 'notification_status': job['status'] if job else None,
            'visitor_name': conversation['visitor_name'] or '', 'visitor_email': conversation['visitor_email'] or '',
            'feedback': conversation['customer_feedback']}


def document_scope(agent, user_id):
    with transaction() as connection:
        revision = connection.execute('SELECT widget_id,agent FROM widget_revisions WHERE id=%s AND user_id=%s', (agent['_widget_revision_id'], user_id)).fetchone()
        if not revision:
            raise ValueError('Chat configuration is unavailable.')
        widget = published(connection, revision['widget_id'])
        current = agent_store.find(connection, agent['id'], user_id)
        permitted = set(revision['agent']['document_ids']) & set(widget['draft'].get('document_ids', []))
        if current['knowledge_mode'] == 'selected':
            permitted &= set(current['document_ids'])
        return list(permitted)


def prepare(widget_id, token, site, body, ip):
    from .chat import ChatInput
    with transaction() as connection:
        row, widget = session(connection, widget_id, token, site)
        activity.expire_stalled(connection, row['user_id'])
        conversation = activity.owned(connection, row['conversation_id'], row['user_id'], lock=True)
        previous = connection.execute('SELECT * FROM agent_turns WHERE id=%s', (body.request_id,)).fetchone()
        if previous and (str(previous['conversation_id']) != str(row['conversation_id']) or previous['question'] != body.message):
            raise HTTPException(409, 'Request identifier already used.')
        if previous and previous['status'] == 'completed':
            return None, None, row['user_id'], activity.serialize(previous)
        if conversation['status'] in {'resolved', 'needs_attention'}:
            raise HTTPException(409, 'This conversation is closed or waiting for support. You can start a new conversation.')
        if connection.execute("SELECT id FROM agent_turns WHERE conversation_id=%s AND status='running'", (row['conversation_id'],)).fetchone():
            raise HTTPException(409, 'An answer is already in progress. Please wait.')
        turns = connection.execute("SELECT id,question,answer FROM agent_turns WHERE conversation_id=%s AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 6", (row['conversation_id'],)).fetchall()
        messages = []
        for turn in reversed(turns):
            messages.extend([{'role': 'user', 'content': turn['question']}, {'role': 'assistant', 'content': turn['answer'][:5000] or 'No answer available.'}])
        messages.append({'role': 'user', 'content': body.message})
        revision = connection.execute('SELECT agent FROM widget_revisions WHERE id=%s', (row['widget_revision_id'],)).fetchone()
        agent = {**revision['agent'], '_widget_revision_id': str(row['widget_revision_id'])}
        current = agent_store.find(connection, agent['id'], row['user_id'])
        agent['slack_notifications'] = agent['slack_notifications'] and current['slack_notifications']
        limit(connection, 'message-ip:' + ip_bucket(ip), 12)
        limit(connection, 'message-session:' + str(row['id']), 6)
        limit(connection, 'message-owner:' + row['user_id'], widget['draft'].get('daily_message_limit', 30), 86400)
        # At most three model requests per turn, including tool continuations.
        limit(connection, 'provider-minute', 18, weight=3)
        limit(connection, 'provider-day', settings().widget_daily_model_requests, 86400, weight=3)
        if previous:
            latest = connection.execute('SELECT id FROM agent_turns WHERE conversation_id=%s ORDER BY created_at DESC,id DESC LIMIT 1', (row['conversation_id'],)).fetchone()
            if latest['id'] != previous['id']:
                raise HTTPException(409, 'Only the most recent failed message can be retried.')
            connection.execute("UPDATE agent_turns SET status='running',answer=NULL,error=NULL,completed_at=NULL,created_at=now() WHERE id=%s", (body.request_id,))
        else:
            connection.execute('INSERT INTO agent_turns(id,conversation_id,user_id,question) VALUES (%s,%s,%s,%s)', (body.request_id, row['conversation_id'], row['user_id'], body.message))
        connection.execute("UPDATE agent_conversations SET status='in_progress',reason=NULL,subject=CASE WHEN subject='Website visitor' THEN %s ELSE subject END,updated_at=now() WHERE id=%s", (body.message[:200], row['conversation_id']))
        activity.emit(connection, row['conversation_id'], row['user_id'], 'started')
    return ChatInput(messages=messages, conversation_id=row['conversation_id'], request_id=body.request_id), agent, row['user_id'], None


def customer_action(widget_id, token, site, body):
    with transaction() as connection:
        row, _ = session(connection, widget_id, token, site, lock=True)
        conversation = activity.owned(connection, row['conversation_id'], row['user_id'])
        if connection.execute("SELECT id FROM agent_turns WHERE conversation_id=%s AND status='running'", (row['conversation_id'],)).fetchone():
            raise HTTPException(409, 'Please wait for the current answer to finish.')
        if body.action == 'contact':
            if conversation['status'] != 'needs_attention':
                raise HTTPException(409, 'Request support before providing follow-up details.')
            connection.execute('UPDATE agent_conversations SET visitor_name=%s,visitor_email=%s,updated_at=now() WHERE id=%s', (body.name or None, body.email or None, row['conversation_id']))
        elif body.action == 'helpful':
            if conversation['status'] != 'answered':
                raise HTTPException(409, 'Feedback is available after an answer.')
            connection.execute("UPDATE agent_conversations SET status='resolved',customer_feedback='helpful',reason='Customer confirmed the answer helped',updated_at=now() WHERE id=%s", (row['conversation_id'],))
        else:
            if conversation['status'] == 'resolved':
                raise HTTPException(409, 'Start a new conversation to request support.')
            connection.execute("UPDATE agent_conversations SET status='needs_attention',customer_feedback=%s,reason='Customer requested human support',updated_at=now() WHERE id=%s", ('unhelpful' if body.action == 'unhelpful' else None, row['conversation_id']))
            revision = connection.execute('SELECT agent FROM widget_revisions WHERE id=%s', (row['widget_revision_id'],)).fetchone()
            if revision['agent'].get('slack_notifications'):
                from .notifications import enqueue_escalation
                enqueue_escalation(connection, conversation, conversation['subject'])
        activity.emit(connection, row['conversation_id'], row['user_id'], 'customer_' + body.action)
    return public_state(widget_id, token, site)
