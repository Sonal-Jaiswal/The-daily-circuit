import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password";
import { can } from "../../src/auth/rbac";
import { markdownToPlainText, parseMarkdown } from "../../src/content/markdown";
import { buildNewsSitemap, buildRss, buildSitemap, escapeXml } from "../../src/seo/xml";
import { breadcrumbJsonLd, newsArticleJsonLd, serializeJsonLd } from "../../src/seo/jsonld";
import { resolveSettings } from "../../src/settings";
import { backoffDelay, HttpError, isTransientError, withRetry } from "../../src/util/retry";
import { readingTimeMinutes, slugify } from "../../src/util/text";

describe("retry", () => {
  it("retries transient failures then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new HttpError("503", 503, "u")).mockRejectedValueOnce(new HttpError("429", 429, "u")).mockResolvedValue("ok");
    await expect(withRetry(fn, { retries: 3, shouldRetry: isTransientError, sleep: async () => undefined })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent failures", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("404", 404, "u"));
    await expect(withRetry(fn, { retries: 3, shouldRetry: isTransientError, sleep: async () => undefined })).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of retries", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError("500", 500, "u"));
    await expect(withRetry(fn, { retries: 2, sleep: async () => undefined })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("backs off exponentially with jitter, capped", () => {
    expect(backoffDelay(1, 1000, 30_000, () => 0)).toBe(500);
    expect(backoffDelay(3, 1000, 30_000, () => 1)).toBe(4000);
    expect(backoffDelay(20, 1000, 30_000, () => 1)).toBe(30_000);
  });
});

describe("restricted markdown", () => {
  it("parses paragraphs, headings, lists, citations and safe links", () => {
    const blocks = parseMarkdown("Intro with **bold** and a cite [S1].\n\n### Subhead\n\n- one\n- two [S2]\n\n1. first\n2. second\n\n[Link](https://example.com) and [bad](javascript:alert(1))");
    expect(blocks.map((b) => b.type)).toEqual(["p", "h3", "ul", "ol", "p"]);
    const first = blocks[0]!;
    expect(first.type === "p" && first.children.some((c) => c.type === "cite" && c.id === "S1")).toBe(true);
    const last = blocks[4]!;
    expect(last.type === "p" && last.children.filter((c) => c.type === "link")).toHaveLength(1);
    expect(markdownToPlainText("**Bold** text [S1]")).toBe("Bold text");
  });
});

describe("SEO builders", () => {
  it("escapes XML", () => {
    expect(escapeXml(`a & b < "c"`)).toBe("a &amp; b &lt; &quot;c&quot;");
  });

  it("builds a sitemap", () => {
    const xml = buildSitemap([{ loc: "https://x.test/a?b=1&c=2", lastmod: new Date("2026-11-01T00:00:00Z") }]);
    expect(xml).toContain("<loc>https://x.test/a?b=1&amp;c=2</loc>");
    expect(xml).toContain("<lastmod>2026-11-01T00:00:00.000Z</lastmod>");
  });

  it("includes only the last 48 hours in the news sitemap", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const xml = buildNewsSitemap(
      [
        { loc: "https://x.test/new", title: "New", publishedAt: new Date("2026-11-03T10:00:00Z") },
        { loc: "https://x.test/old", title: "Old", publishedAt: new Date("2026-10-30T10:00:00Z") },
      ],
      "The Daily Circuit",
      now,
    );
    expect(xml).toContain("https://x.test/new");
    expect(xml).not.toContain("https://x.test/old");
    expect(xml).toContain("<news:name>The Daily Circuit</news:name>");
  });

  it("builds RSS 2.0", () => {
    const xml = buildRss({ title: "T", link: "https://x.test", description: "D", selfUrl: "https://x.test/rss.xml" }, [
      { title: "A & B", link: "https://x.test/a", description: "d", publishedAt: new Date("2026-11-01T15:30:00Z"), category: "AI", author: "Desk" },
    ]);
    expect(xml).toContain("<title>A &amp; B</title>");
    expect(xml).toContain("<pubDate>Sun, 01 Nov 2026 15:30:00 GMT</pubDate>");
  });

  it("serialises JSON-LD safely and mirrors visible fields", () => {
    const site = { name: "S", url: "https://x.test", description: "d", logoUrl: "https://x.test/logo.png" };
    const ld = newsArticleJsonLd(site, {
      url: "https://x.test/ai/a",
      headline: "H</script>",
      description: "d",
      imageUrl: "https://x.test/og.png",
      publishedAt: new Date("2026-11-01T15:30:00Z"),
      modifiedAt: new Date("2026-11-01T16:00:00Z"),
      section: "AI News",
      keywords: ["OpenAI"],
      authorName: "AI Desk",
      authorUrl: "https://x.test/authors#ai-desk",
      wordCount: 600,
    });
    expect(ld["@type"]).toBe("NewsArticle");
    expect(ld.datePublished).toBe("2026-11-01T15:30:00.000Z");
    expect(serializeJsonLd(ld)).not.toContain("</script>");
    expect(breadcrumbJsonLd([{ name: "Home", url: "https://x.test" }]).itemListElement[0]!.position).toBe(1);
  });
});

describe("auth primitives", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password entirely", hash)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("enforces the role matrix", () => {
    expect(can("ADMIN", "settings:manage")).toBe(true);
    expect(can("EDITOR", "settings:manage")).toBe(false);
    expect(can("EDITOR", "articles:publish")).toBe(true);
    expect(can("VIEWER", "articles:edit")).toBe(false);
    expect(can("VIEWER", "dashboard:view")).toBe(true);
  });
});

describe("text and settings", () => {
  it("slugifies headlines", () => {
    expect(slugify("RBI holds repo rate at 5.5% — what's next?")).toBe("rbi-holds-repo-rate-at-5-5-percent-what-s-next");
    expect(slugify("₹500 crore IPO")).toBe("rs-500-crore-ipo");
    expect(slugify("a".repeat(120)).length).toBeLessThanOrEqual(80);
  });

  it("estimates reading time", () => {
    expect(readingTimeMinutes("word ".repeat(460))).toBe(2);
    expect(readingTimeMinutes("")).toBe(1);
  });

  it("keeps ads off without a valid publisher ID", () => {
    const base = { id: "default", siteName: "S", tagline: "t", publishTimeIst: "21:00", maxAiArticles: 10, maxMarketArticles: 10, minSelectionScore: 0.55, scoringWeights: {}, autoPublish: true, latePublishGraceMin: 180, monthlyBudgetUsd: 100, enableFactCheckPass: true, marketWatchlist: [], significantMovePct: 4, adSlots: null, newsletterDigestEnabled: false, updatedById: null, updatedAt: new Date() };
    expect(resolveSettings({ ...base, adsEnabled: true, adsensePublisherId: null }).ads.enabled).toBe(false);
    expect(resolveSettings({ ...base, adsEnabled: true, adsensePublisherId: "ca-pub-123" }).ads.enabled).toBe(false);
    expect(resolveSettings({ ...base, adsEnabled: true, adsensePublisherId: "pub-1234567890123456" }).ads.enabled).toBe(true);
    expect(resolveSettings({ ...base, adsEnabled: false, adsensePublisherId: "pub-1234567890123456" }).ads.enabled).toBe(false);
    // Invalid weights fall back to the documented defaults.
    expect(resolveSettings({ ...base, adsEnabled: false, adsensePublisherId: null }).weights.importance).toBe(0.3);
  });
});
