from functools import lru_cache
import logging
import time
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import QdrantClient, models

from .config import settings
from .db import ready_generations, valid_sources
from .embeddings import DIMENSIONS, embedder
from .chat_timing import current_request_id
from . import agent_tracing

log = logging.getLogger("supportops.chat.performance.retrieval")


@lru_cache
def client():
    config = settings()
    config.require("qdrant_url")
    return QdrantClient(
        url=config.qdrant_url, api_key=config.qdrant_api_key or None, timeout=20
    )


def ensure_collection():
    connection = client()
    name = settings().qdrant_collection
    if not connection.collection_exists(name):
        connection.create_collection(
            name,
            vectors_config=models.VectorParams(
                size=DIMENSIONS, distance=models.Distance.COSINE
            ),
        )
    info = connection.get_collection(name)
    if info.config.params.vectors.size != DIMENSIONS:
        raise RuntimeError(
            "Qdrant collection must use 384 dimensions. Select a new collection and reindex."
        )
    for field in ("user_id", "document_id", "generation"):
        if field not in (info.payload_schema or {}):
            connection.create_payload_index(
                name, field, models.PayloadSchemaType.KEYWORD, wait=True
            )


def scope(user_id, document_id=None, generation=None):
    values = {"user_id": user_id, "document_id": document_id, "generation": generation}
    return models.Filter(
        must=[
            models.FieldCondition(key=key, match=models.MatchValue(value=str(value)))
            for key, value in values.items()
            if value is not None
        ]
    )


def write(document, generation, passages, vectors, offset):
    points = []
    for index, (passage, vector) in enumerate(
        zip(passages, vectors, strict=True), offset
    ):
        chunk_id = str(uuid5(NAMESPACE_URL, f"{document['id']}:{generation}:{index}"))
        points.append(
            models.PointStruct(
                id=chunk_id,
                vector=vector,
                payload={
                    "chunk_id": chunk_id,
                    "user_id": document["user_id"],
                    "document_id": str(document["id"]),
                    "generation": str(generation),
                    "filename": document["filename"],
                    "text": passage.text,
                    "location": passage.location,
                    "page": passage.page,
                },
            )
        )
    client().upsert(settings().qdrant_collection, points, wait=True)


def remove(user_id, document_id, generation=None):
    client().delete(
        settings().qdrant_collection,
        points_selector=models.FilterSelector(
            filter=scope(user_id, document_id, generation)
        ),
        wait=True,
    )


def search(user_id, query, document_ids=None):
    started = time.monotonic()
    with agent_tracing.stage("retrieval_generations") as detail:
        generations = (
            ready_generations(user_id)
            if document_ids is None
            else ready_generations(user_id, document_ids)
        )
        detail['generation_count'] = len(generations)
    if not generations:
        return []
    query_filter = scope(user_id)
    query_filter.must.append(
        models.FieldCondition(key="generation", match=models.MatchAny(any=generations))
    )
    if document_ids is not None:
        query_filter.must.append(
            models.FieldCondition(
                key="document_id",
                match=models.MatchAny(any=list(map(str, document_ids))),
            )
        )
    scope_ms = (time.monotonic() - started) * 1000
    embedding_started = time.monotonic()
    with agent_tracing.stage("embedding"):
        vector = embedder().query(query)
    embedding_ms = (time.monotonic() - embedding_started) * 1000
    query_started = time.monotonic()
    with agent_tracing.stage("vector_search") as detail:
        hits = (
            client()
            .query_points(
                settings().qdrant_collection,
                query=vector,
                query_filter=query_filter,
                limit=8,
                with_payload=True,
            )
            .points
        )
        detail['candidate_count'] = len(hits)
    vector_ms = (time.monotonic() - query_started) * 1000
    validation_started = time.monotonic()
    candidates = [hit.payload for hit in hits if hit.payload]
    with agent_tracing.stage("retrieval_source_validation") as detail:
        result = (
            valid_sources(user_id, candidates)
            if document_ids is None
            else valid_sources(user_id, candidates, document_ids)
        )[:8]
        detail['permitted_count'] = len(result)
    log.info(
        "retrieval request_id=%s duration_ms=%d scope_ms=%d embedding_ms=%d vector_ms=%d validation_ms=%d hits=%d",
        current_request_id.get(),
        (time.monotonic() - started) * 1000,
        scope_ms, embedding_ms, vector_ms, (time.monotonic() - validation_started) * 1000,
        len(result),
    )
    return result
