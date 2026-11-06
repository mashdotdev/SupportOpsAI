import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from supportops.config import settings
from supportops.db import transaction
from supportops.documents import router as document_router
from supportops.chat import router as chat_router
from supportops.agent_routes import router as agent_router

app = FastAPI(title="SupportOps AI Backend", version="1.0.0")
app.include_router(document_router)
app.include_router(chat_router)
app.include_router(agent_router)
log = logging.getLogger("supportops.api")


@app.middleware("http")
async def request_limits(request: Request, call_next):
    started = time.monotonic()
    if request.method in {"POST", "PUT", "PATCH"}:
        body = bytearray()
        async for part in request.stream():
            body.extend(part)
            if len(body) > 200_000:
                return JSONResponse({"error": "Request is too large."}, status_code=413)
        request._body = bytes(body)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    log.info("request method=%s status=%s duration_ms=%d", request.method, response.status_code,
             (time.monotonic() - started) * 1000)
    return response


@app.exception_handler(Exception)
async def service_error(request: Request, error: Exception):
    log.warning("service_unavailable type=%s", type(error).__name__)
    detail = str(error) if isinstance(error, RuntimeError) else "A required backend service is unavailable. Check configuration and try again."
    return JSONResponse({"error": detail}, status_code=503)


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok", "service": "supportops"}


@app.get("/ready")
def ready():
    from supportops.embeddings import embedder
    from supportops.storage import client
    from supportops.vectors import ensure_collection
    settings().require("database_url", "backend_api_token", "openrouter_api_key", "qdrant_url")
    with transaction() as connection:
        connection.execute("SELECT id FROM knowledge_documents LIMIT 0")
    client().head_bucket(Bucket=settings().storage_bucket)
    ensure_collection()
    embedder()
    return {"status": "ready"}
