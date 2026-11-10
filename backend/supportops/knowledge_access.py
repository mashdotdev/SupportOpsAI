"""Fresh knowledge authorization with one SQL statement per read, never cached."""
import hashlib
from fastapi import HTTPException

from .db import read_connection
from . import agent_tracing


SAVED_SCOPE = """
    SELECT a.version, a.knowledge_mode, true AS agent_exists,
        ARRAY(SELECT ad.document_id::text FROM ai_agent_documents ad
              WHERE ad.agent_id=a.id AND ad.user_id=a.user_id ORDER BY ad.document_id) AS document_ids
    FROM ai_agents a WHERE a.id=%s AND a.user_id=%s
"""

WIDGET_SCOPE = """
    SELECT a.version, 'selected' AS knowledge_mode, (a.id IS NOT NULL) AS agent_exists,
        (w.id IS NOT NULL AND live.id IS NOT NULL) AS published, w.enabled,
        w.id AS widget_id, live.configuration->'allowed_origins' AS allowed_origins,
        w.draft->'allowed_origins' AS draft_origins,
        ARRAY(SELECT approved.id FROM jsonb_array_elements_text(r.agent->'document_ids') AS approved(id)
              WHERE COALESCE(w.draft->'document_ids', '[]'::jsonb) ? approved.id
              AND (a.knowledge_mode='all' OR EXISTS (
                  SELECT 1 FROM ai_agent_documents ad WHERE ad.agent_id=a.id
                  AND ad.user_id=a.user_id AND ad.document_id::text=approved.id))) AS document_ids
    FROM widget_revisions r
    LEFT JOIN website_widgets w ON w.id=r.widget_id AND w.user_id=r.user_id
    LEFT JOIN widget_revisions live ON live.id=w.published_revision_id AND live.user_id=r.user_id AND live.widget_id=w.id
    LEFT JOIN ai_agents a ON a.id=%s AND a.user_id=r.user_id AND a.id::text=r.agent->>'id'
    WHERE r.id=%s AND r.user_id=%s
"""


def _read(user_id, agent, candidates=None, delivery=None):
    widget = bool(agent.get('_widget_revision_id'))
    scope_sql = WIDGET_SCOPE if widget else SAVED_SCOPE
    params = ([agent['id'], agent['_widget_revision_id'], user_id] if widget else [agent['id'], user_id])
    fields = ['access.*']
    if candidates is not None:
        # Scope/version and document status/generation are read from the same fresh
        # statement snapshot. The outer row survives even an empty permitted scope.
        fields.append("""COALESCE((
                SELECT jsonb_object_agg(d.id::text, d.active_generation::text)
                FROM knowledge_documents d WHERE d.user_id=%s AND d.status='ready'
                AND d.active_generation IS NOT NULL AND d.id=ANY(%s::uuid[])
                AND (access.knowledge_mode='all' OR d.id::text=ANY(access.document_ids))
            ), '{}'::jsonb) AS generations""")
        params.extend([user_id, list({str(source['document_id']) for source in candidates})])
    if delivery:
        fields.append("""EXISTS(SELECT 1 FROM widget_sessions s
            JOIN agent_conversations c ON c.id=s.conversation_id AND c.user_id=s.user_id
            WHERE s.widget_id=access.widget_id AND s.widget_id=%s AND s.user_id=%s
            AND s.token_hash=%s AND s.site_origin=%s AND s.expires_at>now()
            AND c.widget_revision_id=%s) AS session_valid""")
        params.extend([delivery['widget_id'], user_id, hashlib.sha256(delivery['token'].encode()).hexdigest(),
                       delivery['site'], agent['_widget_revision_id']])
    query = "WITH access AS MATERIALIZED (" + scope_sql + ") SELECT " + ', '.join(fields) + " FROM access"
    with agent_tracing.stage('knowledge_access_query', {'mode': 'widget' if widget else 'agent',
                                                       'check_sources': candidates is not None}):
        with read_connection() as connection:
            row = connection.execute(query, params).fetchone()
    if not row:
        if widget:
            raise ValueError('Chat configuration is unavailable.')
        raise HTTPException(404, 'Agent not found.')
    if widget:
        if not row['published']:
            raise HTTPException(404, 'This chat widget is unavailable.')
        if not row['enabled']:
            raise HTTPException(503, 'Chat is temporarily unavailable. Please try again later.')
        if not row['agent_exists']:
            raise HTTPException(404, 'Agent not found.')
        # Published conversations retain their snapshot; current restrictions still apply.
    elif row['version'] != agent['version']:
        raise ValueError('This agent changed while answering. Start a fresh conversation using the saved configuration.')
    return row


def document_scope(agent, user_id):
    row = _read(user_id, agent)
    return None if row['knowledge_mode'] == 'all' else row['document_ids']


def valid_sources(user_id, sources, agent):
    # Even greeting/abstention responses must detect an agent edit/deletion or pause.
    generations = _read(user_id, agent, candidates=sources)['generations']
    return [source for source in sources
            if generations.get(str(source['document_id'])) == str(source['generation'])]


def validate_widget_delivery(widget_id, token, site, agent, user_id, citations):
    row = _read(user_id, agent, candidates=citations,
                delivery={'widget_id': widget_id, 'token': token, 'site': site})
    if site not in (row['allowed_origins'] or []) or site not in (row['draft_origins'] or []):
        raise HTTPException(403, 'Website origin is not allowed.')
    if not row['session_valid']:
        raise HTTPException(401, 'Your chat session has expired. Start a new conversation.')
    if any(str(citation['document_id']) not in row['generations'] for citation in citations):
        raise RuntimeError('Knowledge access changed before delivery')
