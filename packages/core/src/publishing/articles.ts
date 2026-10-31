import { Prisma, type Article, type ArticleSource, type ArticleStatus, type PrismaClient } from "@tdc/db";
import type { LlmGateway } from "../ai/gateway";
import { deskForSection } from "../content/paths";
import { FACT_CHECK_SYSTEM, renderSources } from "../editorial/prompts";
import { FactCheckSchema, type ArticleDraft, type FactCheck } from "../editorial/schema";
import type { Logger } from "../logger";
import { statusAfterValidation, validateDraft, type ValidationReport } from "../validation/validate";

export interface GenerationMeta {
  confirmed: string[];
  unconfirmed: string[];
  containsAnalystOpinion: boolean;
  sourcesUsed: string[];
  insufficientInformation: boolean;
  insufficientReason: string;
  keyFactSources: string[][];
  researchNotes?: Record<string, string>;
}

type ArticleWithSources = Article & { sources: ArticleSource[]; tags?: Array<{ tag: { name: string } }> };

/** Rebuilds the writer's draft from stored columns so edited articles can be validated the same way. */
export function draftFromArticle(article: ArticleWithSources): ArticleDraft {
  const meta = (article.generationMeta as GenerationMeta | null) ?? null;
  const keyFactsRaw = Array.isArray(article.keyFacts) ? (article.keyFacts as unknown[]) : [];
  const keyFacts = keyFactsRaw.map((k, i) => {
    if (k && typeof k === "object" && "fact" in k) return k as { fact: string; sourceIds: string[] };
    return { fact: String(k), sourceIds: meta?.keyFactSources[i] ?? [] };
  });
  return {
    insufficientInformation: meta?.insufficientInformation ?? false,
    insufficientReason: meta?.insufficientReason ?? "",
    headline: article.headline,
    excerpt: article.excerpt,
    introduction: article.introduction,
    body: article.body,
    context: article.context,
    whyItMatters: article.whyItMatters,
    keyFacts,
    implications: article.implications,
    risks: article.risks,
    confirmed: meta?.confirmed ?? [],
    unconfirmed: meta?.unconfirmed ?? [],
    containsAnalystOpinion: meta?.containsAnalystOpinion ?? false,
    sourcesUsed: meta?.sourcesUsed ?? article.sources.map((s) => s.citationId).filter((x): x is string => Boolean(x)),
    tags: article.tags?.map((t) => t.tag.name) ?? [],
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    imageAlt: article.imageAlt,
  };
}

export function validationSources(article: ArticleWithSources) {
  return article.sources.filter((s) => s.citationId).map((s) => ({ id: s.citationId!, text: s.verificationText ?? "" }));
}

export async function runFactCheck(
  llm: LlmGateway,
  model: string,
  article: ArticleWithSources,
  jobId: string | null,
): Promise<FactCheck> {
  const sources = article.sources
    .filter((s) => s.citationId)
    .map((s) => ({ id: s.citationId!, publisher: s.publisherName, title: s.title, url: s.url, publishedAt: s.publishedAt, kind: "source", text: s.verificationText ?? "" }));
  const prompt = `<article>\n<headline>${article.headline}</headline>\n${article.introduction}\n\n${article.body}\n\nContext: ${article.context}\n\nWhy it matters: ${article.whyItMatters}\n</article>\n\n${renderSources(sources)}`;
  const { data } = await llm.structured({
    purpose: "fact-check",
    model,
    system: FACT_CHECK_SYSTEM,
    prompt,
    schema: FactCheckSchema,
    maxTokens: 8_000,
    effort: "medium",
    fallback: false,
    context: { jobId, articleId: article.id },
  });
  return data;
}

export interface RevalidateResult {
  report: ValidationReport;
  status: ArticleStatus;
  factCheck: FactCheck | null;
}

/**
 * Validate an article (generated or human-edited) and move it to APPROVED / NEEDS_REVIEW / FAILED.
 * A human approval is recorded separately; validation alone never publishes anything.
 */
export async function validateArticle(
  prisma: PrismaClient,
  articleId: string,
  options: { llm: LlmGateway | null; classifierModel: string; factCheck: boolean; autoPublish: boolean; scheduledFor?: Date | null; jobId?: string | null; log?: Logger },
): Promise<RevalidateResult> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId }, include: { sources: true, tags: { include: { tag: true } } } });
  const desk = deskForSection(article.section);
  let factCheck: FactCheck | null = null;
  let factCheckError: string | null = null;
  if (options.factCheck && options.llm) {
    try {
      factCheck = await runFactCheck(options.llm, options.classifierModel, article, options.jobId ?? null);
    } catch (error) {
      factCheckError = (error as Error).message;
      options.log?.warn("Fact-check pass failed", { articleId, error: factCheckError });
    }
  }
  const report = validateDraft(draftFromArticle(article), validationSources(article), { desk, factCheck });
  if (factCheckError) report.review.push(`Automated fact-check could not run: ${factCheckError}`);
  const status = statusAfterValidation(report, options.autoPublish);
  await prisma.article.update({
    where: { id: articleId },
    data: {
      status,
      validationReport: { ...report, factCheck } as unknown as Prisma.InputJsonValue,
      reviewFlags: [...report.blocking, ...report.review].slice(0, 20),
      requiresHumanReview: status === "NEEDS_REVIEW",
      disclaimerRequired: desk === "MARKETS",
      ...(options.scheduledFor !== undefined ? { scheduledFor: options.scheduledFor } : {}),
    },
  });
  return { report, status, factCheck };
}

/** Human approval: only possible when no blocking validation issue remains. */
export async function approveArticle(prisma: PrismaClient, articleId: string, reviewerId: string): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  const report = article.validationReport as ValidationReport | null;
  if (!report) throw new Error("Validate the article before approving it");
  if (report.blocking.length) throw new Error(`Cannot approve: ${report.blocking.length} blocking issue(s) remain. Edit the article and validate again.`);
  if (!["NEEDS_REVIEW", "APPROVED", "DRAFT"].includes(article.status)) throw new Error(`Cannot approve an article in status ${article.status}`);
  return prisma.article.update({ where: { id: articleId }, data: { status: "APPROVED", requiresHumanReview: false, reviewedById: reviewerId, reviewedAt: new Date() } });
}

/** Publish one approved article now. Idempotent: a published article keeps its original publishedAt. */
export async function publishArticleNow(prisma: PrismaClient, articleId: string, at = new Date()): Promise<Article> {
  const res = await prisma.article.updateMany({ where: { id: articleId, status: "APPROVED", publishedAt: null }, data: { status: "PUBLISHED", publishedAt: at } });
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (res.count === 0 && article.status !== "PUBLISHED") throw new Error(`Only approved articles can be published (status: ${article.status})`);
  return article;
}
