"""Real SDK regression checks with a local provider; never spends free quota."""
import asyncio
from collections import OrderedDict
import json
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx2
from openai import AsyncOpenAI

from supportops import activity, chat, embeddings, vectors, widget_routes, widgets, knowledge_access
from supportops.config import Settings
from tests.test_agents import configuration


class ChatPerformanceTests(unittest.TestCase):
    def run_chat(self, *, configured=False, widget=False, prefetch=True, refine=False,
                 text="Refunds within 30 days. [S1]", revoked=False, history=None):
        source = {"document_id": str(uuid4()), "chunk_id": str(uuid4()), "generation": str(uuid4()),
                  "filename": "policy.txt", "location": "Paragraph 1", "text": "Refunds within 30 days.", "page": None}
        config = Settings(_env_file=None, openrouter_api_key="fixture-only", chat_prefetch_knowledge=prefetch)
        agent = {**configuration(), "id": str(uuid4()), "version": 1} if configured else None
        if widget:
            agent['_widget_revision_id'] = str(uuid4())
        requests, frames = [], []

        def handler(request):
            payload = json.loads(request.content)
            requests.append(payload)
            has_evidence = payload['messages'][-1]['role'] == 'tool'
            if not has_evidence or (refine and len(requests) == 1):
                deltas = [({'role': 'assistant', 'tool_calls': [{'index': 0, 'id': 'refine', 'type': 'function',
                    'function': {'name': 'search_knowledge_base', 'arguments': '{"query":"refund proof requirements"}'}}]}, None), ({}, 'tool_calls')]
            else:
                deltas = [({'role': 'assistant', 'reasoning': 'private'}, None),
                          ({'content': '<think>private</think>' + text}, None), ({}, 'stop')]
            content = '\n\n'.join('data: ' + json.dumps({'id': 'fixture', 'object': 'chat.completion.chunk', 'created': 0,
                'model': 'fixture-resolved:free', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': finish}]}) for delta, finish in deltas)
            return httpx2.Response(200, headers={'content-type': 'text/event-stream'}, content=content + '\n\ndata: [DONE]\n\n')

        async def run():
            client = AsyncOpenAI(api_key='fixture-only', base_url='https://openrouter.ai/api/v1',
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)), max_retries=0)
            queue = asyncio.Queue()
            messages = history or [{'role': 'user', 'content': 'What is the refund policy?'}]
            body = chat.ChatInput(messages=messages)
            with patch.object(chat, 'settings', return_value=config), patch.object(chat, 'AsyncOpenAI', return_value=client), \
                 patch.object(chat, 'ready_generations', return_value=[source['generation']]), \
                 patch.object(chat, 'document_scope', return_value=[source['document_id']]), \
                 patch.object(vectors, 'search', return_value=[source]) as search, \
                 patch.object(chat, 'valid_sources', side_effect=lambda *args: [] if revoked else args[1]), \
                 patch.object(knowledge_access, 'valid_sources', side_effect=lambda *args: [] if revoked else args[1]), \
                 self.assertLogs('supportops.chat.performance', level='INFO') as logs:
                await chat.answer(body, 'fixture-owner', queue, agent)
            while not queue.empty():
                value = queue.get_nowait()
                if value:
                    name, payload = value.split('\n', 1)
                    frames.append((name.removeprefix('event: '), json.loads(payload.removeprefix('data: '))))
            return search.call_count, logs.output

        searches, logs = asyncio.run(run())
        self.assertFalse(any(name == 'error' for name, _ in frames), frames)
        return requests, frames, searches, logs

    def test_normal_answers_drop_from_two_provider_calls_to_one_in_every_chat(self):
        for configured, widget in [(False, False), (True, False), (True, True)]:
            with self.subTest(configured=configured, widget=widget):
                baseline, old_frames, _, _ = self.run_chat(configured=configured, widget=widget, prefetch=False)
                requests, frames, searches, logs = self.run_chat(configured=configured, widget=widget)
                self.assertEqual((len(baseline), len(requests), searches), (2, 1, 1))
                self.assertEqual(frames[-1][1]['text'], old_frames[-1][1]['text'])
                self.assertEqual(requests[0]['tool_choice'], 'auto')
                tool = requests[0]['messages'][-1]
                self.assertEqual(tool['role'], 'tool')
                self.assertIn('untrusted_evidence', tool['content'])
                self.assertIn('already searched once', requests[0]['messages'][0]['content'])
                self.assertIn('"model_requests": 1', logs[0])
                self.assertIn('"retrieval_ms"', logs[0])
                self.assertNotIn('What is the refund policy?', logs[0])
                self.assertNotIn('private', str(frames))
                self.assertEqual(requests[0]['provider']['max_price']['completion'], 0)

    def test_refinement_search_is_available_and_evidence_ids_are_stable(self):
        requests, frames, searches, _ = self.run_chat(configured=True, refine=True)
        self.assertEqual((len(requests), searches), (2, 2))
        self.assertEqual(len(frames[-1][1]['citations']), 1)
        self.assertEqual(frames[-1][1]['citations'][0]['id'], 'S1')

    def test_revoked_and_invented_sources_never_reach_either_chat(self):
        for configured in [False, True]:
            for options in [{'revoked': True}, {'text': 'Secret answer [S999]'}]:
                with self.subTest(configured=configured, options=options):
                    _, frames, _, _ = self.run_chat(configured=configured, **options)
                    self.assertEqual(frames[-1][1]['citations'], [])
                    self.assertNotIn('Refunds within 30 days.', str(frames))
                    self.assertNotIn('Secret answer', str(frames))

    def test_internal_markers_are_replaced_before_delivery(self):
        for marker, kind in [('[[GREETING]]', 'greeting'), ('[[CLARIFY]]', 'clarification'),
                             ('[[ESCALATE]]', 'escalation'), ('[[OUT_OF_SCOPE]]', 'out_of_scope')]:
            _, frames, _, _ = self.run_chat(configured=True, text=marker)
            self.assertEqual(frames[-1][1]['response_type'], kind)
            self.assertNotIn('[[', str(frames))

    def test_follow_up_keeps_question_first_and_uses_fresh_evidence(self):
        history = [{'role': 'user', 'content': 'What is the refund window?'},
                   {'role': 'assistant', 'content': '30 days.'}, {'role': 'user', 'content': 'Do I need proof?'}]
        requests, _, searches, _ = self.run_chat(history=history)
        query = json.loads(requests[0]['messages'][-2]['tool_calls'][0]['function']['arguments'])['query']
        self.assertTrue(query.startswith('Do I need proof?'))
        self.assertIn('refund window', query)
        self.assertEqual(searches, 1)

    def test_runtime_reuses_client_and_closes_it_once(self):
        async def run():
            client = SimpleNamespace(close=AsyncMock())
            config = Settings(_env_file=None, openrouter_api_key='fixture', chat_warmup_embeddings=False)
            with patch.object(chat, 'settings', return_value=config), patch.object(chat, 'new_client', return_value=client) as factory:
                async with chat.runtime():
                    async with chat.model_client() as first, chat.model_client() as second:
                        self.assertIs(first, second)
                        client.close.assert_not_awaited()
                factory.assert_called_once()
                client.close.assert_awaited_once()
                self.assertIsNone(chat._shared_client)
        asyncio.run(run())

    def test_query_vector_cache_is_bounded_and_returns_independent_lists(self):
        embedder = embeddings.Embedder.__new__(embeddings.Embedder)
        calls = []
        class Vector:
            def tolist(self):
                return [1.0, 2.0]
        def query(text):
            calls.append(text)
            return iter([Vector()])
        embedder.model = SimpleNamespace(query_embed=query)
        embedder.tokenizer = SimpleNamespace(encode=lambda *args, **kwargs: SimpleNamespace(ids=[]))
        embedder.lock = threading.Lock()
        embedder.query_cache = OrderedDict()
        embedder.query('refunds')[0] = 999
        self.assertEqual(embedder.query('refunds'), [1.0, 2.0])
        self.assertEqual(calls, ['refunds'])
        for index in range(129):
            embedder.query(str(index))
        self.assertEqual(len(embedder.query_cache), 128)
        self.assertNotIn('refunds', embedder.query_cache)


class WidgetDeliveryTests(unittest.TestCase):
    def test_done_delivers_committed_state_without_private_drafts(self):
        async def run():
            request = SimpleNamespace(is_disconnected=lambda: asyncio.sleep(0, result=False))
            body = widget_routes.Message(request_id=uuid4(), message='Refunds?')
            prepared = chat.ChatInput(messages=[{'role': 'user', 'content': body.message}], request_id=body.request_id)
            async def answer(body, owner, queue, agent):
                await queue.put(chat.event('text_delta', {'delta': 'PRIVATE DRAFT'}))
                await queue.put(chat.event('done', {'text': '30 days [S1]', 'response_type': 'answer',
                    'citations': [{'document_id': 'approved'}]}))
                await queue.put(None)
            with patch.object(widgets, 'prepare', return_value=(prepared, {}, 'owner', None)), \
                 patch.object(chat, 'answer', side_effect=answer), \
                 patch.object(widgets, 'public_state', return_value={}), \
                 patch.object(widgets, 'document_scope', return_value=['approved']), \
                 patch.object(widgets, 'validate_delivery'), \
                 patch.object(activity, 'finish_turn') as save:
                response = await widget_routes.message(uuid4(), body, request, 'session', 'https://shop.test')
                frames = []
                async for frame in response.body_iterator:
                    frames.append(frame)
                    if frame.startswith('event: done'):
                        save.assert_called_once()
                final = json.loads(frames[-1].split('data: ', 1)[1])
                self.assertEqual(final['conversation_id'], str(prepared.conversation_id))
                self.assertEqual(final['conversation_status'], 'answered')
                self.assertEqual(final['text'], '30 days')
                self.assertNotIn('PRIVATE', ''.join(frames))
                self.assertNotIn('citations', ''.join(frames))
        asyncio.run(run())

    def test_replay_uses_current_conversation_status(self):
        async def run():
            body = widget_routes.Message(request_id=uuid4(), message='Refunds?')
            previous = {'id': str(body.request_id), 'answer': '30 days', 'response_type': 'answer'}
            with patch.object(widgets, 'prepare', return_value=(None, None, 'owner', previous)), \
                 patch.object(widgets, 'public_state', return_value={'conversation_id': 'conversation', 'status': 'resolved'}):
                response = await widget_routes.message(uuid4(), body, None, 'session', 'https://shop.test')
                frames = [frame async for frame in response.body_iterator]
                self.assertEqual(json.loads(frames[0].split('data: ', 1)[1])['conversation_status'], 'resolved')
        asyncio.run(run())
