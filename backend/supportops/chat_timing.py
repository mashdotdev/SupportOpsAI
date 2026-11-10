"""Content-free stage timings shared by playground and public chat."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
import time

from . import agent_tracing

log = logging.getLogger("supportops.chat.performance")
current_request_id = ContextVar("chat_request_id", default="")


def configure_logging():
    # Uvicorn configures only its own loggers. Expose timings without enabling
    # HTTP-library logging or recording prompts and credentials.
    if not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("INFO: %(message)s"))
        log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False


class ChatTiming:
    def __init__(self, request_id, **metadata):
        self.started = time.monotonic()
        self.values = {"request_id": str(request_id), **metadata}

    @contextmanager
    def measure(self, name):
        started = time.monotonic()
        with agent_tracing.stage(name.removesuffix("_ms")) as data:
            try:
                yield data
            finally:
                elapsed = round((time.monotonic() - started) * 1000, 1)
                self.values[name] = self.values.get(name, 0) + elapsed
                data['duration_ms'] = elapsed

    def first_text(self):
        self.values.setdefault("first_model_text_ms", round((time.monotonic() - self.started) * 1000, 1))

    def finish(self, **values):
        self.values.update(values, total_ms=round((time.monotonic() - self.started) * 1000, 1))
        if agent_tracing.trace_id():
            self.values['trace_id'] = agent_tracing.trace_id()
        with agent_tracing.stage("timing_summary", self.values):
            pass
        log.info("chat_timing %s", json.dumps(self.values))
