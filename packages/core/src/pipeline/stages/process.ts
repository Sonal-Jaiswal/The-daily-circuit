import type { Desk, NewsCandidate, NewsSource, Prisma, Section } from "@tdc/db";
import { canonicalizeUrl, normalizeHeadline } from "../../collector/normalize";
import { deskForSection } from "../../content/paths";
import { ClassificationSchema, type Classification } from "../../editorial/schema";
import { CLASSIFIER_SYSTEM } from "../../editorial/prompts";
import { researchCandidate } from "../../editorial/research";
import { clusterItems, matchesPublished, normalizeSignature } from "../../intelligence/dedupe";
import { addMinutes, istWallTimeToUtc, toDbDate } from "../../time/ist";
import { truncate } from "../../util/text";
import { requireLlm, type PipelineContext, type StageResult } from "../context";

type CandidateWithSource = NewsCandidate & { source: NewsSource };

export const FRESHNESS_WINDOW_HOURS = 30;
const CLASSIFY_BATCH = 20;

/** Step 1: publication-date validation. Unknown dates are looked up on the page when permitted. */
async function validateDates(ctx: PipelineContext, candidates: CandidateWithSource[]) {
  const publishAt = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const windowStart = addMinutes(publishAt, -FRESHNESS_WINDOW_HOURS * 60);
  const now = ctx.now();
  const live: CandidateWithSource[] = [];
  let stale = 0;
  for (const c of candidates) {
    let publishedAt = c.publishedAt;
    let publishedAtSource = c.publishedAtSource;
    if (!publishedAt && c.source.kind !== "PUBLISHER") {
      const page = await researchCandidate(c.originalUrl, null, { allowPageFetch: !c.source.requiresLicenseReview, fetchImpl: ctx.fetchImpl });
      if (page.publishedAt) {
        publishedAt = page.publishedAt;
        publishedAtSource = "PAGE_METADATA";
      }
    }
    let reason: string | null = null;
    if (!publishedAt) reason = "Publication time was not stated by the source and could not be verified";
    else if (publishedAt > addMinutes(now, 15)) reason = "Stated publication time is in the future";
    else if (publishedAt < windowStart) reason = `Published more than ${FRESHNESS_WINDOW_HOURS} hours before the edition`;
    if (reason) {
      stale += 1;
      await ctx.prisma.newsCandidate.update({ where: { id: c.id }, data: { status: "STALE", rankingExplanation: reason, publishedAt, publishedAtSource } });
      continue;
    }
    if (publishedAt !== c.publishedAt) {
      await ctx.prisma.newsCandidate.update({ where: { id: c.id }, data: { publishedAt, publishedAtSource } });
    }
    live.push({ ...c, publishedAt, publishedAtSource });
  }
  return { live, stale };
}

/** Step 2: drop events we already covered in the last few days. */
async function dropAlreadyCovered(ctx: PipelineContext, candidates: CandidateWithSource[]) {
  const since = addMinutes(ctx.now(), -4 * 24 * 60);
  const recent = await ctx.prisma.article.findMany({
    where: { status: { in: ["DRAFT", "NEEDS_REVIEW", "APPROVED", "PUBLISHED"] }, createdAt: { gte: since } },
    select: { headline: true, sources: { select: { url: true } } },
  });
  const urls = new Set<string>();
  for (const a of recent) for (const s of a.sources) {
    try {
      urls.add(canonicalizeUrl(s.url));
    } catch {
      /* stored URLs are validated on write; ignore anything odd */
    }
  }
  const headlines = recent.map((a) => normalizeHeadline(a.headline));
  const remaining: CandidateWithSource[] = [];
  let duplicates = 0;
  for (const c of candidates) {
    if (urls.has(c.canonicalUrl) || matchesPublished(c.normalizedHeadline, headlines, 0.6)) {
      duplicates += 1;
      await ctx.prisma.newsCandidate.update({ where: { id: c.id }, data: { status: "DUPLICATE", rankingExplanation: "Event already covered by a recent article" } });
    } else remaining.push(c);
  }
  return { remaining, duplicates };
}

function classifyPrompt(batch: CandidateWithSource[]): string {
  return batch
    .map((c, i) =>
      [
        `<item id="c${i + 1}">`,
        `headline: ${c.originalHeadline}`,
        `source: ${c.source.name} (${c.source.kind.toLowerCase()})`,
        `published: ${c.publishedAt?.toISOString() ?? "unknown"}`,
        `summary: ${truncate(c.feedSummary ?? "", 600)}`,
        `</item>`,
      ].join("\n"),
    )
    .join("\n");
}

/** Step 3: classification with the economical model. */
async function classify(ctx: PipelineContext, candidates: CandidateWithSource[]) {
  const llm = requireLlm(ctx);
  const results = new Map<string, Classification["items"][number]>();
  for (let i = 0; i < candidates.length; i += CLASSIFY_BATCH) {
    const batch = candidates.slice(i, i + CLASSIFY_BATCH);
    const { data } = await llm.structured({
      purpose: "classify",
      model: ctx.models.classifier,
      system: CLASSIFIER_SYSTEM,
      prompt: `Classify these ${batch.length} items. Return exactly one entry per id.\n\n${classifyPrompt(batch)}`,
      schema: ClassificationSchema,
      maxTokens: 12_000,
      effort: "low",
      fallback: false,
      context: { jobId: ctx.jobId },
    });
    for (const item of data.items) {
      const idx = Number(item.id.replace(/^c/, "")) - 1;
      const candidate = batch[idx];
      if (candidate) results.set(candidate.id, item);
    }
  }
  return results;
}

/** Step 4: group candidates that report the same event, reusing clusters from earlier runs. */
async function clusterDesk(ctx: PipelineContext, desk: Desk): Promise<number> {
  const edition = toDbDate(ctx.editionDate);
  const members = await ctx.prisma.newsCandidate.findMany({
    where: { editionDate: edition, desk, status: { in: ["CLASSIFIED", "SELECTED", "NOT_SELECTED"] } },
    include: { source: true },
  });
  const groups = clusterItems(
    members.map((m) => ({
      id: m.id,
      normalizedHeadline: m.normalizedHeadline,
      canonicalUrl: m.canonicalUrl,
      signature: (m.classification as { eventSignature?: string } | null)?.eventSignature ?? null,
    })),
  );
  const byId = new Map(members.map((m) => [m.id, m]));
  let created = 0;
  for (const ids of groups) {
    const group = ids.map((id) => byId.get(id)!);
    const existingClusterId = group.find((m) => m.clusterId)?.clusterId ?? null;
    const lead = [...group].sort((a, b) => b.sourceReliability - a.sourceReliability)[0]!;
    const signature = normalizeSignature((lead.classification as { eventSignature?: string } | null)?.eventSignature);
    const sourceCount = new Set(group.map((m) => m.source.name)).size;
    let clusterId = existingClusterId;
    if (clusterId) {
      await ctx.prisma.storyCluster.update({ where: { id: clusterId }, data: { sourceCount } });
    } else {
      const cluster = await ctx.prisma.storyCluster.create({ data: { desk, editionDate: edition, title: lead.originalHeadline, signature, sourceCount } });
      clusterId = cluster.id;
      created += 1;
    }
    await ctx.prisma.newsCandidate.updateMany({ where: { id: { in: ids } }, data: { clusterId } });
  }
  return created;
}

export async function processStage(ctx: PipelineContext): Promise<StageResult> {
  const edition = toDbDate(ctx.editionDate);
  const candidates = await ctx.prisma.newsCandidate.findMany({
    where: { editionDate: edition, status: "NEW" },
    include: { source: true },
    orderBy: { collectedAt: "asc" },
  });
  const { live, stale } = await validateDates(ctx, candidates);
  const { remaining, duplicates } = await dropAlreadyCovered(ctx, live);

  let classified = 0;
  let irrelevant = 0;
  let missing = 0;
  if (remaining.length) {
    const results = await classify(ctx, remaining);
    for (const c of remaining) {
      const r = results.get(c.id);
      if (!r) {
        missing += 1;
        continue; // stays NEW; a rerun will retry it
      }
      const relevant = r.section !== "IRRELEVANT" && r.isNews;
      const section = relevant ? (r.section as Section) : null;
      const data: Prisma.NewsCandidateUpdateInput = {
        status: relevant ? "CLASSIFIED" : "IRRELEVANT",
        section,
        desk: section ? deskForSection(section) : c.desk,
        isOriginalReporting: r.isOriginalReporting,
        classification: r,
        extractedFacts: { ...((c.extractedFacts as object | null) ?? {}), facts: r.facts, companies: r.companies, tickers: r.tickers },
        ...(relevant ? {} : { rankingExplanation: `Not a news story for either desk: ${r.rationale}` }),
      };
      await ctx.prisma.newsCandidate.update({ where: { id: c.id }, data });
      if (relevant) classified += 1;
      else irrelevant += 1;
    }
  }
  const clustersCreated = (await clusterDesk(ctx, "AI")) + (await clusterDesk(ctx, "MARKETS"));
  const problems = missing ? [`${missing} candidate(s) were not returned by the classifier and remain queued`] : [];
  return {
    status: missing ? "PARTIAL" : "SUCCEEDED",
    summary: { examined: candidates.length, stale, duplicates, classified, irrelevant, missing, clustersCreated },
    problems,
  };
}
