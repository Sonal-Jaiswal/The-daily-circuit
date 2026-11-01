# Deployment guide

Target: **Vercel** (website, region `sin1` Singapore) · **Render or Railway** (worker) · **Neon** (PostgreSQL, `aws-ap-southeast-1` Singapore) · **Cloudflare** (DNS) · **Anthropic** · **Resend** (email).

## 1. Database (Neon)

1. Create a project in region **AWS Asia Pacific (Singapore)** (Mumbai is not offered to every Neon organisation; Singapore is the nearest).
2. Copy two connection strings:
   * `DATABASE_URL`: the **pooled** string (host contains `-pooler`), with `sslmode=require`.
   * `DIRECT_DATABASE_URL`: the direct string, used only for migrations.
3. Migrations and seed run automatically in the Vercel build (`npm run vercel-build`) and on worker start.
4. Backups: Neon keeps point-in-time history (6 hours on Free, up to 30 days on paid plans). For longer retention, schedule `pg_dump` (e.g. a GitHub Action) to private storage.

## 2. Secrets

```bash
openssl rand -base64 48   # SESSION_SECRET (same value on web and worker)
openssl rand -base64 36   # INTERNAL_JOB_SECRET (same value on web and worker)
```

## 3. Website (Vercel)

1. Vercel → Add New → Project → import `Sonal-Jaiswal/The-daily-circuit`.
2. **Root Directory: `apps/web`**. `apps/web/vercel.json` sets install/build commands for the monorepo.
3. Environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_DATABASE_URL` | Neon direct URL |
| `DATABASE_POOL_MAX` | `3` |
| `NEXT_PUBLIC_SITE_URL` | `https://<your domain>` (or the `*.vercel.app` URL until the domain is ready) |
| `SESSION_SECRET`, `INTERNAL_JOB_SECRET` | from step 2 |
| `EMAIL_TRANSPORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAILS` | email (newsletter confirmations, contact alerts) |
| `CONTACT_EMAIL`, `CORRECTIONS_EMAIL` | public contact addresses |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | optional, GA4 |
| `GOOGLE_SITE_VERIFICATION` | optional, Search Console HTML-tag token |
| `ANTHROPIC_API_KEY`, `CLAUDE_*` | needed only for "Run validation again" in the dashboard |

4. Deploy. Then create the first administrator from your machine against the production database:

```bash
DATABASE_URL='<neon direct url>' ADMIN_EMAIL=you@example.com ADMIN_INITIAL_PASSWORD='<long password>' npm run admin:create -w @tdc/core
```

> Vercel Hobby is for non-commercial use. Once AdSense is enabled the site is commercial and needs Vercel **Pro**.

## 4. Worker (Render or Railway)

**Render:** New → Blueprint → this repo (`render.yaml`). Fill the `sync: false` secrets. Background workers use the Starter plan.

**Railway:** New project → Deploy from GitHub → this repo (`railway.json` uses `apps/worker/Dockerfile`). Add the variables below. Health check: `/health`.

Worker variables: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `WEB_INTERNAL_URL` (same as site URL), `SESSION_SECRET`, `INTERNAL_JOB_SECRET`, `ANTHROPIC_API_KEY`, `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAILS`, optionally `MARKET_DATA_PROVIDER`, `EODHD_API_TOKEN`, `MARKET_DATA_REDISTRIBUTION_LICENSED`.

Run exactly **one** worker instance (more is safe but unnecessary). The container applies migrations on start, then runs the scheduler.

Verify: the platform health check reports `{"status":"ok","db":"ok","claudeConfigured":true}`; the dashboard **Jobs** page lists the scheduled stages from 20:00 IST.

### Free alternative: GitHub Actions

`.github/workflows/evening-edition.yml` runs the pipeline on GitHub's runners every evening (start 19:55 IST, backup start 20:40 IST) using `apps/worker/dist/run-window.js`, which runs the same scheduler and job queue and exits when the edition is published. Free for public repositories.

Repository → Settings → Secrets and variables → Actions:
* Secrets: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SESSION_SECRET`, `INTERNAL_JOB_SECRET`, `ANTHROPIC_API_KEY`, optional `RESEND_API_KEY`.
* Variables (optional): `ADMIN_ALERT_EMAILS`, `EMAIL_FROM`, `SITE_URL`.

Trade-offs: GitHub may start scheduled runs late under load (the backup trigger and the 3-hour late-start grace cover this); jobs queued from the dashboard outside the evening run wait until the next run, or until you press **Run workflow**; GitHub pauses scheduled workflows in repositories with no commits for 60 days. Use only one of this workflow or a persistent worker.

### Model providers and illustrations (free-first)

Set the order with the `LLM_PROVIDERS` repository variable, e.g. `gemini,openrouter,groq,xai,anthropic`. Each call goes to the first provider; on a quota error, refusal or invalid output it moves to the next. A provider that hits its quota is skipped for the rest of that run. Every article records the model that wrote it, and the article page names it.

| Provider | Secret | Variable(s) | Cost |
|---|---|---|---|
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | Free tier |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODELS` | `:free` models: 50 req/day (1,000 after a one-time $10 purchase) |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` (required) | Free tier, low token limits |
| xAI Grok | `XAI_API_KEY` | `XAI_MODEL` (required) | Paid |
| Anthropic Claude | `ANTHROPIC_API_KEY` | — | Paid |

Illustrations: set variable `IMAGE_PROVIDER=cloudflare` and secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` (an API token with the *Workers AI* permission). Images are abstract editorial illustrations (no people, logos or text), labelled as AI-generated, stored in PostgreSQL (~150 KB each) and removable from the article editor. Without a token, articles keep their generated SVG covers.

## 5. Domain (Cloudflare)

1. Vercel → Project → Domains → add `yourdomain.com` and `www.yourdomain.com`.
2. Cloudflare DNS: `CNAME www → cname.vercel-dns.com` and the apex record Vercel shows. Set the records to **DNS only** (grey cloud) so Vercel can issue certificates, or use Full (strict) SSL if proxied.
3. Update `NEXT_PUBLIC_SITE_URL` on Vercel and the worker, then redeploy.

## 6. Email (Resend)

Verify the sending domain (SPF, DKIM records in Cloudflare), set `EMAIL_FROM` to an address on it.

## 7. Google

* **Search Console:** add the domain property (DNS TXT via Cloudflare) or set `GOOGLE_SITE_VERIFICATION`. Submit `/sitemap.xml` and `/news-sitemap.xml`. (Google retired the sitemap ping endpoint; Search Console reads sitemaps on its own schedule.)
* **Google News:** apply in Google News Publisher Center. Inclusion is Google's decision and cannot be guaranteed.
* **GA4:** create a web stream, set `NEXT_PUBLIC_GA_MEASUREMENT_ID`. GA loads only after visitor consent.
* **AdSense:** apply once the site has a body of published articles. After approval, enter the publisher ID and ad-unit IDs in Dashboard → Settings; `ads.txt` is generated automatically. For EEA/UK traffic Google requires a certified consent management platform.

## 8. Post-deployment verification

```bash
curl -s https://<site>/api/health                 # database ok
curl -sI https://<site>/ | grep -i strict-transport
curl -s https://<site>/robots.txt
curl -s https://<site>/sitemap.xml | head
```

Then sign in at `/admin`, run **Collect** for today's date from the Jobs page, and confirm candidates appear under **Candidates**.
