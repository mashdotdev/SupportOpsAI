"""Browser-test harness: real Neon DB/Storage and embeddings; local Qdrant/fake LLM.

Explicitly run only against a disposable branch:
python tests/browser_server.py data/validation.env
This is not a production entry point and never calls OpenRouter.
"""
import json
from pathlib import Path
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
import httpx2
from openai import AsyncOpenAI
from qdrant_client import QdrantClient
import uvicorn

load_dotenv(sys.argv[1], override=True)
import os
os.environ["BACKEND_API_TOKEN"] = "rag-validation-service-token"
os.environ["OPENROUTER_API_KEY"] = "test-only-no-provider-request"
os.environ["FRONTEND_ORIGIN"] = "http://localhost:3002"
os.environ["QDRANT_URL"] = "http://local-test-only"
os.environ["QDRANT_COLLECTION"] = "rag_browser_validation"

from supportops import chat, vectors, worker
from supportops.config import settings
from main import app

qdrant = QdrantClient(":memory:")
vectors.client = lambda: qdrant


def handler(request):
    payload = json.loads(request.content)
    tool_result = payload["messages"][-1]
    if tool_result["role"] != "tool":
        deltas = [({"role": "assistant", "tool_calls": [{"index": 0, "id": "call_1", "type": "function",
                    "function": {"name": "search_knowledge_base", "arguments": '{"query":"refund receipt policy"}'}}]}, None), ({}, "tool_calls")]
    else:
        evidence = json.loads(tool_result["content"])["untrusted_evidence"]
        text = f"{evidence[0]['passage']} [{evidence[0]['source_id']}]" if evidence else chat.ABSTAIN
        deltas = [({"role": "assistant", "reasoning": "private test reasoning"}, None)]
        deltas.extend(({"content": text[index:index + 20]}, None) for index in range(0, len(text), 20))
        deltas.append(({}, "stop"))
    frames = ["data: " + json.dumps({"id": "chatcmpl-browser-test", "object": "chat.completion.chunk", "created": 0,
        "model": "openrouter/free", "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}) for delta, finish in deltas]
    return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content="\n\n".join(frames) + "\n\ndata: [DONE]\n\n")


def fixture_client(**kwargs):
    return AsyncOpenAI(api_key="test-only", base_url="https://openrouter.ai/api/v1",
                       http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)), max_retries=0)


if __name__ == "__main__":
    chat.AsyncOpenAI = fixture_client
    threading.Thread(target=worker.main, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8002, access_log=False)
