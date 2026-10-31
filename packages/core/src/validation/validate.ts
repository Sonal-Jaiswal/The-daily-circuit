import type { ArticleDraft, FactCheck } from "../editorial/schema";
import { parseMarkdown } from "../content/markdown";
import { wordCount } from "../util/text";
import { detectInvestmentAdvice, isClickbait } from "./advice";

export interface ValidationSource {
  id: string;
  text: string;
}

export interface ValidationReport {
  /** Must be fixed before the article can ever be published. */
  blocking: string[];
  /** Publishable only after a human editor approves. */
  review: string[];
  /** Informational. */
  warnings: string[];
  stats: {
    words: number;
    citations: number;
    uncitedParagraphs: number;
    paragraphs: number;
    unsupportedNumbers: string[];
    unverifiedQuotes: string[];
    adviceMatches: string[];
  };
  checkedAt: string;
}

const CITATION_RE = /\[(S\d{1,2})\]/g;

function normaliseForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’`]/g, "'")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Numeric expressions that make a factual claim (amounts, percentages, large figures). */
export function extractClaimNumbers(text: string): string[] {
  const clean = text.replace(CITATION_RE, " ");
  const re = /(?:₹|rs\.?\s?|us\$|\$|€|£)?\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|per cent|percent|crore|lakh|billion|million|trillion|bn|mn|bps|basis points|x))?/gi;
  const out = new Set<string>();
  for (const m of clean.matchAll(re)) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^\d.]/g, "").replace(/\.$/, "");
    if (!digits) continue;
    const value = Number(digits.replace(/,/g, ""));
    const hasUnit = /[%₹$€£]|crore|lakh|billion|million|trillion|bn|mn|bps|basis|x$/i.test(raw);
    const isYear = /^(19|20)\d{2}$/.test(digits) && !hasUnit;
    if (isYear) continue;
    if (!hasUnit && value <= 31 && !digits.includes(".")) continue; // days of month, small counts
    out.add(digits.replace(/,/g, ""));
  }
  return [...out];
}

export function extractQuotes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[“"]([^”"]{12,500})[”"]/g)) {
    const q = m[1]!.trim();
    if (q.split(/\s+/).length >= 4) out.push(q);
  }
  return out;
}

export function validateDraft(
  draft: ArticleDraft,
  sources: ValidationSource[],
  options: { desk: "AI" | "MARKETS"; factCheck?: FactCheck | null; humanEdited?: boolean },
): ValidationReport {
  const blocking: string[] = [];
  const review: string[] = [];
  const warnings: string[] = [];
  const validIds = new Set(sources.map((s) => s.id));
  if (options.desk === "MARKETS") validIds.add("S0"); // licensed market-data block, when supplied

  const fullText = [draft.introduction, draft.body, draft.context, draft.whyItMatters, draft.implications, draft.risks, ...draft.keyFacts.map((k) => k.fact)].join("\n\n");
  const sourceCorpus = normaliseForMatch(sources.map((s) => s.text).join("\n"));

  if (draft.insufficientInformation) {
    blocking.push(`Writer reported insufficient information: ${draft.insufficientReason || "no reason given"}`);
  }

  // Sourcing
  const cited = [...fullText.matchAll(CITATION_RE)].map((m) => m[1]!);
  const unknownCited = [...new Set(cited.filter((id) => !validIds.has(id)))];
  if (unknownCited.length) blocking.push(`Cites sources that were not provided: ${unknownCited.join(", ")}`);
  const unknownUsed = draft.sourcesUsed.filter((id) => !validIds.has(id));
  if (unknownUsed.length) blocking.push(`sourcesUsed lists unknown sources: ${unknownUsed.join(", ")}`);
  for (const kf of draft.keyFacts) {
    const bad = kf.sourceIds.filter((id) => !validIds.has(id));
    if (bad.length) blocking.push(`Key fact cites unknown source ${bad.join(", ")}: "${kf.fact.slice(0, 80)}"`);
  }
  const bodyCitations = [...draft.body.matchAll(CITATION_RE)].length;
  if (bodyCitations === 0) blocking.push("Body contains no source citations");
  if (/https?:\/\/|www\.[a-z]/i.test(fullText)) blocking.push("Article text contains a URL; links come only from the stored source list");

  const blocks = parseMarkdown(draft.body);
  const paragraphs = blocks.filter((b) => b.type === "p");
  const uncited = paragraphs.filter((p) => p.type === "p" && !p.raw.match(CITATION_RE) && wordCount(p.raw) > 25).length;
  if (paragraphs.length && uncited / paragraphs.length > 0.5) review.push(`${uncited} of ${paragraphs.length} body paragraphs carry no citation`);
  else if (uncited > 0) warnings.push(`${uncited} body paragraph(s) carry no citation`);

  // Length & headline
  const words = wordCount(draft.introduction) + wordCount(draft.body);
  if (words < 300) blocking.push(`Article is too short (${words} words)`);
  if (words > 1800) warnings.push(`Article is long (${words} words)`);
  if (isClickbait(draft.headline)) blocking.push("Headline reads as clickbait or uses a question/exclamation");
  if (draft.seoTitle.length > 60) warnings.push(`SEO title is ${draft.seoTitle.length} characters; under 60 displays best`);

  // Quotes must appear verbatim in a source
  const unverifiedQuotes = extractQuotes(fullText).filter((q) => !sourceCorpus.includes(normaliseForMatch(q)));
  if (unverifiedQuotes.length) blocking.push(`Direct quote(s) not found verbatim in sources: ${unverifiedQuotes.map((q) => `"${q.slice(0, 60)}"`).join("; ")}`);

  // Numbers must appear in a source
  const unsupportedNumbers = extractClaimNumbers(fullText).filter((n) => !sourceCorpus.includes(n));
  if (unsupportedNumbers.length > 2) review.push(`Figures not found in sources: ${unsupportedNumbers.slice(0, 8).join(", ")}`);
  else if (unsupportedNumbers.length) warnings.push(`Figure(s) not found verbatim in sources: ${unsupportedNumbers.join(", ")}`);

  // Investment advice
  const advice = detectInvestmentAdvice(`${draft.headline}\n${fullText}`);
  if (advice.length) review.push(`Possible investment advice (${advice.map((a) => a.id).join(", ")}): "${advice[0]!.excerpt}"`);
  if (options.desk === "MARKETS" && draft.containsAnalystOpinion) review.push("Reports analyst opinions — confirm attribution and framing");

  // Model-based fact check
  if (options.factCheck) {
    const bad = options.factCheck.claims.filter((c) => c.verdict === "UNSUPPORTED" || c.verdict === "CONTRADICTED");
    if (bad.length) review.push(`Fact-check flagged ${bad.length} claim(s): ${bad.slice(0, 3).map((c) => `${c.verdict}: ${c.claim.slice(0, 80)}`).join(" | ")}`);
    else if (options.factCheck.overall === "REVIEW") review.push(`Fact-check requested review: ${options.factCheck.summary.slice(0, 200)}`);
  }

  return {
    blocking,
    review,
    warnings,
    stats: {
      words,
      citations: cited.length,
      uncitedParagraphs: uncited,
      paragraphs: paragraphs.length,
      unsupportedNumbers,
      unverifiedQuotes,
      adviceMatches: advice.map((a) => a.id),
    },
    checkedAt: new Date().toISOString(),
  };
}

/** The status a freshly validated article should move to. */
export function statusAfterValidation(report: ValidationReport, autoPublish: boolean): "FAILED" | "NEEDS_REVIEW" | "APPROVED" {
  if (report.blocking.some((b) => b.startsWith("Writer reported insufficient information"))) return "FAILED";
  if (report.blocking.length || report.review.length || !autoPublish) return "NEEDS_REVIEW";
  return "APPROVED";
}
