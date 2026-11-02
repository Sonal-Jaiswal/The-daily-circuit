import * as cheerio from "cheerio";
import { isFetchAllowed } from "../collector/robots";
import { fetchBytes } from "../util/http";
import { collapseWhitespace, truncate } from "../util/text";

export interface PageExtract {
  text: string;
  publishedAt: Date | null;
  title: string | null;
}

const MAX_SOURCE_CHARS = 9_000;

function parseDate(v: string | undefined | null): Date | null {
  if (!v) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Main text plus page-declared publication time. Never trusts <meta> modified times as publication. */
export function extractPage(html: string): PageExtract {
  const $ = cheerio.load(html);
  let publishedAt =
    parseDate($('meta[property="article:published_time"]').attr("content")) ??
    parseDate($('meta[name="article:published_time"]').attr("content")) ??
    parseDate($('meta[itemprop="datePublished"]').attr("content")) ??
    parseDate($('meta[name="pubdate"]').attr("content")) ??
    parseDate($('meta[name="publish-date"]').attr("content"));
  if (!publishedAt) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (publishedAt) return;
      try {
        const data = JSON.parse($(el).text());
        const nodes = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
        for (const n of nodes) {
          const d = parseDate(n?.datePublished);
          if (d) {
            publishedAt = d;
            break;
          }
        }
      } catch {
        /* ignore malformed JSON-LD */
      }
    });
  }
  const title = collapseWhitespace($('meta[property="og:title"]').attr("content") ?? $("title").first().text()) || null;

  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg, figure figcaption, [role=navigation], .advertisement, .ads, .newsletter, .related").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const blocks: string[] = [];
  root.find("h1, h2, h3, p, li, td").each((_, el) => {
    const t = collapseWhitespace($(el).text());
    if (t.length >= 25) blocks.push(t);
  });
  const text = truncate([...new Set(blocks)].join("\n"), MAX_SOURCE_CHARS);
  return { text, publishedAt, title };
}

/**
 * Regulators such as SEBI publish circulars as a PDF inside a viewer page with no body text.
 * Returns the embedded PDF's URL when it is on the same site as the page.
 */
export function embeddedPdfUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const candidates: string[] = [];
  $("iframe[src], embed[src], object[data], a[href]").each((_, el) => {
    const raw = $(el).attr("src") ?? $(el).attr("data") ?? $(el).attr("href") ?? "";
    // Viewer pages pass the document as ?file=<url>.
    const file = raw.match(/[?&]file=([^&#]+)/)?.[1];
    candidates.push(file ? decodeURIComponent(file) : raw);
  });
  for (const c of candidates) {
    try {
      const url = new URL(c, page);
      if (url.protocol === "https:" && url.hostname === page.hostname && /\.pdf$/i.test(url.pathname)) return url.toString();
    } catch {
      /* not a URL */
    }
  }
  return null;
}

async function pdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(data), { mergePages: true });
  return truncate(collapseWhitespace(text.replace(/Page \d+ of \d+/g, " ")), MAX_SOURCE_CHARS);
}

export interface ResearchOptions {
  /** Publisher pages may only be fetched when their terms have been confirmed. */
  allowPageFetch: boolean;
  fetchImpl?: typeof fetch;
}

export interface ResearchResult {
  text: string;
  usedPage: boolean;
  publishedAt: Date | null;
  note: string;
}

/**
 * Gathers permitted source material for one candidate. Respects robots.txt; falls back to the
 * feed summary. Text is used transiently for writing and is not republished.
 */
export async function researchCandidate(url: string, feedSummary: string | null, options: ResearchOptions): Promise<ResearchResult> {
  const fallback = (note: string): ResearchResult => ({ text: feedSummary ?? "", usedPage: false, publishedAt: null, note });
  const fromPdf = (text: string, note: string): ResearchResult =>
    text.length < 200 ? fallback("feed summary only (document had little extractable text)") : { text: feedSummary && !text.includes(feedSummary.slice(0, 80)) ? truncate(`${feedSummary}\n${text}`, MAX_SOURCE_CHARS) : text, usedPage: true, publishedAt: null, note };
  if (!options.allowPageFetch) return fallback("feed summary only (source terms not confirmed for page retrieval)");
  try {
    if (!(await isFetchAllowed(url, options.fetchImpl))) return fallback("feed summary only (robots.txt disallows)");
    const res = await fetchBytes(url, { timeoutMs: 15_000, maxBytes: 2_500_000, headers: { Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9" }, fetchImpl: options.fetchImpl });
    const contentType = res.headers.get("content-type") ?? "";
    if (/pdf/i.test(contentType)) return fromPdf(await pdfText(new Uint8Array(res.body)), "PDF document text");
    if (!/html|xml/i.test(contentType)) return fallback(`feed summary only (unsupported content type ${contentType || "unknown"})`);
    const html = new TextDecoder("utf-8").decode(res.body);
    const page = extractPage(html);
    if (page.text.length < 200) {
      const pdfUrl = embeddedPdfUrl(html, res.url || url);
      if (pdfUrl && (await isFetchAllowed(pdfUrl, options.fetchImpl))) {
        const pdf = await fetchBytes(pdfUrl, { timeoutMs: 20_000, maxBytes: 8_000_000, headers: { Accept: "application/pdf" }, fetchImpl: options.fetchImpl });
        const text = await pdfText(new Uint8Array(pdf.body));
        if (text.length >= 200) return { ...fromPdf(text, "embedded PDF document text"), publishedAt: page.publishedAt };
      }
      return { ...fallback("feed summary only (page had little extractable text)"), publishedAt: page.publishedAt };
    }
    const text = feedSummary && !page.text.includes(feedSummary.slice(0, 80)) ? `${feedSummary}\n${page.text}` : page.text;
    return { text: truncate(text, MAX_SOURCE_CHARS), usedPage: true, publishedAt: page.publishedAt, note: "page text" };
  } catch (error) {
    return fallback(`feed summary only (page fetch failed: ${(error as Error).message})`);
  }
}
