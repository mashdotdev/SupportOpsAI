"""Run with python -m supportops.worker. Postgres is the durable work queue."""
import hashlib
import logging
import threading
import time
from uuid import uuid4

from .db import transaction
from .documents import enqueue
from .embeddings import embedder
from .extraction import chunk, extract
from . import storage, vectors

log = logging.getLogger("supportops.worker")


class LeaseLost(Exception):
    pass


def claim():
    with transaction() as connection:
        job = connection.execute("""SELECT * FROM knowledge_jobs
            WHERE (status='queued' AND run_after<=now()) OR (status='running' AND lease_until<now())
            ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1""").fetchone()
        if not job:
            return None
        if job["attempts"] >= 3:
            connection.execute("UPDATE knowledge_jobs SET status='failed',updated_at=now() WHERE id=%s", (job["id"],))
            connection.execute("""UPDATE knowledge_documents SET status='failed', error='Processing was interrupted repeatedly. Retry indexing.',updated_at=now()
                WHERE id=%s AND status IN ('queued','indexing') AND index_generation=%s""", (job["document_id"], job["generation"]))
            return None
        # Every claim receives a unique generation, fencing a worker that lost its lease.
        generation, lease_token = uuid4(), uuid4()
        job = connection.execute("""UPDATE knowledge_jobs SET status='running', attempts=attempts+1,
            generation=%s, lease_token=%s, lease_until=now()+interval '2 minutes', updated_at=now()
            WHERE id=%s RETURNING *""", (generation, lease_token, job["id"])).fetchone()
        if job["operation"] == "ingest":
            connection.execute("""UPDATE knowledge_documents SET index_generation=%s, status='indexing', updated_at=now()
                WHERE id=%s AND status IN ('queued','indexing')""", (generation, job["document_id"]))
        return job


def renew(job):
    with transaction() as connection:
        row = connection.execute("""UPDATE knowledge_jobs SET lease_until=now()+interval '2 minutes'
            WHERE id=%s AND status='running' AND lease_token=%s AND lease_until>now() RETURNING id""",
            (job["id"], job["lease_token"])).fetchone()
    if not row:
        raise LeaseLost()


def process(job):
    with transaction() as connection:
        document = connection.execute("SELECT * FROM knowledge_documents WHERE id=%s", (job["document_id"],)).fetchone()
    if not document:
        return
    if job["operation"] == "delete":
        vectors.remove(document["user_id"], str(document["id"]))
        storage.delete(document["storage_key"])
        storage.delete(document["staging_key"])
        renew(job)
        with transaction() as connection:
            connection.execute("UPDATE knowledge_documents SET status='deleted', error=NULL, updated_at=now() WHERE id=%s AND status='deleting'", (document["id"],))
        return
    if document["status"] != "indexing" or document["index_generation"] != job["generation"]:
        return
    body = storage.read(document["storage_key"])
    passages = chunk(extract(document["filename"], body), embedder().tokenizer)
    for offset in range(0, len(passages), 32):
        renew(job)
        batch = passages[offset:offset + 32]
        embeddings = embedder().passages([p.text for p in batch])
        renew(job)
        vectors.write(document, job["generation"], batch, embeddings, offset)
    renew(job)
    with transaction() as connection:
        # Lock the lease and document in a transaction before publishing.
        lease = connection.execute("SELECT id FROM knowledge_jobs WHERE id=%s AND lease_token=%s AND lease_until>now() FOR UPDATE", (job["id"], job["lease_token"])).fetchone()
        if not lease:
            raise LeaseLost()
        connection.execute("""UPDATE knowledge_documents SET status='ready', active_generation=%s,
            checksum=%s, chunk_count=%s, error=NULL, updated_at=now()
            WHERE id=%s AND status='indexing' AND index_generation=%s""",
            (job["generation"], hashlib.sha256(body).hexdigest(), len(passages), document["id"], job["generation"]))


def finish(job, error=None):
    permanent = isinstance(error, ValueError) or job["attempts"] >= 3
    with transaction() as connection:
        row = connection.execute("""UPDATE knowledge_jobs SET status=%s, lease_until=NULL,
            run_after=now()+interval '30 seconds', updated_at=now() WHERE id=%s AND lease_token=%s RETURNING id""",
            ("failed" if error and permanent else "queued" if error else "done", job["id"], job["lease_token"])).fetchone()
        if row and error:
            message = str(error) if isinstance(error, ValueError) else "Processing service unavailable. Check configuration, then retry."
            connection.execute("""UPDATE knowledge_documents SET status=%s,error=%s,updated_at=now()
                WHERE id=%s AND index_generation=%s AND status='indexing'""",
                ("failed" if permanent else "queued", message, job["document_id"], job["generation"]))
            if job["operation"] == "delete":
                connection.execute("UPDATE knowledge_documents SET error=%s, updated_at=now() WHERE id=%s AND status='deleting'", (message, job["document_id"]))


def sweep():
    with transaction() as connection:
        abandoned = connection.execute("""UPDATE knowledge_documents SET status='deleting',updated_at=now()
            WHERE status='awaiting_upload' AND created_at<now()-interval '1 hour' RETURNING id""").fetchall()
        for row in abandoned:
            enqueue(connection, row["id"], "delete", uuid4())
        # Deletion is retried until storage is reachable again.
        connection.execute("UPDATE knowledge_jobs SET status='queued',attempts=0,run_after=now() WHERE operation='delete' AND status='failed' AND updated_at<now()-interval '5 minutes'")
        documents = connection.execute("SELECT id FROM knowledge_documents WHERE status IN ('ready','failed','deleted') ORDER BY updated_at").fetchall()
    for document in documents:
        # Clean only unleased generations, including late writes by expired workers.
        with transaction() as connection:
            document = connection.execute("SELECT * FROM knowledge_documents WHERE id=%s FOR UPDATE", (document["id"],)).fetchone()
            if document["status"] not in {"ready", "failed", "deleted"}:
                continue
            leased = connection.execute("SELECT generation FROM knowledge_jobs WHERE document_id=%s AND status='running' AND lease_until>now()", (document["id"],)).fetchall()
            keep = {str(row["generation"]) for row in leased}
            if document["active_generation"]:
                keep.add(str(document["active_generation"]))
            from qdrant_client import models
            query = vectors.scope(document["user_id"], str(document["id"]))
            if keep:
                query.must_not = [models.FieldCondition(key="generation", match=models.MatchAny(any=list(keep)))]
            vectors.client().delete(vectors.settings().qdrant_collection, models.FilterSelector(filter=query), wait=True)
            if document["created_at"].timestamp() < time.time() - 600:
                storage.delete(document["staging_key"])


def run_job(job):
    started = time.monotonic()
    stopped = threading.Event()
    def heartbeat():
        while not stopped.wait(25):
            try:
                renew(job)
            except Exception:
                return
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        process(job)
        finish(job)
    except LeaseLost:
        log.warning("job_lease_lost job=%s", job["id"])
    except Exception as error:
        log.warning("job_failed job=%s type=%s", job["id"], type(error).__name__)
        finish(job, error)
    finally:
        stopped.set()
        thread.join(timeout=1)
        log.info("job_finished job=%s operation=%s duration_ms=%d", job["id"], job["operation"], (time.monotonic() - started) * 1000)


def main():
    logging.basicConfig(level=logging.INFO)
    vectors.ensure_collection()
    embedder()
    last_sweep = 0
    while True:
        try:
            if time.monotonic() - last_sweep > 60:
                sweep()
                last_sweep = time.monotonic()
            job = claim()
            if job:
                run_job(job)
            else:
                time.sleep(2)
        except KeyboardInterrupt:
            break
        except Exception as error:
            log.warning("worker_unavailable type=%s", type(error).__name__)
            time.sleep(5)


if __name__ == "__main__":
    main()
