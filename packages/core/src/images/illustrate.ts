import type { PipelineContext } from "../pipeline/context";
import { sha256 } from "../util/crypto";
import { truncate } from "../util/text";

export interface GeneratedImage {
  data: Buffer;
  mimeType: string;
  model: string;
}

export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string, seed: number): Promise<GeneratedImage>;
}

const PALETTE: Record<string, string> = {
  AI: "deep indigo, soft lavender and a touch of warm marigold",
  TECHNOLOGY: "midnight navy, cool periwinkle and a touch of amber",
  MARKETS: "warm marigold, burnt amber and deep indigo accents",
  IPO: "golden ochre, cream and deep indigo accents",
};

/**
 * Prompt for an editorial illustration. Built from the article's alt-text description (not the
 * headline) and forbids people, faces, logos and text, so an illustration can never be mistaken
 * for a news photograph of a real person or event.
 */
export function illustrationPrompt(input: { section: string; imageAlt: string }): string {
  const subject = truncate(input.imageAlt.replace(/["“”]/g, "").replace(/\s+/g, " ").trim(), 300);
  return [
    `Editorial illustration for a news article. Theme: ${subject}.`,
    "Conceptual and symbolic rather than literal: abstract geometric shapes, flowing circuit-board line motifs, data and network metaphors.",
    `Clean flat vector style with soft gradients, limited palette of ${PALETTE[input.section] ?? PALETTE.AI} on an off-white background, generous negative space, wide landscape composition.`,
    "Strictly no text, letters, numbers, logos, brand marks, flags, watermarks, people, faces, hands or photographic elements.",
  ].join(" ");
}

/** Adds an AI illustration to a freshly written article. Never fails the article: the SVG cover remains. */
export async function attachIllustration(ctx: PipelineContext, articleId: string): Promise<void> {
  const generator = ctx.imageGenerator;
  if (!generator) return;
  const article = await ctx.prisma.article.findUnique({ where: { id: articleId }, select: { section: true, imageAlt: true, slug: true, illustration: { select: { id: true } } } });
  if (!article || article.illustration || !article.imageAlt) return;
  const prompt = illustrationPrompt(article);
  try {
    const seed = parseInt(sha256(article.slug).slice(0, 8), 16) % 2_147_483_647;
    const image = await generator.generate(prompt, seed);
    await ctx.prisma.articleImage.create({ data: { articleId, mimeType: image.mimeType, data: new Uint8Array(image.data), prompt, provider: generator.name, model: image.model } });
    ctx.log.info("Illustration generated", { articleId, bytes: image.data.byteLength });
  } catch (error) {
    ctx.log.warn("Illustration failed; the generated cover is used instead", { articleId, error: (error as Error).message });
  }
}
