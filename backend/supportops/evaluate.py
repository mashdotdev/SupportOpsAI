"""Opt-in live grounding smoke eval: python -m supportops.evaluate (uses free quota)."""
import asyncio
import json
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from . import chat, vectors


async def main():
    cases = json.loads((Path(__file__).parents[1] / "tests" / "grounding-evals.json").read_text())
    failures = 0
    for case in cases:
        sources = [{"document_id": str(uuid4()), "chunk_id": str(uuid4()), "generation": str(uuid4()),
                    "filename": f"policy-{index + 1}.txt", "location": "Paragraph 1", "page": None,
                    "text": text} for index, text in enumerate(case["documents"])]
        messages = [chat.ChatMessage(**message) for message in case.get("history", [])]
        messages.append(chat.ChatMessage(role="user", content=case["question"]))
        queue = asyncio.Queue()
        with patch.object(vectors, "search", return_value=sources), patch.object(chat, "valid_sources", side_effect=lambda _, records: records), \
             patch.object(chat, "ready_generations", return_value=[source["generation"] for source in sources]):
            await chat.answer(chat.ChatInput(messages=messages), "synthetic-evaluation", queue)
        done = None
        while not queue.empty():
            item = queue.get_nowait()
            if item and item.startswith("event: done"):
                done = json.loads(item.split("data: ", 1)[1])
        text = done["text"].lower() if done else ""
        passed = bool(done)
        if case["name"] == "unrelated":
            passed = passed and not done["citations"]
        elif case["name"] == "conflicting":
            passed = passed and "14" in text and "30" in text and len(done["citations"]) >= 2
        elif case["name"] == "follow_up":
            passed = passed and "receipt" in text and bool(done["citations"])
        else:
            passed = passed and "30" in text and bool(done["citations"]) and "900" not in text and "s999" not in text
        failures += not passed
        print(f"{'PASS' if passed else 'FAIL'}: {case['name']} — {case['expected']}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    asyncio.run(main())
