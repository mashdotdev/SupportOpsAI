from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore")
    database_url: str = ""
    backend_api_token: str = ""
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    # Used only by the Agents SDK trace exporter, never for model inference.
    openai_api_key: str = ""
    openai_tracing_api_key: str = ""
    openai_agents_disable_tracing: bool = False
    openai_agents_trace_include_sensitive_data: bool = False
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    qdrant_collection: str = "supportops_development_bge_small_v1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_endpoint_url_s3: str = ""
    aws_region: str = "us-east-2"
    storage_bucket: str = "knowledge-documents"
    frontend_origin: str = "http://localhost:3000"
    integration_encryption_key: str = ""
    widget_daily_model_requests: int = 45
    chat_prefetch_knowledge: bool = True
    chat_warmup_embeddings: bool = True
    embedding_model_path: str = "data/models/bge-small-en-v1.5"
    max_file_bytes: int = 20 * 1024 * 1024

    def require(self, *names: str) -> None:
        missing = [name.upper() for name in names if not getattr(self, name)]
        if missing:
            raise RuntimeError("Configure " + ", ".join(missing) + " on the backend.")


@lru_cache
def settings() -> Settings:
    return Settings()
