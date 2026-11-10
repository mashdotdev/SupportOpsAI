"""Tracing uses a memory processor and fixture LLM: no API calls or key export."""
import asyncio
from contextlib import contextmanager
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from agents.tracing import TracingProcessor, get_trace_provider, set_trace_provider
from agents.tracing.provider import DefaultTraceProvider

from supportops import agent_tracing, chat, vectors
from supportops.config import Settings
from tests import test_chat_performance


class RecordingProcessor(TracingProcessor):
    def __init__(self):
        self.traces, self.spans = [], []
        self.flushes = 0

    def on_trace_start(self, trace):
        pass

    def on_trace_end(self, trace):
        self.traces.append(trace.export())

    def on_span_start(self, span):
        pass

    def on_span_end(self, span):
        self.spans.append(span.export())

    def force_flush(self):
        self.flushes += 1

    def shutdown(self):
        pass


@contextmanager
def captured_traces(**options):
    original = get_trace_provider()
    provider = DefaultTraceProvider()
    recorded = RecordingProcessor()
    provider.register_processor(recorded)
    config = Settings(_env_file=None, openai_api_key='trace-key-fixture-only', **options)
    set_trace_provider(provider)
    try:
        with patch.object(agent_tracing, 'settings', return_value=config), \
             patch.object(agent_tracing, 'set_tracing_export_api_key') as key:
            agent_tracing.configure()
            yield recorded, key
            asyncio.run(agent_tracing.shutdown())
    finally:
        provider.shutdown()
        set_trace_provider(original)
        agent_tracing._configured = False


class AgentTracingTests(unittest.TestCase):
    def run_fixture(self, **options):
        return test_chat_performance.ChatPerformanceTests('test_follow_up_keeps_question_first_and_uses_fresh_evidence').run_chat(**options)

    def test_every_chat_has_one_grouped_trace_with_prefetch_generation_and_validation(self):
        for configured, widget in [(False, False), (True, False), (True, True)]:
            with self.subTest(configured=configured, widget=widget), captured_traces() as (recorded, key):
                self.run_fixture(configured=configured, widget=widget)
                key.assert_called_once_with('trace-key-fixture-only')
                self.assertEqual(len(recorded.traces), 1)
                root = recorded.traces[0]
                self.assertTrue(root['group_id'])
                self.assertEqual(root['metadata']['channel'], 'widget' if widget else 'playground')
                self.assertTrue(root['metadata']['request_id'])
                self.assertTrue(all(isinstance(value, str) for value in root['metadata'].values()))
                spans = [span['span_data'] for span in recorded.spans]
                self.assertEqual(sum(span['type'] == 'generation' for span in spans), 1)
                names = [span.get('name') for span in spans]
                self.assertIn('retrieval', names)
                self.assertIn('source_validation', names)
                self.assertIn('final_answer', names)
                retrieval = next(span for span in spans if span.get('name') == 'retrieval')
                self.assertEqual(retrieval['data']['trigger'], 'application_prefetch')
                self.assertEqual(retrieval['data']['result_count'], 1)
                self.assertEqual(recorded.flushes, 0)

    def test_content_is_excluded_by_default_and_available_with_explicit_setting(self):
        for include in [False, True]:
            with self.subTest(include=include), captured_traces(openai_agents_trace_include_sensitive_data=include) as (recorded, _):
                self.run_fixture(configured=True, refine=True)
                exported = json.dumps(recorded.traces + recorded.spans)
                self.assertEqual('Refunds within 30 days.' in exported, include)
                self.assertEqual('refund proof requirements' in exported, include)
                self.assertNotIn('trace-key-fixture-only', exported)
                self.assertNotIn('fixture-only', exported)
                self.assertTrue(any(span['span_data']['type'] == 'function' for span in recorded.spans))

    def test_kill_switch_disables_traces_even_when_key_exists(self):
        with captured_traces(openai_agents_disable_tracing=True) as (recorded, key):
            self.run_fixture()
            self.assertEqual(recorded.traces, [])
            self.assertEqual(recorded.spans, [])
            key.assert_not_called()

    def test_missing_key_disables_export_and_inference_uses_only_router_key(self):
        config = Settings(_env_file=None, openai_api_key='', openrouter_api_key='router-key-fixture')
        with patch.object(agent_tracing, 'settings', return_value=config), \
             patch.object(agent_tracing, 'set_tracing_export_api_key') as export_key:
            agent_tracing.configure()
            self.assertFalse(agent_tracing.enabled())
            self.assertTrue(agent_tracing.run_config().tracing_disabled)
            export_key.assert_not_called()
        with patch.object(chat, 'settings', return_value=config), patch.object(chat, 'AsyncOpenAI') as factory:
            chat.new_client()
            self.assertEqual(factory.call_args.kwargs['api_key'], 'router-key-fixture')
            self.assertEqual(factory.call_args.kwargs['base_url'], 'https://openrouter.ai/api/v1')

    def test_shutdown_flushes_without_per_request_flush(self):
        with captured_traces() as (recorded, _):
            self.run_fixture()
            self.assertEqual(recorded.flushes, 0)
            asyncio.run(agent_tracing.shutdown())
            self.assertEqual(recorded.flushes, 1)

    def test_dedicated_tracing_key_wins_over_unrelated_openai_environment_key(self):
        config = Settings(_env_file=None, openai_api_key='unrelated-environment-key',
                          openai_tracing_api_key='selected-trace-key')
        with patch.object(agent_tracing, 'settings', return_value=config), \
             patch.object(agent_tracing, 'set_tracing_export_api_key') as export_key:
            try:
                agent_tracing.configure()
                export_key.assert_called_once_with('selected-trace-key')
                self.assertTrue(agent_tracing.enabled())
            finally:
                agent_tracing._configured = False

    def test_retrieval_trace_separates_generation_lookup_embedding_vector_and_validation(self):
        source = {'document_id': 'synthetic-document', 'generation': 'synthetic-generation'}
        query_result = SimpleNamespace(points=[SimpleNamespace(payload=source)])
        body = chat.ChatInput(messages=[{'role': 'user', 'content': 'Refund policy?'}])
        with captured_traces() as (recorded, _), \
             patch.object(vectors, 'ready_generations', return_value=['synthetic-generation']), \
             patch.object(vectors, 'embedder', return_value=SimpleNamespace(query=lambda query: [1.0])), \
             patch.object(vectors, 'client') as client, \
             patch.object(vectors, 'valid_sources', side_effect=lambda owner, sources: sources):
            client.return_value.query_points.return_value = query_result
            with agent_tracing.turn(body):
                self.assertEqual(vectors.search('synthetic-owner', 'Refund policy?'), [source])
            names = {span['span_data'].get('name') for span in recorded.spans}
            self.assertTrue({'retrieval_generations', 'embedding', 'vector_search',
                             'retrieval_source_validation'}.issubset(names))
