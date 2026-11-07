"""Activity ownership, accounting and streaming persistence against a disposable DB."""
import asyncio
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from supportops import activity, chat, db, documents, overview_routes
from supportops.config import Settings


class ActivityUnitTests(unittest.TestCase):
    def test_stream_saves_completion_before_delivering_it(self):
        async def run():
            body = chat.ChatInput(messages=[{'role': 'user', 'content': 'Hello'}])
            async def answer(body, user_id, queue, configured_agent=None):
                await queue.put(chat.event('done', {'text': 'Hello!', 'citations': [], 'response_type': 'greeting'}))
                await queue.put(None)
            request = SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=False))
            with patch.object(chat, 'answer', side_effect=answer), patch.object(activity, 'finish_turn') as save:
                response = chat.stream_response(body, 'owner', request, tracking=True)
                self.assertIn('event: status', await anext(response.body_iterator))
                frame = await anext(response.body_iterator)
                self.assertIn('event: done', frame)
                save.assert_called_once_with(body.conversation_id, body.request_id, 'owner',
                    text='Hello!', citations=[], response_type='greeting')
                await response.body_iterator.aclose()
        asyncio.run(run())

    def test_disconnected_stream_records_cancellation(self):
        async def run():
            body = chat.ChatInput(messages=[{'role': 'user', 'content': 'Hello'}])
            async def answer(*args):
                await asyncio.sleep(60)
            request = SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=True))
            with patch.object(chat, 'answer', side_effect=answer), patch.object(activity, 'finish_turn') as save:
                response = chat.stream_response(body, 'owner', request, tracking=True)
                frames = [frame async for frame in response.body_iterator]
                self.assertEqual(len(frames), 1)
                save.assert_called_once_with(body.conversation_id, body.request_id, 'owner', cancelled=True)
        asyncio.run(run())

    def test_answers_are_not_resolutions_and_escalations_are_not_transfers(self):
        self.assertEqual(activity.outcome('answer'), ('answered', None))
        self.assertEqual(activity.outcome('clarification')[0], 'needs_clarification')
        for kind in ['out_of_scope', 'escalation', 'insufficient_knowledge']:
            self.assertEqual(activity.outcome(kind)[0], 'needs_attention')
        self.assertNotEqual(activity.outcome('greeting')[0], 'resolved')

    def test_stream_only_queries_the_authenticated_owners_revision(self):
        async def run():
            response = await overview_routes.events('owner', SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=False)))
            with patch.object(activity, 'revision', return_value='3:2') as revision:
                frame = await anext(response.body_iterator)
                self.assertIn('event: change', frame)
                revision.assert_called_once_with('owner')
                await response.body_iterator.aclose()
        asyncio.run(run())


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Requires an isolated migrated database')
class ActivityDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = Settings(_env_file=None, database_url=os.environ['TEST_DATABASE_URL'], backend_api_token='activity-test-token')
        cls.patches = [patch.object(module, 'settings', return_value=cls.config) for module in [db, documents, activity, chat]]
        for item in cls.patches:
            item.start()
        db.pool.cache_clear()

    @classmethod
    def tearDownClass(cls):
        db.pool().close()
        db.pool.cache_clear()
        for item in reversed(cls.patches):
            item.stop()

    def setUp(self):
        self.owner = f'activity-test-{uuid4()}'
        self.other = f'activity-test-{uuid4()}'
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        with db.transaction() as connection:
            connection.execute('DELETE FROM agent_conversations WHERE user_id=ANY(%s)', ([self.owner, self.other],))
        self.client.close()

    def request(self, method, path='', owner=None, **kwargs):
        return self.client.request(method, '/v1/overview' + path,
            headers={'Authorization': 'Bearer activity-test-token', 'X-User-Id': owner or self.owner}, **kwargs)

    def turn(self, conversation_id=None, question='What is the refund policy?'):
        body = chat.ChatInput(messages=[{'role': 'user', 'content': question}],
                              conversation_id=conversation_id or uuid4(), request_id=uuid4())
        activity.start_turn(body, self.owner)
        return body

    def finish(self, body, kind='answer', **kwargs):
        activity.finish_turn(body.conversation_id, body.request_id, self.owner,
            text='A grounded reply [S1]' if not kwargs else None, response_type=kind, **kwargs)

    def test_owned_details_filters_and_explicit_resolution(self):
        body = self.turn()
        self.finish(body)
        response = self.request('GET', '?source=test&days=7&tz_offset=-300')
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual((data['metrics']['conversations'], data['metrics']['resolved']), (1, 0))
        self.assertEqual(data['conversations'][0]['status'], 'answered')
        self.assertEqual(self.request('GET').json()['metrics']['conversations'], 0)
        self.assertEqual(self.request('GET', '?source=test', owner=self.other).json()['total'], 0)
        path = f'/conversations/{body.conversation_id}'
        self.assertEqual(self.request('GET', path, owner=self.other).status_code, 404)
        self.assertEqual(self.request('PATCH', path, owner=self.other, json={'resolved': True}).status_code, 404)
        result = self.request('PATCH', path, json={'resolved': True})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['conversation']['status'], 'resolved')
        self.assertEqual(self.request('GET', '?source=test').json()['metrics']['resolved'], 1)
        self.assertEqual(self.request('PATCH', path, json={'resolved': False}).json()['conversation']['status'], 'needs_attention')
        self.assertEqual(self.request('PATCH', path, json={'resolved': True, 'status': 'answered'}).status_code, 422)
        self.assertEqual(self.request('GET', '?days=5').status_code, 422)

    def test_request_deduplication_and_one_running_response(self):
        body = self.turn()
        with self.assertRaises(HTTPException) as running:
            activity.start_turn(body, self.owner)
        self.assertEqual(running.exception.status_code, 409)
        with self.assertRaises(HTTPException):
            self.turn(body.conversation_id)
        self.finish(body)
        replay = activity.start_turn(body, self.owner)
        self.assertEqual(replay['status'], 'completed')
        self.finish(body)
        detail = activity.detail(body.conversation_id, self.owner)
        self.assertEqual(len(detail['turns']), 1)
        self.assertEqual(len(detail['events']), 2)
        with self.assertRaises(HTTPException):
            activity.start_turn(body, self.other)

    def test_failures_cancellations_retries_and_stalled_workers(self):
        failed = self.turn()
        self.finish(failed, error='Provider temporarily unavailable')
        retry = self.turn(failed.conversation_id)
        self.finish(retry)
        cancelled = self.turn()
        self.finish(cancelled, cancelled=True)
        stalled = self.turn()
        with db.transaction() as connection:
            connection.execute("UPDATE agent_turns SET created_at=now()-interval '4 minutes' WHERE id=%s", (stalled.request_id,))
        data = activity.snapshot(self.owner, source='test')
        self.assertEqual(data['metrics']['conversations'], 3)
        self.assertEqual(data['metrics']['failed_responses'], 2)
        self.assertEqual(data['metrics']['cancelled_responses'], 1)
        self.assertEqual(data['metrics']['resolved'], 0)
        self.assertIsNotNone(data['metrics']['median_response_ms'])
        self.assertEqual(activity.detail(stalled.conversation_id, self.owner)['turns'][0]['status'], 'failed')

    def test_pagination_literal_search_and_inactive_outcomes(self):
        for index in range(21):
            body = self.turn(question=f'Question {index}')
            self.finish(body, 'escalation' if index == 0 else 'answer')
        with db.transaction() as connection:
            connection.execute("UPDATE agent_conversations SET updated_at=now()-interval '25 hours' WHERE user_id=%s", (self.owner,))
        data = activity.snapshot(self.owner, source='test', page=2)
        self.assertEqual((data['total'], len(data['conversations'])), (21, 1))
        inactive = activity.snapshot(self.owner, source='test', status='inactive')
        self.assertEqual(inactive['total'], 20)
        self.assertEqual(activity.snapshot(self.owner, source='test', status='needs_attention')['total'], 1)
        self.assertEqual(activity.snapshot(self.owner, source='test', search='%')['total'], 0)
        self.assertEqual(activity.snapshot(self.owner, source='test', search='Question 20')['total'], 1)

    def test_real_stream_persists_before_reporting_completion_and_replays(self):
        body = {'messages': [{'role': 'user', 'content': 'Hello'}], 'conversation_id': str(uuid4()), 'request_id': str(uuid4()), 'source': 'live'}
        async def answer(body, user_id, queue, configured_agent=None):
            await queue.put(chat.event('done', {'id': str(uuid4()), 'text': 'Hello!', 'citations': [], 'response_type': 'greeting'}))
            await queue.put(None)
        headers = {'Authorization': 'Bearer activity-test-token', 'X-User-Id': self.owner}
        with patch.object(chat, 'answer', side_effect=answer) as runner:
            response = self.client.post('/v1/playground/chat', headers=headers, json=body)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn('event: done', response.text)
            detail = self.request('GET', f"/conversations/{body['conversation_id']}").json()
            self.assertEqual(detail['conversation']['source'], 'test')
            self.assertEqual(detail['turns'][0]['answer'], 'Hello!')
            response = self.client.post('/v1/playground/chat', headers=headers, json=body)
            self.assertIn('Hello!', response.text)
            self.assertEqual(runner.call_count, 1)

    def test_agent_snapshot_survives_deletion_and_changed_configuration_is_rejected(self):
        agent = {'id': uuid4(), 'version': 1, 'name': 'Historical agent', 'model_id': 'openrouter/free'}
        body = chat.ChatInput(messages=[{'role': 'user', 'content': 'Hello'}])
        activity.start_turn(body, self.owner, agent)
        self.finish(body)
        detail = activity.detail(body.conversation_id, self.owner)
        self.assertEqual(detail['conversation']['agent_name'], 'Historical agent')
        with self.assertRaises(HTTPException):
            next_body = chat.ChatInput(conversation_id=body.conversation_id, messages=[{'role': 'user', 'content': 'Another question'}])
            activity.start_turn(next_body, self.owner, {**agent, 'version': 2})
        self.assertEqual(activity.snapshot(self.owner, source='test', agent_id=agent['id'])['total'], 1)


if __name__ == '__main__':
    unittest.main()
