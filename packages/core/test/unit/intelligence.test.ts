import { describe, expect, it } from "vitest";
import { canonicalizeUrl, normalizeHeadline, stripPublisherSuffix } from "../../src/collector/normalize";
import { clusterItems, headlineSimilarity, matchesPublished } from "../../src/intelligence/dedupe";
import { credibilityScore, freshnessScore, rankClusters, type RankCluster, type RankMember } from "../../src/intelligence/rank";
import { DEFAULT_WEIGHTS } from "../../src/settings";

describe("normalisation", () => {
  it("canonicalises URLs for duplicate detection", () => {
    expect(canonicalizeUrl("http://www.Example.com/news/story/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/news/story?a=1&b=2");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("strips publisher suffixes and punctuation from headlines", () => {
    expect(stripPublisherSuffix("OpenAI ships new model - TechCrunch", "TechCrunch")).toBe("OpenAI ships new model");
    expect(normalizeHeadline("RBI keeps repo rate at 5.5%: What it means | Mint", "Mint")).toBe("rbi keeps repo rate at 5.5% what it means");
  });
});

describe("deduplication", () => {
  const items = [
    { id: "a", normalizedHeadline: normalizeHeadline("RBI keeps repo rate unchanged at 5.5% in October policy"), canonicalUrl: "https://a.example/1" },
    { id: "b", normalizedHeadline: normalizeHeadline("Reserve Bank keeps repo rate unchanged at 5.5% in October policy review"), canonicalUrl: "https://b.example/2" },
    { id: "c", normalizedHeadline: normalizeHeadline("NVIDIA unveils new data-centre GPU for AI training"), canonicalUrl: "https://c.example/3" },
    { id: "d", normalizedHeadline: normalizeHeadline("SEBI issues final order against EKI Energy Services"), canonicalUrl: "https://d.example/4" },
    { id: "e", normalizedHeadline: normalizeHeadline("Completely different headline about IPO filings"), canonicalUrl: "https://c.example/3" },
  ];

  it("scores near-identical headlines as similar and unrelated ones as different", () => {
    expect(headlineSimilarity(items[0]!.normalizedHeadline, items[1]!.normalizedHeadline)).toBeGreaterThan(0.5);
    expect(headlineSimilarity(items[0]!.normalizedHeadline, items[2]!.normalizedHeadline)).toBeLessThan(0.2);
  });

  it("groups items about the same event, by headline or by shared URL", () => {
    const clusters = clusterItems(items).map((c) => c.sort().join(""));
    expect(clusters).toContain("ab");
    expect(clusters).toContain("ce");
    expect(clusters).toContain("d");
    expect(clusters).toHaveLength(3);
  });

  it("merges items that share an event signature even with different wording", () => {
    const clusters = clusterItems([
      { id: "x", normalizedHeadline: "openai launches gpt 6", canonicalUrl: "https://x/1", signature: "openai-gpt-6-release" },
      { id: "y", normalizedHeadline: "the next frontier model is here", canonicalUrl: "https://y/1", signature: "OpenAI GPT-6 release" },
    ]);
    expect(clusters).toEqual([["x", "y"]]);
  });

  it("detects events that were already published", () => {
    expect(matchesPublished(items[1]!.normalizedHeadline, [items[0]!.normalizedHeadline])).toBe(true);
    expect(matchesPublished(items[2]!.normalizedHeadline, [items[0]!.normalizedHeadline])).toBe(false);
  });
});

describe("ranking", () => {
  const ref = new Date("2026-11-01T15:30:00Z");
  const member = (over: Partial<RankMember> = {}): RankMember => ({
    candidateId: "m",
    publisher: "Pub",
    reliability: 0.8,
    isOfficial: false,
    publishedAt: new Date(ref.getTime() - 2 * 3_600_000),
    importance: 7,
    impact: 6,
    interest: 6,
    isOriginalReporting: false,
    ...over,
  });

  it("computes freshness over a 30-hour window", () => {
    expect(freshnessScore(new Date(ref.getTime() - 3 * 3_600_000), ref)).toBe(1);
    expect(freshnessScore(new Date(ref.getTime() - 18 * 3_600_000), ref)).toBeCloseTo(0.5);
    expect(freshnessScore(new Date(ref.getTime() - 31 * 3_600_000), ref)).toBe(0);
    expect(freshnessScore(null, ref)).toBe(0);
  });

  it("rewards independent corroboration and official sources", () => {
    expect(credibilityScore([member()]).score).toBeCloseTo(0.8);
    expect(credibilityScore([member(), member({ publisher: "Other" })]).score).toBeCloseTo(0.85);
    expect(credibilityScore([member({ isOfficial: true, reliability: 0.95 })]).score).toBeCloseTo(1);
  });

  it("applies the configured 30/25/20/15/10 weights", () => {
    const [r] = rankClusters([{ clusterId: "c1", title: "t", members: [member({ importance: 10, impact: 10, interest: 10, reliability: 1 })] }], {
      weights: DEFAULT_WEIGHTS,
      reference: ref,
      quota: 10,
      minScore: 0,
      desk: "AI",
    });
    expect(r!.score.total).toBeCloseTo(1);
    expect(r!.explanation).toMatch(/importance 1\.00×0\.3/);
  });

  it("selects at most the quota, one per event, and never pads with weak stories", () => {
    const clusters: RankCluster[] = Array.from({ length: 14 }, (_, i) => ({
      clusterId: `c${String(i).padStart(2, "0")}`,
      title: `Story ${i}`,
      members: [member({ candidateId: `m${i}`, importance: 10 - (i % 10), impact: 10 - (i % 10), interest: 5 })],
    }));
    clusters.push({ clusterId: "weak", title: "Weak", members: [member({ candidateId: "w", importance: 1, impact: 1, interest: 1, reliability: 0.3 })] });
    clusters.push({ clusterId: "old", title: "Old", members: [member({ candidateId: "o", publishedAt: new Date(ref.getTime() - 40 * 3_600_000) })] });
    const ranked = rankClusters(clusters, { weights: DEFAULT_WEIGHTS, reference: ref, quota: 10, minScore: 0.55, desk: "AI" });
    const selected = ranked.filter((r) => r.selected);
    expect(selected).toHaveLength(10);
    expect(new Set(selected.map((s) => s.clusterId)).size).toBe(10);
    expect(selected.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranked.find((r) => r.clusterId === "weak")!.explanation).toMatch(/below the minimum score/);
    expect(ranked.find((r) => r.clusterId === "old")!.explanation).toMatch(/freshness window/);
  });

  it("publishes fewer than the quota when fewer stories qualify", () => {
    const ranked = rankClusters([{ clusterId: "only", title: "Only", members: [member()] }], { weights: DEFAULT_WEIGHTS, reference: ref, quota: 10, minScore: 0.55, desk: "Markets" });
    expect(ranked.filter((r) => r.selected)).toHaveLength(1);
  });
});
