"""Opt-in synthetic quality/latency evaluation. Uses free quota; never edits app data."""
import argparse
import asyncio
import json
from pathlib import Path
import statistics
import time
from unittest.mock import patch
from uuid import uuid4

from . import chat, vectors
from .config import settings


def check_case(case, done):
    if not done:
        return False
    text = done['text'].lower()
    if case['name'] == 'unrelated':
        return not done['citations']
    if case['name'] == 'conflicting':
        return '14' in text and '30' in text and len(done['citations']) >= 2
    if case['name'] == 'follow_up':
        return 'receipt' in text and bool(done['citations'])
    return '30' in text and bool(done['citations']) and '900' not in text and 's999' not in text


async def evaluate_case(case, config):
    sources = [{"document_id": str(uuid4()), "chunk_id": str(uuid4()), "generation": str(uuid4()),
                "filename": f"policy-{index + 1}.txt", "location": "Paragraph 1", "page": None,
                "text": text} for index, text in enumerate(case["documents"])]
    messages = [chat.ChatMessage(**message) for message in case.get("history", [])]
    messages.append(chat.ChatMessage(role="user", content=case["question"]))
    queue = asyncio.Queue()
    recorded = []
    original_finish = chat.ChatTiming.finish

    def capture(timing, **values):
        original_finish(timing, **values)
        recorded.append(dict(timing.values))

    started = time.monotonic()
    with patch.object(chat, 'settings', return_value=config), \
         patch.object(vectors, "search", return_value=sources), \
         patch.object(chat, "valid_sources", side_effect=lambda _, records: records), \
         patch.object(chat, "ready_generations", return_value=[source["generation"] for source in sources]), \
         patch.object(chat.ChatTiming, 'finish', capture):
        await chat.answer(chat.ChatInput(messages=messages), "synthetic-evaluation", queue)
    done, error = None, None
    while not queue.empty():
        item = queue.get_nowait()
        if item and item.startswith("event: done"):
            done = json.loads(item.split("data: ", 1)[1])
        elif item and item.startswith('event: error'):
            error = json.loads(item.split('data: ', 1)[1])['error']
    metrics = recorded[-1] if recorded else {}
    return {'case': case['name'], 'model': config.openrouter_model,
            'mode': 'retrieval-first' if config.chat_prefetch_knowledge else 'tool-first',
            'passed': check_case(case, done), 'duration_ms': round((time.monotonic() - started) * 1000, 1),
            'model_requests': recorded[-1].get('model_requests', 0) if recorded else 0,
            'sdk_response_model': recorded[-1].get('sdk_response_model') if recorded else None,
            'model_ms': metrics.get('model_ms'), 'retrieval_ms': metrics.get('retrieval_ms'),
            'source_validation_ms': metrics.get('source_validation_ms'),
            'error': error}


async def main(args=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', action='append', help='Free model ID to benchmark; repeat to compare models.')
    parser.add_argument('--compare', action='store_true', help='Compare the previous tool-first path with retrieval-first.')
    parser.add_argument('--case', action='append', choices=['supported', 'unrelated', 'conflicting', 'follow_up', 'injection'])
    parser.add_argument('--repeats', type=int, default=1, choices=range(1, 6))
    parser.add_argument('--output', type=Path, help='Write synthetic benchmark results as JSON.')
    options = parser.parse_args(args)
    cases = json.loads((Path(__file__).parents[1] / "tests" / "grounding-evals.json").read_text())
    cases = [case for case in cases if not options.case or case['name'] in options.case]
    models = options.model or [settings().openrouter_model]
    modes = [False, True] if options.compare else [True]
    # Validate every requested model before spending quota. No paid fallback.
    for model in models:
        config = settings().model_copy(update={'openrouter_model': model})
        with patch.object(chat, 'settings', return_value=config):
            await chat.validate_model()
    print('Synthetic provider benchmark: retrieval/database/network-to-browser latency is excluded.')
    if 'openrouter/free' in models:
        print('The free router can select different models; pin a :free model for a controlled comparison.')
    results = []
    async with chat.runtime():
        for model in models:
            for repeat in range(options.repeats):
                for case in cases:
                    # Alternate order to reduce consistent warm-up/order bias.
                    for prefetch in (modes if repeat % 2 == 0 else list(reversed(modes))):
                        config = settings().model_copy(update={'openrouter_model': model, 'chat_prefetch_knowledge': prefetch})
                        result = await evaluate_case(case, config)
                        results.append(result)
                        print(f"{'PASS' if result['passed'] else 'FAIL'} {model} {result['mode']} {case['name']}: "
                              f"{result['duration_ms'] / 1000:.2f}s, {result['model_requests']} calls"
                              + (f" — {result['error']}" if result['error'] else ''), flush=True)
                        if result['error']:
                            break
                    # Avoid burning the remaining allowance on an unavailable provider.
                    if results[-1]['error']:
                        break
                if results[-1]['error']:
                    break
    summaries = []
    for model in models:
        for prefetch in modes:
            mode = 'retrieval-first' if prefetch else 'tool-first'
            group = [result for result in results if result['model'] == model and result['mode'] == mode]
            if not group:
                continue
            summary = {'model': model, 'mode': mode, 'passed': sum(item['passed'] for item in group), 'cases': len(group),
                       'median_ms': statistics.median(item['duration_ms'] for item in group),
                       'max_ms': max(item['duration_ms'] for item in group),
                       'model_requests': sum(item['model_requests'] for item in group)}
            ordered = sorted(item['duration_ms'] for item in group)
            summary['p95_ms'] = ordered[min(len(ordered) - 1, (95 * len(ordered) + 99) // 100 - 1)]
            summaries.append(summary)
            print(f"{model} {mode}: {summary['passed']}/{summary['cases']} passed, "
                  f"median {summary['median_ms'] / 1000:.2f}s, max {summary['max_ms'] / 1000:.2f}s")
    if options.output:
        options.output.write_text(json.dumps({'summaries': summaries, 'results': results}, indent=2), encoding='utf-8')
    return int(any(not result['passed'] for result in results))


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
