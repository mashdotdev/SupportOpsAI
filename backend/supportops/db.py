from contextlib import contextmanager
from functools import lru_cache

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings


@lru_cache
def pool() -> ConnectionPool:
    settings().require("database_url")
    return ConnectionPool(settings().database_url, min_size=0, max_size=5, open=True,
                          timeout=10, kwargs={"row_factory": dict_row, "connect_timeout": 10})


@contextmanager
def transaction():
    with pool().connection() as connection:
        with connection.transaction():
            yield connection


def serialize(document: dict) -> dict:
    return {key: str(value) if key in {"id", "created_at", "updated_at"} else value
            for key, value in document.items()
            if key not in {"user_id", "storage_key", "staging_key", "index_generation", "active_generation", "checksum"}}


def owned(connection, document_id, user_id, *, lock=False):
    return connection.execute(
        "SELECT * FROM knowledge_documents WHERE id=%s AND user_id=%s AND status <> 'deleted'"
        + (" FOR UPDATE" if lock else ""), (document_id, user_id)).fetchone()


def valid_sources(user_id: str, sources: list[dict], document_ids=None) -> list[dict]:
    if not sources:
        return []
    with transaction() as connection:
        rows = connection.execute(
            "SELECT id, active_generation FROM knowledge_documents WHERE user_id=%s AND status='ready' AND id=ANY(%s::uuid[])",
            (user_id, list({s["document_id"] for s in sources}))).fetchall()
    allowed = {(str(row["id"]), str(row["active_generation"])) for row in rows}
    selected = None if document_ids is None else set(map(str, document_ids))
    return [s for s in sources if (s["document_id"], s["generation"]) in allowed
            and (selected is None or str(s["document_id"]) in selected)]


def ready_generations(user_id: str, document_ids=None) -> list[str]:
    with transaction() as connection:
        rows = connection.execute("SELECT active_generation FROM knowledge_documents WHERE user_id=%s AND status='ready'"
                                  + (" AND id=ANY(%s::uuid[])" if document_ids is not None else ""),
                                  (user_id, document_ids) if document_ids is not None else (user_id,)).fetchall()
    return [str(row["active_generation"]) for row in rows]
