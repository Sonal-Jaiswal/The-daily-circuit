import { expect, test } from "@playwright/test";

const ARTICLE = "/ai/example-labs-releases-fixture-model";
const MARKET_ARTICLE = "/markets/fixture-regulator-issues-order";

test.describe("homepage", () => {
  test("renders the lead story, desks, trending, snapshot notice and newsletter", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/The Daily Circuit/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Example Labs releases a fixture language model");
    await expect(page.getByRole("heading", { name: "Today in AI" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today in Indian markets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Most read this week" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Market snapshot" })).toBeVisible();
    // Without a licensed provider no prices are shown — and none are invented.
    await expect(page.getByText(/licensed exchange-data feed/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "The evening edition, in your inbox" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Sections" }).first();
    for (const label of ["Home", "AI News", "Indian Markets", "IPO", "Technology", "Daily Edition", "About"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
  });

  test("never lists drafts or articles awaiting review", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Unpublished draft fixture")).toHaveCount(0);
    await expect(page.getByText("awaiting editorial review")).toHaveCount(0);
  });

  test("ships organisation structured data", async ({ page }) => {
    await page.goto("/");
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)[0]["@type"]).toBe("NewsMediaOrganization");
  });
});

test.describe("articles", () => {
  test("has a permanent URL with full article anatomy", async ({ page }) => {
    const res = await page.goto(ARTICLE);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Example Labs releases a fixture language model for testing");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("AI News");
    await expect(page.getByText("(automated, AI-generated)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Key facts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Why it matters" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Risks and open questions" })).toBeVisible();
    await expect(page.getByText("How this article was produced.")).toBeVisible();
    const sources = page.locator("#sources-heading + ol li");
    await expect(sources).toHaveCount(2);
    await expect(sources.first().getByRole("link")).toHaveAttribute("href", "https://example.com/fixture-source-one");
    // Citation markers link to the numbered source list.
    await expect(page.locator('a.cite[href="#source-1"]').first()).toBeVisible();
    await expect(page.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", /linkedin\.com/);
    await expect(page.getByRole("heading", { name: "Related stories" })).toBeVisible();
  });

  test("SEO metadata and NewsArticle data match the visible page", async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `http://localhost:3100${ARTICLE}`);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /fixture/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/api\/og\?section=AI/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const all = blocks.flatMap((b) => [JSON.parse(b)].flat());
    const news = all.find((d) => d["@type"] === "NewsArticle");
    const crumbs = all.find((d) => d["@type"] === "BreadcrumbList");
    expect(news.headline).toBe(await page.getByRole("heading", { level: 1 }).textContent());
    expect(news.datePublished).toBe(await page.locator("header time").first().getAttribute("datetime"));
    expect(news.author[0].name).toBe("The Daily Circuit AI Desk");
    expect(crumbs.itemListElement).toHaveLength(3);
  });

  test("market articles carry the investment disclaimer", async ({ page }) => {
    await page.goto(MARKET_ARTICLE);
    await expect(page.getByText("Not investment advice")).toBeVisible();
    await expect(page.getByText(/not a SEBI-registered investment adviser/)).toBeVisible();
  });

  test("unknown, draft and wrong-section URLs return 404", async ({ page }) => {
    for (const path of ["/ai/no-such-article", "/ai/unpublished-draft-fixture", "/markets/example-labs-releases-fixture-model", "/ai/__placeholder__"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("renders an Open Graph image", async ({ request }) => {
    const res = await request.get("/api/og?section=AI&slug=example-labs-releases-fixture-model");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("sections and editions", () => {
  test("category page lists its stories", async ({ page }) => {
    await page.goto("/markets");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Indian markets");
    await expect(page.getByRole("link", { name: /Fixture Regulator issues an order/ }).first()).toBeVisible();
  });

  test("empty sections are not indexed", async ({ page }) => {
    await page.goto("/ipo");
    await expect(page.getByText("No stories published yet")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("daily edition archive links to the edition", async ({ page }) => {
    await page.goto("/edition");
    await page.getByRole("link").filter({ hasText: /\d{4}/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evening edition, test fixture");
    await expect(page.getByRole("link", { name: /Example Labs releases/ }).first()).toBeVisible();
  });

  test("policy pages exist", async ({ page }) => {
    for (const [path, heading] of [
      ["/about", "About The Daily Circuit"],
      ["/editorial-policy", "Editorial policy"],
      ["/corrections", "Corrections and grievances"],
      ["/privacy-policy", "Privacy policy"],
      ["/terms", "Terms of use"],
      ["/disclaimer", "Financial disclaimer"],
      ["/contact", "Contact"],
      ["/authors", "Authors"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
    }
  });
});

test.describe("discoverability", () => {
  test("sitemap lists published articles only", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/ai/example-labs-releases-fixture-model");
    expect(xml).toContain("/markets/fixture-regulator-issues-order");
    expect(xml).not.toContain("unpublished-draft-fixture");
    expect(xml).not.toContain("awaiting-review");
    expect(xml).not.toContain("<loc>http://localhost:3100/ipo</loc>");
  });

  test("Google News sitemap lists recent articles", async ({ request }) => {
    const res = await request.get("/news-sitemap.xml");
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain("<news:name>The Daily Circuit</news:name>");
    expect(xml).toContain("example-labs-releases-fixture-model");
  });

  test("robots.txt keeps the dashboard out and points to both sitemaps", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toContain("Disallow: /admin");
    expect(txt).toContain("Sitemap: http://localhost:3100/sitemap.xml");
    expect(txt).toContain("Sitemap: http://localhost:3100/news-sitemap.xml");
  });

  test("RSS feed is valid RSS 2.0", async ({ request }) => {
    const xml = await (await request.get("/rss.xml")).text();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Example Labs releases a fixture language model for testing</title>");
  });

  test("ads.txt is absent until a publisher ID is configured", async ({ request }) => {
    expect((await request.get("/ads.txt")).status()).toBe(404);
  });
});

test.describe("platform", () => {
  test("health endpoint reports database connectivity", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect((await res.json()).database).toBe("ok");
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("internal revalidation requires the job secret", async ({ request }) => {
    expect((await request.post("/api/internal/revalidate", { data: {} })).status()).toBe(401);
    const ok = await request.post("/api/internal/revalidate", { data: { paths: ["/"] }, headers: { Authorization: "Bearer e2e-internal-secret-0123456789" } });
    expect(ok.status()).toBe(200);
  });

  test("newsletter subscription uses double opt-in", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("#newsletter");
    await form.getByLabel("Email address").fill(`reader-${Date.now()}@example.com`);
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Subscribe" }).click();
    await expect(form.getByRole("status")).toContainText("confirm your address");
  });

  test("newsletter API rejects cross-site requests and missing consent", async ({ request }) => {
    expect((await request.post("/api/newsletter", { data: { email: "x@example.com", consent: true }, headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await request.post("/api/newsletter", { data: { email: "x@example.com", consent: false }, headers: { Origin: "http://localhost:3100" } })).status()).toBe(400);
  });
});
