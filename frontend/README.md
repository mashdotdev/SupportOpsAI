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

The app uses a shared `pg` pool in the Next.js Node runtime with pooled
`DATABASE_URL`. Migrations use `DATABASE_URL_UNPOOLED`. Database credentials stay
server-side. Every ticket API request checks the Auth session, and queries scope
rows to that user's ID. POST also validates the request origin and subject.
For Vercel Fluid hosting, attach the pool with `@vercel/functions` before deploying;
other runtimes should follow the installed Neon connection guidance.

```sh
npm run db:migrate
npm run build
npm run start -- --port 3001
# In another terminal:
npm run test:neon
```

On Windows with PowerShell script execution disabled, use `npm.cmd` in place of
`npm`. Visit `/auth/sign-up` to create an account or `/workspace` to sign in and
create tickets. Sign-out is available in the workspace. Neon supplies the login,
registration, and recovery UI.

`test:neon` uses the running app at `http://localhost:3001` (override with
`TEST_BASE_URL`). It creates synthetic test users and tickets, checks anonymous
access denial, signup, session cookies, persisted ticket writes/reads, validation,
logout, fresh login, and isolation between users, then deletes its test data.
It requires database access for persistence assertions and cleanup. Email delivery,
password recovery, and OAuth are not covered by this test. Configure the deployed
frontend origin as a trusted Neon Auth domain before publishing it.

Validated on 2026-10-30: production build and HTTP end-to-end test passed. The
migration was first validated on a temporary branch, which was then removed.
Browser visual verification was unavailable because the browser access host was
not running.

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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
