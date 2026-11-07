"""Slack outbox tests use a disposable database and a fake HTTP transport; never post to Slack."""
import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
import httpx
from pydantic import ValidationError

from main import app
from supportops import activity, agent_store, chat, db, documents, notifications
from supportops.config import Settings
from supportops.integration_routes import SlackInput
from tests.test_agents import configuration

WEBHOOK = 'https://hooks.slack.com/services/Tfixture/Bfixture/secretfixture'


class ConnectorUnitTests(unittest.TestCase):
    def test_webhook_validation_prevents_arbitrary_requests(self):
        for url in ['https://evil.test/services/a/b/c', 'https://hooks.slack.com.evil.test/services/a/b/c',
                    'http://hooks.slack.com/services/a/b/c', WEBHOOK+'?x=y', WEBHOOK+'#x',
                    'https://user@hooks.slack.com/services/a/b/c', 'https://hooks.slack.com:444/services/a/b/c']:
            with self.assertRaises(ValidationError):
                SlackInput(name='Support', destination='#support', webhook_url=url)
        self.assertEqual(notifications.webhook_url(WEBHOOK), WEBHOOK)

    def test_payload_uses_plain_text_and_does_not_expose_transcripts_or_secrets(self):
        job = dict(agent_name='Care', source='test', question='<!channel> <https://evil.test|click>',
                   reason='Human assistance required', kind='escalation', conversation_id=uuid4())
        config = Settings(_env_file=None, frontend_origin='https://app.test')
        with patch.object(notifications, 'settings', return_value=config):
            payload = notifications.slack_payload(job)
        self.assertTrue(payload['text'].startswith('[TEST]'))
        self.assertEqual(payload['blocks'][1]['text']['type'], 'plain_text')
        self.assertTrue(payload['blocks'][2]['elements'][0]['url'].startswith('https://app.test/workspace?conversation='))
        self.assertNotIn('secretfixture', json.dumps(payload))

    def test_escalation_response_never_claims_unconfirmed_delivery(self):
        agent = configuration(slack_notifications=True)
        agent['authority']['escalation_message'] = 'I notified the team.'
        for text in ['[[ESCALATE]]', 'Uncited draft', '[[ESCALATE]] extra']:
            result, _, kind = chat.finalize_configured(text, {}, agent)
            self.assertEqual(kind, 'escalation')
            self.assertIn('not yet confirmed', result)
            self.assertNotIn('I notified', result)


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Requires an isolated migrated database with no notification worker')
class NotificationDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = Settings(_env_file=None, database_url=os.environ['TEST_DATABASE_URL'],
                              backend_api_token='slack-tests', integration_encryption_key=Fernet.generate_key().decode(),
                              frontend_origin='https://app.test')
        cls.patches = [patch.object(module, 'settings', return_value=cls.config) for module in [db, documents, activity, chat, notifications]]
        for item in cls.patches:
            item.start()
        db.pool.cache_clear()

    @classmethod
    def tearDownClass(cls):
        db.pool().close(); db.pool.cache_clear()
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        self.owner = 'slack-test-' + str(uuid4())
        self.other = 'slack-test-' + str(uuid4())
        self.destination = notifications.save_connection(self.owner, SlackInput(name='Support', destination='#support', webhook_url=WEBHOOK))['connection']
        self.agent = agent_store.save_agent(agent_store.AgentInput(**configuration(slack_notifications=True)), self.owner)

    def tearDown(self):
        with db.transaction() as connection:
            connection.execute('DELETE FROM notification_jobs WHERE user_id=ANY(%s)', ([self.owner,self.other],))
            connection.execute('DELETE FROM agent_conversations WHERE user_id=ANY(%s)', ([self.owner,self.other],))
            connection.execute('DELETE FROM slack_connections WHERE user_id=ANY(%s)', ([self.owner,self.other],))
            connection.execute('DELETE FROM ai_agents WHERE user_id=ANY(%s)', ([self.owner,self.other],))

    def escalation(self, live=False, kind='escalation', conversation_id=None):
        body = chat.ChatInput(conversation_id=conversation_id or uuid4(), messages=[{'role':'user','content':'Please make a policy exception'}])
        activity.start_turn(body, self.owner, self.agent)
        if live:
            with db.transaction() as connection:
                connection.execute("UPDATE agent_conversations SET source='live' WHERE id=%s", (body.conversation_id,))
        activity.finish_turn(body.conversation_id, body.request_id, self.owner, text='Human assistance is needed.', response_type=kind)
        return body

    def job(self, job_id):
        with db.transaction() as connection:
            return connection.execute('SELECT * FROM notification_jobs WHERE id=%s', (job_id,)).fetchone()

    def due(self):
        with db.transaction() as connection:
            connection.execute("UPDATE notification_jobs SET run_after=now()-interval '1 second' WHERE user_id=%s", (self.owner,))
            connection.execute("UPDATE slack_connections SET next_send_at=now()-interval '1 second' WHERE user_id=%s", (self.owner,))

    def test_secret_is_encrypted_owner_scoped_and_reconnectable(self):
        public = notifications.get_connection(self.owner)
        self.assertNotIn('secretfixture', json.dumps(public))
        self.assertIsNone(notifications.get_connection(self.other)['connection'])
        with db.transaction() as connection:
            row = connection.execute('SELECT secret FROM slack_connections WHERE user_id=%s', (self.owner,)).fetchone()
        self.assertNotIn('secretfixture', row['secret'])
        self.assertEqual(notifications.cipher().decrypt(row['secret'].encode()).decode(), WEBHOOK)
        notifications.disconnect(self.owner)
        self.assertIsNone(notifications.get_connection(self.owner)['connection'])
        notifications.save_connection(self.owner, SlackInput(name='Again', destination='#support', webhook_url=WEBHOOK))
        self.assertIsNotNone(notifications.get_connection(self.owner)['connection'])

    def test_simulation_default_only_escalations_and_atomic_deduplication(self):
        for kind in ['greeting','answer','clarification','out_of_scope','insufficient_knowledge']:
            self.escalation(kind=kind)
        self.assertEqual(notifications.history(self.owner)['total'], 0)
        body = self.escalation()
        with patch.object(notifications, 'send_http') as send:
            notifications.run_once()
            send.assert_not_called()
        job = notifications.history(self.owner)['jobs'][0]
        self.assertEqual(job['status'], 'simulated')
        with ThreadPoolExecutor(max_workers=3) as executor:
            list(executor.map(lambda _: notifications.notify_conversation(body.conversation_id, self.owner), range(3)))
        self.assertEqual(notifications.history(self.owner)['total'], 1)
        detail = activity.detail(body.conversation_id, self.owner)
        self.assertEqual(detail['conversation']['status'], 'needs_attention')
        self.assertEqual(detail['notifications'][0]['preview']['environment'], 'TEST')

    def test_live_delivery_and_connection_test_preserve_outcomes(self):
        body = self.escalation(live=True)
        with patch.object(notifications, 'send_http', return_value=httpx.Response(200, text='ok')) as send:
            self.assertTrue(notifications.run_once())
            self.assertEqual(send.call_count, 1)
        detail = activity.detail(body.conversation_id, self.owner)
        self.assertEqual(detail['notifications'][0]['status'], 'sent')
        self.assertEqual(detail['conversation']['status'], 'needs_attention')
        notifications.notify_conversation(body.conversation_id, self.owner, True)
        self.assertEqual(notifications.history(self.owner)['total'], 1)
        test = notifications.test_connection(self.owner)['job']
        self.assertEqual(notifications.test_connection(self.owner)['job']['id'], test['id'])
        self.due()
        with patch.object(notifications, 'send_http', return_value=httpx.Response(200, text='ok')):
            notifications.run_once()
        self.assertEqual(notifications.get_connection(self.owner)['connection']['status'], 'verified')

    def test_rate_limit_waits_and_retries_then_read_timeout_is_unknown(self):
        body = self.escalation(live=True)
        with patch.object(notifications, 'send_http', return_value=httpx.Response(429, headers={'Retry-After':'60'})):
            notifications.run_once()
        job = notifications.history(self.owner)['jobs'][0]
        self.assertEqual(job['status'], 'queued')
        self.assertIsNone(notifications.claim())
        self.due()
        with patch.object(notifications, 'send_http', side_effect=httpx.ReadTimeout('secret URL must not leak')):
            notifications.run_once()
        job = self.job(job['id'])
        self.assertEqual(job['status'], 'unknown')
        self.assertNotIn('secret URL', job['error'])
        self.assertIsNone(notifications.claim())
        notifications.notify_conversation(body.conversation_id, self.owner, True)
        self.assertEqual(self.job(job['id'])['status'], 'unknown')

    def test_revocation_disconnect_and_crash_recovery(self):
        self.escalation(live=True)
        claimed = notifications.claim()
        with db.transaction() as connection:
            connection.execute('UPDATE ai_agents SET slack_notifications=false WHERE id=%s', (self.agent['id'],))
        with patch.object(notifications, 'send_http') as send:
            notifications.deliver(claimed); send.assert_not_called()
        self.assertEqual(self.job(claimed['id'])['status'], 'cancelled')
        test = notifications.test_connection(self.owner)['job']
        notifications.disconnect(self.owner)
        self.assertEqual(self.job(test['id'])['status'], 'cancelled')
        notifications.save_connection(self.owner, SlackInput(name='Support', destination='#support', webhook_url=WEBHOOK))
        notifications.test_connection(self.owner)
        claimed = notifications.claim()
        with db.transaction() as connection:
            connection.execute("UPDATE notification_jobs SET lease_until=now()-interval '1 second' WHERE id=%s", (claimed['id'],))
        self.assertIsNone(notifications.claim())
        self.assertEqual(self.job(claimed['id'])['status'], 'unknown')

    def test_new_escalation_cycle_and_manual_retry_after_definite_failure(self):
        body = self.escalation()
        job = notifications.notify_conversation(body.conversation_id, self.owner, True)['job']
        with patch.object(notifications, 'send_http', return_value=httpx.Response(403)):
            notifications.run_once()
        self.assertEqual(self.job(job['id'])['status'], 'failed')
        retry = notifications.notify_conversation(body.conversation_id, self.owner, True)['job']
        self.assertEqual(retry['id'], job['id'])
        self.assertEqual(retry['status'], 'queued')
        activity.set_resolution(body.conversation_id, self.owner, True)
        self.due()
        with patch.object(notifications, 'send_http') as send:
            notifications.run_once(); send.assert_not_called()
        activity.set_resolution(body.conversation_id, self.owner, False)
        new = notifications.notify_conversation(body.conversation_id, self.owner, True)['job']
        self.assertNotEqual(new['id'], job['id'])
        self.assertEqual(new['cycle'], 2)

    def test_test_delivery_rechecks_permission_but_owner_can_explicitly_send(self):
        self.agent = agent_store.save_agent(agent_store.AgentUpdate(**{**configuration(slack_notifications=True, slack_test_delivery=True), 'version': self.agent['version']}), self.owner, self.agent['id'])
        body = self.escalation()
        claimed = notifications.claim()
        with db.transaction() as connection:
            connection.execute('UPDATE ai_agents SET slack_test_delivery=false WHERE id=%s', (self.agent['id'],))
        with patch.object(notifications, 'send_http') as send:
            notifications.deliver(claimed); send.assert_not_called()
        notifications.notify_conversation(body.conversation_id, self.owner, True)
        with patch.object(notifications, 'send_http', return_value=httpx.Response(200, text='ok')):
            notifications.run_once()
        self.assertEqual(self.job(claimed['id'])['status'], 'sent')

    def test_routes_enforce_identity_and_bound_queries(self):
        body = self.escalation()
        with TestClient(app, raise_server_exceptions=False) as client:
            headers = {'Authorization':'Bearer slack-tests','X-User-Id':self.other}
            response = client.post(f'/v1/integrations/conversations/{body.conversation_id}/notify', json={'deliver':True}, headers=headers)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(client.get('/v1/integrations/history', headers=headers).json()['total'], 0)
            self.assertEqual(client.get('/v1/integrations/slack').status_code, 401)
            self.assertEqual(client.get('/v1/integrations/history?page=0', headers=headers).status_code, 422)
            invalid = client.put('/v1/integrations/slack', headers=headers,
                json={'name':'Support','destination':'#support','webhook_url':WEBHOOK+'?secret=private'})
            self.assertEqual(invalid.status_code, 422)
            self.assertNotIn('secretfixture', invalid.text)
        self.assertEqual(notifications.history(self.owner, search='%')['total'], 0)
        self.assertEqual(notifications.history(self.owner, source='test', status='simulated')['total'], 1)
