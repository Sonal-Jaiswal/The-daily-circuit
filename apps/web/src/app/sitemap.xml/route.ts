import { articlePath } from "@tdc/core/content/paths";
import { buildSitemap, type SitemapEntry } from "@tdc/core/seo/xml";
import { getEditions, getFeedArticles, getSectionCounts } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

const STATIC_PAGES = ["/about", "/authors", "/contact", "/editorial-policy", "/corrections", "/privacy-policy", "/terms", "/disclaimer", "/edition"];
const SECTION_PATHS = { AI: "/ai", TECHNOLOGY: "/technology", MARKETS: "/markets", IPO: "/ipo" } as const;

/** Only published, indexable URLs. Empty sections are left out (they are noindex). */
export async function GET() {
  const [articles, editions, counts] = await Promise.all([getFeedArticles(), getEditions(), getSectionCounts()]);
  const entries: SitemapEntry[] = [{ loc: absoluteUrl("/"), lastmod: articles[0]?.publishedAt ?? null, changefreq: "daily", priority: 1 }];
  for (const [section, path] of Object.entries(SECTION_PATHS) as Array<[keyof typeof SECTION_PATHS, string]>) {
    const c = counts[section];
    if (c?.count) entries.push({ loc: absoluteUrl(path), lastmod: c.lastPublishedAt, changefreq: "daily", priority: 0.8 });
  }
  for (const p of STATIC_PAGES) entries.push({ loc: absoluteUrl(p), changefreq: "monthly", priority: 0.3 });
  for (const e of editions) entries.push({ loc: absoluteUrl(`/edition/${e.date}`), lastmod: e.publishedAt, priority: 0.5 });
  for (const a of articles) entries.push({ loc: absoluteUrl(articlePath(a)), lastmod: a.contentModifiedAt ?? a.publishedAt, priority: 0.7 });
  return new Response(buildSitemap(entries), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
