import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler

from supportops.config import settings
from supportops.db import transaction
from supportops.documents import router as document_router
from supportops.chat import router as chat_router
from supportops.agent_routes import router as agent_router
from supportops.overview_routes import router as overview_router
from supportops.integration_routes import router as integration_router
from supportops.widget_routes import router as widget_router, public as public_widget_router
from supportops import chat
from supportops.chat_timing import configure_logging


@asynccontextmanager
async def lifespan(app):
    configure_logging()
    async with chat.runtime():
        yield


app = FastAPI(title="SupportOps AI Backend", version="1.0.0", lifespan=lifespan)
app.include_router(document_router)
app.include_router(chat_router)
app.include_router(agent_router)
app.include_router(overview_router)
app.include_router(integration_router)
app.include_router(widget_router)
app.include_router(public_widget_router)
log = logging.getLogger("supportops.api")


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    if request.url.path.startswith(("/v1/integrations/", "/v1/public/widgets/")):
        # Pydantic includes rejected field inputs by default; never echo a webhook credential.
        return JSONResponse(
            {
                "error": "; ".join(item["msg"] for item in error.errors())[:500],
                "detail": [
                    {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
                    for item in error.errors()
                ],
            },
            status_code=422,
        )
    return await request_validation_exception_handler(request, error)


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
    log.info(
        "request method=%s status=%s duration_ms=%d",
        request.method,
        response.status_code,
        (time.monotonic() - started) * 1000,
    )
    return response


@app.exception_handler(Exception)
async def service_error(request: Request, error: Exception):
    log.warning("service_unavailable type=%s", type(error).__name__)
    detail = "Chat is temporarily unavailable. Please try again later." if request.url.path.startswith('/v1/public/widgets/') else (
        str(error)
        if isinstance(error, RuntimeError)
        else "A required backend service is unavailable. Check configuration and try again."
    )
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

    settings().require(
        "database_url", "backend_api_token", "openrouter_api_key", "qdrant_url"
    )
    with transaction() as connection:
        connection.execute("SELECT id FROM knowledge_documents LIMIT 0")
        connection.execute("SELECT id FROM ai_agents LIMIT 0")
        connection.execute("SELECT id FROM agent_conversations LIMIT 0")
        connection.execute("SELECT id FROM slack_connections LIMIT 0")
        connection.execute("SELECT id FROM website_widgets LIMIT 0")
    client().head_bucket(Bucket=settings().storage_bucket)
    ensure_collection()
    embedder()
    return {"status": "ready"}
