# Task checklist

## Built and tested

- [x] Monorepo (npm workspaces): `apps/web`, `apps/worker`, `packages/core`, `packages/db`
- [x] Prisma 7 schema (22 models, UUIDs, indexes, audit history), migrations, idempotent seed with no secrets
- [x] Source registry with 21 feeds verified on 2026-11-01 (exchange and Indian publisher feeds disabled until access/licence is confirmed)
- [x] Collector: RSS/Atom/RDF, robots.txt (RFC 9309), conditional GET, honest user agent, publication vs. updated time kept separate
- [x] Intelligence: URL canonicalisation, headline normalisation, clustering, re-coverage detection, Haiku classification, weighted ranking with stored explanations, quotas without padding
- [x] Claude editorial agent: permitted research, Sonnet 5.5 structured output, Zod validation, refusal/truncation handling, server-side fallbacks, usage and cost recording, monthly budget cap
- [x] Validation: citations, verbatim quotes, figures, URLs, clickbait, investment-advice detection, Haiku fact-check pass, human review routing
- [x] Market intelligence: licensed-provider interface (EODHD adapter), snapshots, "Why is this stock moving?" only with disclosed reasons, licence gate before display
- [x] IST scheduler with stage dependencies, durable Postgres job queue, retries, alerts, manual reruns, partial publication, graceful shutdown, health endpoint
- [x] Public site: all required routes, article anatomy, related stories, breadcrumbs, share links, generative licensed-by-construction covers, light/dark mode, mobile-first
- [x] SEO: metadata, canonical, OG/Twitter, NewsArticle/Organization/Breadcrumb JSON-LD, sitemap, Google News sitemap, RSS, robots, OG images, noindex for drafts/admin/empty sections
- [x] Admin dashboard: overview, articles, editor, approve/reject/publish/unpublish, candidates, sources, taxonomy, jobs and logs, usage and spend, settings, users (RBAC), subscribers, messages
- [x] Newsletter: double opt-in, signed unsubscribe, RFC 8058 one-click, daily digest (opt-in setting)
- [x] Monetisation: AdSense slots (off until approved), consent banner with Consent Mode, ads.txt from settings
- [x] Security: hashed sessions, scrypt, RBAC, CSRF/origin checks, rate limits, CSP and security headers, retention enforcement
- [x] Tests: 72 unit, 20 integration, 34 Playwright e2e (desktop + mobile); CI workflow
- [x] Deployment configs: `apps/web/vercel.json`, `apps/worker/Dockerfile`, `render.yaml`, `railway.json`

## Outstanding human actions

- [ ] Provide `ANTHROPIC_API_KEY` (worker) and set a monthly budget in Settings
- [ ] Create Vercel project (root `apps/web`) and set env vars; approve the plan (Pro needed once monetised)
- [ ] Create Render or Railway worker (paid plan, ~US$5–7/month) and set env vars
- [ ] Domain: add to Vercel, configure Cloudflare DNS
- [ ] Resend account + verified sending domain; set `ADMIN_ALERT_EMAILS`
- [ ] Review third-party feed terms before enabling flagged sources (Dashboard → Sources → Mark terms confirmed)
- [ ] Confirm NSE/BSE access arrangements before enabling exchange feeds
- [ ] Choose a market-data vendor with redistribution rights before setting `MARKET_DATA_REDISTRIBUTION_LICENSED=true`
- [ ] Legal review of the privacy policy, terms and disclaimer; add the publisher's legal entity and a named Grievance Officer
- [ ] Digital news publisher obligations under India's IT Rules 2021 (information to the Ministry of Information and Broadcasting, grievance redressal)
- [ ] Google Search Console, Google News Publisher Center, GA4, AdSense applications
