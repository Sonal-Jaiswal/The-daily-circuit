import type { Desk } from "@tdc/db";
import { rankClusters, type RankCluster } from "../../intelligence/rank";
import { istWallTimeToUtc, toDbDate } from "../../time/ist";
import type { PipelineContext, StageResult } from "../context";

interface RawScores {
  importance?: number;
  impact?: number;
  interest?: number;
}

async function rankDesk(ctx: PipelineContext, desk: Desk) {
  const edition = toDbDate(ctx.editionDate);
  const quota = desk === "AI" ? ctx.settings.maxAiArticles : ctx.settings.maxMarketArticles;
  const alreadyWritten = await ctx.prisma.article.count({
    where: { cluster: { editionDate: edition, desk }, status: { notIn: ["FAILED", "REJECTED"] } },
  });
  const remaining = Math.max(0, quota - alreadyWritten);
  const clusters = await ctx.prisma.storyCluster.findMany({
    where: { editionDate: edition, desk, article: null },
    include: { candidates: { where: { status: { in: ["CLASSIFIED", "SELECTED", "NOT_SELECTED"] } }, include: { source: true } } },
  });
  const input: RankCluster[] = clusters
    .filter((c) => c.candidates.length)
    .map((c) => ({
      clusterId: c.id,
      title: c.title,
      members: c.candidates.map((m) => {
        const s = (m.classification as RawScores | null) ?? {};
        return {
          candidateId: m.id,
          publisher: m.source.name,
          reliability: m.sourceReliability,
          isOfficial: ["OFFICIAL", "COMPANY", "REGULATOR", "EXCHANGE"].includes(m.source.kind),
          publishedAt: m.publishedAt,
          importance: s.importance ?? 0,
          impact: s.impact ?? 0,
          interest: s.interest ?? 0,
          isOriginalReporting: m.isOriginalReporting ?? false,
        };
      }),
    }));
  const reference = istWallTimeToUtc(ctx.editionDate, ctx.settings.publishTimeIst);
  const ranked = rankClusters(input, { weights: ctx.settings.weights, reference, quota: remaining, minScore: ctx.settings.minSelectionScore, desk: desk === "AI" ? "AI" : "Markets" });

  for (const c of ranked) {
    for (const m of c.members) {
      const isPrimary = m.candidateId === c.primaryCandidateId;
      await ctx.prisma.newsCandidate.update({
        where: { id: m.candidateId },
        data: {
          isClusterPrimary: isPrimary,
          status: c.selected ? (isPrimary ? "SELECTED" : "CLASSIFIED") : "NOT_SELECTED",
          importanceScore: c.score.importance,
          credibilityScore: c.score.credibility,
          freshnessScore: c.score.freshness,
          impactScore: c.score.impact,
          interestScore: c.score.interest,
          totalScore: c.score.total,
          rankPosition: c.position,
          rankingExplanation: isPrimary ? c.explanation : `Supporting source for: ${c.title}. ${c.explanation}`,
        },
      });
    }
  }
  return { desk, quota, alreadyWritten, considered: ranked.length, selected: ranked.filter((c) => c.selected).length };
}

export async function rankStage(ctx: PipelineContext): Promise<StageResult> {
  const ai = await rankDesk(ctx, "AI");
  const markets = await rankDesk(ctx, "MARKETS");
  return { status: "SUCCEEDED", summary: { ai, markets } };
}
