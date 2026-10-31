import type { NewsSource, PrismaClient } from "@tdc/db";
import type { Logger } from "../logger";
import { addMinutes, istWallTimeToUtc, toDbDate } from "../time/ist";
import { fetchText } from "../util/http";
import { isTransientError, withRetry } from "../util/retry";
import { truncate } from "../util/text";
import { parseFeed } from "./feed-parser";
import { canonicalizeUrl, normalizeHeadline, stripPublisherSuffix } from "./normalize";
import { isFetchAllowed } from "./robots";

export interface SourceResult {
  sourceId: string;
  name: string;
  status: "ok" | "not-modified" | "robots-disallowed" | "error";
  items: number;
  created: number;
  error?: string;
}

export interface CollectStats {
  sourcesProcessed: number;
  sourcesFailed: number;
  itemsSeen: number;
  candidatesCreated: number;
  results: SourceResult[];
}

/** Only keep items published within this window before the edition's publish time. */
export const LOOKBACK_HOURS = 36;

export async function collectSource(
  prisma: PrismaClient,
  source: NewsSource,
  options: { editionDate: string; publishTimeIst: string; now: Date; log: Logger; fetchImpl?: typeof fetch },
): Promise<SourceResult> {
  const base = { sourceId: source.id, name: source.name };
  try {
    if (!(await isFetchAllowed(source.feedUrl, options.fetchImpl))) {
      await prisma.newsSource.update({ where: { id: source.id }, data: { lastFetchedAt: options.now, lastStatus: "robots-disallowed" } });
      return { ...base, status: "robots-disallowed", items: 0, created: 0 };
    }
    const conditional: Record<string, string> = { Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" };
    if (source.etag) conditional["If-None-Match"] = source.etag;
    if (source.lastModified) conditional["If-Modified-Since"] = source.lastModified;

    const res = await withRetry(() => fetchText(source.feedUrl, { headers: conditional, timeoutMs: 20_000, fetchImpl: options.fetchImpl }), {
      retries: 2,
      baseDelayMs: 1_000,
      shouldRetry: isTransientError,
    });
    if (res.notModified) {
      await prisma.newsSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: options.now, lastSuccessAt: options.now, lastStatus: "not-modified", lastError: null, consecutiveFailures: 0 },
      });
      return { ...base, status: "not-modified", items: 0, created: 0 };
    }

    const feed = parseFeed(res.text);
    const publishAt = istWallTimeToUtc(options.editionDate, options.publishTimeIst);
    const earliest = addMinutes(publishAt, -LOOKBACK_HOURS * 60);
    const latest = addMinutes(options.now, 24 * 60);
    const editionDate = toDbDate(options.editionDate);

    const rows = [];
    for (const item of feed.items.slice(0, source.maxItemsPerFetch)) {
      // Never treat a feed's "updated" stamp as the publication time.
      if (item.publishedAt && (item.publishedAt < earliest || item.publishedAt > latest)) continue;
      if (!item.publishedAt && item.updatedAt && item.updatedAt < earliest) continue;
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(item.link);
      } catch {
        continue;
      }
      const headline = stripPublisherSuffix(item.title, source.name);
      rows.push({
        sourceId: source.id,
        originalUrl: item.link,
        canonicalUrl,
        guid: item.guid ? truncate(item.guid, 500) : null,
        originalHeadline: truncate(headline, 500),
        normalizedHeadline: normalizeHeadline(headline, source.name),
        feedSummary: item.summary,
        publishedAt: item.publishedAt,
        publishedAtSource: item.publishedAt ? ("FEED_PUBLISHED" as const) : ("UNKNOWN" as const),
        feedUpdatedAt: item.updatedAt,
        collectedAt: options.now,
        desk: source.desk,
        editionDate,
        sourceReliability: source.reliability,
        extractedFacts: { feedCategories: item.categories },
      });
    }
    const created = rows.length ? (await prisma.newsCandidate.createMany({ data: rows, skipDuplicates: true })).count : 0;
    await prisma.newsSource.update({
      where: { id: source.id },
      data: {
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        lastFetchedAt: options.now,
        lastSuccessAt: options.now,
        lastStatus: `ok: ${feed.items.length} items, ${created} new`,
        lastError: null,
        consecutiveFailures: 0,
      },
    });
    return { ...base, status: "ok", items: feed.items.length, created };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    options.log.warn("Source fetch failed", { source: source.slug, error: message });
    await prisma.newsSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: options.now, lastStatus: "error", lastError: truncate(message, 500), consecutiveFailures: { increment: 1 } },
    });
    return { ...base, status: "error", items: 0, created: 0, error: message };
  }
}

export async function collectAll(
  prisma: PrismaClient,
  options: { editionDate: string; publishTimeIst: string; now: Date; log: Logger; sourceIds?: string[]; concurrency?: number; fetchImpl?: typeof fetch },
): Promise<CollectStats> {
  const sources = await prisma.newsSource.findMany({
    where: { isEnabled: true, ...(options.sourceIds ? { id: { in: options.sourceIds } } : {}) },
    orderBy: { name: "asc" },
  });
  const results: SourceResult[] = [];
  const queue = [...sources];
  const workers = Array.from({ length: Math.min(options.concurrency ?? 4, queue.length) }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      results.push(await collectSource(prisma, s, options));
    }
  });
  await Promise.all(workers);
  return {
    sourcesProcessed: results.length,
    sourcesFailed: results.filter((r) => r.status === "error").length,
    itemsSeen: results.reduce((n, r) => n + r.items, 0),
    candidatesCreated: results.reduce((n, r) => n + r.created, 0),
    results: results.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
