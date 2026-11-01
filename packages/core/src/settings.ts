import { z } from "zod";
import type { PrismaClient, SiteSettings } from "@tdc/db";

export const ScoringWeightsSchema = z
  .object({
    importance: z.number().min(0).max(1),
    credibility: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
    impact: z.number().min(0).max(1),
    interest: z.number().min(0).max(1),
  })
  .refine((w) => Math.abs(w.importance + w.credibility + w.freshness + w.impact + w.interest - 1) < 0.001, {
    message: "Scoring weights must add up to 1",
  });
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const DEFAULT_WEIGHTS: ScoringWeights = { importance: 0.3, credibility: 0.25, freshness: 0.2, impact: 0.15, interest: 0.1 };

export const WatchlistItemSchema = z.object({
  symbol: z.string().min(1),
  exchange: z.enum(["NSE", "BSE"]),
  name: z.string().min(1),
  type: z.enum(["INDEX", "EQUITY"]),
  sector: z.string().optional(),
  providerSymbol: z.string().min(1),
});
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;

/** Ad unit IDs from an approved AdSense account. Empty = slot renders nothing. */
export const AdSlotsSchema = z
  .object({
    header: z.string().regex(/^\d{6,20}$/).optional(),
    inArticle: z.string().regex(/^\d{6,20}$/).optional(),
    sidebar: z.string().regex(/^\d{6,20}$/).optional(),
    footer: z.string().regex(/^\d{6,20}$/).optional(),
  })
  .partial();
export type AdSlots = z.infer<typeof AdSlotsSchema>;

export const ADSENSE_PUBLISHER_RE = /^pub-\d{10,20}$/;

export interface ResolvedSettings {
  raw: SiteSettings;
  siteName: string;
  tagline: string;
  publishTimeIst: string;
  maxAiArticles: number;
  maxMarketArticles: number;
  minSelectionScore: number;
  weights: ScoringWeights;
  autoPublish: boolean;
  latePublishGraceMin: number;
  monthlyBudgetUsd: number;
  enableFactCheckPass: boolean;
  watchlist: WatchlistItem[];
  significantMovePct: number;
  ads: { enabled: boolean; publisherId: string | null; slots: AdSlots };
  newsletterDigestEnabled: boolean;
  writerGuidance: string;
  coverageFocus: { AI: string; MARKETS: string };
  imageStyle: "illustration" | "photo";
}

export function resolveSettings(raw: SiteSettings): ResolvedSettings {
  const weights = ScoringWeightsSchema.safeParse(raw.scoringWeights);
  const watchlist = z.array(WatchlistItemSchema).safeParse(raw.marketWatchlist);
  const slots = AdSlotsSchema.safeParse(raw.adSlots ?? {});
  const publisherId = raw.adsensePublisherId && ADSENSE_PUBLISHER_RE.test(raw.adsensePublisherId) ? raw.adsensePublisherId : null;
  return {
    raw,
    siteName: raw.siteName,
    tagline: raw.tagline,
    publishTimeIst: raw.publishTimeIst,
    maxAiArticles: raw.maxAiArticles,
    maxMarketArticles: raw.maxMarketArticles,
    minSelectionScore: raw.minSelectionScore,
    weights: weights.success ? weights.data : DEFAULT_WEIGHTS,
    autoPublish: raw.autoPublish,
    latePublishGraceMin: raw.latePublishGraceMin,
    monthlyBudgetUsd: raw.monthlyBudgetUsd,
    enableFactCheckPass: raw.enableFactCheckPass,
    watchlist: watchlist.success ? watchlist.data : [],
    significantMovePct: raw.significantMovePct,
    // Ads only switch on when an admin enabled them AND a valid publisher ID exists.
    ads: { enabled: raw.adsEnabled && publisherId !== null, publisherId, slots: slots.success ? slots.data : {} },
    newsletterDigestEnabled: raw.newsletterDigestEnabled,
    writerGuidance: raw.writerGuidance.trim(),
    coverageFocus: { AI: raw.aiCoverageFocus.trim(), MARKETS: raw.marketsCoverageFocus.trim() },
    imageStyle: raw.imageStyle === "photo" ? "photo" : "illustration",
  };
}

export async function loadSettings(prisma: PrismaClient): Promise<ResolvedSettings> {
  const raw = await prisma.siteSettings.upsert({
    where: { id: "default" },
    create: { id: "default", scoringWeights: DEFAULT_WEIGHTS, marketWatchlist: [] },
    update: {},
  });
  return resolveSettings(raw);
}
