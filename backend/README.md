# SupportOps RAG backend

FastAPI + OpenAI Agents SDK using **OpenRouter free chat models**, CPU FastEmbed,
Qdrant Cloud, and private Neon Object Storage. No OpenAI API key is needed.

## Website chatbot widget

Open **Website Widget** in the workspace. Select a saved agent, explicitly approve
the documents it may use on a public website, add exact HTTPS website origins and
a privacy-policy URL, then save and publish. Copy the generated script into the
website before its closing body tag. Add `www` and other subdomains separately.
HTTP origins are accepted only for localhost development.

The public app URL must be reachable over HTTPS. Keep the FastAPI service behind
the Next.js server; it authenticates public widget requests with the private
`BACKEND_API_TOKEN`, and visitors receive separate seven-day credentials scoped to
one widget, origin, and conversation. A widget ID is public configuration. Never
put provider keys, service tokens, or an owner session in an embed snippet.

For VS Code public port forwarding, forward only the frontend port (3000).
Set `WIDGET_PUBLIC_ORIGIN` in frontend `.env.local` to the exact HTTPS tunnel
origin, without a trailing slash, then restart the frontend if needed. This
allows browser POSTs when the tunnel rewrites the internal request URL to
localhost. Update this setting and the embed script URL if the tunnel changes.
The allowed website origin remains the customer's website, not the tunnel.

Each publication stores an immutable agent configuration. New conversations use
the latest publication; existing conversations keep their original version.
Saving an agent does not publish it. Pausing blocks messages immediately. Saving
a draft that removes an origin or approved document revokes that access immediately;
document deletion and the current agent's knowledge/Slack permission restrictions
also take precedence over published snapshots. Changing the agent's document
selection never grants the widget additional documents automatically.

The iframe does not require third-party login cookies. The small loader keeps an
opaque visitor credential in the embedding website's localStorage and passes it
through origin- and source-checked messages. When storage is blocked, chat works
for the current page session. Conversation text stays on the server. Website CSPs
must allow the app origin in `script-src` and `frame-src`; our iframe sends a
per-widget `frame-ancestors` policy. Domain checks restrict browser embedding;
visitor credentials and rate limits enforce access to public APIs.

The **Conversations** inbox and Overview show website traffic as **Live**. An answer
is not automatically resolved: the customer must confirm it helped, or the owner
must mark it resolved. Support requests and validated escalations create durable
real Slack jobs when the published agent and its current permissions allow them.
Playground's real-test-delivery switch does not govern website traffic. Keep the
notification worker running. The widget reports queued/sent/failed/unknown delivery
accurately. Contact details are optional until the visitor chooses follow-up; they
appear in the owner-only conversation view. Human replies in the widget and two-way
Slack are outside this MVP.

Free models remain mandatory, without paid fallbacks. Public requests, session
creation, concurrent turns, IP/session rates, owner daily messages, and shared
model usage are limited in Postgres, including across API replicas. The default
`WIDGET_DAILY_MODEL_REQUESTS=45` conservatively reserves three provider requests per
turn (up to 15 turns/day across all widgets), even when a turn uses fewer. Set this
to match the actual OpenRouter account allowance. Playground usage also consumes
the upstream allowance. The owner message limit resets at midnight UTC.

For per-IP limits in production, set frontend `WIDGET_CLIENT_IP_HEADER` only to a
header your trusted hosting proxy always replaces, and prevent direct origin
access that could forge it. If unset, all visitors share a conservative IP bucket.
Use hosting/network protections as appropriate for a public endpoint. Support
fallback email and the privacy URL are configured in the widget settings.

Run `bun run test:widgets` in the frontend and
`uv run python -m unittest tests.test_widgets -v` in the backend. Database tests
require an isolated, migrated `TEST_DATABASE_URL` with no workers. Model and Slack
responses in automated tests are fixtures; no Slack messages are sent.

## Backend configuration

Copy `.env.example` to `.env`, preserving existing secrets. Supply an OpenRouter
key, Qdrant URL/key, and the Neon branch's S3 credentials. `DATABASE_URL` must point
to the **same Neon branch** used by Next.js. Set matching `BACKEND_API_TOKEN` values
in backend `.env` and frontend `.env.local`; add `BACKEND_URL` to the frontend.
Never expose these values through `NEXT_PUBLIC_` variables.

The default model is `openrouter/free`. A configured `:free` model must exist in
OpenRouter's catalog, have zero prompt/completion pricing, and support tools and
tool choice. No paid fallback list is sent. OpenAI tracing is optional (see below). Free
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

Knowledge search is available to agents. Authority guides model responses;
it does not grant actions. The structured Notify support team permission can
queue Slack notifications for explicit escalations; it does not create tickets
or transfer conversations. Greeting and
clarification markers are replaced with application text. Knowledge answers must
pass citation identity checks; ungrounded answers fall back to escalation.
Custom-agent text is held until final scope/citation validation before it enters
the SSE response. Status events and heartbeats remain streamed throughout.
As with the playground, citation identity checks do not establish semantic
entailment or guarantee model compliance with every behavior preference.

## Slack notifications

Deploy Prisma migration `202611070002_slack_notifications` using the same direct
database migration workflow. Test it on the isolated validation branch first.

Set `INTEGRATION_ENCRYPTION_KEY` in the backend environment. Generate it once:

```sh
uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Store this key as a deployment secret; use the same value in the API and worker.
Keep it stable: replacing it makes existing encrypted webhooks unreadable, and
those connections must be reconfigured. Webhooks never enter model context or
public responses. Only exact `https://hooks.slack.com/services/...` URLs are
accepted. The connector does not follow redirects or use ambient HTTP proxies.

Set `FRONTEND_ORIGIN` to the application's external origin so Slack conversation
links are usable by the team. Localhost links work only on the development computer.
Receiving a Slack link does not grant application access; the current MVP remains
owner-scoped. Team membership is a separate feature.

Run the separate delivery worker alongside the API:

```sh
uv run python -m supportops.notification_worker
```

VS Code includes a **Slack notification worker** task. Docker Compose includes
the `notification-worker` service. An idle worker checks the queue every two
seconds. Deploy it as a persistent process, not a request-scoped background task.

In Tools & Integrations, save the connection name, channel label and Slack incoming
webhook. The label is descriptive; the webhook selects the actual channel. Saving
never sends a message. **Send test notification** explicitly queues a TEST message.
Enable **Notify support team** on selected agents. Tests simulate delivery by
default; enabling real test delivery or choosing **Send TEST to Slack** posts a
message. Only validated `escalation` outcomes automatically queue notifications.
Out-of-scope responses, clarification and technical failures do not automatically
notify. With notification permission enabled, escalation replies use standard
application text that cannot claim delivery before confirmation.

Escalation results and the outbox commit together. Deduplication allows one
notification per conversation escalation cycle and mode (simulation/delivery).
Only reopening a resolved conversation starts a new cycle. Pending sends recheck
agent permission, connection version and conversation state. Disabling,
replacing or disconnecting Slack cancels pending jobs; a bounded in-flight request
finishes before settings changes acquire the connection lock. Delivery is limited
to one request per second per connection. Connection failures and HTTP 429 retry
at most three attempts, honoring Retry-After. Read/write timeouts, server errors,
and expired sending leases become **Delivery unknown** and are not automatically
retried because Slack webhooks do not provide exactly-once delivery guarantees.
Check Slack for unknown deliveries. Definite failed/cancelled deliveries can be
retried explicitly from the conversation using the notify/send-test action.

Slack acceptance records **Sent**; conversations stay **Needs attention** until
explicitly resolved. Disconnected connections retain audit history but delete
their encrypted credential. Playground simulations show previews and never contact
Slack. The message contains only a bounded problem excerpt, generic escalation
reason, agent/environment and an authenticated conversation link.

Run `uv run python -m unittest tests.test_notifications -v` with an isolated,
migrated `TEST_DATABASE_URL` and no notification worker for database tests. All
Slack HTTP calls are fixtures; tests never post to Slack. Frontend transport tests:
`bun run test:integrations` from the frontend directory.

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

## OpenAI agent tracing

The Agents SDK can export traces to the [OpenAI Traces dashboard](https://platform.openai.com/traces)
while inference continues to use free OpenRouter models. Configure only the backend:

```env
OPENAI_TRACING_API_KEY=your-openai-project-api-key
OPENAI_AGENTS_DISABLE_TRACING=false
OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA=false
```

Restart the API after changing environment settings. The exporter explicitly uses
`OPENAI_TRACING_API_KEY` (falling back to `OPENAI_API_KEY`); it never replaces the
OpenRouter inference key/client. Prefer the dedicated variable when an IDE/shell
already exports a different `OPENAI_API_KEY`. No OpenAI key is sent to the browser. Without a key,
or with `OPENAI_AGENTS_DISABLE_TRACING=true`, chat continues with tracing disabled.

Each new answer has one trace named `SupportOps playground chat` or
`SupportOps widget chat`, grouped by conversation ID, with request/model/version
metadata. SDK spans show agent execution, model generations, and tool calls.
Application spans also show the initial retrieval performed before generation,
model/source validation, final response type, errors/cancellation, and timings.
Timing logs include the trace ID for correlation. Tracing shows recorded operations;
it does not reveal a model's private internal reasoning. Slack delivery runs in its
separate notification worker and is not an agent tool call in these traces.

Set `OPENAI_AGENTS_TRACE_INCLUDE_SENSITIVE_DATA=true` to inspect prompts, replies,
tool arguments/results, and retrieved document passages. This uploads that content
to OpenAI; keep it `false` when you only need operations, counts, and timings.
The local development setting may enable content capture explicitly; the application
default and example environment keep it disabled. Trace metadata does not include
visitor names, emails, tokens, webhook credentials, or API keys.

The SDK's background batch exporter keeps export off the response path. Pending
traces flush on graceful shutdown. Export authentication/network failures do not
switch providers or fail customer answers; inspect SDK exporter logs if traces do
not appear. Allow a short delay after a completed chat, and select the OpenAI project
associated with the trace key in the dashboard. Replayed completed requests do not
rerun the agent and therefore do not create a new answer trace.

Run `uv run python -m unittest tests.test_agent_tracing -v` for fixture-only tracing
checks. These use an in-memory processor and never export test/customer data.

## Tests

### Chat latency and quality

The knowledge-base playground, saved-agent playground, and website widget share
the same retrieval-first pipeline. A fresh, permission-scoped search is supplied
as a tool result before generation, so a normal factual answer needs one provider
request. One refinement search remains available. Authority rules, citation/source
checks, publication/domain revocation, final persistence, and free-only routing
remain enforced. The three-request per-turn widget quota reservation remains a
conservative upper bound for unusual tool continuations.

The API lifespan reuses the OpenRouter HTTP pool and warms the packaged embedding
model. Query vectors use a bounded, in-memory cache; passages, permissions, and
answers are not cached. The widget applies the committed `done` event immediately;
history/notification synchronization runs independently. Playground replies also
hold drafts until source validation completes.

`CHAT_PREFETCH_KNOWLEDGE=true` and `CHAT_WARMUP_EMBEDDINGS=true` are the defaults;
no migration or reindexing is needed. Set the first to `false` for a temporary
comparison or rollback. Restart the API to reload environment changes.

`chat_timing` JSON log entries correlate preparation, model validation, retrieval,
model processing, first model text, source checks, and finalization using the
request ID. Internal first-model-text time is not customer-visible answer time.
Retrieval logs additionally separate embedding, vector-service, and source-check
time. Logs contain timings/identifiers/counts, not customer messages or passages.
The dashboard median retains its existing completed-turn definition; compare it
with browser send-to-visible time and collect more than two samples.

Run the synthetic quality/latency benchmark explicitly (consumes free quota):

```sh
uv run python -m supportops.evaluate --compare --output data/chat-performance.json
# Pin a currently available free model; repeat --model to compare candidates.
uv run python -m supportops.evaluate --model VENDOR/MODEL:free --compare --repeats 2
```

It checks supported, unrelated, conflicting, follow-up, and injected-policy cases,
and reports quality passes, median/max duration, provider calls, and the SDK's model
identifier (which may remain the router ID when using `openrouter/free`).
It never edits agents or app data. Retrieval is synthetic, so these numbers isolate
the provider/pipeline and exclude real DB/vector/tunnel/browser latency. Using
`openrouter/free` may choose different models between requests; pin a model for
comparisons. Review correctness and escalation behavior before changing an agent's
selected model, and benchmark a production build outside the development tunnel.

On 2026-11-10, the configured `nvidia/nemotron-3.5-super-vl:free` passed all five
synthetic cases in both paths: median 2.33s/11 calls total with tool-first versus
1.41s/5 calls total with retrieval-first. This is a small provider-only sample,
not a promise of end-to-end response time.

### Retrieval and authorization round trips

The next optimization pass keeps permissions live rather than caching them.
Saved-agent scope is read in one statement. Final validation combines current
agent version/scope, document ownership/readiness, and active indexing generations
in one statement and one pool checkout. Widget checks intersect the immutable
snapshot's approved documents with the current draft and current agent permissions.
Published snapshots remain valid across ordinary agent edits, while restrictions,
deleted agents, and paused/unpublished widgets are enforced immediately.

Widget delivery uses one combined access query for publication/pause, exact domain,
hashed session token/expiry, and document access. It avoids fetching the whole
conversation history merely to recheck access. Customer history endpoints retain
their existing behavior. Empty evidence never skips the agent/version/pause check.

Pool connections use autocommit for single-statement reads, avoiding extra
`BEGIN`/`COMMIT` round trips. Every write path still uses an explicit transaction;
rollback, atomic escalation/outbox writes, and idle-connection health checks remain
enabled. No database migration or reindex is required. Restart the API and workers
to replace existing connection pools with the updated configuration.

New retrieval trace children are `knowledge_scope`, `retrieval_generations`,
`embedding`, `vector_search`, `retrieval_source_validation`, `knowledge_access_query`,
and `database_checkout`. They distinguish model time from pool/network wait, scope
lookup, embeddings, and Qdrant time. These are measurements, not new retrieval
timeouts. Final authorization is still performed after generation.

For the next measurement, send the same question with the same selected model and
document set after restart. Compare `retrieval_ms`, `knowledge_scope_ms`,
`source_validation_ms`, `model_ms`, and `model_requests` in `timing_summary`, plus
the detailed child spans. Measure several warm turns and keep the first cold turn
separate. Backend delivery/finalization logs capture work outside the answer trace;
browser send-to-visible timing remains the end-to-end measure.

The free-model evaluation command accepts repeated `--model` options and records
per-case model/retrieval/validation timings, quality results, median/max, and
nearest-rank p95. It does not change any saved agent or published widget model.
Only change a model after comparing quality and latency on the same questions;
small samples and synthetic retrieval do not establish production p95 latency.

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
