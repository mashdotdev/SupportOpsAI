"""Database/queue integration against an explicitly supplied isolated Neon branch."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from qdrant_client import QdrantClient, models
from tokenizers import Tokenizer, models as token_models, pre_tokenizers

from main import app
from supportops import db, documents, storage, vectors, worker
from supportops.config import Settings


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "Set TEST_DATABASE_URL to an isolated migrated database")
class DatabaseFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = Settings(_env_file=None, database_url=os.environ["TEST_DATABASE_URL"], backend_api_token="test-service-token")
        cls.config_patch = patch.object(db, "settings", return_value=cls.config)
        cls.config_patch.start()
        db.pool.cache_clear()

    @classmethod
    def tearDownClass(cls):
        db.pool().close()
        db.pool.cache_clear()
        cls.config_patch.stop()

    def setUp(self):
        self.alice, self.bob = f"rag-test-{uuid4()}", f"rag-test-{uuid4()}"
        self.objects = {}
        self.copies = 0
        self.client = TestClient(app, raise_server_exceptions=False)
        self.qdrant = QdrantClient(":memory:")
        self.qdrant.create_collection(self.config.qdrant_collection, vectors_config=models.VectorParams(size=384, distance=models.Distance.COSINE))
        tokenizer = Tokenizer(token_models.WordLevel({"[UNK]": 0}, unk_token="[UNK]"))
        tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
        model = SimpleNamespace(tokenizer=tokenizer, passages=lambda texts: [[1.0] + [0.0] * 383 for _ in texts], query=lambda _: [1.0] + [0.0] * 383)
        self.patches = [patch.object(documents, "settings", return_value=self.config),
                        patch.object(vectors, "settings", return_value=self.config),
                        patch.object(vectors, "client", return_value=self.qdrant),
                        patch.object(vectors, "embedder", return_value=model),
                        patch.object(worker, "embedder", return_value=model),
                        patch.object(storage, "signed_upload", side_effect=lambda key, media, size: {"url": "https://storage.test", "fields": {"key": key}}),
                        patch.object(storage, "head", side_effect=lambda key: {"ContentLength": len(self.objects[key]), "ContentType": "text/plain", "ETag": "test"}),
                        patch.object(storage, "accept", side_effect=self.accept),
                        patch.object(storage, "read", side_effect=lambda key: self.objects[key]),
                        patch.object(storage, "delete", side_effect=lambda key: self.objects.pop(key, None)),
                        patch.object(storage, "download", return_value="https://storage.test/signed-original")]
        for p in self.patches:
            p.start()

    def tearDown(self):
        try:
            with db.transaction() as connection:
                connection.execute("DELETE FROM knowledge_documents WHERE user_id=ANY(%s)", ([self.alice, self.bob],))
        finally:
            for p in reversed(self.patches):
                p.stop()
            self.qdrant.close()
            self.client.close()

    def accept(self, source, destination, etag):
        self.copies += 1
        self.objects[destination] = self.objects[source]

    def request(self, method, path="", user=None, **kwargs):
        return self.client.request(method, "/v1/knowledge-base/documents" + path,
            headers={"Authorization": "Bearer test-service-token", "X-User-Id": user or self.alice}, **kwargs)

    def upload(self, text=b"Refunds within 30 days. Keep a receipt."):
        result = self.request("POST", json={"filename": "policy.txt", "size": len(text)})
        self.assertEqual(result.status_code, 201, result.text)
        data = result.json()
        self.objects[data["upload"]["fields"]["key"]] = text
        document_id = data["document"]["id"]
        self.assertEqual(self.request("POST", f"/{document_id}/complete").status_code, 202)
        return document_id

    def test_upload_ingest_retrieve_download_delete_and_user_isolation(self):
        document_id = self.upload()
        self.assertEqual(self.request("POST", f"/{document_id}/complete").status_code, 202)
        self.assertEqual(self.copies, 1)
        self.assertEqual(self.request("GET", user=self.bob).json()["documents"], [])
        for method, suffix in [("GET", "/content"), ("POST", "/complete"), ("POST", "/retry"), ("DELETE", "")]:
            self.assertEqual(self.request(method, f"/{document_id}{suffix}", user=self.bob).status_code, 404)
        job = worker.claim()
        worker.process(job)
        worker.finish(job)
        self.assertEqual(self.request("GET").json()["documents"][0]["status"], "ready")
        hits = vectors.search(self.alice, "refunds")
        self.assertEqual(hits[0]["document_id"], document_id)
        self.assertEqual(vectors.search(self.bob, "refunds"), [])
        self.assertEqual(self.request("GET", f"/{document_id}/content", follow_redirects=False).status_code, 307)
        self.request("DELETE", f"/{document_id}")
        self.assertEqual(vectors.search(self.alice, "refunds"), [])
        deletion = worker.claim()
        worker.process(deletion)
        worker.finish(deletion)
        self.assertEqual(self.request("GET").json()["documents"], [])
        self.assertEqual(self.objects, {})

    def test_expired_worker_cannot_publish_newer_generation(self):
        document_id = self.upload()
        old = worker.claim()
        with db.transaction() as connection:
            connection.execute("UPDATE knowledge_jobs SET lease_until=now()-interval '1 second' WHERE id=%s", (old["id"],))
        replacement = worker.claim()
        self.assertNotEqual(old["generation"], replacement["generation"])
        with self.assertRaises(worker.LeaseLost):
            worker.renew(old)
        worker.process(old)
        worker.finish(old)
        worker.process(replacement)
        worker.finish(replacement)
        with db.transaction() as connection:
            row = db.owned(connection, document_id, self.alice)
        self.assertEqual(row["active_generation"], replacement["generation"])

    def test_corrupt_extraction_fails_without_publishing_and_can_retry(self):
        document_id = self.upload(b"\x00binary")
        job = worker.claim()
        worker.run_job(job)
        self.assertEqual(self.request("GET").json()["documents"][0]["status"], "failed")
        self.assertEqual(vectors.search(self.alice, "anything"), [])
        self.assertEqual(self.request("POST", f"/{document_id}/retry").status_code, 202)

    def test_sweep_abandons_uploads_and_removes_old_vectors(self):
        document_id = self.upload()
        job = worker.claim()
        worker.process(job)
        worker.finish(job)
        vectors.write({"id": document_id, "user_id": self.alice, "filename": "old.txt"}, uuid4(),
                      [SimpleNamespace(text="obsolete", location="Paragraph 1", page=None)], [[1.0] + [0.0] * 383], 0)
        worker.sweep()
        hits = vectors.search(self.alice, "refunds")
        self.assertEqual(len(hits), 1)
        self.assertEqual(self.qdrant.count(self.config.qdrant_collection).count, 1)


if __name__ == "__main__":
    unittest.main()
