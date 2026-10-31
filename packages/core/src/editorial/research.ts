import * as cheerio from "cheerio";
import { isFetchAllowed } from "../collector/robots";
import { fetchText } from "../util/http";
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
  if (!options.allowPageFetch) return fallback("feed summary only (source terms not confirmed for page retrieval)");
  try {
    if (!(await isFetchAllowed(url, options.fetchImpl))) return fallback("feed summary only (robots.txt disallows)");
    const res = await fetchText(url, { timeoutMs: 15_000, maxBytes: 2_500_000, headers: { Accept: "text/html,application/xhtml+xml" }, fetchImpl: options.fetchImpl });
    const contentType = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(contentType)) return fallback(`feed summary only (unsupported content type ${contentType || "unknown"})`);
    const page = extractPage(res.text);
    if (page.text.length < 200) return { ...fallback("feed summary only (page had little extractable text)"), publishedAt: page.publishedAt };
    const text = feedSummary && !page.text.includes(feedSummary.slice(0, 80)) ? `${feedSummary}\n${page.text}` : page.text;
    return { text: truncate(text, MAX_SOURCE_CHARS), usedPage: true, publishedAt: page.publishedAt, note: "page text" };
  } catch (error) {
    return fallback(`feed summary only (page fetch failed: ${(error as Error).message})`);
  }
}
