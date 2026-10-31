export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export interface SitemapEntry {
  loc: string;
  lastmod?: Date | null;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly";
  priority?: number;
}

export function buildSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`<loc>${escapeXml(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`<lastmod>${e.lastmod.toISOString()}</lastmod>`);
      if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
      if (e.priority !== undefined) parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>${parts.join("")}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export interface NewsSitemapEntry {
  loc: string;
  title: string;
  publishedAt: Date;
}

/** Google News sitemap: only articles published in the last 48 hours, max 1,000 URLs. */
export function buildNewsSitemap(entries: NewsSitemapEntry[], publicationName: string, now = new Date()): string {
  const cutoff = now.getTime() - 48 * 3_600_000;
  const urls = entries
    .filter((e) => e.publishedAt.getTime() >= cutoff && e.publishedAt.getTime() <= now.getTime())
    .slice(0, 1000)
    .map(
      (e) =>
        `  <url><loc>${escapeXml(e.loc)}</loc><news:news><news:publication><news:name>${escapeXml(publicationName)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${e.publishedAt.toISOString()}</news:publication_date><news:title>${escapeXml(e.title)}</news:title></news:news></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>\n`;
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  publishedAt: Date;
  category: string;
  author: string;
}

export function buildRss(channel: { title: string; link: string; description: string; selfUrl: string }, items: RssItem[]): string {
  const body = items
    .map(
      (i) =>
        `    <item>\n      <title>${escapeXml(i.title)}</title>\n      <link>${escapeXml(i.link)}</link>\n      <guid isPermaLink="true">${escapeXml(i.link)}</guid>\n      <description>${escapeXml(i.description)}</description>\n      <category>${escapeXml(i.category)}</category>\n      <dc:creator>${escapeXml(i.author)}</dc:creator>\n      <pubDate>${i.publishedAt.toUTCString()}</pubDate>\n    </item>`,
    )
    .join("\n");
  const lastBuild = items[0]?.publishedAt ?? new Date();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n    <title>${escapeXml(channel.title)}</title>\n    <link>${escapeXml(channel.link)}</link>\n    <description>${escapeXml(channel.description)}</description>\n    <language>en-in</language>\n    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>\n    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>\n${body}\n  </channel>\n</rss>\n`;
}
