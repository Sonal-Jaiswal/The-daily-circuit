import { headlineTokens } from "../collector/normalize";

export interface DedupeItem {
  id: string;
  normalizedHeadline: string;
  canonicalUrl: string;
  signature?: string | null;
}

/** Similarity of two headlines' token sets: max of Jaccard and a damped overlap coefficient. */
export function headlineSimilarity(a: string, b: string): number {
  const ta = new Set(headlineTokens(a));
  const tb = new Set(headlineTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const jaccard = inter / (ta.size + tb.size - inter);
  const minSize = Math.min(ta.size, tb.size);
  const overlap = minSize >= 4 ? (inter / minSize) * 0.85 : 0;
  return Math.max(jaccard, overlap);
}

export function normalizeSignature(sig: string | null | undefined): string | null {
  if (!sig) return null;
  const s = sig
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length >= 6 ? s : null;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/**
 * Groups items that describe the same event. Two items join a cluster when they share a
 * canonical URL, an event signature, or their headlines are similar enough.
 * Returns clusters as arrays of ids, preserving input order.
 */
export function clusterItems(items: DedupeItem[], threshold = 0.5): string[][] {
  const uf = new UnionFind();
  const byUrl = new Map<string, string>();
  const bySig = new Map<string, string>();
  for (const item of items) {
    uf.find(item.id);
    const urlHit = byUrl.get(item.canonicalUrl);
    if (urlHit) uf.union(urlHit, item.id);
    else byUrl.set(item.canonicalUrl, item.id);
    const sig = normalizeSignature(item.signature);
    if (sig) {
      const sigHit = bySig.get(sig);
      if (sigHit) uf.union(sigHit, item.id);
      else bySig.set(sig, item.id);
    }
  }
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i]!;
      const b = items[j]!;
      if (headlineSimilarity(a.normalizedHeadline, b.normalizedHeadline) >= threshold) uf.union(a.id, b.id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const root = uf.find(item.id);
    const g = groups.get(root);
    if (g) g.push(item.id);
    else groups.set(root, [item.id]);
  }
  return [...groups.values()];
}

/** True if a headline matches something already published recently (prevents re-covering an event). */
export function matchesPublished(normalizedHeadline: string, publishedHeadlines: string[], threshold = 0.6): boolean {
  return publishedHeadlines.some((h) => headlineSimilarity(normalizedHeadline, h) >= threshold);
}
