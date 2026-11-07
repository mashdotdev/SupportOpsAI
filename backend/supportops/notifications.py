"""Owned Slack connector and transactional notification outbox. No model receives credentials."""
from datetime import datetime, timedelta, timezone
import re
from urllib.parse import urlsplit
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
import httpx

from .config import settings
from .db import transaction

PUBLIC_JOB = 'id,conversation_id,agent_id,agent_name,cycle,kind,mode,source,status,question,reason,attempts,error,created_at,updated_at'


def serialized(row):
    from .activity import serialize
    return serialize(row)


def cipher():
    settings().require('integration_encryption_key')
    try:
        return Fernet(settings().integration_encryption_key.encode())
    except (ValueError, TypeError):
        raise RuntimeError('INTEGRATION_ENCRYPTION_KEY must be a Fernet key. See backend setup instructions.') from None


def webhook_url(value):
    # Exact Slack endpoint only; credentials, queries, fragments, redirects and arbitrary hosts are forbidden.
    if not re.fullmatch(r'https://hooks\.slack\.com/services/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+', value):
        raise ValueError('Enter a Slack incoming webhook URL beginning https://hooks.slack.com/services/.')
    return value


def connection_public(row):
    if not row or not row['secret']:
        return None
    result = {key: row[key] for key in ('id', 'name', 'destination', 'enabled', 'version', 'verified_at',
                                       'last_sent_at', 'last_error', 'updated_at')}
    result['status'] = ('disabled' if not row['enabled'] else 'needs_attention' if row['last_error']
                        else 'verified' if row['verified_at'] else 'not_tested')
    result['webhook'] = 'https://hooks.slack.com/services/••••/••••/••••'
    return serialized(result)


def get_connection(user_id):
    with transaction() as connection:
        row = connection.execute('SELECT * FROM slack_connections WHERE user_id=%s', (user_id,)).fetchone()
    return {'connection': connection_public(row), 'available': bool(settings().integration_encryption_key)}


def emit(connection, job, kind):
    if job['conversation_id']:
        from .activity import emit as activity_emit
        activity_emit(connection, job['conversation_id'], job['user_id'], 'slack_' + kind)


def cancel_pending(connection, connection_id, reason):
    jobs = connection.execute("""UPDATE notification_jobs SET status='cancelled',error=%s,updated_at=now(),
        lease_token=NULL,lease_until=NULL WHERE connection_id=%s AND status IN ('queued','sending') RETURNING *""",
        (reason, connection_id)).fetchall()
    for job in jobs:
        connection.execute("""UPDATE notification_attempts SET status='cancelled',error=%s,completed_at=now()
            WHERE job_id=%s AND completed_at IS NULL""", (reason, job['id']))
        emit(connection, job, 'cancelled')


def save_connection(user_id, body):
    encrypted = cipher().encrypt(webhook_url(body.webhook_url).encode()).decode() if body.webhook_url else None
    with transaction() as connection:
        # Serialize first-time concurrent creates as well as replacements.
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ('slack:' + user_id,))
        previous = connection.execute('SELECT * FROM slack_connections WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()
        if not previous or not previous['secret']:
            if not encrypted:
                raise HTTPException(422, 'Enter a Slack webhook URL to connect.')
        if previous:
            if (previous['secret'] or body.version is not None) and body.version != previous['version']:
                raise HTTPException(409, 'Slack settings changed. Refresh before saving.')
            cancel_pending(connection, previous['id'], 'Connection settings changed before delivery.')
            row = connection.execute("""UPDATE slack_connections SET name=%s,destination=%s,
                secret=COALESCE(%s,secret),enabled=%s,version=version+1,
                verified_at=CASE WHEN %s THEN NULL ELSE verified_at END,
                last_error=CASE WHEN %s THEN NULL ELSE last_error END,updated_at=now()
                WHERE user_id=%s RETURNING *""", (body.name, body.destination, encrypted, body.enabled,
                encrypted is not None, encrypted is not None, user_id)).fetchone()
        else:
            row = connection.execute("""INSERT INTO slack_connections(user_id,name,destination,secret,enabled)
                VALUES (%s,%s,%s,%s,%s) RETURNING *""", (user_id, body.name, body.destination, encrypted, body.enabled)).fetchone()
    return {'connection': connection_public(row)}


def disconnect(user_id):
    with transaction() as connection:
        row = connection.execute('SELECT * FROM slack_connections WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()
        if row:
            cancel_pending(connection, row['id'], 'Slack disconnected before delivery.')
            connection.execute("""UPDATE slack_connections SET secret=NULL,enabled=false,version=version+1,
                verified_at=NULL,last_error=NULL,updated_at=now() WHERE id=%s""", (row['id'],))
    return {'connection': None}


def require_connection(connection, user_id):
    row = connection.execute('SELECT * FROM slack_connections WHERE user_id=%s FOR UPDATE', (user_id,)).fetchone()
    if not row or not row['enabled'] or not row['secret']:
        raise HTTPException(409, 'Connect and enable Slack before sending a notification.')
    cipher()
    return row


def insert_job(connection, destination, conversation, question, reason, mode, explicit=False):
    job = connection.execute("""INSERT INTO notification_jobs(user_id,connection_id,connection_version,
        conversation_id,agent_id,agent_name,cycle,kind,mode,source,status,question,reason,explicit_delivery)
        VALUES (%s,%s,%s,%s,%s,%s,%s,'escalation',%s,%s,%s,%s,%s,%s)
        ON CONFLICT (conversation_id,cycle,mode) WHERE kind='escalation' DO NOTHING RETURNING *""",
        (conversation['user_id'], destination['id'], destination['version'], conversation['id'],
         conversation['agent_id'], conversation['agent_name'], conversation['escalation_cycle'], mode,
         conversation['source'], 'simulated' if mode == 'simulation' else 'queued', question[:1000], reason[:500], explicit)).fetchone()
    if job:
        emit(connection, job, job['status'])
    else:
        job = connection.execute("""SELECT * FROM notification_jobs WHERE conversation_id=%s AND cycle=%s
            AND mode=%s AND kind='escalation'""", (conversation['id'], conversation['escalation_cycle'], mode)).fetchone()
        if explicit and job['status'] in {'failed', 'cancelled'}:
            job = connection.execute("""UPDATE notification_jobs SET status='queued',error=NULL,run_after=now(),
                connection_version=%s,explicit_delivery=true,max_attempts=attempts+3,updated_at=now()
                WHERE id=%s RETURNING *""", (destination['version'], job['id'])).fetchone()
            emit(connection, job, 'queued')
    return {key: serialized(job)[key] for key in PUBLIC_JOB.split(',')}


def enqueue_escalation(connection, conversation, question):
    """Called inside finish_turn's transaction: validated outcome and outbox commit together."""
    if not conversation['agent_id']:
        return
    agent = connection.execute('SELECT * FROM ai_agents WHERE id=%s AND user_id=%s',
                               (conversation['agent_id'], conversation['user_id'])).fetchone()
    if not agent or not agent['slack_notifications'] or agent['version'] != conversation['agent_version']:
        return
    destination = connection.execute('SELECT * FROM slack_connections WHERE user_id=%s FOR UPDATE',
                                     (conversation['user_id'],)).fetchone()
    if not destination or not destination['enabled'] or not destination['secret']:
        return
    mode = 'simulation' if conversation['source'] == 'test' and not agent['slack_test_delivery'] else 'delivery'
    insert_job(connection, destination, conversation, question,
               'Human assistance required under this agent’s escalation rules.', mode)


def notify_conversation(conversation_id, user_id, deliver=False):
    from .activity import owned
    with transaction() as connection:
        conversation = owned(connection, conversation_id, user_id, lock=True)
        if conversation['status'] != 'needs_attention':
            raise HTTPException(409, 'Only conversations needing attention can notify support.')
        destination = require_connection(connection, user_id)
        agent = connection.execute('SELECT slack_notifications FROM ai_agents WHERE id=%s AND user_id=%s',
                                   (conversation['agent_id'], user_id)).fetchone()
        if not agent or not agent['slack_notifications']:
            raise HTTPException(409, 'Enable Notify support team on this conversation’s agent first.')
        question = connection.execute('SELECT question FROM agent_turns WHERE conversation_id=%s ORDER BY created_at DESC,id DESC LIMIT 1',
                                      (conversation_id,)).fetchone()
        return {'job': insert_job(connection, destination, conversation,
                question['question'] if question else conversation['subject'],
                'Human assistance requested by the workspace owner.',
                'delivery' if conversation['source'] == 'live' or deliver else 'simulation',
                explicit=conversation['source'] == 'live' or deliver)}


def test_connection(user_id):
    with transaction() as connection:
        destination = require_connection(connection, user_id)
        existing = connection.execute("""SELECT * FROM notification_jobs WHERE connection_id=%s AND kind='connection_test'
            AND status IN ('queued','sending') LIMIT 1""", (destination['id'],)).fetchone()
        if not existing:
            existing = connection.execute("""INSERT INTO notification_jobs(user_id,connection_id,connection_version,
                agent_name,kind,mode,source,status,question,reason)
                VALUES (%s,%s,%s,'Connection test','connection_test','delivery','test','queued',
                'Slack connection test','Test notification requested by the workspace owner.') RETURNING *""",
                (user_id, destination['id'], destination['version'])).fetchone()
    return {'job': {key: serialized(existing)[key] for key in PUBLIC_JOB.split(',')}}


def history(user_id, page=1, search='', status=None, source=None):
    where, params = 'user_id=%s', [user_id]
    if search:
        where += " AND (question ILIKE %s ESCAPE '\\' OR agent_name ILIKE %s ESCAPE '\\')"
        pattern = '%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        params.extend([pattern, pattern])
    for column, value in [('status', status), ('source', source)]:
        if value:
            where += f' AND {column}=%s'
            params.append(value)
    with transaction() as connection:
        total = connection.execute(f'SELECT count(*) AS total FROM notification_jobs WHERE {where}', params).fetchone()['total']
        page = min(page, max(1, (total + 19) // 20))
        jobs = connection.execute(f'SELECT {PUBLIC_JOB} FROM notification_jobs WHERE {where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET %s',
                                  [*params, (page-1)*20]).fetchall()
        attempts = connection.execute("""SELECT a.* FROM notification_attempts a JOIN notification_jobs j ON j.id=a.job_id
            WHERE j.user_id=%s AND j.id=ANY(%s::uuid[]) ORDER BY a.number""", (user_id, [job['id'] for job in jobs])).fetchall()
        agents = connection.execute('SELECT id,name,slack_notifications,slack_test_delivery FROM ai_agents WHERE user_id=%s ORDER BY name', (user_id,)).fetchall()
    return {'jobs': list(map(serialized, jobs)), 'attempts': list(map(serialized, attempts)),
            'agents': list(map(serialized, agents)), 'total': total, 'page': page}


def preview(job):
    origin = settings().frontend_origin.rstrip('/')
    parsed = urlsplit(origin)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc or parsed.query or parsed.fragment:
        raise RuntimeError('Configure FRONTEND_ORIGIN as the application origin.')
    return {'agent': job['agent_name'], 'environment': 'TEST' if job['source'] == 'test' else 'LIVE',
            'problem': job['question'], 'reason': job['reason'],
            'url': f"{origin}/workspace?conversation={job['conversation_id']}" if job['conversation_id'] else None}


def slack_payload(job):
    data = preview(job)
    title = ('[TEST] ' if job['source'] == 'test' else '') + (
        'Slack connection test' if job['kind'] == 'connection_test' else 'Human assistance needed')
    # All customer content uses plain_text; no user-generated mentions, links or Slack markup.
    text = f"{title}\nAgent: {data['agent']}\nEnvironment: {data['environment']}\nProblem: {data['problem']}\nReason: {data['reason']}"
    blocks = [{'type': 'header', 'text': {'type': 'plain_text', 'text': title}},
              {'type': 'section', 'text': {'type': 'plain_text', 'text': text[:2900]}}]
    if data['url']:
        blocks.append({'type': 'actions', 'elements': [{'type': 'button', 'text': {'type': 'plain_text', 'text': 'Open conversation'}, 'url': data['url']}]})
    return {'text': title, 'blocks': blocks, 'unfurl_links': False, 'unfurl_media': False}


def recover_expired(connection):
    rows = connection.execute("""SELECT * FROM notification_jobs WHERE status='sending' AND lease_until < now()
        FOR UPDATE SKIP LOCKED""").fetchall()
    for job in rows:
        message = 'Worker interrupted; Slack may have received this notification. Check Slack before sending again.'
        connection.execute("UPDATE notification_jobs SET status='unknown',error=%s,updated_at=now(),lease_token=NULL,lease_until=NULL WHERE id=%s", (message, job['id']))
        connection.execute("UPDATE notification_attempts SET status='unknown',error=%s,completed_at=now() WHERE job_id=%s AND completed_at IS NULL", (message, job['id']))
        emit(connection, job, 'unknown')


def claim():
    with transaction() as connection:
        recover_expired(connection)
        job = connection.execute("""SELECT * FROM notification_jobs WHERE status='queued' AND run_after <= now()
            ORDER BY run_after,created_at FOR UPDATE SKIP LOCKED LIMIT 1""").fetchone()
        if not job:
            return None
        token = uuid4()
        job = connection.execute("""UPDATE notification_jobs SET status='sending',lease_token=%s,
            lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=%s RETURNING *""", (token, job['id'])).fetchone()
        return job


def send_http(url, payload):
    # No ambient proxies, HTTP logging of secrets, redirects, or hidden network retries.
    with httpx.Client(timeout=httpx.Timeout(8, connect=4), follow_redirects=False, trust_env=False) as client:
        return client.post(url, json=payload)


def deliver(job):
    """One bounded request. Connection lock serializes sends and configuration revocation."""
    # Commit attempt intent before the external side effect. A crash becomes unknown, never a blind retry.
    with transaction() as connection:
        current = connection.execute('SELECT * FROM notification_jobs WHERE id=%s FOR UPDATE', (job['id'],)).fetchone()
        if not current or current['status'] != 'sending' or current['lease_token'] != job['lease_token']:
            return
        number = current['attempts'] + 1
        connection.execute('UPDATE notification_jobs SET attempts=%s WHERE id=%s', (number, job['id']))
        connection.execute("INSERT INTO notification_attempts(job_id,number,status) VALUES (%s,%s,'sending')", (job['id'], number))
    with transaction() as connection:
        destination = connection.execute('SELECT * FROM slack_connections WHERE id=%s AND user_id=%s FOR UPDATE',
                                         (job['connection_id'], job['user_id'])).fetchone()
        current = connection.execute('SELECT * FROM notification_jobs WHERE id=%s FOR UPDATE', (job['id'],)).fetchone()
        if not current or current['status'] != 'sending' or current['lease_token'] != job['lease_token']:
            return
        status, error, code, delay = 'cancelled', None, None, 0
        valid = destination and destination['enabled'] and destination['secret'] and destination['version'] == job['connection_version']
        if valid and job['kind'] == 'escalation':
            # Lock permission during dispatch; revocation waits for the bounded in-flight send.
            agent = connection.execute('SELECT * FROM ai_agents WHERE id=%s AND user_id=%s FOR SHARE', (job['agent_id'], job['user_id'])).fetchone()
            conversation = connection.execute('SELECT status,escalation_cycle FROM agent_conversations WHERE id=%s AND user_id=%s',
                                               (job['conversation_id'], job['user_id'])).fetchone()
            valid = bool(agent and agent['slack_notifications'] and conversation
                         and (job['source'] != 'test' or job['explicit_delivery'] or agent['slack_test_delivery'])
                         and conversation['status'] == 'needs_attention' and conversation['escalation_cycle'] == job['cycle'])
        if not valid:
            error = 'Connection, agent permission, or conversation changed before delivery.'
        elif destination['next_send_at'] > datetime.now(timezone.utc):
            status, delay = 'queued', max(1, (destination['next_send_at']-datetime.now(timezone.utc)).total_seconds())
            error = 'Waiting for the Slack destination rate limit.'
        else:
            try:
                url = webhook_url(cipher().decrypt(destination['secret'].encode()).decode())
                response = send_http(url, slack_payload(job))
                code = response.status_code
                if code == 200 and response.text.strip() == 'ok':
                    status = 'sent'
                elif code == 429:
                    status = 'queued' if number < current['max_attempts'] else 'failed'
                    try:
                        delay = max(1, min(86400, int(response.headers.get('Retry-After', '30'))))
                    except ValueError:
                        delay = 30
                    error = 'Slack rate limit reached.'
                elif code >= 500:
                    status, error = 'unknown', 'Slack returned a server error; delivery could not be confirmed. Check Slack.'
                else:
                    status, error = 'failed', f'Slack rejected the notification (HTTP {code}). Check or replace the webhook.'
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
                status, delay, error = ('queued' if number < current['max_attempts'] else 'failed'), 5 * 2 ** min(number, 3), 'Could not connect to Slack.'
            except httpx.RequestError:
                status, error = 'unknown', 'Slack delivery could not be confirmed. Check Slack before sending again.'
            except (InvalidToken, ValueError, RuntimeError):
                status, error = 'failed', 'Slack credential or application origin is invalid. Check backend configuration and replace the webhook.'
            connection.execute("UPDATE slack_connections SET next_send_at=now()+(%s * interval '1 second') WHERE id=%s", (max(1, delay), destination['id']))
        connection.execute("""UPDATE notification_jobs SET status=%s,error=%s,run_after=now()+(%s * interval '1 second'),
            updated_at=now(),lease_until=NULL,lease_token=NULL WHERE id=%s""", (status, error, delay, job['id']))
        connection.execute("""UPDATE notification_attempts SET status=%s,http_status=%s,error=%s,completed_at=now()
            WHERE job_id=%s AND number=%s""", ('deferred' if status == 'queued' else status, code, error, job['id'], number))
        if status == 'sent':
            connection.execute("""UPDATE slack_connections SET last_sent_at=now(),last_error=NULL,
                verified_at=CASE WHEN %s THEN now() ELSE verified_at END WHERE id=%s""", (job['kind'] == 'connection_test', destination['id']))
        elif status in {'failed', 'unknown'}:
            connection.execute('UPDATE slack_connections SET last_error=%s WHERE id=%s', (error, destination['id']))
        emit(connection, job, status)


def run_once():
    job = claim()
    if not job:
        return False
    deliver(job)
    return True
