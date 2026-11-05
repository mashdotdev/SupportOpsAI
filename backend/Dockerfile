FROM ghcr.io/astral-sh/uv:0.7.12 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /uvx /bin/
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH" \
    EMBEDDING_MODEL_PATH=/app/data/models/bge-small-en-v1.5
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev
COPY supportops ./supportops
RUN python -m supportops.package_model
COPY main.py ./
RUN useradd --uid 10001 --create-home app && chown -R app:app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
