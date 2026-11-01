import type { Prisma, PrismaClient, Section } from "@tdc/db";
import { istDateString, toDbDate } from "../time/ist";

/** Fields every public article card needs. */
export const cardSelect = {
  id: true,
  slug: true,
  section: true,
  kind: true,
  headline: true,
  excerpt: true,
  imageAlt: true,
  imageUrl: true,
  readingTimeMinutes: true,
  publishedAt: true,
  author: { select: { name: true, slug: true } },
  illustration: { select: { id: true } },
} satisfies Prisma.ArticleSelect;

export type ArticleCard = Prisma.ArticleGetPayload<{ select: typeof cardSelect }> & { publishedAt: Date };

const PUBLISHED = { status: "PUBLISHED" as const, publishedAt: { not: null } };

function asCards<T extends { publishedAt: Date | null }>(rows: T[]): Array<T & { publishedAt: Date }> {
  return rows.filter((r): r is T & { publishedAt: Date } => r.publishedAt !== null);
}

export async function listPublished(prisma: PrismaClient, options: { sections?: Section[]; take?: number; skip?: number; excludeIds?: string[] } = {}): Promise<ArticleCard[]> {
  const rows = await prisma.article.findMany({
    where: { ...PUBLISHED, ...(options.sections ? { section: { in: options.sections } } : {}), ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}) },
    orderBy: { publishedAt: "desc" },
    take: options.take ?? 20,
    skip: options.skip ?? 0,
    select: cardSelect,
  });
  return asCards(rows);
}

export async function countPublished(prisma: PrismaClient, sections?: Section[]): Promise<number> {
  return prisma.article.count({ where: { ...PUBLISHED, ...(sections ? { section: { in: sections } } : {}) } });
}

export async function getPublishedArticle(prisma: PrismaClient, section: Section, slug: string) {
  const article = await prisma.article.findFirst({
    where: { ...PUBLISHED, section, slug },
    include: {
      author: true,
      category: true,
      sources: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { id: true, url: true, title: true, publisherName: true, publishedAt: true, citationId: true, isPrimary: true } },
      tags: { include: { tag: true } },
      stocks: { orderBy: { dataTimestamp: "desc" }, take: 1 },
      illustration: { select: { id: true, model: true } },
      edition: { select: { editionDate: true, title: true } },
    },
  });
  return article && article.publishedAt ? { ...article, publishedAt: article.publishedAt } : null;
}

/** Same section, sharing tags first, then most recent. Never includes the article itself. */
export async function relatedArticles(prisma: PrismaClient, article: { id: string; section: Section; tagIds: string[] }, take = 4): Promise<ArticleCard[]> {
  const byTag = article.tagIds.length
    ? asCards(
        await prisma.article.findMany({
          where: { ...PUBLISHED, id: { not: article.id }, tags: { some: { tagId: { in: article.tagIds } } } },
          orderBy: { publishedAt: "desc" },
          take,
          select: cardSelect,
        }),
      )
    : [];
  if (byTag.length >= take) return byTag;
  const rest = await listPublished(prisma, { sections: [article.section], take: take - byTag.length, excludeIds: [article.id, ...byTag.map((a) => a.id)] });
  return [...byTag, ...rest];
}

/** Most-read published articles over the last three days (internal analytics). */
export async function trendingArticles(prisma: PrismaClient, take = 5): Promise<ArticleCard[]> {
  const since = toDbDate(istDateString(new Date(Date.now() - 3 * 24 * 3_600_000)));
  const stats = await prisma.articleDailyStat.groupBy({
    by: ["articleId"],
    where: { date: { gte: since } },
    _sum: { views: true },
    orderBy: { _sum: { views: "desc" } },
    take: take * 2,
  });
  if (!stats.length) return [];
  const rows = asCards(await prisma.article.findMany({ where: { ...PUBLISHED, id: { in: stats.map((s) => s.articleId) } }, select: cardSelect }));
  const order = new Map(stats.map((s, i) => [s.articleId, i]));
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).slice(0, take);
}

export async function latestEditionDate(prisma: PrismaClient): Promise<string | null> {
  const e = await prisma.dailyEdition.findFirst({ where: { publishedAt: { not: null } }, orderBy: { editionDate: "desc" }, select: { editionDate: true } });
  return e ? e.editionDate.toISOString().slice(0, 10) : null;
}

export async function getEdition(prisma: PrismaClient, editionDate: string) {
  const edition = await prisma.dailyEdition.findUnique({ where: { editionDate: toDbDate(editionDate) } });
  if (!edition || !edition.publishedAt) return null;
  const articles = asCards(
    await prisma.article.findMany({ where: { ...PUBLISHED, editionId: edition.id }, orderBy: [{ section: "asc" }, { publishedAt: "asc" }], select: cardSelect }),
  );
  return { edition, articles };
}

export async function listEditions(prisma: PrismaClient, take = 30) {
  return prisma.dailyEdition.findMany({
    where: { publishedAt: { not: null }, OR: [{ aiCount: { gt: 0 } }, { marketCount: { gt: 0 } }] },
    orderBy: { editionDate: "desc" },
    take,
    select: { editionDate: true, title: true, aiCount: true, marketCount: true, publishedAt: true },
  });
}

/** Latest snapshot per tracked instrument. Callers must check licensing before display. */
export async function latestMarketSnapshot(prisma: PrismaClient) {
  const latest = await prisma.stockSnapshot.findFirst({ orderBy: { dataTimestamp: "desc" }, select: { editionDate: true } });
  if (!latest) return null;
  const rows = await prisma.stockSnapshot.findMany({ where: { editionDate: latest.editionDate }, orderBy: { dataTimestamp: "desc" } });
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(`${r.exchange}:${r.symbol}`) ? false : (seen.add(`${r.exchange}:${r.symbol}`), true)));
  const indices = unique.filter((r) => r.instrumentType === "INDEX");
  const equities = unique.filter((r) => r.instrumentType === "EQUITY").sort((a, b) => Number(b.changePercent) - Number(a.changePercent));
  return {
    editionDate: latest.editionDate.toISOString().slice(0, 10),
    asOf: unique.reduce((d, r) => (r.dataTimestamp > d ? r.dataTimestamp : d), new Date(0)),
    provider: unique[0]?.provider ?? "",
    indices,
    gainers: equities.filter((e) => Number(e.changePercent) > 0).slice(0, 5),
    losers: equities.filter((e) => Number(e.changePercent) < 0).reverse().slice(0, 5),
  };
}

export async function recordView(prisma: PrismaClient, articleId: string, at = new Date()): Promise<void> {
  const date = toDbDate(istDateString(at));
  await prisma.$transaction([
    prisma.articleDailyStat.upsert({ where: { articleId_date: { articleId, date } }, create: { articleId, date, views: 1 }, update: { views: { increment: 1 } } }),
    prisma.article.update({ where: { id: articleId }, data: { viewCount: { increment: 1 } } }),
  ]);
}
