import type { ScoringWeights } from "../settings";

export interface RankMember {
  candidateId: string;
  publisher: string;
  reliability: number;
  isOfficial: boolean;
  publishedAt: Date | null;
  /** 0–10 scores from classification. */
  importance: number;
  impact: number;
  interest: number;
  isOriginalReporting: boolean;
}

export interface RankCluster {
  clusterId: string;
  title: string;
  members: RankMember[];
}

export interface ScoreBreakdown {
  importance: number;
  credibility: number;
  freshness: number;
  impact: number;
  interest: number;
  total: number;
  independentSources: number;
  ageHours: number | null;
}

export interface RankedCluster extends RankCluster {
  score: ScoreBreakdown;
  primaryCandidateId: string;
  selected: boolean;
  position: number | null;
  explanation: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** 1.0 for stories up to 6h old at publication, falling linearly to 0 at 30h. */
export function freshnessScore(publishedAt: Date | null, reference: Date): number {
  if (!publishedAt) return 0;
  const hours = Math.max(0, (reference.getTime() - publishedAt.getTime()) / 3_600_000);
  if (hours <= 6) return 1;
  if (hours >= 30) return 0;
  return 1 - (hours - 6) / 24;
}

/** Best source reliability, plus up to +0.15 for independent corroboration and +0.05 for an official source. */
export function credibilityScore(members: RankMember[]): { score: number; independentSources: number } {
  const publishers = new Set(members.map((m) => m.publisher.toLowerCase()));
  const best = Math.max(...members.map((m) => m.reliability));
  const corroboration = Math.min(0.15, 0.05 * (publishers.size - 1));
  const official = members.some((m) => m.isOfficial) ? 0.05 : 0;
  return { score: clamp01(best + corroboration + official), independentSources: publishers.size };
}

/** The member we treat as the lead source: official/original first, then most reliable, then earliest. */
export function pickPrimary(members: RankMember[]): RankMember {
  return [...members].sort((a, b) => {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    if (a.isOriginalReporting !== b.isOriginalReporting) return a.isOriginalReporting ? -1 : 1;
    if (b.reliability !== a.reliability) return b.reliability - a.reliability;
    return (a.publishedAt?.getTime() ?? Infinity) - (b.publishedAt?.getTime() ?? Infinity);
  })[0]!;
}

export function scoreCluster(cluster: RankCluster, weights: ScoringWeights, reference: Date): ScoreBreakdown {
  const m = cluster.members;
  const importance = clamp01(Math.max(...m.map((x) => x.importance)) / 10);
  const impact = clamp01(Math.max(...m.map((x) => x.impact)) / 10);
  const interest = clamp01(m.reduce((s, x) => s + x.interest, 0) / m.length / 10);
  const { score: credibility, independentSources } = credibilityScore(m);
  const earliest = m.map((x) => x.publishedAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const freshness = freshnessScore(earliest, reference);
  const total =
    importance * weights.importance +
    credibility * weights.credibility +
    freshness * weights.freshness +
    impact * weights.impact +
    interest * weights.interest;
  return {
    importance,
    credibility,
    freshness,
    impact,
    interest,
    total: Math.round(total * 1000) / 1000,
    independentSources,
    ageHours: earliest ? Math.round(((reference.getTime() - earliest.getTime()) / 3_600_000) * 10) / 10 : null,
  };
}

function describe(score: ScoreBreakdown, weights: ScoringWeights): string {
  const f = (n: number) => n.toFixed(2);
  return (
    `Score ${f(score.total)} = importance ${f(score.importance)}×${weights.importance} + credibility ${f(score.credibility)}×${weights.credibility}` +
    ` + freshness ${f(score.freshness)}×${weights.freshness} + impact ${f(score.impact)}×${weights.impact} + interest ${f(score.interest)}×${weights.interest}.` +
    ` ${score.independentSources} independent source(s)` +
    (score.ageHours !== null ? `, first published ${score.ageHours}h before the edition.` : ", publication time unknown.")
  );
}

/** Lowest score a story may have when it is used only to reach the daily minimum. */
export const MINIMUM_FILL_FLOOR = 0.35;

/**
 * Ranks clusters and selects up to `quota` with a total at or above `minScore`. When fewer than
 * `minimum` pass, the next-best stories (older reserve stories included) fill the gap down to
 * `floorScore`. One selection per cluster — a quota is never filled by repeating an event.
 */
export function rankClusters(
  clusters: RankCluster[],
  options: { weights: ScoringWeights; reference: Date; quota: number; minScore: number; desk: string; minimum?: number; floorScore?: number },
): RankedCluster[] {
  const scored = clusters
    .filter((c) => c.members.length > 0)
    .map((c) => ({ ...c, score: scoreCluster(c, options.weights, options.reference), primaryCandidateId: pickPrimary(c.members).candidateId }))
    .sort((a, b) => b.score.total - a.score.total || a.clusterId.localeCompare(b.clusterId));

  const minimum = Math.min(options.minimum ?? 0, options.quota);
  const floor = options.floorScore ?? MINIMUM_FILL_FLOOR;
  let position = 0;
  const first = scored.map((c) => {
    const base = describe(c.score, options.weights);
    if (c.score.freshness === 0) {
      return { ...c, selected: false, position: null, explanation: `${base} Not selected: older than the 30-hour freshness window (kept only as a reserve for the daily minimum).` };
    }
    if (c.score.total < options.minScore) {
      return { ...c, selected: false, position: null, explanation: `${base} Not selected: below the minimum score of ${options.minScore}.` };
    }
    if (position >= options.quota) {
      return { ...c, selected: false, position: null, explanation: `${base} Not selected: the ${options.desk} desk's quota of ${options.quota} was already filled by higher-scoring stories.` };
    }
    position += 1;
    return { ...c, selected: true, position, explanation: `${base} Selected #${position} of up to ${options.quota} for the ${options.desk} desk.` };
  });
  // Too few stories cleared the usual bar: take the next best, highest score first.
  return first.map((c) => {
    if (c.selected || position >= minimum || c.score.total < floor) return c;
    position += 1;
    return { ...c, selected: true, position, explanation: `${describe(c.score, options.weights)} Selected #${position} to reach the ${options.desk} desk's daily minimum of ${minimum}, below the usual bar.` };
  });
}
