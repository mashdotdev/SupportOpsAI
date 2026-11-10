"""Optional OpenAI tracing, independent of the OpenRouter inference client."""
import asyncio
from contextlib import contextmanager
import logging

from agents import RunConfig, custom_span, flush_traces, get_current_trace, set_tracing_disabled, set_tracing_export_api_key, trace

from .config import settings

log = logging.getLogger("supportops.chat.performance")
_configured = False


def export_key(config):
    # A dedicated key avoids accidental inheritance of an unrelated OPENAI_API_KEY
    # from an IDE or hosting environment. The ordinary OpenAI key remains a fallback.
    return config.openai_tracing_api_key or config.openai_api_key


def enabled():
    config = settings()
    return _configured and bool(export_key(config)) and not config.openai_agents_disable_tracing


def include_content():
    return enabled() and settings().openai_agents_trace_include_sensitive_data


def configure(config=None):
    global _configured
    config = config or settings()
    _configured = bool(export_key(config)) and not config.openai_agents_disable_tracing
    if _configured:
        # Pydantic reads backend/.env without populating os.environ. Pass the key
        # explicitly, and never make it the default inference key/client.
        set_tracing_export_api_key(export_key(config))
    set_tracing_disabled(not _configured)
    log.info("openai_tracing enabled=%s include_content=%s", _configured, include_content())


async def shutdown():
    global _configured
    try:
        if _configured:
            # The SDK batches exports in a background thread. Flush only at shutdown,
            # never on the chat response path.
            await asyncio.to_thread(flush_traces)
    finally:
        _configured = False
        set_tracing_disabled(True)


def channel(agent):
    return "widget" if agent and agent.get('_widget_revision_id') else "playground"


def run_config():
    return RunConfig(tracing_disabled=not enabled(), trace_include_sensitive_data=include_content())


@contextmanager
def turn(body, agent=None):
    config = settings()
    metadata = {"request_id": str(body.request_id), "channel": channel(agent),
                "model": agent['model_id'] if agent else config.openrouter_model,
                "retrieval_first": str(config.chat_prefetch_knowledge).lower()}
    # The ingest API accepts string metadata values even though the SDK's public
    # trace() annotation permits Any. Omit absent fields rather than exporting null.
    if agent:
        metadata['agent_version'] = str(agent['version'])
    with trace("SupportOps " + channel(agent) + " chat", group_id=str(body.conversation_id),
               metadata=metadata, disabled=not enabled()):
        with stage("answer"):
            yield


@contextmanager
def stage(name, metadata=None):
    data = {"stage": name, **(metadata or {})}
    with custom_span(name, data=data, disabled=not enabled() or get_current_trace() is None) as span:
        try:
            yield data
        except BaseException as error:
            # Exception messages may contain customer content or credentials.
            span.set_error({"message": name + " failed", "data": {"error_type": type(error).__name__}})
            raise


def trace_id():
    current = get_current_trace()
    return current.trace_id if enabled() and current is not None else None
