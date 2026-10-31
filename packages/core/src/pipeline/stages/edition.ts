import type { DailyEdition, PrismaClient } from "@tdc/db";
import { adminAlertRecipients, getEnv, siteUrl } from "../../env";
import { articleUrl, deskForSection, editionPath, sectionInfo } from "../../content/paths";
import { adminReportEmail, dailyDigestEmail } from "../../email/templates";
import { unsubscribeUrl } from "../../newsletter/service";
import { validateArticle } from "../../publishing/articles";
import { formatIstDate, istWallTimeToUtc, toDbDate } from "../../time/ist";
import type { PipelineContext, StageResult } from "../context";

export function editionTitle(editionDate: string): string {
  return `Evening edition, ${formatIstDate(istWallTimeToUtc(editionDate, "12:00"))}`;
}

/** One edition row per IST date; safe to call from any stage. */
export async function ensureEdition(prisma: PrismaClient, editionDate: string, scheduledFor: Date): Promise<DailyEdition> {
  return prisma.dailyEdition.upsert({
    where: { editionDate: toDbDate(editionDate) },
    create: { editionDate: toDbDate(editionDate), title: editionTitle(editionDate), scheduledFor, status: "PREPARING" },
    update: {},
  });
}

export async function validateStage(ctx: PipelineContext): Promise<StageResult> {
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const edition = await ensureEdition(ctx.prisma, ctx.editionDate, publishAt);
  const drafts = await ctx.prisma.article.findMany({ where: { editionId: edition.id, status: "DRAFT" }, select: { id: true } });
  const counts = { approved: 0, needsReview: 0, failed: 0 };
  for (const d of drafts) {
    const { status } = await validateArticle(ctx.prisma, d.id, {
      llm: ctx.llm,
      classifierModel: ctx.models.classifier,
      factCheck: ctx.settings.enableFactCheckPass,
      autoPublish: ctx.settings.autoPublish,
      scheduledFor: publishAt,
      jobId: ctx.jobId,
      log: ctx.log,
    });
    if (status === "APPROVED") counts.approved += 1;
    else if (status === "NEEDS_REVIEW") counts.needsReview += 1;
    else counts.failed += 1;
  }
  return { status: "SUCCEEDED", summary: { validated: drafts.length, ...counts } };
}

export async function prepareEditionStage(ctx: PipelineContext): Promise<StageResult> {
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const edition = await ensureEdition(ctx.prisma, ctx.editionDate, publishAt);
  const articles = await ctx.prisma.article.findMany({
    where: { editionId: edition.id },
    select: { id: true, status: true, section: true, headline: true },
    orderBy: { createdAt: "asc" },
  });
  const ready = articles.filter((a) => a.status === "APPROVED" || a.status === "PUBLISHED");
  const aiCount = ready.filter((a) => deskForSection(a.section) === "AI").length;
  const marketCount = ready.length - aiCount;
  const stats = {
    approved: articles.filter((a) => a.status === "APPROVED").length,
    needsReview: articles.filter((a) => a.status === "NEEDS_REVIEW").length,
    failed: articles.filter((a) => a.status === "FAILED").length,
  };
  await ctx.prisma.dailyEdition.update({
    where: { id: edition.id },
    data: {
      aiCount,
      marketCount,
      stats,
      scheduledFor: publishAt,
      status: ready.length ? "READY" : "EMPTY",
      summary: ready.length ? ready.slice(0, 3).map((a) => a.headline).join(" · ") : null,
    },
  });
  return { status: "SUCCEEDED", summary: { aiCount, marketCount, ...stats } };
}

/**
 * Publishes every approved article of the edition whose scheduled time has arrived.
 * Idempotent: `updateMany` only touches APPROVED rows without a publish time, so a rerun
 * (or a second worker) can never republish or change an existing publication timestamp.
 */
export async function publishStage(ctx: PipelineContext): Promise<StageResult> {
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const edition = await ensureEdition(ctx.prisma, ctx.editionDate, publishAt);
  const now = ctx.now();
  const force = ctx.payload.force === true;
  const due = await ctx.prisma.article.findMany({
    where: { editionId: edition.id, status: "APPROVED", publishedAt: null, ...(force ? {} : { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] }) },
    select: { id: true },
  });
  const ids = due.map((a) => a.id);
  const published = await ctx.prisma.$transaction(async (tx) => {
    const res = await tx.article.updateMany({ where: { id: { in: ids }, status: "APPROVED", publishedAt: null }, data: { status: "PUBLISHED", publishedAt: now } });
    if (res.count) {
      await tx.auditLog.createMany({
        data: ids.map((id) => ({ actorType: "SYSTEM" as const, action: "article.publish", entityType: "Article", entityId: id, after: { editionDate: ctx.editionDate, publishedAt: now.toISOString() } })),
      });
    }
    const all = await tx.article.findMany({ where: { editionId: edition.id }, select: { status: true, section: true } });
    const live = all.filter((a) => a.status === "PUBLISHED");
    const pending = all.filter((a) => ["NEEDS_REVIEW", "APPROVED", "DRAFT", "FAILED"].includes(a.status)).length;
    await tx.dailyEdition.update({
      where: { id: edition.id },
      data: {
        status: live.length === 0 ? "EMPTY" : pending ? "PARTIAL" : "PUBLISHED",
        publishedAt: edition.publishedAt ?? (live.length ? now : null),
        aiCount: live.filter((a) => deskForSection(a.section) === "AI").length,
        marketCount: live.filter((a) => deskForSection(a.section) === "MARKETS").length,
      },
    });
    return res.count;
  });
  return { status: "SUCCEEDED", summary: { published, considered: ids.length } };
}

export async function buildAdminReport(ctx: PipelineContext, edition: DailyEdition) {
  const editionDb = toDbDate(ctx.editionDate);
  const [articles, notSelected, jobs] = await Promise.all([
    ctx.prisma.article.findMany({ where: { editionId: edition.id }, select: { headline: true, status: true, section: true, slug: true, reviewFlags: true } }),
    ctx.prisma.newsCandidate.count({ where: { editionDate: editionDb, status: { in: ["NOT_SELECTED", "STALE", "DUPLICATE", "IRRELEVANT"] } } }),
    ctx.prisma.jobExecution.findMany({ where: { editionDate: editionDb }, select: { id: true, type: true, status: true, error: true, result: true } }),
  ]);
  const jobIds = jobs.map((j) => j.id);
  const usage = await ctx.prisma.apiUsage.aggregate({ where: { jobId: { in: jobIds } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true });
  const now = ctx.now();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = await ctx.prisma.apiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } });
  const collect = jobs.find((j) => j.type === "COLLECT")?.result as { sourcesProcessed?: number; sourcesFailed?: number } | null;
  const published = articles.filter((a) => a.status === "PUBLISHED");
  const problems = [
    ...jobs.filter((j) => j.status === "FAILED" || j.status === "PARTIAL").map((j) => `${j.type} ${j.status.toLowerCase()}: ${j.error ?? ((j.result as { problems?: string[] } | null)?.problems ?? []).join("; ")}`),
    ...articles.filter((a) => a.status === "FAILED").map((a) => `Failed: ${a.headline} — ${a.reviewFlags[0] ?? "unknown reason"}`),
    ...articles.filter((a) => a.status === "NEEDS_REVIEW").map((a) => `Needs review: ${a.headline} — ${a.reviewFlags[0] ?? ""}`),
  ];
  return {
    siteName: ctx.settings.siteName,
    editionDate: ctx.editionDate,
    aiPublished: published.filter((a) => deskForSection(a.section) === "AI").length,
    marketPublished: published.filter((a) => deskForSection(a.section) === "MARKETS").length,
    needsReview: articles.filter((a) => a.status === "NEEDS_REVIEW").length,
    failed: articles.filter((a) => a.status === "FAILED").length,
    skipped: notSelected,
    sourcesProcessed: collect?.sourcesProcessed ?? 0,
    sourcesFailed: collect?.sourcesFailed ?? 0,
    apiCalls: usage._count,
    inputTokens: usage._sum.inputTokens ?? 0,
    outputTokens: usage._sum.outputTokens ?? 0,
    costUsd: Number(usage._sum.costUsd ?? 0),
    monthToDateUsd: Number(month._sum.costUsd ?? 0),
    monthlyBudgetUsd: ctx.settings.monthlyBudgetUsd,
    published: published.map((a) => ({ headline: a.headline, url: articleUrl(a) })),
    problems,
    adminUrl: `${siteUrl()}/admin`,
  };
}

/** Sitemaps/feeds refresh, administrator report and (optional) subscriber digest — each sent at most once. */
export async function postPublishStage(ctx: PipelineContext): Promise<StageResult> {
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const edition = await ensureEdition(ctx.prisma, ctx.editionDate, publishAt);
  const problems: string[] = [];

  try {
    await ctx.revalidate(["/", "/ai", "/technology", "/markets", "/ipo", editionPath(ctx.editionDate), "/sitemap.xml", "/news-sitemap.xml", "/rss.xml"]);
  } catch (error) {
    problems.push(`Cache refresh failed: ${(error as Error).message}`);
  }

  let reportSent = false;
  const recipients = ctx.alertRecipients.length ? ctx.alertRecipients : adminAlertRecipients(getEnv());
  if (!edition.reportSentAt && recipients.length) {
    const report = await buildAdminReport(ctx, edition);
    await ctx.mailer.send(adminReportEmail(recipients, report));
    await ctx.prisma.dailyEdition.update({ where: { id: edition.id }, data: { reportSentAt: ctx.now() } });
    reportSent = true;
  }

  let digestRecipients = 0;
  if (ctx.settings.newsletterDigestEnabled && !edition.digestSentAt && edition.publishedAt) {
    const articles = await ctx.prisma.article.findMany({
      where: { editionId: edition.id, status: "PUBLISHED" },
      orderBy: { publishedAt: "asc" },
      select: { headline: true, excerpt: true, section: true, slug: true },
    });
    if (articles.length) {
      const subscribers = await ctx.prisma.newsletterSubscriber.findMany({
        where: { status: "CONFIRMED", OR: [{ lastSentAt: null }, { lastSentAt: { lt: edition.publishedAt } }] },
        select: { id: true, email: true },
      });
      for (const s of subscribers) {
        await ctx.mailer.send(
          dailyDigestEmail({
            to: s.email,
            siteName: ctx.settings.siteName,
            editionTitle: edition.title,
            editionUrl: `${siteUrl()}${editionPath(ctx.editionDate)}`,
            articles: articles.map((a) => ({ headline: a.headline, excerpt: a.excerpt, url: articleUrl(a), sectionName: sectionInfo(a.section).name })),
            unsubscribeUrl: unsubscribeUrl(s.id),
          }),
        );
        await ctx.prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { lastSentAt: ctx.now() } });
        digestRecipients += 1;
      }
    }
    await ctx.prisma.dailyEdition.update({ where: { id: edition.id }, data: { digestSentAt: ctx.now() } });
  }
  return { status: problems.length ? "PARTIAL" : "SUCCEEDED", summary: { reportSent, digestRecipients }, problems };
}
