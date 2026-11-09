"""Public widget isolation, publication, recovery and delivery tests. Provider calls are fixtures."""
import asyncio
import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from main import app
from supportops import activity, agent_store, chat, db, documents, notifications, widget_routes, widgets
from supportops.config import Settings
from supportops.integration_routes import SlackInput
from tests.test_agents import configuration

SITE = 'https://shop.test'


class WidgetUnitTests(unittest.TestCase):
    def test_origins_are_exact_and_safe_for_frame_headers(self):
        self.assertEqual(widgets.origin('https://EXAMPLE.com:443/'), 'https://example.com')
        self.assertEqual(widgets.origin('http://localhost:4173'), 'http://localhost:4173')
        for value in ['https://*.example.com', 'http://example.com', 'https://example.com/path',
                      'https://user@example.com', 'https://example.com?x=y', 'https://example.com#x',
                      'https://example.com\r\nX-Foo: bad', 'javascript:alert(1)', 'https://example.com:bad',
                      'https://example.com;script-src', 'https://exa%6dple.com', 'https://-bad.example']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                widgets.origin(value)

    def test_public_inputs_cannot_set_agent_history_source_or_ownership(self):
        for field in ['messages', 'source', 'agent_id', 'user_id', 'conversation_id']:
            with self.assertRaises(ValidationError):
                widget_routes.Message(request_id=uuid4(), message='Hello', **{field: 'forged'})
        with self.assertRaises(ValidationError):
            widgets.WidgetInput(version=1, suggested_questions=['x' * 151])
        with self.assertRaises(ValidationError):
            widgets.WidgetInput(version=1, privacy_url='javascript:alert(1)')


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Requires an isolated migrated database with no workers')
class WidgetDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = Settings(_env_file=None, database_url=os.environ['TEST_DATABASE_URL'],
            backend_api_token='widget-fixture-token', integration_encryption_key=Fernet.generate_key().decode(),
            widget_daily_model_requests=1000)
        cls.patches = [patch.object(module, 'settings', return_value=cls.config)
            for module in [db, documents, activity, chat, notifications, widgets, widget_routes]]
        for item in cls.patches:
            item.start()
        db.pool.cache_clear()

    @classmethod
    def tearDownClass(cls):
        db.pool().close(); db.pool.cache_clear()
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        self.owner = 'widget-test-' + str(uuid4())
        self.document = uuid4()
        with db.transaction() as connection:
            connection.execute("""INSERT INTO knowledge_documents(id,user_id,filename,media_type,byte_size,storage_key,staging_key,status,active_generation)
                VALUES (%s,%s,'Approved policy.txt','text/plain',10,%s,%s,'ready',%s)""",
                (self.document, self.owner, 'widget-fixture/' + str(self.document), 'widget-staging/' + str(self.document), uuid4()))
        notifications.save_connection(self.owner, SlackInput(name='Fixture only', destination='#fixture',
            webhook_url='https://hooks.slack.com/services/Tfixture/Bfixture/secretfixture'))
        self.agent = agent_store.save_agent(agent_store.AgentInput(**configuration(slack_notifications=True)), self.owner)
        result = widgets.owner_get(self.owner)
        result = widgets.save(self.owner, widgets.WidgetInput(version=result['widget']['version'], agent_id=self.agent['id'],
            document_ids=[self.document], allowed_origins=[SITE], privacy_url=SITE + '/privacy', support_email='support@shop.test'))
        self.result = widgets.publish(self.owner, result['widget']['version'])
        self.widget_id = self.result['widget']['id']

    def tearDown(self):
        with db.transaction() as connection:
            connection.execute('DELETE FROM agent_conversations WHERE user_id=%s', (self.owner,))
            connection.execute('UPDATE website_widgets SET published_revision_id=NULL WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM website_widgets WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM notification_jobs WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM slack_connections WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM ai_agents WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM knowledge_documents WHERE user_id=%s', (self.owner,))
            connection.execute('DELETE FROM widget_rate_limits WHERE bucket LIKE %s', ('%' + self.owner + '%',))

    def visitor(self):
        return widgets.new_session(self.widget_id, SITE, self.owner)

    def body(self, text='What is the refund policy?'):
        return widget_routes.Message(request_id=uuid4(), message=text)

    def finish(self, prepared, kind='answer'):
        activity.finish_turn(prepared.conversation_id, prepared.request_id, self.owner, text='Refunds within thirty days.', response_type=kind)

    def test_sessions_are_scoped_expiring_and_do_not_expose_private_configuration(self):
        visitor = self.visitor()
        public = widgets.public_config(self.widget_id)
        for key in ['agent', 'instructions', 'document_ids', 'user_id', 'model_id', 'token_hash']:
            self.assertNotIn(key, public)
        self.assertNotIn('secretfixture', json.dumps(public))
        self.assertEqual(widgets.public_state(self.widget_id, visitor['token'], SITE)['turns'], [])
        for widget_id, token, site, code in [(self.widget_id, 'x' * 43, SITE, 401),
                                           (self.widget_id, visitor['token'], 'https://evil.test', 403),
                                           (uuid4(), visitor['token'], SITE, 404)]:
            with self.assertRaises(HTTPException) as error:
                widgets.public_state(widget_id, token, site)
            self.assertEqual(error.exception.status_code, code)
        with db.transaction() as connection:
            row = connection.execute('SELECT token_hash FROM widget_sessions WHERE conversation_id=%s', (visitor['conversation_id'],)).fetchone()
            self.assertNotEqual(row['token_hash'], visitor['token'])
            connection.execute("UPDATE widget_sessions SET expires_at=now()-interval '1 second' WHERE conversation_id=%s", (visitor['conversation_id'],))
        with self.assertRaises(HTTPException):
            widgets.public_state(self.widget_id, visitor['token'], SITE)

    def test_publication_is_immutable_and_new_conversations_pick_up_updates(self):
        visitor = self.visitor()
        new_agent = agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(slack_notifications=True),
            'name': 'Updated care agent', 'version': self.agent['version']}), self.owner, self.agent['id'])
        prepared, snapshot, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE, self.body(), self.owner)
        self.assertEqual(snapshot['name'], self.agent['name'])
        self.assertEqual(snapshot['version'], self.agent['version'])
        self.assertEqual(widgets.document_scope(snapshot, self.owner), [str(self.document)])
        self.finish(prepared)
        latest = widgets.publish(self.owner, self.result['widget']['version'])
        visitor2 = self.visitor()
        prepared2, snapshot2, _, _ = widgets.prepare(self.widget_id, visitor2['token'], SITE, self.body(), self.owner)
        self.assertEqual(snapshot2['version'], new_agent['version'])
        self.assertEqual(latest['published']['number'], 2)
        self.finish(prepared2)

    def test_knowledge_domain_and_pause_revocations_apply_to_existing_sessions(self):
        visitor = self.visitor()
        prepared, snapshot, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE, self.body(), self.owner)
        self.finish(prepared)
        updated = widgets.save(self.owner, widgets.WidgetInput(**{**self.result['widget']['draft'], 'version': self.result['widget']['version'], 'document_ids': []}))
        self.assertEqual(widgets.document_scope(snapshot, self.owner), [])
        updated = widgets.save(self.owner, widgets.WidgetInput(**{**updated['widget']['draft'], 'version': updated['widget']['version'], 'allowed_origins': []}))
        with self.assertRaises(HTTPException) as error:
            widgets.public_state(self.widget_id, visitor['token'], SITE)
        self.assertEqual(error.exception.status_code, 403)
        widgets.pause(self.owner, updated['widget']['version'])
        with self.assertRaises(HTTPException) as error:
            widgets.new_session(self.widget_id, SITE, self.owner)
        self.assertEqual(error.exception.status_code, 503)

    def test_server_history_replays_and_concurrent_turns_are_idempotent(self):
        visitor = self.visitor()
        body = self.body()
        def prepare():
            try:
                return widgets.prepare(self.widget_id, visitor['token'], SITE, body, self.owner)
            except HTTPException as error:
                return error.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: prepare(), range(2)))
        self.assertEqual(sum(isinstance(item, tuple) for item in results), 1)
        self.assertIn(409, results)
        prepared = next(item[0] for item in results if isinstance(item, tuple))
        self.finish(prepared)
        self.assertEqual(widgets.prepare(self.widget_id, visitor['token'], SITE, body, self.owner)[3]['answer'], 'Refunds within thirty days.')
        followup, _, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE, self.body('And how long?'), self.owner)
        self.assertEqual([message.role for message in followup.messages], ['user', 'assistant', 'user'])
        self.assertEqual(followup.messages[1].content, 'Refunds within thirty days.')
        activity.finish_turn(followup.conversation_id, followup.request_id, self.owner, error='Fixture failure')
        retried, _, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE,
            widget_routes.Message(request_id=followup.request_id, message='And how long?'), self.owner)
        self.finish(retried)
        self.assertEqual(len(widgets.public_state(self.widget_id, visitor['token'], SITE)['turns']), 2)

    def test_live_slack_escalation_contact_and_owner_inbox(self):
        visitor = self.visitor()
        prepared, _, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE, self.body(), self.owner)
        # Saving an agent must not break notifications from its published version.
        agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(slack_notifications=True), 'version': self.agent['version']}), self.owner, self.agent['id'])
        self.finish(prepared, 'escalation')
        state = widgets.public_state(self.widget_id, visitor['token'], SITE)
        self.assertEqual(state['status'], 'needs_attention')
        self.assertEqual(state['notification_status'], 'queued')
        jobs = notifications.history(self.owner)['jobs']
        self.assertEqual(len(jobs), 1)
        self.assertEqual((jobs[0]['source'], jobs[0]['mode']), ('live', 'delivery'))
        widgets.customer_action(self.widget_id, visitor['token'], SITE, widget_routes.Action(action='support'))
        widgets.customer_action(self.widget_id, visitor['token'], SITE, widget_routes.Action(action='contact', name='Customer', email='customer@shop.test'))
        inbox = activity.inbox(self.owner, search='customer@shop.test', widget_only=True)
        self.assertEqual(inbox['total'], 1)
        self.assertEqual(inbox['conversations'][0]['visitor_name'], 'Customer')
        self.assertEqual(activity.inbox('other-' + self.owner)['total'], 0)
        self.assertEqual(activity.snapshot(self.owner)['metrics']['needs_attention'], 1)
        self.assertEqual(notifications.history(self.owner)['total'], 1)

    def test_feedback_resolution_and_current_permission_revocation(self):
        visitor = self.visitor()
        prepared, _, _, _ = widgets.prepare(self.widget_id, visitor['token'], SITE, self.body(), self.owner)
        self.finish(prepared)
        state = widgets.customer_action(self.widget_id, visitor['token'], SITE, widget_routes.Action(action='helpful'))
        self.assertEqual((state['status'], state['feedback']), ('resolved', 'helpful'))
        visitor2 = self.visitor()
        prepared2, _, _, _ = widgets.prepare(self.widget_id, visitor2['token'], SITE, self.body(), self.owner)
        agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(slack_notifications=False), 'version': self.agent['version']}), self.owner, self.agent['id'])
        self.finish(prepared2, 'escalation')
        self.assertEqual(notifications.history(self.owner)['total'], 0)

    def test_http_service_authorization_safe_stream_and_public_error_redaction(self):
        visitor = self.visitor()
        headers = {'X-Widget-Service-Token': self.config.backend_api_token, 'X-Widget-Session': visitor['token'],
                   'X-Widget-Site-Origin': SITE, 'X-Widget-Client-IP': self.owner}
        async def answer(body, user_id, queue, agent):
            await queue.put(chat.event('text_delta', {'delta': 'PRIVATE DRAFT'}))
            await queue.put(chat.event('done', {'text': 'Hello there.', 'citations': [], 'response_type': 'greeting'}))
            await queue.put(None)
        path = f'/v1/public/widgets/{self.widget_id}'
        with TestClient(app) as client:
            self.assertEqual(client.get(path + '/config').status_code, 401)
            with patch.object(chat, 'answer', side_effect=answer):
                result = client.post(path + '/messages', headers=headers, json={'request_id': str(uuid4()), 'message': 'Hello'})
            self.assertEqual(result.status_code, 200)
            self.assertIn('Hello there.', result.text)
            self.assertNotIn('PRIVATE DRAFT', result.text)
            self.assertNotIn('citations', result.text)
            self.assertEqual(client.post(path + '/messages', headers=headers, json={'request_id': str(uuid4()), 'message': 'Hi', 'user_id': 'forged'}).status_code, 422)
            self.assertEqual(client.get('/v1/widgets', headers={'Authorization': 'Bearer ' + self.config.backend_api_token, 'X-User-Id': self.owner}).status_code, 200)

    def test_limits_are_durable_and_publication_requires_valid_knowledge(self):
        with db.transaction() as connection:
            widgets.limit(connection, self.owner + ':test', 1)
        with self.assertRaises(HTTPException) as error, db.transaction() as connection:
            widgets.limit(connection, self.owner + ':test', 1)
        self.assertEqual(error.exception.status_code, 429)
        with self.assertRaises(HTTPException):
            widgets.save(self.owner, widgets.WidgetInput(**{**self.result['widget']['draft'], 'version': self.result['widget']['version'], 'document_ids': [uuid4()]}))
