from pathlib import PurePath
from typing import Annotated
from uuid import UUID, uuid4
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from .config import settings
from .db import owned, serialize, transaction
from .extraction import MEDIA
from . import storage


def require_user(authorization: Annotated[str | None, Header()] = None,
                 x_user_id: Annotated[str | None, Header()] = None):
    token = settings().backend_api_token
    if not token:
        raise HTTPException(503, "Configure BACKEND_API_TOKEN on the backend.")
    if not authorization or not hmac.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(401, "Unauthorized")
    if not x_user_id or len(x_user_id) > 256:
        raise HTTPException(401, "Unauthorized")
    return x_user_id


User = Annotated[str, Depends(require_user)]
router = APIRouter(prefix="/v1/knowledge-base/documents", tags=["knowledge-base"])


class Upload(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    size: int = Field(gt=0)


def find(connection, document_id, user_id, *, lock=False):
    document = owned(connection, document_id, user_id, lock=lock)
    if not document:
        raise HTTPException(404, "Document not found.")
    return document


def enqueue(connection, document_id, operation, generation):
    connection.execute("""INSERT INTO knowledge_jobs (id, document_id, operation, generation)
        VALUES (%s,%s,%s,%s) ON CONFLICT (document_id, operation, generation) DO NOTHING""",
        (uuid4(), document_id, operation, generation))


@router.get("")
def list_documents(user_id: User):
    with transaction() as connection:
        rows = connection.execute("""SELECT * FROM knowledge_documents WHERE user_id=%s AND status <> 'deleted'
            ORDER BY created_at DESC LIMIT 200""", (user_id,)).fetchall()
    return {"documents": [serialize(row) for row in rows]}


@router.post("", status_code=201)
def initialize_upload(body: Upload, user_id: User):
    if body.size > settings().max_file_bytes:
        raise HTTPException(413, "Files must be 20 MiB or smaller.")
    if any(char in body.filename for char in ("/", "\\", "\r", "\n", "\x00")):
        raise HTTPException(422, "Use a filename without path separators or control characters.")
    extension = PurePath(body.filename).suffix.lower()
    if extension not in MEDIA:
        raise HTTPException(422, "Upload PDF, DOCX, TXT, or Markdown files.")
    document_id = uuid4()
    # IDs, rather than user-provided filenames, define object keys.
    staging_key = f"staging/{document_id}{extension}"
    storage_key = f"documents/{document_id}{extension}"
    upload = storage.signed_upload(staging_key, MEDIA[extension], body.size)
    with transaction() as connection:
        row = connection.execute("""INSERT INTO knowledge_documents
            (id,user_id,filename,media_type,byte_size,staging_key,storage_key)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (document_id, user_id, body.filename, MEDIA[extension], body.size, staging_key, storage_key)).fetchone()
    return {"document": serialize(row), "upload": upload}


@router.post("/{document_id}/complete", status_code=202)
def complete_upload(document_id: UUID, user_id: User):
    # Lock serializes completion and deletion; repeated completion never recopies a source.
    with transaction() as connection:
        document = find(connection, document_id, user_id, lock=True)
        if document["status"] == "deleting":
            raise HTTPException(409, "Document is being deleted.")
        if document["status"] != "awaiting_upload":
            return {"document": serialize(document)}
        metadata = storage.head(document["staging_key"])
        if metadata["ContentLength"] != document["byte_size"] or metadata.get("ContentType") != document["media_type"]:
            raise HTTPException(422, "Uploaded file size or type does not match. Delete it and upload again.")
        storage.accept(document["staging_key"], document["storage_key"], metadata["ETag"])
        generation = uuid4()
        document = connection.execute("""UPDATE knowledge_documents SET status='queued', index_generation=%s,
            updated_at=now() WHERE id=%s RETURNING *""", (generation, document_id)).fetchone()
        enqueue(connection, document_id, "ingest", generation)
    return {"document": serialize(document)}


@router.post("/{document_id}/retry", status_code=202)
def retry(document_id: UUID, user_id: User):
    with transaction() as connection:
        document = find(connection, document_id, user_id, lock=True)
        if document["status"] != "failed":
            raise HTTPException(409, "Only failed documents can be retried.")
        generation = uuid4()
        document = connection.execute("""UPDATE knowledge_documents SET status='queued', error=NULL,
            index_generation=%s, updated_at=now() WHERE id=%s RETURNING *""", (generation, document_id)).fetchone()
        enqueue(connection, document_id, "ingest", generation)
    return {"document": serialize(document)}


@router.delete("/{document_id}", status_code=202)
def delete_document(document_id: UUID, user_id: User):
    with transaction() as connection:
        document = find(connection, document_id, user_id, lock=True)
        if document["status"] != "deleting":
            connection.execute("UPDATE knowledge_documents SET status='deleting', active_generation=NULL, updated_at=now() WHERE id=%s", (document_id,))
            enqueue(connection, document_id, "delete", uuid4())
    return {"status": "deleting"}


@router.get("/{document_id}/content")
def content(document_id: UUID, user_id: User):
    with transaction() as connection:
        document = find(connection, document_id, user_id)
    if document["status"] in {"awaiting_upload", "deleting"}:
        raise HTTPException(409, "This document is not available.")
    return RedirectResponse(storage.download(document), status_code=307, headers={"Cache-Control": "private, no-store"})
