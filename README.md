# The Daily Circuit

An automated evening edition covering **artificial intelligence** and **Indian markets**. Every day at **9:00 pm IST** it publishes up to ten AI stories and up to ten Indian-market stories from the previous 24 hours. Each story is researched and written by Anthropic's Claude models from linked sources, checked by automated validation, and held for a human editor when a check fails.

```
apps/web        Next.js 16 site, admin dashboard, APIs, sitemaps, RSS   → Vercel
apps/worker     Persistent scheduler + job runner (IST pipeline)        → Render / Railway
packages/core   Newsroom engine: collection, ranking, Claude, validation, publishing
packages/db     Prisma 7 schema, migrations, seed                       → Neon / Supabase PostgreSQL
e2e             Playwright end-to-end tests
docs            Architecture, deployment guide, task checklist
```

## Quick start (local)

Requirements: Node 20.9+ (24 recommended), Docker.

```bash
docker compose up -d                 # PostgreSQL on localhost:54329
cp .env.example .env                 # then fill SESSION_SECRET etc. (see below)
npm ci                               # also generates the Prisma client
npm run db:deploy && npm run db:seed # schema + categories, desks, sources, settings
ADMIN_EMAIL=you@example.com ADMIN_INITIAL_PASSWORD='a long password' npm run admin:create -w @tdc/core
npm run dev                          # http://localhost:3000  (dashboard: /admin)
npm run dev:worker                   # scheduler + job runner (needs ANTHROPIC_API_KEY to write)
```

Run a single stage by hand (the worker picks it up):

```bash
npm run run-job -w @tdc/worker -- COLLECT 2026-11-01
npm run run-job -w @tdc/worker -- PUBLISH 2026-11-01 --force
```

## Tests

```bash
npm run typecheck        # all workspaces
npm run lint             # ESLint (web)
npm run test -w @tdc/core   # 72 unit + 20 integration tests (needs TEST_DATABASE_URL)
npm run test:e2e         # 34 Playwright tests: seeds tdc_e2e, builds, starts, tests desktop + mobile
```

Integration tests run the whole evening pipeline against PostgreSQL with fixture feeds served by a local HTTP server and a scripted Claude gateway, so they cost nothing and need no network.

## How the newsroom works

| IST | Stage | What happens |
|---|---|---|
| 20:00 | Collect | Read enabled RSS/Atom sources (robots.txt respected, honest user agent, conditional GET). |
| 20:15 | Process | Validate publication dates, drop events already covered, classify with Claude Haiku 5.5, cluster reports of the same event. |
| 20:25 | Rank | Importance 30% · credibility 25% · freshness 20% · impact 15% · interest 10%. Up to 10 per desk, one per event, minimum score. Explanations stored. |
| 20:30 | Research + write | Fetch permitted source text; Claude Sonnet 5.5 writes structured JSON (Zod-validated). Sources come from our database, never from the model. |
| 20:50 | Validate | Deterministic checks (citations, quotes verbatim, figures in sources, no URLs, advice and clickbait detection) + Haiku fact-check pass. |
| 20:55 | Prepare edition | One `DailyEdition` per IST date. |
| 21:00 | Publish | Approved articles go live; idempotent, never republishes. |
| 21:05 | Post-publish | Refresh cached pages and sitemaps, email the admin report, optional subscriber digest. |

Each stage starts at its slot **and** only after the previous stage finishes. Failures retry with backoff; a permanent failure alerts the administrator. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the step-by-step guide, and [docs/TASKS.md](docs/TASKS.md) for the checklist and outstanding human actions.

## Configuration

All configuration is environment variables. [.env.example](.env.example) documents every one. Secrets never live in the repository or the database seed.
