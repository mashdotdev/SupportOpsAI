"""Durable, owner-scoped conversation history and dashboard aggregates."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from .config import settings
from .db import transaction


def serialize(row):
    return {key: value.isoformat() if isinstance(value, datetime) else str(value) if isinstance(value, UUID) else value
            for key, value in row.items() if key != 'user_id'}


def emit(connection, conversation_id, user_id, kind):
    connection.execute("INSERT INTO agent_activity_events (conversation_id,user_id,kind) VALUES (%s,%s,%s)",
                       (conversation_id, user_id, kind))


def owned(connection, conversation_id, user_id, lock=False):
    row = connection.execute("SELECT * FROM agent_conversations WHERE id=%s AND user_id=%s" +
                             (" FOR NO KEY UPDATE" if lock else ""), (conversation_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, 'Conversation not found.')
    return row


def start_turn(body, user_id, agent=None):
    """Only trusted server entry points choose source. Browser chat is always test."""
    conversation_id, turn_id = body.conversation_id, body.request_id
    agent_id = agent['id'] if agent else None
    version = agent['version'] if agent else None
    model_id = agent['model_id'] if agent else settings().openrouter_model
    with transaction() as connection:
        expire_stalled(connection, user_id)
        connection.execute("""INSERT INTO agent_conversations
            (id,user_id,source,agent_id,agent_name,agent_version,model_id,subject)
            VALUES (%s,%s,'test',%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
            (conversation_id, user_id, agent_id, agent['name'] if agent else 'Knowledge base playground',
             version, model_id, body.messages[-1].content[:200]))
        conversation = owned(connection, conversation_id, user_id, lock=True)
        if (str(conversation['agent_id'] or ''), conversation['agent_version'], conversation['model_id'], conversation['source']) != (
                str(agent_id or ''), version, model_id, 'test'):
            raise HTTPException(409, 'Start a new conversation to use a different agent or configuration.')
        previous = connection.execute('SELECT * FROM agent_turns WHERE id=%s', (turn_id,)).fetchone()
        if previous:
            if previous['user_id'] != user_id or str(previous['conversation_id']) != str(conversation_id):
                raise HTTPException(409, 'Request identifier already used.')
            if previous['question'] != body.messages[-1].content:
                raise HTTPException(409, 'Request identifier belongs to a different question.')
            if previous['status'] == 'completed':
                return serialize(previous)
            raise HTTPException(409, 'This request was already accepted. Retry with a new request identifier.')
        if conversation['status'] == 'resolved':
            raise HTTPException(409, 'Reopen this conversation or clear the chat before sending another message.')
        if connection.execute("SELECT id FROM agent_turns WHERE conversation_id=%s AND status='running'", (conversation_id,)).fetchone():
            raise HTTPException(409, 'An answer is already in progress for this conversation.')
        inserted = connection.execute('''INSERT INTO agent_turns (id,conversation_id,user_id,question)
            VALUES (%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING RETURNING id''',
            (turn_id, conversation_id, user_id, body.messages[-1].content)).fetchone()
        if not inserted:
            raise HTTPException(409, 'Request identifier already used.')
        connection.execute("UPDATE agent_conversations SET status='in_progress',reason=NULL,updated_at=now() WHERE id=%s", (conversation_id,))
        emit(connection, conversation_id, user_id, 'started')
    return None


def outcome(response_type):
    if response_type == 'answer':
        return 'answered', None
    if response_type == 'clarification':
        return 'needs_clarification', 'More customer information requested'
    if response_type in {'escalation', 'out_of_scope', 'insufficient_knowledge'}:
        return 'needs_attention', {
            'out_of_scope': 'Outside agent authority',
            'insufficient_knowledge': 'Insufficient knowledge',
            'escalation': 'Escalation rules or insufficient evidence',
        }[response_type]
    return 'answered', 'Greeting delivered; resolution unconfirmed'


def finish_turn(conversation_id, turn_id, user_id, *, text=None, citations=None,
                response_type=None, error=None, cancelled=False):
    with transaction() as connection:
        conversation = owned(connection, conversation_id, user_id, lock=True)
        status = 'cancelled' if cancelled else 'failed' if error else 'completed'
        changed = connection.execute("""UPDATE agent_turns SET answer=%s,citations=%s,response_type=%s,
            status=%s,error=%s,completed_at=now(),duration_ms=GREATEST(0,(EXTRACT(EPOCH FROM now()-created_at)*1000)::integer)
            WHERE id=%s AND conversation_id=%s AND user_id=%s AND status='running' RETURNING id""",
            (text, Jsonb(citations or []), response_type, status, error, turn_id, conversation_id, user_id)).fetchone()
        if not changed:
            return
        state, reason = ('inactive', error or 'Response cancelled') if status != 'completed' else outcome(response_type)
        connection.execute('UPDATE agent_conversations SET status=%s,reason=%s,updated_at=now() WHERE id=%s AND user_id=%s',
                           (state, reason, conversation_id, user_id))
        emit(connection, conversation_id, user_id, status)
        if status == 'completed' and response_type == 'escalation':
            from .notifications import enqueue_escalation
            question = connection.execute('SELECT question FROM agent_turns WHERE id=%s', (turn_id,)).fetchone()['question']
            enqueue_escalation(connection, conversation, question)


def expire_stalled(connection, user_id):
    # Recover crashed workers without holding a transaction during model requests.
    rows = connection.execute("""SELECT id FROM agent_conversations c WHERE user_id=%s AND EXISTS
        (SELECT 1 FROM agent_turns t WHERE t.conversation_id=c.id AND t.status='running'
        AND t.created_at < now()-interval '3 minutes') FOR UPDATE""", (user_id,)).fetchall()
    for row in rows:
        connection.execute("""UPDATE agent_turns SET status='failed',error='Response interrupted or timed out.',
            completed_at=now(),duration_ms=NULL WHERE conversation_id=%s AND status='running'""", (row['id'],))
        connection.execute("UPDATE agent_conversations SET status='inactive',reason='Response interrupted or timed out.',updated_at=now() WHERE id=%s", (row['id'],))
        emit(connection, row['id'], user_id, 'failed')


EFFECTIVE_STATUS = "CASE WHEN c.status IN ('answered','needs_clarification') AND c.updated_at < now()-interval '24 hours' THEN 'inactive' ELSE c.status END"


def snapshot(user_id, source='live', days=7, agent_id=None, search='', status=None, page=1, order='latest', tz_offset=0):
    # Browser supplies its current UTC offset, never ownership or outcomes.
    tz = timezone(timedelta(minutes=-tz_offset))
    now = datetime.now(tz)
    start = (now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days-1)).astimezone(timezone.utc)
    where = 'c.user_id=%s AND c.source=%s AND c.created_at >= %s'
    params = [user_id, source, start]
    if agent_id:
        where += ' AND c.agent_id=%s'
        params.append(agent_id)
    with transaction() as connection:
        expire_stalled(connection, user_id)
        # Shared filters keep cards, table and trend scoped to the same period.
        rows = connection.execute(f"""SELECT count(*)::integer AS conversations,
            count(*) FILTER (WHERE c.status='resolved')::integer AS resolved,
            count(*) FILTER (WHERE c.status='needs_attention')::integer AS needs_attention,
            count(*) FILTER (WHERE {EFFECTIVE_STATUS}='in_progress')::integer AS in_progress
            FROM agent_conversations c WHERE {where}""", params).fetchone()
        timing = connection.execute(f"""SELECT count(*) FILTER (WHERE t.status='failed')::integer AS failed_responses,
            count(*) FILTER (WHERE t.status='cancelled')::integer AS cancelled_responses
            FROM agent_turns t JOIN agent_conversations c ON c.id=t.conversation_id
            WHERE {where} AND t.status IN ('completed','failed','cancelled')""", params).fetchone()
        # Median uses completed responses only, excluding failures and cancellations.
        timing['median_response_ms'] = connection.execute(f"""SELECT percentile_cont(0.5)
            WITHIN GROUP (ORDER BY t.duration_ms) AS value FROM agent_turns t
            JOIN agent_conversations c ON c.id=t.conversation_id WHERE {where} AND t.status='completed'""", params).fetchone()['value']
        table_where, table_params = where, list(params)
        if search:
            table_where += " AND c.subject ILIKE %s ESCAPE '\\'"
            table_params.append('%' + search.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%')
        if status:
            table_where += f' AND {EFFECTIVE_STATUS}=%s'
            table_params.append(status)
        total = connection.execute(f'SELECT count(*) AS total FROM agent_conversations c WHERE {table_where}', table_params).fetchone()['total']
        page = min(page, max(1, (total + 19) // 20))
        direction = 'DESC' if order == 'latest' else 'ASC'
        conversations = connection.execute(f"""SELECT c.id,c.agent_id,c.agent_name,c.subject,
            {EFFECTIVE_STATUS} AS status,c.reason,c.updated_at,c.created_at,
            (SELECT j.status FROM notification_jobs j WHERE j.conversation_id=c.id AND j.cycle=c.escalation_cycle
             ORDER BY (j.mode='delivery') DESC,j.created_at DESC LIMIT 1) AS notification_status,
            (SELECT count(*)::integer FROM agent_turns t WHERE t.conversation_id=c.id AND t.status='failed') AS failed_responses
            FROM agent_conversations c WHERE {table_where} ORDER BY c.updated_at {direction},c.id {direction} LIMIT 20 OFFSET %s""",
            [*table_params, (page-1)*20]).fetchall()
        agents = connection.execute(f"""SELECT c.agent_id,c.agent_name,count(*)::integer AS conversations,
            count(*) FILTER (WHERE c.status='resolved')::integer AS resolved,
            count(*) FILTER (WHERE c.status='needs_attention')::integer AS needs_attention,
            count(*) FILTER (WHERE {EFFECTIVE_STATUS}='answered')::integer AS answered,
            (SELECT count(*)::integer FROM agent_turns t JOIN agent_conversations ac ON ac.id=t.conversation_id
             WHERE ac.user_id=c.user_id AND ac.source=%s AND ac.created_at >= %s
             AND ac.agent_id IS NOT DISTINCT FROM c.agent_id AND ac.agent_name=c.agent_name AND t.status='failed') AS failed_responses
            FROM agent_conversations c WHERE {where} GROUP BY c.user_id,c.agent_id,c.agent_name ORDER BY conversations DESC,c.agent_name""",
            [source, start, *params]).fetchall()
        trend = connection.execute(f"""SELECT (c.created_at AT TIME ZONE 'UTC' - %s * interval '1 minute')::date AS day,
            {EFFECTIVE_STATUS} AS status,count(*)::integer AS count FROM agent_conversations c
            WHERE {where} GROUP BY day,{EFFECTIVE_STATUS} ORDER BY day""", [tz_offset, *params]).fetchall()
        choices = connection.execute("""SELECT DISTINCT ON (agent_id) agent_id,agent_name FROM agent_conversations
            WHERE user_id=%s AND agent_id IS NOT NULL ORDER BY agent_id,updated_at DESC""", (user_id,)).fetchall()
        available = connection.execute('SELECT id AS agent_id,name AS agent_name FROM ai_agents WHERE user_id=%s', (user_id,)).fetchall()
        choices = {str(row['agent_id']): serialize(row) for row in [*choices, *available]}
    return {'metrics': {**rows, **timing}, 'conversations': list(map(serialize, conversations)),
            'agents': list(map(serialize, agents)), 'agent_choices': list(choices.values()),
            'trend': [{**row, 'day': str(row['day'])} for row in trend], 'total': total, 'page': page,
            'generated_at': datetime.now(timezone.utc).isoformat()}


def detail(conversation_id, user_id):
    with transaction() as connection:
        expire_stalled(connection, user_id)
        conversation = owned(connection, conversation_id, user_id)
        if (conversation['status'] in {'answered', 'needs_clarification'}
                and conversation['updated_at'] < datetime.now(timezone.utc) - timedelta(hours=24)):
            conversation['status'] = 'inactive'
        turns = connection.execute('SELECT * FROM agent_turns WHERE conversation_id=%s AND user_id=%s ORDER BY created_at,id',
                                   (conversation_id, user_id)).fetchall()
        events = connection.execute('SELECT kind,created_at FROM agent_activity_events WHERE conversation_id=%s AND user_id=%s ORDER BY id',
                                    (conversation_id, user_id)).fetchall()
        from .notifications import PUBLIC_JOB, preview
        jobs = connection.execute(f'SELECT {PUBLIC_JOB} FROM notification_jobs WHERE conversation_id=%s AND user_id=%s ORDER BY created_at DESC,id DESC',
                                  (conversation_id, user_id)).fetchall()
        destination = connection.execute('SELECT name,destination,enabled,secret IS NOT NULL AS connected FROM slack_connections WHERE user_id=%s', (user_id,)).fetchone()
        agent = connection.execute('SELECT slack_notifications FROM ai_agents WHERE id=%s AND user_id=%s', (conversation['agent_id'], user_id)).fetchone()
    return {'conversation': serialize(conversation), 'turns': list(map(serialize, turns)), 'events': list(map(serialize, events)),
            'notifications': [{**serialize(job), 'preview': preview(job)} for job in jobs],
            'can_notify': bool(agent and agent['slack_notifications'] and destination and destination['enabled'] and destination['connected']),
            'slack_destination': destination['destination'] if destination else None}


def set_resolution(conversation_id, user_id, resolved):
    with transaction() as connection:
        expire_stalled(connection, user_id)
        conversation = owned(connection, conversation_id, user_id, lock=True)
        if connection.execute("SELECT id FROM agent_turns WHERE conversation_id=%s AND status='running'", (conversation_id,)).fetchone():
            raise HTTPException(409, 'Wait for the current answer to finish.')
        state = 'resolved' if resolved else 'needs_attention'
        if conversation['status'] != state:
            if not resolved and conversation['status'] == 'resolved':
                connection.execute('UPDATE agent_conversations SET escalation_cycle=escalation_cycle+1 WHERE id=%s', (conversation_id,))
            connection.execute('UPDATE agent_conversations SET status=%s,reason=%s,updated_at=now() WHERE id=%s AND user_id=%s',
                (state, 'Resolution confirmed by workspace owner' if resolved else 'Reopened by workspace owner', conversation_id, user_id))
            emit(connection, conversation_id, user_id, 'resolved_by_owner' if resolved else 'reopened_by_owner')


def revision(user_id):
    with transaction() as connection:
        expire_stalled(connection, user_id)
        row = connection.execute('SELECT COALESCE(max(id),0) AS revision,count(*) AS count FROM agent_activity_events WHERE user_id=%s', (user_id,)).fetchone()
        # Count catches events committed out of identity-allocation order.
        return f"{row['revision']}:{row['count']}"
