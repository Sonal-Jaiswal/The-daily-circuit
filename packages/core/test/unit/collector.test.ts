import { describe, expect, it } from "vitest";
import { parseFeed, parseFeedDate } from "../../src/collector/feed-parser";
import { parseRobots } from "../../src/collector/robots";
import { embeddedPdfUrl, extractPage, researchCandidate } from "../../src/editorial/research";
import { routineNoticeReason } from "../../src/intelligence/routine";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>SEBI RSS Feed</title>
<lastBuildDate>31 Oct 2026 22:00:02</lastBuildDate><pubDate>31 Oct 2026 22:00:02 +0530</pubDate>
<item><title>Final Order in the matter of EKI Energy Services Ltd.</title>
<description><![CDATA[<p>Final <b>Order</b> &amp; details</p>]]></description>
<link>https://www.sebi.gov.in/enforcement/orders/oct-2026/final-order_105524.html</link>
<pubDate>30 Oct, 2026 +0530</pubDate></item>
<item><title>No date item</title><link>https://www.sebi.gov.in/x.html</link></item>
<item><title>Missing link</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><updated>2026-11-01T10:00:00Z</updated>
<entry><title type="html">Model launch &amp;amp; more</title><link rel="alternate" href="https://blog.example/launch"/><link rel="self" href="https://blog.example/self"/>
<id>tag:blog,2026:1</id><published>2026-10-31T09:00:00Z</published><updated>2026-11-01T08:00:00Z</updated><summary>Short summary</summary></entry>
<entry><title>Only updated</title><link href="https://blog.example/updated"/><updated>2026-11-01T08:00:00Z</updated></entry>
</feed>`;

describe("feed parsing", () => {
  it("parses RSS items and their own publication dates, not the channel's", () => {
    const feed = parseFeed(RSS);
    expect(feed.format).toBe("rss");
    expect(feed.items).toHaveLength(2);
    const [first, second] = feed.items;
    expect(first!.title).toBe("Final Order in the matter of EKI Energy Services Ltd.");
    expect(first!.summary).toBe("Final Order & details");
    expect(first!.publishedAt?.toISOString()).toBe("2026-10-29T18:30:00.000Z");
    expect(second!.publishedAt).toBeNull();
  });

  it("keeps Atom 'updated' separate from 'published'", () => {
    const feed = parseFeed(ATOM);
    expect(feed.format).toBe("atom");
    expect(feed.items[0]!.link).toBe("https://blog.example/launch");
    expect(feed.items[0]!.publishedAt?.toISOString()).toBe("2026-10-31T09:00:00.000Z");
    expect(feed.items[0]!.updatedAt?.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(feed.items[1]!.publishedAt).toBeNull();
    expect(feed.items[1]!.updatedAt).not.toBeNull();
  });

  it("parses RFC 822 and Indian government date formats", () => {
    expect(parseFeedDate("Sat, 31 Oct 2026 16:30:00 GMT")?.toISOString()).toBe("2026-10-31T16:30:00.000Z");
    expect(parseFeedDate("30 Oct, 2026 +0530")?.toISOString()).toBe("2026-10-29T18:30:00.000Z");
    expect(parseFeedDate("not a date")).toBeNull();
  });

  it("rejects non-feed documents", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow(/Unrecognised/);
  });
});

describe("robots.txt", () => {
  const robots = parseRobots(`
User-agent: *
Disallow: /private/
Allow: /private/public-page
Disallow: /*.pdf$

User-agent: TheDailyCircuitBot
Disallow: /no-bots/
`);

  it("uses the most specific group for our agent", () => {
    expect(robots.isAllowed("/no-bots/page")).toBe(false);
    // The specific group replaces the * group entirely.
    expect(robots.isAllowed("/private/thing")).toBe(true);
  });

  it("applies longest-match with Allow winning ties, and wildcards", () => {
    const generic = parseRobots("User-agent: *\nDisallow: /private/\nAllow: /private/public-page\nDisallow: /*.pdf$");
    expect(generic.isAllowed("/private/thing")).toBe(false);
    expect(generic.isAllowed("/private/public-page")).toBe(true);
    expect(generic.isAllowed("/files/report.pdf")).toBe(false);
    expect(generic.isAllowed("/files/report.pdf?x=1")).toBe(true);
    expect(generic.isAllowed("/news")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(parseRobots("User-agent: *\nDisallow:").isAllowed("/anything")).toBe(true);
  });
});

describe("page extraction", () => {
  it("extracts main text and the declared publication time", () => {
    const html = `<html><head><meta property="article:published_time" content="2026-11-01T06:00:00+05:30"><title>T</title></head>
<body><nav><p>Navigation link text that is long enough to count</p></nav><article><h1>Headline here for the story</h1>
<p>The first paragraph explains the decision announced on Friday in detail.</p><p>Second paragraph with more supporting facts and figures.</p></article>
<footer><p>Copyright footer text that should be removed entirely</p></footer></body></html>`;
    const page = extractPage(html);
    expect(page.publishedAt?.toISOString()).toBe("2026-11-01T00:30:00.000Z");
    expect(page.text).toContain("first paragraph explains");
    expect(page.text).not.toContain("Navigation");
    expect(page.text).not.toContain("Copyright");
  });

  it("falls back to JSON-LD datePublished", () => {
    const page = extractPage(`<html><head><script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-31T12:00:00Z"}</script></head><body><p>x</p></body></html>`);
    expect(page.publishedAt?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
});

/** A minimal, valid one-page PDF with one line per entry, with a correct cross-reference table. */
function tinyPdf(lines: string[]): Buffer {
  const stream = `BT /F1 10 Tf 14 TL 40 750 Td ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("regulator documents", () => {
  const CIRCULAR = [
    "Page 1 of 2",
    "SEBI circular on the cooling off period for offer for sale by privately listed InvITs,",
    "issued to all recognised stock exchanges, depositories and clearing corporations,",
    "effective immediately for every infrastructure investment trust in India.",
  ];
  const viewer = `<html><body><h1>Cooling off period</h1><iframe src='../../../web/?file=https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/1793619502649.pdf'></iframe></body></html>`;

  it("finds a same-site PDF behind a viewer page, and ignores other sites", () => {
    expect(embeddedPdfUrl(viewer, "https://www.sebi.gov.in/legal/circulars/nov-2026/x_105539.html")).toBe("https://www.sebi.gov.in/sebi_data/attachdocs/nov-2026/1793619502649.pdf");
    expect(embeddedPdfUrl(`<a href="https://elsewhere.example/doc.pdf">PDF</a>`, "https://www.sebi.gov.in/a.html")).toBeNull();
    expect(embeddedPdfUrl(`<p>No document</p>`, "https://www.sebi.gov.in/a.html")).toBeNull();
  });

  it("reads the embedded PDF when the page itself has no text", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (u: unknown) => {
      const url = String(u);
      requested.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url.endsWith(".pdf")) return new Response(new Uint8Array(tinyPdf(CIRCULAR)), { status: 200, headers: { "content-type": "application/pdf" } });
      return new Response(viewer, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const res = await researchCandidate("https://www.sebi.gov.in/legal/circulars/nov-2026/x_105539.html", "Cooling off period for offer for sale by Private listed InvITs", { allowPageFetch: true, fetchImpl });
    expect(res.note).toBe("embedded PDF document text");
    expect(res.text).toContain("cooling off period for offer for sale by privately listed InvITs");
    expect(requested.some((u) => u.endsWith("1793619502649.pdf"))).toBe(true);
  });

  it("sets aside routine paperwork from official sources only", () => {
    for (const h of [
      "Money Market Operations as on November 01, 2026",
      "SEBI Order for Compliance - Release Order for Recovery Certificate No. 9226 of 2026 against Jigar Bhailalbhai Khalash",
      "Notice of Demand dated November 02, 2026 issued under RC No. 9315 of 2026",
      "Appeal No. 7127 of 2026 filed by Himanshu Soni",
      "Auction of Government of India Dated Securities",
      "Processing of Applications Received Under the Citizen’s Charter Status as on October 31, 2026",
    ]) expect(routineNoticeReason(h, "REGULATOR"), h).not.toBeNull();
    for (const h of [
      "Framework for Issuance of Depository Receipts on Units of REITs",
      "Cooling off period for offer for sale by Private listed InvITs",
      "Adjudication Order in the matter of Praveg Limited",
      "RBI keeps repo rate unchanged at 5.25%",
    ]) expect(routineNoticeReason(h, "REGULATOR"), h).toBeNull();
    expect(routineNoticeReason("Money Market Operations as on November 01, 2026", "PUBLISHER")).toBeNull();
  });
});
