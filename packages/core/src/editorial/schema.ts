import { z } from "zod";
import { truncate } from "../util/text";

export const PROMPT_VERSION = "2026-11-01.1";

const sourceId = z.string().regex(/^S\d{1,2}$/, "Source ids look like S1, S2…");

/** Minimum sizes for a real article. Not enforced when the writer reports insufficient information. */
const DRAFT_MINIMUMS: Array<[keyof ArticleDraftShape, number]> = [
  ["headline", 15],
  ["excerpt", 60],
  ["introduction", 80],
  ["body", 600],
  ["context", 60],
  ["whyItMatters", 60],
  ["implications", 40],
  ["risks", 40],
  ["seoTitle", 20],
  ["seoDescription", 70],
  ["imageAlt", 10],
];

const ArticleDraftObject = z.object({
  insufficientInformation: z
    .boolean()
    .describe("True when the sources do not support a full, accurate article. Set the text fields to short placeholders in that case."),
  insufficientReason: z.string().describe("Why the sources are insufficient, or an empty string."),
  headline: z.string().describe("Original, factual headline (at least 15 characters). No clickbait, no question headlines."),
  excerpt: z.string().describe("One- or two-sentence summary shown in listings (at least 60 characters)."),
  introduction: z.string().describe("Opening paragraph: what happened, who, when. Include citation markers like [S1]."),
  body: z
    .string()
    .describe("Main article in restricted Markdown, 450–900 words: paragraphs, '### ' subheads, '- ' lists. Cite with [S1] markers next to the claims they support. No URLs."),
  context: z.string().describe("Background a reader needs. Cited."),
  whyItMatters: z.string().describe("Why this matters to readers in India and to the industry."),
  keyFacts: z
    .array(z.object({ fact: z.string().min(1), sourceIds: z.array(sourceId) }))
    .describe("3–8 verifiable facts, each tied to the source ids that state it."),
  implications: z.string().describe("Plausible consequences, clearly framed as analysis, not fact."),
  risks: z.string().describe("Risks, open questions and what is not yet confirmed."),
  confirmed: z.array(z.string()).describe("Claims that the sources confirm."),
  unconfirmed: z.array(z.string()).describe("Claims that are reported, expected or speculative — not confirmed."),
  containsAnalystOpinion: z.boolean().describe("True if the article reports third-party analyst opinions or forecasts."),
  sourcesUsed: z.array(sourceId).describe("Ids of every source the article relies on."),
  tags: z.array(z.string()).describe("2–6 short topical tags, e.g. 'OpenAI', 'RBI', 'Semiconductors'."),
  seoTitle: z.string().describe("Search title, at most 70 characters."),
  seoDescription: z.string().describe("Meta description, 70–170 characters."),
  imageAlt: z.string().describe("Alt text for an abstract illustration representing the story's topic."),
});
type ArticleDraftShape = z.infer<typeof ArticleDraftObject>;

/**
 * What the writer model must return. Validated with Zod before anything is stored. Size
 * minimums apply only to full articles, so an honest "insufficient information" answer is
 * recorded as such instead of being rejected as malformed.
 */
// Lengths some models overshoot. Metadata is trimmed to fit rather than discarding a sound article.
export const clampDraft = <T extends ArticleDraftShape>(d: T): T => ({
  ...d,
  excerpt: truncate(d.excerpt.trim(), 320),
  seoTitle: truncate(d.seoTitle.trim(), 70),
  seoDescription: truncate(d.seoDescription.trim(), 170),
  imageAlt: truncate(d.imageAlt.trim(), 160),
  keyFacts: d.keyFacts.slice(0, 8),
  tags: d.tags.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 40).slice(0, 6),
});

export const ArticleDraftSchema = ArticleDraftObject.superRefine((d, ctx) => {
  if (d.insufficientInformation) return;
  for (const [field, min] of DRAFT_MINIMUMS) {
    if (String(d[field]).length < min) ctx.addIssue({ code: "custom", path: [field], message: `Too small: expected at least ${min} characters` });
  }
  const check = (ok: boolean, path: string, message: string) => ok || ctx.addIssue({ code: "custom", path: [path], message });
  check(d.keyFacts.length >= 3 && d.keyFacts.every((k) => k.sourceIds.length > 0), "keyFacts", "Expected 3–8 key facts, each with at least one source id");
  check(d.sourcesUsed.length > 0, "sourcesUsed", "Expected at least one source id");
  check(d.tags.length >= 2, "tags", "Expected 2–6 tags");
  check(d.headline.length <= 120, "headline", "Headline is longer than 120 characters");
});
export type ArticleDraft = z.infer<typeof ArticleDraftSchema>;

export const ClassificationSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      section: z.enum(["AI", "TECHNOLOGY", "MARKETS", "IPO", "IRRELEVANT"]),
      isNews: z.boolean().describe("False for evergreen guides, promotions, event listings, job posts, opinion columns."),
      importance: z.number().min(0).max(10),
      impact: z.number().min(0).max(10),
      interest: z.number().min(0).max(10),
      isOriginalReporting: z.boolean().describe("True if this source is the originator (official release, filing, exclusive)."),
      eventSignature: z.string().describe("Stable kebab-case key for the underlying event, shared by items about the same event."),
      facts: z.array(z.string()).max(6).describe("Facts stated in the headline/summary only. Do not add outside knowledge."),
      companies: z.array(z.string()).max(8),
      tickers: z.array(z.string()).max(8).describe("NSE/BSE symbols explicitly named or unambiguous; otherwise empty."),
      rationale: z.string().max(400),
    }),
  ),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const FactCheckSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "CONTRADICTED"]),
      sourceIds: z.array(z.string()),
      note: z.string(),
    }),
  ),
  overall: z.enum(["PASS", "REVIEW"]),
  summary: z.string(),
});
export type FactCheck = z.infer<typeof FactCheckSchema>;
