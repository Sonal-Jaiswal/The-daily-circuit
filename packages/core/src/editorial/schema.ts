import { z } from "zod";

export const PROMPT_VERSION = "2026-11-01.1";

const sourceId = z.string().regex(/^S\d{1,2}$/, "Source ids look like S1, S2…");

/** What the writer model must return. Validated with Zod before anything is stored. */
export const ArticleDraftSchema = z.object({
  insufficientInformation: z
    .boolean()
    .describe("True when the sources do not support a full, accurate article. Set the text fields to short placeholders in that case."),
  insufficientReason: z.string().describe("Why the sources are insufficient, or an empty string."),
  headline: z.string().min(15).max(120).describe("Original, factual headline. No clickbait, no question headlines."),
  excerpt: z.string().min(60).max(320).describe("One- or two-sentence summary shown in listings."),
  introduction: z.string().min(80).describe("Opening paragraph: what happened, who, when. Include citation markers like [S1]."),
  body: z
    .string()
    .min(600)
    .describe("Main article in restricted Markdown: paragraphs, '### ' subheads, '- ' lists. Cite with [S1] markers next to the claims they support. No URLs."),
  context: z.string().min(60).describe("Background a reader needs. Cited."),
  whyItMatters: z.string().min(60).describe("Why this matters to readers in India and to the industry."),
  keyFacts: z
    .array(z.object({ fact: z.string().min(10), sourceIds: z.array(sourceId).min(1) }))
    .min(3)
    .max(8)
    .describe("Verifiable facts, each tied to the sources that state it."),
  implications: z.string().min(40).describe("Plausible consequences, clearly framed as analysis, not fact."),
  risks: z.string().min(40).describe("Risks, open questions and what is not yet confirmed."),
  confirmed: z.array(z.string()).describe("Claims that the sources confirm."),
  unconfirmed: z.array(z.string()).describe("Claims that are reported, expected or speculative — not confirmed."),
  containsAnalystOpinion: z.boolean().describe("True if the article reports third-party analyst opinions or forecasts."),
  sourcesUsed: z.array(sourceId).min(1).describe("Ids of every source the article relies on."),
  tags: z.array(z.string().min(2).max(40)).min(2).max(6).describe("Short topical tags, e.g. 'OpenAI', 'RBI', 'Semiconductors'."),
  seoTitle: z.string().min(20).max(70).describe("Search title, at most 70 characters."),
  seoDescription: z.string().min(70).max(170).describe("Meta description, 70–170 characters."),
  imageAlt: z.string().min(10).max(160).describe("Alt text for an abstract illustration representing the story's topic."),
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
