import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getPrisma, type Section } from "@tdc/db";
import {
  getEdition,
  getPublishedArticle,
  latestEditionDate,
  latestMarketSnapshot,
  listEditions,
  listPublished,
  relatedArticles,
  trendingArticles,
  type ArticleCard,
} from "@tdc/core/content/queries";
import { resolveSettings } from "@tdc/core/settings";
import { markdownToPlainText } from "@tdc/core/content/markdown";
import { wordCount } from "@tdc/core/util/text";

/** Every public read is tagged "content"; the 9 PM publish expires the tag. */
export const CONTENT_TAG = "content";

export type { ArticleCard };

/** Exchange data is shown only with a configured provider AND a confirmed redistribution licence. */
function marketDataPublic(): boolean {
  const provider = process.env.MARKET_DATA_PROVIDER ?? "none";
  return provider !== "none" && process.env.MARKET_DATA_REDISTRIBUTION_LICENSED === "true";
}

export interface SnapshotRow {
  symbol: string;
  name: string;
  exchange: string;
  lastPrice: number;
  changePercent: number;
  dataTimestamp: Date;
}

export interface PublicSnapshot {
  asOf: Date;
  provider: string;
  indices: SnapshotRow[];
  gainers: SnapshotRow[];
  losers: SnapshotRow[];
}

async function snapshot(): Promise<PublicSnapshot | null> {
  if (!marketDataPublic()) return null;
  const s = await latestMarketSnapshot(getPrisma());
  if (!s) return null;
  const row = (r: (typeof s.indices)[number]): SnapshotRow => ({
    symbol: r.symbol,
    name: r.companyName,
    exchange: r.exchange,
    lastPrice: Number(r.lastPrice),
    changePercent: Number(r.changePercent),
    dataTimestamp: r.dataTimestamp,
  });
  return { asOf: s.asOf, provider: s.provider, indices: s.indices.map(row), gainers: s.gainers.map(row), losers: s.losers.map(row) };
}

export async function getPublicSettings() {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const raw = await getPrisma().siteSettings.findUnique({ where: { id: "default" } });
  if (!raw) return { publishTimeIst: "21:00", ads: { enabled: false, publisherId: null as string | null, slots: {} as Record<string, string | undefined> } };
  const s = resolveSettings(raw);
  return { publishTimeIst: s.publishTimeIst, ads: s.ads };
}

export async function getHomeData() {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const prisma = getPrisma();
  const [latest, ai, markets, trending, editionDate, market] = await Promise.all([
    listPublished(prisma, { take: 13 }),
    listPublished(prisma, { sections: ["AI", "TECHNOLOGY"], take: 6 }),
    listPublished(prisma, { sections: ["MARKETS", "IPO"], take: 6 }),
    trendingArticles(prisma, 5),
    latestEditionDate(prisma),
    snapshot(),
  ]);
  const featured = latest[0] ?? null;
  const exclude = new Set([featured?.id, ...ai.map((a) => a.id), ...markets.map((a) => a.id)]);
  return {
    featured,
    ai: ai.filter((a) => a.id !== featured?.id).slice(0, 5),
    markets: markets.filter((a) => a.id !== featured?.id).slice(0, 5),
    latest: latest.filter((a) => !exclude.has(a.id)).slice(0, 9),
    trending,
    editionDate,
    snapshot: market,
  };
}

export async function getSectionArticles(sections: Section[], take = 40): Promise<ArticleCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return listPublished(getPrisma(), { sections, take });
}

export async function getRecentSlugs(section: Section, take = 30): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const rows = await getPrisma().article.findMany({
    where: { section, status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take,
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function getArticle(section: Section, slug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(CONTENT_TAG);
  const a = await getPublishedArticle(getPrisma(), section, slug);
  if (!a) return null;
  const stock = a.stocks[0];
  const keyFacts = (Array.isArray(a.keyFacts) ? a.keyFacts : []) as Array<{ fact: string; sourceIds?: string[] } | string>;
  return {
    id: a.id,
    slug: a.slug,
    section: a.section,
    kind: a.kind,
    headline: a.headline,
    excerpt: a.excerpt,
    introduction: a.introduction,
    body: a.body,
    context: a.context,
    whyItMatters: a.whyItMatters,
    keyFacts: keyFacts.map((k) => (typeof k === "string" ? { fact: k, sourceIds: [] } : { fact: k.fact, sourceIds: k.sourceIds ?? [] })),
    implications: a.implications,
    risks: a.risks,
    seoTitle: a.seoTitle,
    seoDescription: a.seoDescription,
    imageAlt: a.imageAlt,
    imageUrl: a.imageUrl,
    illustration: a.illustration ? { id: a.illustration.id, model: a.illustration.model } : null,
    imageCredit: a.imageCredit,
    readingTimeMinutes: a.readingTimeMinutes,
    generatedByModel: a.generatedByModel,
    disclaimerRequired: a.disclaimerRequired,
    publishedAt: a.publishedAt,
    modifiedAt: a.contentModifiedAt ?? a.publishedAt,
    wasUpdated: Boolean(a.contentModifiedAt && a.contentModifiedAt > a.publishedAt),
    author: { name: a.author.name, slug: a.author.slug, isAutomated: a.author.isAutomated },
    category: { name: a.category.name, slug: a.category.slug },
    tags: a.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, slug: t.tag.slug })),
    sources: a.sources.map((s) => ({ id: s.id, url: s.url, title: s.title, publisher: s.publisherName, publishedAt: s.publishedAt, citationId: s.citationId, isPrimary: s.isPrimary })),
    edition: a.edition ? { date: a.edition.editionDate.toISOString().slice(0, 10), title: a.edition.title } : null,
    stock:
      stock && marketDataPublic()
        ? {
            symbol: stock.symbol,
            exchange: stock.exchange,
            companyName: stock.companyName,
            lastPrice: Number(stock.lastPrice),
            previousClose: Number(stock.previousClose),
            changePercent: Number(stock.changePercent),
            volume: stock.volume !== null ? Number(stock.volume) : null,
            dataTimestamp: stock.dataTimestamp,
            provider: stock.provider,
          }
        : null,
    wordCount: wordCount(markdownToPlainText(`${a.introduction}\n${a.body}\n${a.context}\n${a.whyItMatters}\n${a.implications}\n${a.risks}`)),
  };
}
export type PublicArticle = NonNullable<Awaited<ReturnType<typeof getArticle>>>;

export async function getRelated(articleId: string, section: Section, tagIds: string[]): Promise<ArticleCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return relatedArticles(getPrisma(), { id: articleId, section, tagIds }, 4);
}

export async function getEditionPage(date: string) {
  "use cache";
  cacheLife("days");
  cacheTag(CONTENT_TAG);
  const e = await getEdition(getPrisma(), date);
  if (!e) return null;
  return {
    date,
    title: e.edition.title,
    summary: e.edition.summary,
    publishedAt: e.edition.publishedAt,
    aiCount: e.edition.aiCount,
    marketCount: e.edition.marketCount,
    articles: e.articles,
  };
}

export async function getEditions() {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const rows = await listEditions(getPrisma(), 60);
  return rows.map((r) => ({ date: r.editionDate.toISOString().slice(0, 10), title: r.title, aiCount: r.aiCount, marketCount: r.marketCount, publishedAt: r.publishedAt }));
}

export async function getAuthors() {
  "use cache";
  cacheLife("days");
  cacheTag(CONTENT_TAG);
  const authors = await getPrisma().author.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { articles: { where: { status: "PUBLISHED" } } } } } });
  return authors.map((a) => ({ slug: a.slug, name: a.name, role: a.role, bio: a.bio, isAutomated: a.isAutomated, published: a._count.articles }));
}

/** For sitemaps and the RSS feed: published articles only. */
export async function getFeedArticles(take = 5000) {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return getPrisma().article.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take,
    select: { slug: true, section: true, headline: true, excerpt: true, publishedAt: true, contentModifiedAt: true, updatedAt: true, author: { select: { name: true } } },
  });
}

export async function getSectionCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const rows = await getPrisma().article.groupBy({ by: ["section"], where: { status: "PUBLISHED" }, _count: true, _max: { publishedAt: true } });
  return Object.fromEntries(rows.map((r) => [r.section, { count: r._count, lastPublishedAt: r._max.publishedAt }])) as Partial<Record<Section, { count: number; lastPublishedAt: Date | null }>>;
}
