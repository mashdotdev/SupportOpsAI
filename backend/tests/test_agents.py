"""Agent boundary tests and opt-in integration on an isolated, migrated database."""
import asyncio
import json
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import httpx2
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from pydantic import ValidationError
from qdrant_client import QdrantClient, models

from main import app
from supportops import agent_models, agent_store, chat, db, documents, vectors, knowledge_access
from supportops.config import Settings


def configuration(**overrides):
    return {"name": "Care agent", "model_id": "openrouter/free", "instructions": "Explain uploaded policies.",
            "authority": {"scope": "Refund policies", "communication_style": "Warm and concise",
                          "boundaries": "Never approve refunds", "escalation_rules": "Escalate exceptions",
                          "escalation_message": "Please contact our support team for assistance."},
            "knowledge_mode": "all", "document_ids": [], **overrides}


class CatalogAndConfigurationTests(unittest.TestCase):
    def setUp(self):
        agent_models._catalog = None

    def test_catalog_filters_paid_and_incompatible_models_and_caches(self):
        entries = [
            {"id": "vendor/good:free", "name": "Good", "pricing": {"prompt": "0", "completion": "0"}, "supported_parameters": ["tools", "tool_choice"]},
            {"id": "vendor/paid:free", "pricing": {"prompt": "0.01", "completion": "0"}, "supported_parameters": ["tools", "tool_choice"]},
            {"id": "vendor/no-tools:free", "pricing": {"prompt": "0", "completion": "0"}},
            {"id": "vendor/charge:free", "pricing": {"prompt": "0", "completion": "0", "request": "0.001"}, "supported_parameters": ["tools", "tool_choice"]},
            {"id": "vendor/image:free", "pricing": {"prompt": "0", "completion": "0"}, "supported_parameters": ["tools", "tool_choice"], "architecture": {"output_modalities": ["image"]}},
        ]
        async def run():
            client = AsyncMock()
            client.get.return_value = httpx.Response(200, request=httpx.Request("GET", "https://openrouter.ai/api/v1/models"), json={"data": entries})
            with patch.object(agent_models.httpx, "AsyncClient") as factory:
                factory.return_value.__aenter__.return_value = client
                result = await agent_models.list_models()
                self.assertEqual([model["id"] for model in result], ["openrouter/free", "vendor/good:free"])
                await agent_models.validate_model("vendor/good:free")
                self.assertEqual(client.get.await_count, 1)
                for model_id in ["vendor/paid", "vendor/missing:free"]:
                    with self.assertRaises(ValueError):
                        await agent_models.validate_model(model_id)
        asyncio.run(run())

    def test_expired_catalog_failure_is_not_used_to_authorize_model(self):
        agent_models._catalog = (time.monotonic() - 301, [{"id": "vendor/good:free"}])
        async def run():
            client = AsyncMock()
            client.get.side_effect = httpx.ConnectError("offline")
            with patch.object(agent_models.httpx, "AsyncClient") as factory:
                factory.return_value.__aenter__.return_value = client
                with self.assertRaises(RuntimeError):
                    await agent_models.validate_model("vendor/good:free")
        asyncio.run(run())

    def test_configuration_bounds_and_explicit_empty_scope(self):
        value = agent_store.AgentInput(**configuration(knowledge_mode="selected"))
        self.assertEqual(value.document_ids, [])
        for overrides in [{"name": "  "}, {"instructions": "x" * 10001}, {"knowledge_mode": "forged"}, {"tools": ["refund"]}]:
            with self.assertRaises(ValidationError):
                agent_store.AgentInput(**configuration(**overrides))
        agent = {**configuration(), "id": str(uuid4()), "version": 1}
        text, sources, kind = chat.finalize_configured("Refunds approved without evidence.", {}, agent)
        self.assertEqual((text, sources, kind), (agent["authority"]["escalation_message"], [], "escalation"))
        text, sources, kind = chat.finalize_configured("[[ESCALATE]] Extra text [S1]", {"S1": {}}, agent)
        self.assertEqual((text, sources, kind), (agent["authority"]["escalation_message"], [], "escalation"))


class AgentRuntimeTests(unittest.TestCase):
    def fixture(self, response_text, source=None, scope=None, final_scope_error=False):
        agent = {**configuration(), "id": str(uuid4()), "version": 2}
        config = Settings(_env_file=None, openrouter_api_key="fixture-key")
        requests = []
        def handler(request):
            payload = json.loads(request.content)
            requests.append(payload)
            if source and len(requests) == 1:
                deltas = [({"role": "assistant", "tool_calls": [{"index": 0, "id": "search1", "type": "function", "function": {"name": "search_knowledge_base", "arguments": '{"query":"refunds"}'}}]}, None), ({}, "tool_calls")]
            else:
                deltas = [({"content": response_text}, None), ({}, "stop")]
            frames = ["data: " + json.dumps({"id": "fixture", "object": "chat.completion.chunk", "created": 0, "model": "openrouter/free", "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}) for delta, finish in deltas]
            return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content="\n\n".join(frames) + "\n\ndata: [DONE]\n\n")
        async def run():
            client = AsyncOpenAI(api_key="fixture-key", base_url="https://openrouter.ai/api/v1", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)), max_retries=0)
            queue = asyncio.Queue()
            def final_sources(owner, sources, agent):
                if final_scope_error:
                    raise ValueError("Agent changed")
                return [item for item in sources if scope is None or item['document_id'] in scope]
            with patch.object(chat, "settings", return_value=config), patch.object(chat, "AsyncOpenAI", return_value=client), \
                 patch.object(agent_store, "current_document_scope", return_value=scope), \
                 patch.object(knowledge_access, 'valid_sources', side_effect=final_sources), \
                 patch.object(vectors, "search", return_value=[source] if source else []) as search, \
                 patch.object(chat, "valid_sources", side_effect=lambda owner, sources, selected: [item for item in sources if selected is None or item["document_id"] in selected]):
                await chat.answer(chat.ChatInput(messages=[chat.ChatMessage(role="user", content="Test request")]), "alice", queue, agent)
            frames = []
            while not queue.empty():
                frame = queue.get_nowait()
                if frame:
                    frames.append((frame.split("\n", 1)[0][7:], json.loads(frame.split("data: ", 1)[1])))
            return frames, search.call_args
        frames, search_args = asyncio.run(run())
        for request in requests:
            self.assertEqual(request["model"], "openrouter/free")
            self.assertNotIn("models", request)
            self.assertEqual(request["provider"]["max_price"], {"prompt": 0, "completion": 0, "request": 0, "image": 0})
            self.assertEqual([tool["function"]["name"] for tool in request["tools"]], ["search_knowledge_base"])
            self.assertIn("Never approve refunds", request["messages"][0]["content"])
        return frames, agent, search_args

    def test_greeting_clarification_and_escalation_without_citations(self):
        for marker, kind in [("[[GREETING]]", "greeting"), ("[[CLARIFY]]", "clarification"), ("[[ESCALATE]]", "escalation"), ("[[OUT_OF_SCOPE]]", "out_of_scope")]:
            with self.subTest(marker=marker):
                frames, agent, _ = self.fixture(marker)
                final = next(payload for name, payload in frames if name == "done")
                self.assertEqual(final["response_type"], kind)
                self.assertEqual(final["citations"], [])
                self.assertNotIn("[[", str(frames))
                if kind in {"escalation", "out_of_scope"}:
                    self.assertEqual(final["text"], agent["authority"]["escalation_message"])

    def test_answer_uses_selected_documents_and_validated_citations(self):
        source = {"document_id": str(uuid4()), "generation": str(uuid4()), "chunk_id": str(uuid4()), "filename": "policy.txt", "location": "Paragraph 1", "text": "Refunds within 30 days.", "page": None}
        frames, _, search_args = self.fixture("Refunds within 30 days. [S1]", source, [source["document_id"]])
        final = next(payload for name, payload in frames if name == "done")
        self.assertEqual(final["response_type"], "answer")
        self.assertEqual(final["citations"][0]["document_id"], source["document_id"])
        self.assertEqual(search_args.args[2], [source["document_id"]])

    def test_unapproved_or_changed_sources_cannot_be_displayed(self):
        source = {"document_id": str(uuid4()), "generation": str(uuid4()), "chunk_id": str(uuid4()), "filename": "policy.txt", "location": "Paragraph 1", "text": "Secret", "page": None}
        frames, agent, _ = self.fixture("Secret [S1]", source, [])
        final = next(payload for name, payload in frames if name == "done")
        self.assertEqual(final["text"], agent["authority"]["escalation_message"])
        self.assertNotIn("Secret", str(frames))
        frames, _, _ = self.fixture("Secret [S1]", source, None, final_scope_error=True)
        self.assertTrue(any(name == "error" for name, _ in frames))
        self.assertFalse(any(name in {"text_delta", "done"} for name, _ in frames))


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "Set TEST_DATABASE_URL to an isolated migrated database")
class AgentDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = Settings(_env_file=None, database_url=os.environ["TEST_DATABASE_URL"], backend_api_token="agent-tests-token")
        cls.patches = [patch.object(db, "settings", return_value=cls.config), patch.object(documents, "settings", return_value=cls.config)]
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
        self.alice, self.bob = f"agent-test-{uuid4()}", f"agent-test-{uuid4()}"
        self.client = TestClient(app, raise_server_exceptions=False)

    def tearDown(self):
        with db.transaction() as connection:
            connection.execute("DELETE FROM ai_agents WHERE user_id=ANY(%s)", ([self.alice, self.bob],))
            connection.execute("DELETE FROM knowledge_documents WHERE user_id=ANY(%s)", ([self.alice, self.bob],))
        self.client.close()

    def request(self, method, path="", user=None, **kwargs):
        return self.client.request(method, "/v1/agents" + path, headers={"Authorization": "Bearer agent-tests-token", "X-User-Id": user or self.alice}, **kwargs)

    def document(self, owner=None):
        document_id, generation = uuid4(), uuid4()
        with db.transaction() as connection:
            connection.execute("""INSERT INTO knowledge_documents (id,user_id,filename,media_type,byte_size,storage_key,staging_key,status,active_generation)
                VALUES (%s,%s,'policy.txt','text/plain',20,%s,%s,'ready',%s)""", (document_id, owner or self.alice, f"agent-test/{document_id}", f"staging/{document_id}", generation))
        return str(document_id), str(generation)

    def test_owned_crud_version_conflicts_and_delete(self):
        created = self.request("POST", json=configuration())
        self.assertEqual(created.status_code, 201, created.text)
        agent = created.json()["agent"]
        self.assertEqual(agent["version"], 1)
        self.assertNotIn("user_id", agent)
        self.assertEqual(self.request("GET").json()["agents"][0]["id"], agent["id"])
        self.assertEqual(self.request("GET", f"/{agent['id']}").json()["agent"]["name"], "Care agent")
        self.assertEqual(self.request("GET", user=self.bob).json(), {"agents": []})
        for method in ["GET", "PATCH", "DELETE"]:
            response = self.request(method, f"/{agent['id']}", user=self.bob, **({"json": {**configuration(), "version": 1}} if method == "PATCH" else {}))
            self.assertEqual(response.status_code, 404, response.text)
        update = {**configuration(name="Renamed"), "version": 1}
        self.assertEqual(self.request("PATCH", f"/{agent['id']}", json=update).json()["agent"]["version"], 2)
        self.assertEqual(self.request("PATCH", f"/{agent['id']}", json=update).status_code, 409)
        self.assertEqual(self.request("POST", f"/{agent['id']}/chat", json={"version": 1, "messages": [{"role": "user", "content": "Hello"}]}).status_code, 409)
        self.assertEqual(self.request("DELETE", f"/{agent['id']}").status_code, 204)
        self.assertEqual(self.request("GET", f"/{agent['id']}").status_code, 404)

    def test_document_permissions_empty_selection_and_deletion(self):
        first, generation = self.document()
        second, _ = self.document()
        foreign, _ = self.document(self.bob)
        self.assertEqual(self.request("POST", json=configuration(knowledge_mode="selected", document_ids=[foreign])).status_code, 422)
        agent = self.request("POST", json=configuration(knowledge_mode="selected", document_ids=[first])).json()["agent"]
        self.assertEqual(agent["document_ids"], [first])
        self.assertEqual(db.ready_generations(self.alice, [first]), [generation])
        self.assertEqual(db.ready_generations(self.alice, []), [])
        sources = [{"document_id": first, "generation": generation}, {"document_id": second, "generation": "invalid"}]
        self.assertEqual(db.valid_sources(self.alice, sources, []), [])
        with db.transaction() as connection:
            connection.execute("UPDATE knowledge_documents SET status='deleting' WHERE id=%s", (first,))
        self.assertEqual(db.valid_sources(self.alice, sources, [first]), [])
        self.assertEqual(db.ready_generations(self.alice, [first]), [])
        self.assertEqual(self.request("PATCH", f"/{agent['id']}", json={**configuration(knowledge_mode="selected", document_ids=[first]), "version": 1}).status_code, 422)
        # A selected agent with no documents keeps its explicit empty scope.
        empty = self.request("PATCH", f"/{agent['id']}", json={**configuration(knowledge_mode="selected"), "version": 1}).json()["agent"]
        self.assertEqual(agent_store.current_document_scope(agent["id"], self.alice, empty["version"]), [])

    def test_qdrant_filters_selected_files_before_returning_payloads(self):
        first, first_generation = self.document()
        second, second_generation = self.document()
        qdrant = QdrantClient(":memory:")
        qdrant.create_collection(self.config.qdrant_collection, vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE))
        vector = [1.0] + [0.0] * 383
        for doc, generation in [(first, first_generation), (second, second_generation)]:
            qdrant.upsert(self.config.qdrant_collection, [models.PointStruct(id=str(uuid4()), vector=vector, payload={"user_id": self.alice, "document_id": doc, "generation": generation})])
        with patch.object(vectors, "settings", return_value=self.config), patch.object(vectors, "client", return_value=qdrant), patch.object(vectors, "embedder", return_value=SimpleNamespace(query=lambda _: vector)):
            self.assertEqual([hit["document_id"] for hit in vectors.search(self.alice, "refunds", [first])], [first])
            self.assertEqual(vectors.search(self.alice, "refunds", []), [])
        qdrant.close()

    def test_paid_models_and_unauthorized_requests_are_rejected(self):
        self.assertEqual(self.request("POST", json=configuration(model_id="vendor/paid-model")).status_code, 422)
        for method, path in [("GET", ""), ("GET", "/models"), ("POST", "")]:
            response = self.client.request(method, "/v1/agents" + path, **({"json": configuration()} if method == "POST" else {}))
            self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
