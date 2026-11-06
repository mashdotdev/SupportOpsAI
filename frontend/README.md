SupportOps AI is a Next.js app with Neon Postgres and Managed Neon Auth.

## Neon setup

Run commands from `frontend/` (the app root). The linked project is
`divine-water-60791020`, organization `org-royal-snowflake-55127659`, branch `production`.
`neon.ts` declares Auth; Postgres is included by default. `neon deploy` provisions
backend services and pulls secrets; it does not publish the Next.js frontend.

```sh
bun install
bunx neon login
bunx neon init -y --org-id org-royal-snowflake-55127659 --project-id divine-water-60791020 --branch production --services postgres,auth
bunx neon deploy
```

Keep `.env.local` private. See `.env.example` for variable names. Generate an
additional `NEON_AUTH_COOKIE_SECRET` with at least 32 random characters; deployment
pulls the database and Auth URLs but does not generate this application secret.

The app uses Prisma 7 with the `@prisma/adapter-pg` driver and a shared, lazy
server-only client in the Next.js Node runtime. Queries use pooled `DATABASE_URL`;
Prisma migration commands use `DATABASE_URL_UNPOOLED`. Database credentials stay
server-side. Every ticket API request checks the Auth session, and queries scope
rows to that user's ID. POST also validates the request origin and subject.
The pool is limited to five connections with 10-second idle/connect timeouts.
Neon Auth manages its own `neon_auth` schema; Prisma manages application tables in
`public` only. The ticket API preserves its `created_at` ISO-string response field.

## Prisma schema and migrations

Run all commands from `frontend/`. `prisma7.config.ts` uses Next's environment
loader, including `.env.local`; explicitly supplied environment variables win.
Never expose either database URL through `NEXT_PUBLIC_` variables.

For an **existing database** containing `support_tickets`, first verify its schema
matches `prisma/migrations/0_init/migration.sql` (including the subject CHECK and
user/date index), then record the baseline once without recreating its tables:

```sh
bun run db:baseline
bun run db:migrate
```

For a **new, empty database**, run only `bun run db:migrate`; this creates the
table and constraints. Do not mark the baseline applied on an empty database.
The baseline replaces the former SQL migration runner.

For subsequent schema changes, use an isolated Neon development branch, edit
`prisma/schema.prisma`, and run `bun run db:migrate:dev --name descriptive_name`.
Review and commit the generated SQL, then run `bun run db:generate`. Use only
`bun run db:migrate` (Prisma Migrate deploy) on production. Never use reset or
`db push` against an existing production database. Development migrations may
require a disposable shadow database; never use production as the shadow target.

Prisma cannot express the subject-length CHECK in its model; maintain it in SQL
migrations. Keep the database-generated UUID, `timestamptz(6)`, and mapped index
when evolving the model. No foreign key to managed Auth tables is introduced.

Useful commands: `bun run db:validate`, `bun run db:generate`,
`bun run db:status`, and `bun run db:studio`. Generated client code is ignored by
Git and ESLint; both `dev` and `build` regenerate it automatically. Migration
deployment is explicit and is never run as part of a build.

```sh
bun run db:migrate
bun run build
bun run start --port 3001
# In another terminal:
bun run test:neon
```

On Windows with PowerShell script execution disabled, use `npm.cmd` in place of
`npm`. Visit `/auth/sign-up` to create an account or `/workspace` to sign in and
create tickets. Sign-out is available in the workspace. Neon supplies the login,
registration, and recovery UI.

`test:neon` uses the running app at `http://localhost:3001` (override with
`TEST_BASE_URL`). It creates synthetic test users and tickets, checks anonymous
access denial, signup, session cookies, persisted ticket writes/reads, validation,
logout, fresh login, isolation between users, newest-first ordering, the 100-row
limit, and response fields, then deletes its test data. Direct SQL in this test
independently checks Prisma's persistence and cleans up managed Auth test users.
It requires database access for persistence assertions and cleanup. Email delivery,
password recovery, and OAuth are not covered by this test. Configure the deployed
frontend origin as a trusted Neon Auth domain before publishing it.

Validated on 2026-11-02: Prisma validation/generation, production build (including
TypeScript), ESLint, 12 auth tests, and the expanded HTTP end-to-end test passed.
Baseline adoption preserved the branch's existing ticket rows; deployment to an
empty database verified defaults, indexes, and the subject CHECK. Both migration
paths were tested on a temporary Neon branch before recording the baseline in
the existing production database. Production migration status is up to date.


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Saved AI agents

Visit `/workspace/ai-agent` to create, edit, test, and delete support agents. Each
agent has a free OpenRouter model, instructions, structured authority settings,
and either all owned knowledge documents or an explicit selected set. The model
picker supports search. Save changes before testing; the editor and playground
always use the saved version. Conversations are temporary and reset on refresh,
agent changes, and configuration version changes.

Run the FastAPI backend alongside Next.js and configure the matching server-only
`BACKEND_API_TOKEN` and `BACKEND_URL`. Apply the committed agent migration to the
backend's database using the existing isolated-branch-first Prisma workflow.
The backend and frontend must use the intended environment; do not copy test
branch credentials over production environment files.

Authority defines scope, communication style, boundaries, escalation rules, and
the escalation message. Escalation displays that message; it does not perform a
handoff or create a ticket. Only knowledge search is available. See the
[backend documentation](../backend/README.md#saved-ai-agents) for API, filtering,
model pricing enforcement, and verification details.

Run `bun run test:agents` for agent proxy authorization, PATCH forwarding,
payload limits, path restrictions, and deletion response checks. Existing auth
and RAG suites remain available through `test:auth` and `test:rag`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
