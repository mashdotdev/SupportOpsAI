# SupportOps RAG backend

FastAPI + OpenAI Agents SDK using **OpenRouter free chat models**, CPU FastEmbed,
Qdrant Cloud, and private Neon Object Storage. No OpenAI API key is needed.

## Configure

Copy `.env.example` to `.env`, preserving existing secrets. Supply an OpenRouter
key, Qdrant URL/key, and the Neon branch's S3 credentials. `DATABASE_URL` must point
to the **same Neon branch** used by Next.js. Set matching `BACKEND_API_TOKEN` values
in backend `.env` and frontend `.env.local`; add `BACKEND_URL` to the frontend.
Never expose these values through `NEXT_PUBLIC_` variables.

The default model is `openrouter/free`. A configured `:free` model must exist in
OpenRouter's catalog, have zero prompt/completion pricing, and support tools and
tool choice. No paid fallback list is sent. OpenAI tracing is disabled. Free
capacity and shared account quotas can interrupt chat; retries are user initiated.
OpenRouter receives questions, recent chat context, and retrieved policy passages.
An empty knowledge base (including files still indexing) returns upload/readiness
guidance without calling OpenRouter or Qdrant. Free endpoints need not implement
`parallel_tool_calls`; the backend omits it and enforces its two-search limit in
the retrieval tool instead.

From `frontend/`, use the existing Neon CLI context to create an isolated development
branch before applying schema/config changes. The private `knowledge-documents`
bucket is declared in `neon.ts`. Review `neon config plan`, then run `neon deploy`
against the chosen branch and copy its `AWS_*` variables to the backend environment.
Do not replace production environment files with development branch credentials.
Neon Storage requires a supported project region; the existing configuration
indicates Ohio (`us-east-2`).

Prisma exclusively owns schema migrations:

```sh
cd frontend
bun run db:validate
bun run db:migrate
```

Run migrations against an isolated branch first. The migrations add knowledge
documents, jobs, AI agents, and conversation activity, preserving tickets and managed Auth tables. SQL CHECK
constraints on size/status/counts must remain in migration SQL because Prisma
does not represent them. Use pooled URLs for runtime and direct URLs for migrations.

## Run locally

From the repository root, enter `backend/` before running the API:

```sh
cd backend
uv sync --locked
uv run python -m supportops.package_model
uv run python -m supportops.configure_storage
uv run uvicorn main:app --reload --port 8000 --no-access-log
# Another terminal, also in backend/:
uv run python -m supportops.worker
```

If an endpoint reports a missing relation such as `ai_agents` or `agent_conversations`, apply the pending
Prisma migrations with `bun run db:migrate` from `frontend/`, then retry the request.
The frontend migration URL and backend `DATABASE_URL` must target the same database.

Run `bun run dev` in `frontend/`. Visit `/workspace/knowledge-base`, upload a policy,
wait for Ready, then open `/workspace/playground`. Document uploads go directly
to Storage. Browser uploads require bucket CORS matching `FRONTEND_ORIGIN` exactly.

FastEmbed uses a revision-pinned, checksum-verified quantized ONNX artifact packaged
by `supportops.package_model`. Inference does not download models. Both API and worker
must deploy the same artifact. It embeds English text into 384-dimensional cosine
vectors. Chunking uses the model tokenizer with 400-token chunks and 60-token overlap;
query text is bounded to leave room for model instructions and special tokens.

## Data and recovery

- Sources are immutable after upload completion. Original filenames never become
  storage paths. Original downloads are authorized and signed for 60 seconds.
- PDF pages, DOCX paragraph/table rows, and text paragraph numbers survive extraction.
  Scanned or encrypted PDFs require a readable, unlocked replacement; OCR is deferred.
- Postgres stores status and durable work. Worker leases expire after two minutes
  and renew every 25 seconds. Every claim uses a new generation; only an active,
  complete generation can be retrieved. Transient indexing failures receive three
  attempts; extraction errors fail immediately and can be retried after correction.
- Deletion first removes retrieval eligibility. The worker removes originals and
  vectors, retrying unavailable deletion services. Periodic sweeps clean abandoned
  uploads and obsolete generations; bucket lifecycle rules are not relied on.
- Use a unique `QDRANT_COLLECTION` per Neon branch. Neon branching does **not** branch
  Qdrant. Changing embedding models/revisions requires a new collection and reindexing.
- Chat saves conversations and response attempts as **test activity**. The browser
  still sends bounded completed turns for model context; clearing the visible chat
  starts a new saved conversation, and does not delete its history.
  Source IDs are validated against owned, ready documents before final answers.
  Citation identity checks do not prove semantic entailment; use the grounding evals.

## Overview and conversation activity

`/workspace` displays owner-scoped conversation metrics, current outcomes, a daily
volume chart, agent comparisons, and searchable, paginated history. Playground and
saved-agent chats are always marked `test` by the backend. The default `live` view
stays empty until a trusted customer channel is implemented; clients cannot turn
test requests into live activity.

Answers are not automatically counted as resolutions. A workspace owner explicitly
marks a conversation resolved or reopens it from the detail panel. Escalation means
human assistance is recommended; it does not perform a handoff. Failed/cancelled
attempts remain visible, while successful response timings exclude them. Agent
names, model IDs, and versions are retained even if an agent is renamed or deleted.

Periods include conversations started on the selected local calendar dates. Search
and outcome filters apply to the conversation table; the cards and chart keep the
selected period, agent, and source. Answered/clarification conversations become
inactive after 24 hours; human-attention and confirmed-resolution states persist.
Running attempts abandoned for three minutes are recorded as interrupted failures.

`GET /v1/overview/events` provides authenticated SSE invalidations by polling durable
activity revisions every two seconds, without holding database connections open.
Streams reconnect after 95 seconds; the page also refreshes every 15 seconds while
visible to recover missed notifications and refresh time-based outcomes.

Verify with `bun run test:overview` in `frontend/` and, in `backend/`,
`uv run python -m unittest tests.test_activity`. Set `TEST_DATABASE_URL` to a migrated
**isolated** database to enable the database integration tests.

## Deployment

From the repository root:

```sh
docker compose build api
docker compose up -d
```

The shared image packages the model during its build and runs as an unprivileged
user. The worker is a separate service with the same configuration/image. Host
Next.js separately and point its server-only `BACKEND_URL` at the API. Restrict API
network access to the frontend where practical; every business endpoint additionally
requires the service token and server-set user ID. Do not expose the service token
to browsers. TLS is required between hosted services.

Configure the HTTPS reverse proxy to disable response buffering for chat, permit a
120-second request budget, and pass disconnects upstream. Nginx equivalents:
`proxy_buffering off`, `proxy_read_timeout 120s`, `proxy_send_timeout 120s`.
Chat emits heartbeats every ten seconds and times out after 110 seconds.

`GET /health` is liveness; `GET /ready` checks configuration, schema, storage,
Qdrant collection, and packaged embeddings. Bootstrap the collection with
`uv run python -c "from supportops.vectors import ensure_collection; ensure_collection()"`
before routing production traffic. Use the worker logs to monitor failures and
queue status/attempt counts in `knowledge_jobs`. Operational logs omit document
contents, questions, credentials, signed URLs, and provider reasoning.

## Saved AI agents

`/workspace/ai-agent` manages owned support agents. Configuration includes name,
free OpenRouter model, instructions, authority (scope, communication style,
boundaries, escalation rules/message), and knowledge access. `all` includes future
ready uploads; `selected` is an explicit allowlist, including an empty allowlist.
Agent attachments use composite ownership foreign keys. Retrieval and final
citation validation both apply the saved scope and check for concurrent agent
changes. Document removal never expands an agent's scope.

The Next.js `/api/agents/[[...path]]` proxy exposes `/v1/agents` CRUD, `/models`,
and `/{id}/chat`. Updates supply the last saved `version` and return 409 on a
conflict. Agent chat also supplies `version`; changing the configuration starts
a new temporary conversation. The browser never supplies runtime instructions,
authority, or model overrides to chat.

The model catalog is cached for five minutes, filtered for zero pricing and
tool-capable `:free` models, and checked again at execution. `openrouter/free` is
an explicit automatic option. Provider requests cap prompt, completion, request,
and image prices at zero, and send no model fallback list. Catalog eligibility
does not guarantee endpoint capacity; errors remain visible and retries are
user initiated. See [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

Only the knowledge search tool is available. Authority guides model responses;
it does not grant actions. Escalation returns the owner's configured message and
does not create tickets, notify staff, or transfer conversations. Greeting and
clarification markers are replaced with application text. Knowledge answers must
pass citation identity checks; ungrounded answers fall back to escalation.
Custom-agent text is held until final scope/citation validation before it enters
the SSE response. Status events and heartbeats remain streamed throughout.
As with the playground, citation identity checks do not establish semantic
entailment or guarantee model compliance with every behavior preference.

Prisma migration `202611060001_ai_agents` must be deployed to the database used
by the backend before agent APIs are enabled. First validate on an isolated
branch, using the existing direct-connection migration workflow. No changes to
embeddings, object storage, Qdrant collections, or indexing are required.

### Agent verification

`tests/test_agents.py` covers catalog pricing/capabilities/cache failures, bounded
configuration, the real Agents SDK with a fixture provider, marker privacy,
authority composition, zero-price routing, scope changes, and rejected citations.
With `TEST_DATABASE_URL`, it also tests real CRUD, update conflicts, cross-user
permissions, soft-deleted files, empty scopes, and Qdrant document filtering.
It never calls a live model. Use the same isolated-database requirements below.

## Tests

```sh
uv run python -m unittest discover -s tests -v
```

Set `TEST_DATABASE_URL` to an **isolated, migrated database with no other workers** to enable integration
tests; they create and remove only uniquely identified synthetic documents/jobs.
Set `TEST_EMBEDDINGS=1` to additionally exercise the packaged ONNX model.
See `tests/grounding-evals.json` for policy-answer evaluation cases. Live OpenRouter
evaluation requires your key and consumes free request quota; it is opt-in.
Run it with `uv run python -m supportops.evaluate`.

Frontend transport and existing authentication checks run from `frontend/` with
`bun run test:rag`, `bun run test:auth`, `bun run lint`, and `bun run build`.
`tests/browser_server.py` is an explicit test harness for a disposable Neon branch:
it uses real Storage/embeddings, local Qdrant, and simulated model replies. Never use
that test entry point for production.

## Verification on 2026-11-04

All 23 backend tests passed, including the real CPU embedding model, Agents SDK
tool streaming through a simulated OpenRouter transport, and database/worker
isolation and recovery on an isolated Neon branch. The 3 frontend transport tests,
12 existing auth tests, ESLint, TypeScript, and production build passed.

Browser checks exercised real Neon uploads, indexing, streamed fixture answers,
source panels, and deletion with local Qdrant. Mobile accessibility checks reported
no violations. Signed original downloads returned HTTP 200 with byte-identical
contents; Chrome's automated download-save operation was canceled, so native save
behavior still needs checking in the target deployment.

Live OpenRouter quality/capacity and Qdrant Cloud connectivity need configured keys.
Docker Compose configuration validates; the image build was not run because the
Docker Linux daemon was unavailable. The temporary test branch/bucket were removed.
Production migrations, bucket provisioning, and provider credentials remain explicit
deployment steps; existing production data and local environment files were preserved.

Follow-up verification on 2026-11-05: a live synthetic request using
`nvidia/nemotron-3.5-super-vl:free` completed through the Agents SDK after removing
the unsupported `parallel_tool_calls` parameter. The running API also returned a
successful `done` event with guidance for an empty knowledge base. Provider 404,
network, and capacity failures now have distinct actionable error messages.
