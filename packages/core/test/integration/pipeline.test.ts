import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { StructuredCall } from "../../src/ai/gateway";
import { LlmError } from "../../src/ai/gateway";
import type { ArticleDraft } from "../../src/editorial/schema";
import { runStage } from "../../src/pipeline/run";
import { goodDraft, SOURCE_TEXT } from "../fixtures/drafts";
import { articlePage, closeDb, db, makeContext, resetDatabase, rssFeed, startFixtureServer, type FixtureServer } from "./helpers";

// Fixture content for automated tests only. Edition: 2026-11-01, publish 21:00 IST = 15:30 UTC.
let server: FixtureServer;

const LONG = (topic: string) =>
  `${topic} The announcement was published on the company's official newsroom and describes the change in detail for customers and developers who rely on the product today.`;

function classification(call: StructuredCall<unknown>) {
  const items = [...call.prompt.matchAll(/<item id="(c\d+)">\nheadline: (.+)/g)].map((m) => ({ id: m[1]!, headline: m[2]! }));
  return {
    items: items.map(({ id, headline }) => {
      const base = { id, isNews: true, isOriginalReporting: true, facts: [headline], companies: [], tickers: [] as string[], rationale: "fixture" };
      if (/Atlas/.test(headline)) return { ...base, section: "AI", importance: 8, impact: 7, interest: 8, eventSignature: "acme-atlas-3-launch" };
      if (/Volt/.test(headline)) return { ...base, section: "TECHNOLOGY", importance: 7, impact: 7, interest: 6, eventSignature: "volt-quarterly-results" };
      if (/Football/.test(headline)) return { ...base, section: "IRRELEVANT", importance: 1, impact: 1, interest: 1, eventSignature: "football-transfer" };
      if (/webinar/.test(headline)) return { ...base, section: "AI", isNews: false, importance: 1, impact: 1, interest: 2, eventSignature: "acme-webinar" };
      if (/Bengaluru/.test(headline)) return { ...base, section: "AI", importance: 2, impact: 2, interest: 2, eventSignature: "acme-bengaluru-lab" };
      if (/SEBI/.test(headline)) return { ...base, section: "MARKETS", importance: 7, impact: 6, interest: 7, eventSignature: "sebi-order-example-energy", tickers: ["EXAMPLE"] };
      if (/RBI/.test(headline)) return { ...base, section: "MARKETS", importance: 6, impact: 5, interest: 6, eventSignature: "rbi-sgb-redemption-price" };
      return { ...base, section: "IRRELEVANT", importance: 0, impact: 0, interest: 0, eventSignature: "unknown-item" };
    }),
  };
}

function aiDraft(headline: string, cite: string): ArticleDraft {
  const p = (n: number) => `${LONG(`Paragraph ${n} explains what changed and why developers care ${cite}.`)} It also sets out what remains unconfirmed ${cite}.`;
  return goodDraft({
    headline,
    excerpt: `${headline}. The company described the change in its official announcement, which our automated desk summarises here.`,
    introduction: `${headline}, according to the company's announcement ${cite}.`,
    body: Array.from({ length: 8 }, (_, i) => p(i + 1)).join("\n\n"),
    context: `The company has been expanding this product line over the past year ${cite}.`,
    whyItMatters: `Developers in India building on the product will see the change directly ${cite}.`,
    keyFacts: [
      { fact: "The company announced the change officially.", sourceIds: ["S1"] },
      { fact: "Developers are the primary audience for the change.", sourceIds: ["S1"] },
      { fact: "Some details remain unconfirmed.", sourceIds: ["S1"] },
    ],
    sourcesUsed: cite.includes("S2") ? ["S1", "S2"] : ["S1"],
    tags: ["Acme", "AI models"],
    seoTitle: headline.slice(0, 60),
    seoDescription: `${headline}. A summary of the official announcement and what it means for developers in India.`.slice(0, 165),
    implications: "Competing products may respond, though no company has announced plans to do so.",
    risks: "Independent evaluations are not yet available, so performance claims remain the company's own.",
  });
}

function respond(call: StructuredCall<unknown>) {
  if (call.purpose === "classify") return classification(call);
  if (call.purpose === "write-article") {
    if (call.prompt.includes("Atlas")) return aiDraft("Acme AI releases Atlas 3 with a longer context window", "[S1][S2]");
    if (call.prompt.includes("Volt")) return aiDraft("Volt reports record data-centre revenue for the quarter", "[S1]");
    if (call.prompt.includes("SEBI")) return goodDraft();
    if (call.prompt.includes("RBI")) return new LlmError("Model declined the request (category: unspecified)", "refusal");
  }
  return new Error(`Unexpected call ${call.purpose}`);
}

async function seedSources() {
  const p = db();
  await p.newsSource.createMany({
    data: [
      { slug: "acme", name: "Acme Newsroom", kind: "COMPANY", desk: "AI", feedUrl: `${server.url}/feeds/ai.xml`, homepageUrl: server.url, reliability: 0.9 },
      { slug: "wire", name: "Second Wire", kind: "PUBLISHER", desk: "AI", feedUrl: `${server.url}/feeds/ai2.xml`, homepageUrl: server.url, reliability: 0.75, requiresLicenseReview: true },
      { slug: "regulator", name: "Test Regulator", kind: "REGULATOR", desk: "MARKETS", feedUrl: `${server.url}/feeds/markets.xml`, homepageUrl: server.url, reliability: 0.95 },
      { slug: "disabled", name: "Disabled Source", kind: "PUBLISHER", desk: "MARKETS", feedUrl: `${server.url}/feeds/disabled.xml`, homepageUrl: server.url, reliability: 0.8, isEnabled: false },
    ],
  });
}

beforeAll(async () => {
  server = await startFixtureServer();
  const u = server.url;
  const rss = "application/rss+xml";
  server.routes.set(
    "/feeds/ai.xml",
    {
      type: rss,
      body: rssFeed([
        { title: "Acme AI releases Atlas 3 language model with longer context", link: `${u}/a/atlas`, pubDate: "Sun, 01 Nov 2026 10:00:00 GMT", description: "Acme AI has released Atlas 3." },
        { title: "Chipmaker Volt posts record quarterly data-centre revenue", link: `${u}/a/volt?utm_source=rss`, pubDate: "Sun, 01 Nov 2026 08:00:00 GMT", description: "Volt reported results." },
        { title: "Old story from three days ago", link: `${u}/a/old`, pubDate: "Thu, 29 Oct 2026 08:00:00 GMT" },
        { title: "Football club signs new striker", link: `${u}/a/football`, pubDate: "Sun, 01 Nov 2026 09:00:00 GMT" },
        { title: "Acme AI hosts webinar on prompt tips", link: `${u}/a/webinar`, pubDate: "Sun, 01 Nov 2026 09:30:00 GMT" },
        { title: "Acme AI opens research lab in Bengaluru", link: `${u}/a/bengaluru` },
      ]),
    },
  );
  server.routes.set(
    "/feeds/ai2.xml",
    {
      type: rss,
      body: rssFeed([
        { title: "Atlas 3 model launched by Acme AI with longer context window", link: `${u}/b/atlas`, pubDate: "Sun, 01 Nov 2026 11:00:00 GMT", description: "Second Wire reports that Acme AI launched Atlas 3, its newest model, with a longer context window for developers." },
        { title: "Undated wire item", link: `${u}/b/undated` },
      ]),
    },
  );
  server.routes.set(
    "/feeds/markets.xml",
    {
      type: rss,
      body: rssFeed([
        { title: "SEBI issues final order against Example Energy Services", link: `${u}/m/sebi`, pubDate: "30 Oct, 2026 +0530".replace("30 Oct", "1 Nov") },
        { title: "RBI announces redemption price for SGB tranche", link: `${u}/m/rbi`, pubDate: "Sun, 01 Nov 2026 05:00:00 GMT", description: "The RBI announced the redemption price." },
      ]),
    },
  );
  server.routes.set("/a/atlas", { body: articlePage("Atlas 3", [LONG("Acme AI released Atlas 3, its newest language model, with a longer context window."), LONG("Developers can use the model starting today.")]) });
  server.routes.set("/a/volt", { body: articlePage("Volt results", [LONG("Volt reported record data-centre revenue for the quarter."), LONG("The company credited demand for AI accelerators.")]) });
  server.routes.set("/a/bengaluru", { body: articlePage("Lab", [LONG("Acme AI opened a research lab in Bengaluru.")], "2026-11-01T09:00:00Z") });
  server.routes.set("/m/sebi", { body: articlePage("SEBI order", [SOURCE_TEXT]) });
  server.routes.set("/m/rbi", { body: articlePage("RBI", [LONG("The Reserve Bank of India announced the redemption price for a Sovereign Gold Bond tranche.")]) });
});

afterAll(async () => {
  await server.close();
  await closeDb();
});

beforeEach(async () => {
  await resetDatabase();
  await seedSources();
});

describe("daily pipeline end to end", () => {
  it("collects, deduplicates, ranks, writes, validates and publishes — with partial publication", async () => {
    const ctx = await makeContext({ respond });
    const p = db();

    const collect = await runStage("COLLECT", ctx);
    expect(collect.summary).toMatchObject({ sourcesProcessed: 3, sourcesFailed: 0 });
    // The 3-day-old item is outside the lookback window; the disabled source is never fetched.
    expect(await p.newsCandidate.count({ where: { originalHeadline: { contains: "Old story" } } })).toBe(0);
    expect(server.hits.some((h) => h.includes("/feeds/disabled.xml"))).toBe(false);
    expect(server.hits.every((h) => h.includes("TheDailyCircuitBot/1.0"))).toBe(true);
    // Tracking parameters are stripped for duplicate detection; the original URL is kept.
    const volt = await p.newsCandidate.findFirstOrThrow({ where: { originalHeadline: { contains: "Volt" } } });
    expect(volt.canonicalUrl).not.toContain("utm_source");
    expect(volt.originalUrl).toContain("utm_source=rss");

    // Re-collecting is idempotent.
    const again = await runStage("COLLECT", ctx);
    expect(again.summary).toMatchObject({ candidatesCreated: 0 });

    const processed = await runStage("PROCESS", ctx);
    expect(processed.summary).toMatchObject({ stale: 1, irrelevant: 2 });
    const undated = await p.newsCandidate.findFirstOrThrow({ where: { originalHeadline: "Undated wire item" } });
    expect(undated.status).toBe("STALE");
    const lab = await p.newsCandidate.findFirstOrThrow({ where: { originalHeadline: { contains: "Bengaluru" } } });
    expect(lab.publishedAtSource).toBe("PAGE_METADATA");

    // The two Atlas reports form one cluster.
    const atlas = await p.newsCandidate.findMany({ where: { originalHeadline: { contains: "Atlas" } } });
    expect(atlas).toHaveLength(2);
    expect(atlas[0]!.clusterId).toBe(atlas[1]!.clusterId);

    await runStage("RANK", ctx);
    const selected = await p.newsCandidate.findMany({ where: { status: "SELECTED" }, orderBy: { totalScore: "desc" } });
    expect(selected.map((s) => s.originalHeadline)).toEqual(expect.arrayContaining([expect.stringContaining("Atlas"), expect.stringContaining("Volt"), expect.stringContaining("SEBI"), expect.stringContaining("RBI")]));
    expect(selected).toHaveLength(4);
    const labRanked = await p.newsCandidate.findUniqueOrThrow({ where: { id: lab.id } });
    expect(labRanked.status).toBe("NOT_SELECTED");
    expect(labRanked.rankingExplanation).toMatch(/below the minimum score/);
    // The official source leads the cluster.
    const atlasPrimary = await p.newsCandidate.findFirstOrThrow({ where: { clusterId: atlas[0]!.clusterId, isClusterPrimary: true }, include: { source: true } });
    expect(atlasPrimary.source.name).toBe("Acme Newsroom");

    const generated = await runStage("GENERATE", ctx);
    expect(generated.status).toBe("PARTIAL");
    expect(generated.summary).toMatchObject({ written: 3, failed: 1 });

    await runStage("VALIDATE", ctx);
    const articles = await p.article.findMany({ include: { sources: true } });
    const byHeadline = (s: string) => articles.find((a) => a.headline.includes(s))!;
    expect(byHeadline("Atlas").status).toBe("APPROVED");
    expect(byHeadline("SEBI").status).toBe("APPROVED");
    expect(byHeadline("RBI").status).toBe("FAILED");

    // Source attribution comes from collected URLs, never from the model.
    const atlasArticle = byHeadline("Atlas");
    expect(atlasArticle.sources.map((s) => s.url).sort()).toEqual([`${server.url}/a/atlas`, `${server.url}/b/atlas`]);
    expect(atlasArticle.sources.find((s) => s.isPrimary)?.publisherName).toBe("Acme Newsroom");
    expect(byHeadline("SEBI").disclaimerRequired).toBe(true);

    const prepared = await runStage("PREPARE_EDITION", ctx);
    expect(prepared.summary).toMatchObject({ aiCount: 2, marketCount: 1, failed: 1 });

    const published = await runStage("PUBLISH", ctx);
    expect(published.summary).toMatchObject({ published: 3 });
    const live = await p.article.findMany({ where: { status: "PUBLISHED" } });
    expect(live).toHaveLength(3);
    const publishedAt = live[0]!.publishedAt!.toISOString();
    expect(publishedAt).toBe("2026-11-01T15:30:00.000Z");

    // Publishing again changes nothing.
    const later = await makeContext({ respond, now: () => new Date("2026-11-01T16:00:00Z") });
    expect((await runStage("PUBLISH", later)).summary).toMatchObject({ published: 0 });
    expect((await p.article.findUniqueOrThrow({ where: { id: live[0]!.id } })).publishedAt!.toISOString()).toBe(publishedAt);

    const edition = await p.dailyEdition.findMany();
    expect(edition).toHaveLength(1);
    expect(edition[0]).toMatchObject({ status: "PARTIAL", aiCount: 2, marketCount: 1 });

    const post = await runStage("POST_PUBLISH", ctx);
    expect(post.summary).toMatchObject({ reportSent: true });
    expect(ctx.mailer.sent[0]!.subject).toMatch(/3 published, 0 for review, 1 failed/);
    // The report is sent once per edition.
    await runStage("POST_PUBLISH", ctx);
    expect(ctx.mailer.sent).toHaveLength(1);

    // Rerunning generation retries only the failed story; published stories are untouched.
    const rerun = await runStage("GENERATE", ctx);
    expect(rerun.summary).toMatchObject({ clusters: 1, written: 0, failed: 1 });
    expect(await p.article.count()).toBe(4);
  });

  it("respects the daily quota without filling it with duplicate events", async () => {
    await db().siteSettings.update({ where: { id: "default" }, data: { maxAiArticles: 1 } });
    const ctx = await makeContext({ respond });
    await runStage("COLLECT", ctx);
    await runStage("PROCESS", ctx);
    await runStage("RANK", ctx);
    const aiSelected = await db().newsCandidate.findMany({ where: { status: "SELECTED", desk: "AI" } });
    expect(aiSelected).toHaveLength(1);
    expect(aiSelected[0]!.originalHeadline).toContain("Atlas");
    const volt = await db().newsCandidate.findFirstOrThrow({ where: { originalHeadline: { contains: "Volt" } } });
    expect(volt.rankingExplanation).toMatch(/quota of 1/);
  });

  it("does not re-cover an event that was already published", async () => {
    const ctx = await makeContext({ respond });
    for (const stage of ["COLLECT", "PROCESS", "RANK", "GENERATE", "VALIDATE", "PREPARE_EDITION", "PUBLISH"] as const) await runStage(stage, ctx);
    // Next day: the same Atlas story appears again in a feed.
    const next = await makeContext({ respond, editionDate: "2026-11-02", now: () => new Date("2026-11-02T15:30:00Z") });
    server.routes.set("/feeds/ai2.xml", {
      type: "application/rss+xml",
      body: rssFeed([{ title: "Acme AI releases Atlas 3 language model with a longer context", link: `${server.url}/b/atlas-followup`, pubDate: "Mon, 02 Nov 2026 09:00:00 GMT" }]),
    });
    await runStage("COLLECT", next);
    const res = await runStage("PROCESS", next);
    expect(res.summary).toMatchObject({ duplicates: 1 });
  });
});
