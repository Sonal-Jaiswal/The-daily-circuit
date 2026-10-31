# Architecture

## Components

```
                ┌──────────────────────── Vercel (sin1) ────────────────────────┐
 readers ──────▶│ apps/web  Next.js 16 (Cache Components)                       │
                │  • public site: static shells, tag "content" revalidated       │
 editors ──────▶│  • /admin dashboard (session cookie, RBAC, server actions)     │
                │  • /api/health /api/newsletter /api/views /api/og              │
                │  • /sitemap.xml /news-sitemap.xml /rss.xml /robots.txt /ads.txt│
                └───────────────▲───────────────────────────┬───────────────────┘
                                │ POST /api/internal/revalidate (Bearer secret)
                ┌───────────────┴───────────┐               │ Prisma (pooled)
                │ apps/worker (Render/Railway)│              ▼
                │  • scheduler tick (IST)    │──────▶ PostgreSQL (Neon, Singapore)
                │  • job queue runner        │       JobExecution = durable queue
                │  • /health                 │
                └──────┬─────────────┬───────┘
                       │             │
            RSS/Atom feeds     Anthropic Messages API (Sonnet 5.5 writer, Haiku 5.5 triage/fact-check)
            source pages       Resend (email)   EODHD (optional, licensed market data)
```

`packages/core` holds all domain logic, shared by the web app and the worker, and is fully tested. `packages/db` is the Prisma 7 schema (ESM `prisma-client` generator, `pg` driver adapter).

## Durable job orchestration

There is no long-running HTTP request. The worker:

1. Every tick (20 s around the evening run, 10 min otherwise) calls `schedulerTick`, a pure planner (`planPipeline`) over the executions already recorded for yesterday/today/tomorrow. A due stage is inserted into `JobExecution` with idempotency key `<STAGE>:<YYYY-MM-DD>`. The unique key means several workers can never double-schedule.
2. Claims jobs with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`. A heartbeat every 30 s marks liveness; jobs whose worker died are re-queued after 10 minutes.
3. Failures re-queue with exponential backoff up to `maxAttempts` (3). Configuration errors (e.g. missing API key) fail immediately. Final failures email `ADMIN_ALERT_EMAILS`.
4. SIGTERM: stop polling, wait up to 25 s, hand any in-flight job back to the queue (all stages are idempotent).

Manual reruns from the dashboard insert `MANUAL` jobs (no idempotency key) that the same runner executes.

### Idempotency guarantees

| Concern | Guarantee |
|---|---|
| Same feed item collected twice | `NewsCandidate.canonicalUrl` unique + `createMany(skipDuplicates)` |
| Same event written twice | `Article.idempotencyKey = <date>:cluster:<id>` unique; generation skips clusters with a non-failed article |
| Event re-covered on a later day | Candidates similar to articles from the last 4 days are marked `DUPLICATE` |
| Article published twice | `updateMany where status=APPROVED and publishedAt is null` |
| Two editions per day | `DailyEdition.editionDate` unique |
| Report/digest sent twice | `reportSentAt` / `digestSentAt` / per-subscriber `lastSentAt` |

## Time

All timestamps are `timestamp` columns holding UTC. Edition dates are `@db.Date` calendar dates in Asia/Kolkata. India has had a fixed UTC+05:30 offset since 1945, so `time/ist.ts` converts exactly; display uses `Intl` with `timeZone: "Asia/Kolkata"`. Feed `updated` timestamps are stored separately (`feedUpdatedAt`) and never used as publication time; items without a verifiable publication time are not selected.

## Editorial safety

* **Sources:** the writer receives numbered sources (`S1…`) and may only return their ids. URLs shown to readers come from collected candidates, never from model output.
* **Validation (`validation/validate.ts`):** blocks unknown citations, any URL in text, quotes not found verbatim in a source, clickbait, too-short drafts; routes to review: possible investment advice, analyst opinions on the markets desk, unsupported figures, fact-check findings.
* **Approval:** impossible while blocking issues remain. Edits by editors are re-validated; corrections to live articles must pass validation and show an "Updated" time.
* **Markets:** disclaimer rendered on every markets/IPO article; "Why is this stock moving?" boxes only appear with licensed data and only cite disclosed reasons.
* **Disclosure:** automated desk bylines, "AI-generated" label and a production note on every article.

## Rendering and caching (Next.js 16 Cache Components)

* Public data functions use `'use cache'` + `cacheLife` + `cacheTag("content")`. They prerender into static shells.
* Article and edition routes use `ensureStatic = "navigation"` with `generateStaticParams` (a placeholder param when the database is empty): crawlers get complete HTML and metadata in `<head>`; unknown slugs return a real 404.
* After publication the worker calls `/api/internal/revalidate`, which runs `revalidateTag("content", { expire: 0 })`, so the next request rebuilds with the new edition. Editor actions on live content use `updateTag`.
* The dashboard reads the session cookie inside a Suspense boundary and is never cached.

## Security

* Sessions: 256-bit random token in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie; only its SHA-256 is stored; 7-day sliding expiry; revoked on password reset/deactivation.
* Passwords: scrypt (N=2^15), constant-time verification, dummy hash for unknown accounts.
* RBAC: ADMIN / EDITOR / VIEWER (`auth/rbac.ts`), enforced in every page and server action (`requireUser` / `authorize`). `proxy.ts` only does an optimistic cookie check.
* CSRF: server actions are origin-checked by Next.js; JSON route handlers check `Origin`.
* Rate limits in PostgreSQL (shared across serverless instances): login, newsletter, contact, views.
* Headers: CSP, HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Robots-Tag: noindex` on `/admin` and `/api`.
* IP addresses are stored only as keyed hashes.

## Data model

`User`, `Session`, `Author`, `Category`, `Tag`, `ArticleTag`, `NewsSource`, `StoryCluster`, `NewsCandidate`, `Article`, `ArticleSource`, `ArticleDailyStat`, `DailyEdition`, `StockSnapshot`, `JobExecution`, `JobLog`, `ApiUsage`, `NewsletterSubscriber`, `ContactMessage`, `SiteSettings`, `AuditLog`, `RateLimitBucket`. See `packages/db/prisma/schema.prisma`.
