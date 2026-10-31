import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticate, createSession, destroySession, getSession } from "../../src/auth/session";
import { hashPassword } from "../../src/auth/password";
import { getPublishedArticle, listPublished, recordView, trendingArticles } from "../../src/content/queries";
import { LogMailer } from "../../src/email/mailer";
import { claimNextJob, enqueueJob, failJob, recoverStaleJobs } from "../../src/jobs/queue";
import { executeJob } from "../../src/jobs/runner";
import { schedulerTick } from "../../src/jobs/scheduler";
import { silentLogger } from "../../src/logger";
import { confirmSubscription, subscribe, unsubscribe, unsubscribeToken } from "../../src/newsletter/service";
import { approveArticle, publishArticleNow } from "../../src/publishing/articles";
import { uniqueSlug } from "../../src/publishing/slug";
import { ensureEdition } from "../../src/pipeline/stages/edition";
import { rateLimit } from "../../src/security/ratelimit";
import { toDbDate } from "../../src/time/ist";
import { closeDb, db, resetDatabase } from "./helpers";

beforeEach(resetDatabase);
afterAll(closeDb);

async function makeArticle(over: Record<string, unknown> = {}) {
  const p = db();
  const category = await p.category.findUniqueOrThrow({ where: { section: "AI" } });
  const author = await p.author.findUniqueOrThrow({ where: { slug: "ai-desk" } });
  const key = `test:${Math.random()}`;
  return p.article.create({
    data: {
      idempotencyKey: key,
      slug: await uniqueSlug(p, (over.headline as string) ?? "Fixture headline for tests", key),
      section: "AI",
      categoryId: category.id,
      authorId: author.id,
      headline: "Fixture headline for tests",
      excerpt: "Excerpt",
      introduction: "Intro",
      body: "Body [S1]",
      context: "c",
      whyItMatters: "w",
      keyFacts: [],
      implications: "i",
      risks: "r",
      seoTitle: "s",
      seoDescription: "d",
      imageAlt: "a",
      readingTimeMinutes: 1,
      ...over,
    },
  });
}

describe("articles and slugs", () => {
  it("creates unique slugs and never reuses a taken one", async () => {
    const a = await makeArticle({ headline: "RBI holds rates steady" });
    const b = await makeArticle({ headline: "RBI holds rates steady" });
    expect(a.slug).toBe("rbi-holds-rates-steady");
    expect(b.slug).toMatch(/^rbi-holds-rates-steady-[0-9a-f]{6}$/);
    await expect(db().article.create({ data: { ...(await db().article.findUniqueOrThrow({ where: { id: a.id } })), id: undefined, idempotencyKey: "other" } as never })).rejects.toThrow();
  });

  it("lists and serves only published articles", async () => {
    const draft = await makeArticle({ status: "DRAFT" });
    const live = await makeArticle({ status: "PUBLISHED", publishedAt: new Date(), headline: "Live one" });
    const listed = await listPublished(db());
    expect(listed.map((x) => x.id)).toEqual([live.id]);
    expect(await getPublishedArticle(db(), "AI", draft.slug)).toBeNull();
    expect((await getPublishedArticle(db(), "AI", live.slug))?.id).toBe(live.id);
    expect(await getPublishedArticle(db(), "MARKETS", live.slug)).toBeNull();
  });

  it("requires a clean validation report before approval, and publishes once", async () => {
    const blocked = await makeArticle({ status: "NEEDS_REVIEW", validationReport: { blocking: ["Direct quote not found"], review: [], warnings: [] } });
    const user = await db().user.create({ data: { email: "ed@test.example", name: "Ed", passwordHash: "x", role: "EDITOR" } });
    await expect(approveArticle(db(), blocked.id, user.id)).rejects.toThrow(/blocking/);
    const ok = await makeArticle({ status: "NEEDS_REVIEW", validationReport: { blocking: [], review: ["Possible investment advice"], warnings: [] } });
    const approved = await approveArticle(db(), ok.id, user.id);
    expect(approved).toMatchObject({ status: "APPROVED", reviewedById: user.id });
    const first = await publishArticleNow(db(), ok.id, new Date("2026-11-01T15:30:00Z"));
    const second = await publishArticleNow(db(), ok.id, new Date("2026-11-02T15:30:00Z"));
    expect(second.publishedAt!.toISOString()).toBe(first.publishedAt!.toISOString());
    await expect(publishArticleNow(db(), blocked.id)).rejects.toThrow(/Only approved/);
  });

  it("keeps one edition per date", async () => {
    const at = new Date("2026-11-01T15:30:00Z");
    const [a, b] = await Promise.all([ensureEdition(db(), "2026-11-01", at), ensureEdition(db(), "2026-11-01", at)].map((p) => p.catch(() => ensureEdition(db(), "2026-11-01", at))));
    expect(a!.id).toBe(b!.id);
    expect(await db().dailyEdition.count()).toBe(1);
  });

  it("counts views for trending", async () => {
    const a = await makeArticle({ status: "PUBLISHED", publishedAt: new Date(), headline: "Popular" });
    const b = await makeArticle({ status: "PUBLISHED", publishedAt: new Date(), headline: "Less popular" });
    for (let i = 0; i < 3; i += 1) await recordView(db(), a.id);
    await recordView(db(), b.id);
    expect((await trendingArticles(db())).map((x) => x.id)).toEqual([a.id, b.id]);
  });
});

describe("job queue", () => {
  it("is idempotent per scheduled key", async () => {
    const one = await enqueueJob(db(), { type: "COLLECT", editionDate: "2026-11-01", idempotencyKey: "COLLECT:2026-11-01" });
    const two = await enqueueJob(db(), { type: "COLLECT", editionDate: "2026-11-01", idempotencyKey: "COLLECT:2026-11-01" });
    expect(one.created).toBe(true);
    expect(two.created).toBe(false);
    expect(two.job.id).toBe(one.job.id);
  });

  it("never hands the same job to two workers", async () => {
    await enqueueJob(db(), { type: "COLLECT", trigger: "MANUAL" });
    const claims = await Promise.all([claimNextJob(db(), "w1"), claimNextJob(db(), "w2"), claimNextJob(db(), "w3")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("retries with backoff, then fails permanently", async () => {
    const { job } = await enqueueJob(db(), { type: "COLLECT", trigger: "MANUAL", maxAttempts: 2 });
    const c1 = (await claimNextJob(db(), "w"))!;
    const r1 = await failJob(db(), c1, new Error("boom"));
    expect(r1).toMatchObject({ final: false, job: { status: "QUEUED" } });
    expect(r1.job.runAfter.getTime()).toBeGreaterThan(Date.now());
    await db().jobExecution.update({ where: { id: job.id }, data: { runAfter: new Date() } });
    const c2 = (await claimNextJob(db(), "w"))!;
    expect(c2.attempts).toBe(2);
    const r2 = await failJob(db(), c2, new Error("boom again"));
    expect(r2).toMatchObject({ final: true, job: { status: "FAILED" } });
  });

  it("recovers jobs whose worker stopped heartbeating", async () => {
    await enqueueJob(db(), { type: "COLLECT", trigger: "MANUAL" });
    const c = (await claimNextJob(db(), "dead-worker"))!;
    await db().jobExecution.update({ where: { id: c.id }, data: { heartbeatAt: new Date(Date.now() - 60 * 60_000) } });
    expect(await recoverStaleJobs(db())).toBe(1);
    expect((await db().jobExecution.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("QUEUED");
  });

  it("schedules the 20:00 IST collection exactly once, even from concurrent workers", async () => {
    const now = new Date("2026-11-01T14:30:00Z"); // 20:00 IST
    const ticks = await Promise.all([schedulerTick(db(), { now, log: silentLogger, marketDataEnabled: false }), schedulerTick(db(), { now, log: silentLogger, marketDataEnabled: false })]);
    expect(ticks.flat()).toEqual(["COLLECT:2026-11-01"]);
    expect(await db().jobExecution.count({ where: { type: "COLLECT" } })).toBe(1);
    expect(await schedulerTick(db(), { now: new Date("2026-11-01T14:31:00Z"), log: silentLogger, marketDataEnabled: false })).toEqual([]);
  });

  it("executes a job, records logs, and alerts when a job fails for good", async () => {
    const mailer = new LogMailer();
    const deps = {
      prisma: db(),
      log: silentLogger,
      mailer,
      workerId: "w",
      llmFactory: () => null,
      marketProvider: null,
      revalidate: async () => undefined,
      alertRecipients: ["ops@test.example"],
      models: { writer: "claude-sonnet-5-5", classifier: "claude-haiku-5-5" },
      now: () => new Date("2026-11-01T15:20:00Z"),
    };
    await enqueueJob(db(), { type: "PREPARE_EDITION", editionDate: "2026-11-01", trigger: "MANUAL" });
    const done = await executeJob(deps, (await claimNextJob(db(), "w"))!);
    expect(done.status).toBe("SUCCEEDED");
    expect(await db().jobLog.count({ where: { jobId: done.id } })).toBeGreaterThan(0);

    // No API key: misconfiguration fails immediately (no pointless retries) and alerts.
    await enqueueJob(db(), { type: "GENERATE", editionDate: "2026-11-01", trigger: "MANUAL" });
    const failed = await executeJob(deps, (await claimNextJob(db(), "w"))!);
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(mailer.sent.at(-1)!.subject).toMatch(/GENERATE failed/);
  });
});

describe("newsletter double opt-in", () => {
  it("subscribes, confirms, and unsubscribes", async () => {
    const mailer = new LogMailer();
    expect(await subscribe(db(), mailer, { email: "  Reader@Example.com " })).toBe("confirmation_sent");
    const sub = await db().newsletterSubscriber.findUniqueOrThrow({ where: { email: "reader@example.com" } });
    expect(sub.status).toBe("PENDING");
    const link = mailer.sent[0]!.text.match(/token=([^\s]+)/)![1]!;
    expect(await confirmSubscription(db(), "wrong-token")).toBe(false);
    expect(await confirmSubscription(db(), decodeURIComponent(link))).toBe(true);
    expect((await db().newsletterSubscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("CONFIRMED");
    expect(await subscribe(db(), mailer, { email: "reader@example.com" })).toBe("already_confirmed");
    expect(await unsubscribe(db(), `${sub.id}.forged`)).toBe(false);
    expect(await unsubscribe(db(), unsubscribeToken(sub.id))).toBe(true);
    expect((await db().newsletterSubscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("UNSUBSCRIBED");
  });

  it("rejects expired confirmation links and invalid addresses", async () => {
    const mailer = new LogMailer();
    await subscribe(db(), mailer, { email: "late@example.com" });
    await db().newsletterSubscriber.updateMany({ data: { confirmTokenExpires: new Date(Date.now() - 1000) } });
    const token = decodeURIComponent(mailer.sent[0]!.text.match(/token=([^\s]+)/)![1]!);
    expect(await confirmSubscription(db(), token)).toBe(false);
    await expect(subscribe(db(), mailer, { email: "not-an-email" })).rejects.toThrow();
  });
});

describe("authentication", () => {
  it("authenticates, creates sessions and revokes them", async () => {
    await db().user.create({ data: { email: "admin@test.example", name: "Admin", role: "ADMIN", passwordHash: await hashPassword("a long admin password") } });
    expect(await authenticate(db(), "admin@test.example", "wrong password here")).toBeNull();
    expect(await authenticate(db(), "nobody@test.example", "a long admin password")).toBeNull();
    const user = (await authenticate(db(), "ADMIN@test.example", "a long admin password"))!;
    expect(user.role).toBe("ADMIN");
    const { token } = await createSession(db(), user.id);
    expect((await db().session.findFirstOrThrow()).tokenHash).not.toBe(token);
    expect((await getSession(db(), token))?.user.email).toBe("admin@test.example");
    await destroySession(db(), token);
    expect(await getSession(db(), token)).toBeNull();
  });

  it("rejects expired sessions and deactivated users", async () => {
    const u = await db().user.create({ data: { email: "e@test.example", name: "E", role: "EDITOR", passwordHash: await hashPassword("another long password") } });
    const { token } = await createSession(db(), u.id);
    await db().session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getSession(db(), token)).toBeNull();
    const fresh = await createSession(db(), u.id);
    await db().user.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await getSession(db(), fresh.token)).toBeNull();
  });

  it("rate-limits by key across calls", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await rateLimit(db(), "login:1.2.3.4", 3, 60));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });
});

describe("dates", () => {
  it("stores edition dates as calendar dates", async () => {
    const e = await ensureEdition(db(), "2026-11-01", new Date("2026-11-01T15:30:00Z"));
    expect(e.editionDate.toISOString()).toBe(toDbDate("2026-11-01").toISOString());
  });
});
