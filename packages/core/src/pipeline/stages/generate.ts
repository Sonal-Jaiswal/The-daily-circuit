import { Prisma, type NewsCandidate, type NewsSource, type Section, type StockSnapshot, type StoryCluster } from "@tdc/db";
import { LlmError } from "../../ai/gateway";
import { WRITER_SYSTEM, writerPrompt, type PromptSource, type StockContext } from "../../editorial/prompts";
import { researchCandidate } from "../../editorial/research";
import { ArticleDraftSchema, clampDraft, PROMPT_VERSION, type ArticleDraft } from "../../editorial/schema";
import type { GenerationMeta } from "../../publishing/articles";
import { uniqueSlug } from "../../publishing/slug";
import { istWallTimeToUtc, toDbDate } from "../../time/ist";
import { sha256 } from "../../util/crypto";
import { readingTimeMinutes, slugify, truncate, uniqueBy, wordCount } from "../../util/text";
import { markdownToPlainText } from "../../content/markdown";
import { requireLlm, type PipelineContext, type StageResult } from "../context";
import { ensureEdition } from "./edition";
import { attachIllustration } from "../../images/illustrate";

type Member = NewsCandidate & { source: NewsSource };
type ClusterWithMembers = StoryCluster & { candidates: Member[] };

const MAX_SOURCES = 4;
const MIN_DRAFT_WORDS = 350;

export function articleIdempotencyKey(editionDate: string, clusterId: string): string {
  return `${editionDate}:cluster:${clusterId}`;
}

export async function monthToDateSpendUsd(ctx: Pick<PipelineContext, "prisma" | "now">): Promise<number> {
  const now = ctx.now();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await ctx.prisma.apiUsage.aggregate({ where: { createdAt: { gte: start } }, _sum: { costUsd: true } });
  return Number(agg._sum.costUsd ?? 0);
}

function orderMembers(cluster: ClusterWithMembers): Member[] {
  const sorted = [...cluster.candidates].sort((a, b) => {
    if (a.isClusterPrimary !== b.isClusterPrimary) return a.isClusterPrimary ? -1 : 1;
    return b.sourceReliability - a.sourceReliability;
  });
  return uniqueBy(sorted, (m) => m.source.name.toLowerCase()).slice(0, MAX_SOURCES);
}

/** "Why is this stock moving?": attach the latest significant move for a ticker named in the story. */
async function findStockMove(ctx: PipelineContext, members: Member[]): Promise<StockSnapshot | null> {
  const tickers = new Set<string>();
  for (const m of members) for (const t of ((m.extractedFacts as { tickers?: string[] } | null)?.tickers ?? [])) tickers.add(t.toUpperCase().replace(/\.(NS|NSE|BO|BSE)$/, ""));
  if (!tickers.size) return null;
  const since = new Date(ctx.now().getTime() - 30 * 3_600_000);
  const snaps = await ctx.prisma.stockSnapshot.findMany({
    where: { symbol: { in: [...tickers] }, instrumentType: "EQUITY", dataTimestamp: { gte: since } },
    orderBy: { dataTimestamp: "desc" },
  });
  return snaps.find((s) => Math.abs(Number(s.changePercent)) >= ctx.settings.significantMovePct) ?? null;
}

function stockContext(s: StockSnapshot): StockContext {
  return {
    companyName: s.companyName,
    exchange: s.exchange,
    symbol: s.symbol,
    lastPrice: s.lastPrice.toString(),
    previousClose: s.previousClose.toString(),
    changePercent: s.changePercent.toString(),
    volume: s.volume?.toString() ?? null,
    dataTimestamp: s.dataTimestamp,
    provider: s.provider,
  };
}

async function recordFailure(ctx: PipelineContext, cluster: ClusterWithMembers, editionId: string, reason: string) {
  const primary = cluster.candidates.find((m) => m.isClusterPrimary) ?? cluster.candidates[0]!;
  const section: Section = primary.section ?? (cluster.desk === "AI" ? "AI" : "MARKETS");
  const key = articleIdempotencyKey(ctx.editionDate, cluster.id);
  const category = await ctx.prisma.category.findUniqueOrThrow({ where: { section } });
  const author = await ctx.prisma.author.findUniqueOrThrow({ where: { slug: cluster.desk === "AI" ? "ai-desk" : "markets-desk" } });
  const report = { blocking: [reason], review: [], warnings: [], stats: {}, checkedAt: new Date().toISOString() };
  await ctx.prisma.article.upsert({
    where: { idempotencyKey: key },
    create: {
      idempotencyKey: key,
      slug: `draft-${slugify(primary.originalHeadline, 60)}-${sha256(key).slice(0, 8)}`,
      status: "FAILED",
      section,
      categoryId: category.id,
      authorId: author.id,
      editionId,
      clusterId: cluster.id,
      headline: truncate(primary.originalHeadline, 200),
      excerpt: "",
      introduction: "",
      body: "",
      context: "",
      whyItMatters: "",
      keyFacts: [],
      implications: "",
      risks: "",
      seoTitle: "",
      seoDescription: "",
      imageAlt: "",
      readingTimeMinutes: 1,
      validationReport: report,
      reviewFlags: [reason],
    },
    update: { status: "FAILED", validationReport: report, reviewFlags: [reason] },
  });
}

async function saveDraft(
  ctx: PipelineContext,
  cluster: ClusterWithMembers,
  editionId: string,
  draft: ArticleDraft,
  sources: Array<PromptSource & { candidateId: string; isPrimary: boolean; note: string }>,
  stock: StockSnapshot | null,
  usage: { requestId: string | null; model: string },
) {
  draft = clampDraft(draft);
  const primary = cluster.candidates.find((m) => m.isClusterPrimary) ?? cluster.candidates[0]!;
  const section: Section = primary.section ?? (cluster.desk === "AI" ? "AI" : "MARKETS");
  const key = articleIdempotencyKey(ctx.editionDate, cluster.id);
  const existing = await ctx.prisma.article.findUnique({ where: { idempotencyKey: key }, select: { id: true } });
  const slug = await uniqueSlug(ctx.prisma, draft.headline, key, existing?.id);
  const category = await ctx.prisma.category.findUniqueOrThrow({ where: { section } });
  const author = await ctx.prisma.author.findUniqueOrThrow({ where: { slug: cluster.desk === "AI" ? "ai-desk" : "markets-desk" } });
  const used = new Set(draft.sourcesUsed);
  const keptSources = sources.filter((s) => used.has(s.id) || s.isPrimary);
  const meta: GenerationMeta = {
    confirmed: draft.confirmed,
    unconfirmed: draft.unconfirmed,
    containsAnalystOpinion: draft.containsAnalystOpinion,
    sourcesUsed: draft.sourcesUsed,
    insufficientInformation: draft.insufficientInformation,
    insufficientReason: draft.insufficientReason,
    keyFactSources: draft.keyFacts.map((k) => k.sourceIds),
    researchNotes: Object.fromEntries(sources.map((s) => [s.id, s.note])),
  };
  const content = {
    slug,
    status: "DRAFT" as const,
    kind: stock ? ("STOCK_MOVER" as const) : ("NEWS" as const),
    section,
    categoryId: category.id,
    authorId: author.id,
    editionId,
    clusterId: cluster.id,
    headline: draft.headline,
    excerpt: draft.excerpt,
    introduction: draft.introduction,
    body: draft.body,
    context: draft.context,
    whyItMatters: draft.whyItMatters,
    keyFacts: draft.keyFacts as unknown as Prisma.InputJsonValue,
    implications: draft.implications,
    risks: draft.risks,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    imageAlt: draft.imageAlt,
    readingTimeMinutes: readingTimeMinutes(markdownToPlainText(`${draft.introduction}\n${draft.body}\n${draft.context}\n${draft.whyItMatters}\n${draft.implications}\n${draft.risks}`)),
    disclaimerRequired: cluster.desk === "MARKETS",
    generationMeta: meta as unknown as Prisma.InputJsonValue,
    // The model that actually wrote this article (the provider chain may have fallen back).
    generatedByModel: usage.model,
    promptVersion: PROMPT_VERSION,
    validationReport: Prisma.JsonNull,
    reviewFlags: [],
  };
  const article = await ctx.prisma.$transaction(async (tx) => {
    const saved = await tx.article.upsert({ where: { idempotencyKey: key }, create: { idempotencyKey: key, ...content }, update: content });
    await tx.articleSource.deleteMany({ where: { articleId: saved.id } });
    await tx.articleSource.createMany({
      data: keptSources.map((s, i) => ({
        articleId: saved.id,
        candidateId: s.candidateId,
        url: s.url,
        title: s.title,
        publisherName: s.publisher,
        publishedAt: s.publishedAt,
        citationId: s.id,
        verificationText: s.text,
        isPrimary: s.isPrimary,
        sortOrder: i,
      })),
    });
    await tx.articleTag.deleteMany({ where: { articleId: saved.id } });
    for (const name of uniqueBy(draft.tags.map((t) => t.trim()).filter(Boolean), (t) => slugify(t, 40))) {
      const tagSlug = slugify(name, 40);
      const tag = await tx.tag.upsert({ where: { slug: tagSlug }, create: { slug: tagSlug, name }, update: {} });
      await tx.articleTag.create({ data: { articleId: saved.id, tagId: tag.id } });
    }
    if (stock) await tx.stockSnapshot.update({ where: { id: stock.id }, data: { articleId: saved.id } });
    await tx.newsCandidate.updateMany({ where: { clusterId: cluster.id, status: "SELECTED" }, data: { status: "USED" } });
    return saved;
  }, { timeout: 30_000, maxWait: 10_000 });
  if (usage.requestId) await ctx.prisma.apiUsage.updateMany({ where: { requestId: usage.requestId }, data: { articleId: article.id } });
  return article;
}

export async function generateStage(ctx: PipelineContext): Promise<StageResult> {
  const llm = requireLlm(ctx);
  const edition = toDbDate(ctx.editionDate);
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const editionRow = await ensureEdition(ctx.prisma, ctx.editionDate, publishAt);

  const clusters = await ctx.prisma.storyCluster.findMany({
    where: {
      editionDate: edition,
      candidates: { some: { status: "SELECTED", isClusterPrimary: true } },
      OR: [{ article: null }, { article: { status: "FAILED" } }],
    },
    include: { candidates: { where: { status: { in: ["SELECTED", "CLASSIFIED"] } }, include: { source: true } } },
  });

  const problems: string[] = [];
  let written = 0;
  let failed = 0;
  for (const cluster of clusters) {
    const spent = await monthToDateSpendUsd(ctx);
    if (spent >= ctx.settings.monthlyBudgetUsd) {
      problems.push(`Monthly Claude budget of $${ctx.settings.monthlyBudgetUsd} reached ($${spent.toFixed(2)} spent); stopped before "${cluster.title}"`);
      break;
    }
    const members = orderMembers(cluster);
    try {
      const sources: Array<PromptSource & { candidateId: string; isPrimary: boolean; note: string }> = [];
      for (const m of members) {
        const research = await researchCandidate(m.originalUrl, m.feedSummary, { allowPageFetch: !m.source.requiresLicenseReview, fetchImpl: ctx.fetchImpl });
        if (research.text.trim().length < 80) continue;
        sources.push({
          id: `S${sources.length + 1}`,
          publisher: m.source.name,
          title: m.originalHeadline,
          url: m.originalUrl,
          publishedAt: m.publishedAt,
          kind: m.source.kind.toLowerCase(),
          text: research.text,
          candidateId: m.id,
          isPrimary: m.isClusterPrimary,
          note: research.note,
        });
      }
      if (!sources.length) throw new Error("No usable source text was available from permitted sources");
      if (!sources.some((s) => s.isPrimary)) sources[0]!.isPrimary = true;

      const stock = cluster.desk === "MARKETS" ? await findStockMove(ctx, members) : null;
      const primarySection = members.find((m) => m.isClusterPrimary)?.section ?? (cluster.desk === "AI" ? "AI" : "MARKETS");
      const prompt = writerPrompt({ desk: cluster.desk, section: primarySection, editionDate: ctx.editionDate, sources, stock: stock ? stockContext(stock) : null, guidance: ctx.settings.writerGuidance });
      const write = (extra = "") =>
        llm.structured({
          purpose: "write-article",
          model: ctx.models.writer,
          system: WRITER_SYSTEM,
          prompt: prompt + extra,
          schema: ArticleDraftSchema,
          maxTokens: 16_000,
          effort: "medium",
          fallback: true,
          context: { jobId: ctx.jobId },
        });
      let { data: draft, usage } = await write();
      // Smaller models tend to undershoot the length; ask once for a fuller draft from the same sources.
      const words = wordCount(markdownToPlainText(`${draft.introduction}\n${draft.body}`));
      if (!draft.insufficientInformation && words < MIN_DRAFT_WORDS) {
        ctx.log.info("Draft too short; requesting a fuller rewrite", { cluster: cluster.id, words });
        ({ data: draft, usage } = await write(`\n\nYour previous draft was only ${words} words. Write the full article again at 450–900 words (introduction plus body), using only these sources and the same rules. If the sources cannot support that length without padding, set insufficientInformation to true.`));
      }
      if (draft.insufficientInformation) {
        failed += 1;
        await recordFailure(ctx, cluster, editionRow.id, `Writer reported insufficient information: ${draft.insufficientReason}`);
        continue;
      }
      const article = await saveDraft(ctx, cluster, editionRow.id, draft, sources, stock, usage);
      await attachIllustration(ctx, article.id);
      written += 1;
      ctx.log.info("Draft written", { cluster: cluster.id, headline: draft.headline });
    } catch (error) {
      failed += 1;
      const reason = error instanceof LlmError ? `Model ${error.code}: ${error.message}` : (error as Error).message;
      problems.push(`"${truncate(cluster.title, 80)}": ${reason}`);
      ctx.log.warn("Article generation failed", { cluster: cluster.id, error: reason });
      await recordFailure(ctx, cluster, editionRow.id, reason);
    }
  }
  return {
    status: failed || problems.length ? (written ? "PARTIAL" : clusters.length ? "PARTIAL" : "SUCCEEDED") : "SUCCEEDED",
    summary: { clusters: clusters.length, written, failed },
    problems,
  };
}
