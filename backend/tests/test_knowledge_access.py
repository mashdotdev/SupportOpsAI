"""Fresh authorization, round-trip bounds, and real DB revocation regressions."""
import os
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from supportops import agent_store, db, knowledge_access, widgets
from tests import test_widgets
from tests.test_agents import configuration


class KnowledgeAccessUnitTests(unittest.TestCase):
    def test_scope_and_sources_use_one_bound_statement_and_one_checkout(self):
        document, generation = str(uuid4()), str(uuid4())
        agent = {'id': str(uuid4()), 'version': 4}
        source = {'document_id': document, 'generation': generation}
        row = {'version': 4, 'knowledge_mode': 'selected', 'document_ids': [document],
               'generations': {document: generation}, 'agent_exists': True}
        connection = MagicMock()
        connection.execute.return_value.fetchone.return_value = row
        with patch.object(knowledge_access, 'read_connection') as read:
            read.return_value.__enter__.return_value = connection
            self.assertEqual(knowledge_access.valid_sources('owner', [source], agent), [source])
            read.assert_called_once()
            connection.execute.assert_called_once()
            sql, params = connection.execute.call_args.args
            self.assertIn('knowledge_documents', sql)
            self.assertIn('ai_agent_documents', sql)
            self.assertIn('owner', params)
            self.assertNotIn('owner', sql)

    def test_empty_results_do_not_bypass_agent_version_check(self):
        connection = MagicMock()
        connection.execute.return_value.fetchone.return_value = {'version': 5}
        with patch.object(knowledge_access, 'read_connection') as read:
            read.return_value.__enter__.return_value = connection
            with self.assertRaisesRegex(ValueError, 'changed'):
                knowledge_access.valid_sources('owner', [], {'id': str(uuid4()), 'version': 4})


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Requires isolated migrated validation database')
class KnowledgeAccessDatabaseTests(unittest.TestCase):
    # Reuse the existing fixture lifecycle without inheriting its test methods.
    setUpClass = classmethod(test_widgets.WidgetDatabaseTests.setUpClass.__func__)
    tearDownClass = classmethod(test_widgets.WidgetDatabaseTests.tearDownClass.__func__)
    setUp = test_widgets.WidgetDatabaseTests.setUp
    tearDown = test_widgets.WidgetDatabaseTests.tearDown
    visitor = test_widgets.WidgetDatabaseTests.visitor
    body = test_widgets.WidgetDatabaseTests.body

    def source(self):
        with db.read_connection() as connection:
            generation = connection.execute('SELECT active_generation FROM knowledge_documents WHERE id=%s', (self.document,)).fetchone()['active_generation']
        return {'document_id': str(self.document), 'generation': str(generation)}

    def snapshot(self):
        visitor = self.visitor()
        _, agent, _, _ = widgets.prepare(self.widget_id, visitor['token'], test_widgets.SITE, self.body(), self.owner)
        return visitor, agent

    def test_saved_agent_validation_is_live_and_enforces_owner_version_and_ready_generation(self):
        source = self.source()
        self.assertEqual(knowledge_access.valid_sources(self.owner, [source], self.agent), [source])
        with self.assertRaises(HTTPException):
            knowledge_access.valid_sources('foreign-' + self.owner, [source], self.agent)
        self.assertEqual(knowledge_access.valid_sources(self.owner, [{**source, 'generation': str(uuid4())}], self.agent), [])
        selected = agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(knowledge_mode='selected', slack_notifications=True),
            'version': self.agent['version']}), self.owner, self.agent['id'])
        self.assertEqual(knowledge_access.document_scope(selected, self.owner), [])
        self.assertEqual(knowledge_access.valid_sources(self.owner, [source], selected), [])
        with self.assertRaisesRegex(ValueError, 'changed'):
            knowledge_access.valid_sources(self.owner, [], self.agent)

    def test_widget_draft_and_agent_restrictions_revoke_existing_snapshot_sources(self):
        _, snapshot = self.snapshot()
        source = self.source()
        self.assertEqual(knowledge_access.valid_sources(self.owner, [source], snapshot), [source])
        agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(knowledge_mode='selected', slack_notifications=True),
            'version': self.agent['version']}), self.owner, self.agent['id'])
        self.assertEqual(knowledge_access.valid_sources(self.owner, [source], snapshot), [])
        # The immutable snapshot remains usable after ordinary agent edits; only
        # its current document restrictions narrow access.
        self.assertEqual(knowledge_access.valid_sources(self.owner, [], snapshot), [])
        updated = widgets.save(self.owner, widgets.WidgetInput(**{**self.result['widget']['draft'],
            'version': self.result['widget']['version'], 'document_ids': []}))
        self.assertEqual(knowledge_access.document_scope(snapshot, self.owner), [])
        widgets.pause(self.owner, updated['widget']['version'])
        with self.assertRaises(HTTPException) as error:
            knowledge_access.valid_sources(self.owner, [], snapshot)
        self.assertEqual(error.exception.status_code, 503)

    def test_delivery_rechecks_session_domain_pause_and_document_state(self):
        visitor, snapshot = self.snapshot()
        citations = [{'document_id': str(self.document)}]
        args = (self.widget_id, visitor['token'], test_widgets.SITE, snapshot, self.owner, citations)
        widgets.validate_delivery(*args)
        with self.assertRaises(HTTPException) as error:
            widgets.validate_delivery(self.widget_id, 'x' * 43, test_widgets.SITE, snapshot, self.owner, citations)
        self.assertEqual(error.exception.status_code, 401)
        with self.assertRaises(HTTPException) as error:
            widgets.validate_delivery(self.widget_id, visitor['token'], 'https://evil.test', snapshot, self.owner, citations)
        self.assertEqual(error.exception.status_code, 403)
        with db.transaction() as connection:
            connection.execute("UPDATE knowledge_documents SET status='deleting' WHERE id=%s", (self.document,))
        with self.assertRaises(RuntimeError):
            widgets.validate_delivery(*args)
        with db.transaction() as connection:
            connection.execute("UPDATE knowledge_documents SET status='ready' WHERE id=%s", (self.document,))
            connection.execute("UPDATE widget_sessions SET expires_at=now()-interval '1 second' WHERE conversation_id=%s", (visitor['conversation_id'],))
        with self.assertRaises(HTTPException) as error:
            widgets.validate_delivery(*args)
        self.assertEqual(error.exception.status_code, 401)

    def test_read_connections_are_autocommit_and_writes_still_rollback_atomically(self):
        with db.read_connection() as connection:
            self.assertTrue(connection.autocommit)
        with self.assertRaises(RuntimeError):
            with db.transaction() as connection:
                connection.execute("UPDATE knowledge_documents SET status='deleting' WHERE id=%s", (self.document,))
                raise RuntimeError('rollback fixture')
        self.assertEqual(knowledge_access.valid_sources(self.owner, [self.source()], self.agent), [self.source()])
