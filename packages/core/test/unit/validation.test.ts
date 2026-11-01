import { describe, expect, it } from "vitest";
import { ArticleDraftSchema } from "../../src/editorial/schema";
import { detectInvestmentAdvice, isClickbait } from "../../src/validation/advice";
import { extractClaimNumbers, statusAfterValidation, validateDraft } from "../../src/validation/validate";
import { goodDraft, SOURCE_TEXT } from "../fixtures/drafts";

const sources = [{ id: "S1", text: SOURCE_TEXT }];

describe("deterministic editorial validation", () => {
  it("passes a well-sourced draft", () => {
    const r = validateDraft(goodDraft(), sources, { desk: "MARKETS" });
    expect(r.blocking).toEqual([]);
    expect(r.review).toEqual([]);
    expect(statusAfterValidation(r, true)).toBe("APPROVED");
    expect(statusAfterValidation(r, false)).toBe("NEEDS_REVIEW");
  });

  it("blocks citations of sources that were not provided (no invented sources)", () => {
    const r = validateDraft(goodDraft({ body: goodDraft().body + "\n\nAn extra claim [S7]." }), sources, { desk: "AI" });
    expect(r.blocking.join()).toMatch(/S7/);
    expect(statusAfterValidation(r, true)).toBe("NEEDS_REVIEW");
  });

  it("blocks URLs in article text (links come only from stored sources)", () => {
    const r = validateDraft(goodDraft({ context: "See https://made-up.example/report for details [S1]." }), sources, { desk: "AI" });
    expect(r.blocking.join()).toMatch(/URL/);
  });

  it("blocks quotes that do not appear verbatim in a source", () => {
    const fake = validateDraft(goodDraft({ whyItMatters: 'A SEBI official said "this is the largest penalty we have ever imposed" [S1].' }), sources, { desk: "MARKETS" });
    expect(fake.blocking.join()).toMatch(/quote/i);
    const real = validateDraft(goodDraft({ whyItMatters: 'The order states that "the noticee failed to make timely and adequate disclosures to investors" [S1].' }), sources, { desk: "MARKETS" });
    expect(real.blocking).toEqual([]);
  });

  it("flags figures that are not in any source", () => {
    const r = validateDraft(goodDraft({ implications: "Shares could fall 12.5%, losing ₹900 crore, or 3.2x the fine, analysts guessed." }), sources, { desk: "MARKETS" });
    expect(r.stats.unsupportedNumbers).toEqual(expect.arrayContaining(["12.5", "900", "3.2"]));
    expect(r.review.join()).toMatch(/Figures not found/);
  });

  it("routes possible investment advice to a human", () => {
    const r = validateDraft(goodDraft({ implications: "Investors should buy the stock before results, with a target price of ₹25 lakh." }), sources, { desk: "MARKETS" });
    expect(r.review.join()).toMatch(/investment advice/);
    expect(statusAfterValidation(r, true)).toBe("NEEDS_REVIEW");
  });

  it("fails the article when the writer reports insufficient information", () => {
    const r = validateDraft(goodDraft({ insufficientInformation: true, insufficientReason: "Only a headline" }), sources, { desk: "AI" });
    expect(statusAfterValidation(r, true)).toBe("FAILED");
  });

  it("blocks clickbait headlines and too-short articles", () => {
    expect(validateDraft(goodDraft({ headline: "You won't believe what SEBI just did" }), sources, { desk: "MARKETS" }).blocking.join()).toMatch(/clickbait/);
    expect(validateDraft(goodDraft({ body: "Short body [S1]." }), sources, { desk: "MARKETS" }).blocking.join()).toMatch(/too short/);
  });

  it("escalates fact-check findings", () => {
    const r = validateDraft(goodDraft(), sources, {
      desk: "MARKETS",
      factCheck: { overall: "REVIEW", summary: "One claim unsupported", claims: [{ claim: "Penalty is ₹50 lakh", verdict: "CONTRADICTED", sourceIds: ["S1"], note: "" }] },
    });
    expect(r.review.join()).toMatch(/Fact-check flagged 1/);
  });
});

describe("helpers", () => {
  it("extracts claim numbers but ignores years and small counts", () => {
    expect(extractClaimNumbers("In 2026, 3 firms paid ₹1,25,000 and 4.5% rose [S1] by 250 bps")).toEqual(["125000", "4.5", "250"]);
  });

  it("detects advice phrasing and clickbait", () => {
    expect(detectInvestmentAdvice("This is a multibagger")).toHaveLength(1);
    expect(detectInvestmentAdvice("Shares rose 4% after the results were announced")).toHaveLength(0);
    expect(isClickbait("Is this the end of search?")).toBe(true);
    expect(isClickbait("RBI holds repo rate at 5.5%")).toBe(false);
  });
});

describe("Claude response schema", () => {
  it("accepts a complete draft", () => {
    expect(ArticleDraftSchema.safeParse(goodDraft()).success).toBe(true);
  });

  it("rejects missing fields, bad source ids and out-of-range lengths", () => {
    const { headline: _h, ...missing } = goodDraft();
    expect(ArticleDraftSchema.safeParse(missing).success).toBe(false);
    expect(ArticleDraftSchema.safeParse(goodDraft({ sourcesUsed: ["source-1"] })).success).toBe(false);
    expect(ArticleDraftSchema.safeParse(goodDraft({ seoTitle: "x".repeat(90) })).success).toBe(false);
    expect(ArticleDraftSchema.safeParse(goodDraft({ keyFacts: [] })).success).toBe(false);
    expect(ArticleDraftSchema.safeParse(goodDraft({ body: "Too short." })).success).toBe(false);
  });

  it("accepts placeholder text when the writer reports insufficient information", () => {
    const thin = goodDraft({ insufficientInformation: true, insufficientReason: "Only a headline was available", excerpt: "n/a", introduction: "n/a", body: "n/a", context: "n/a", whyItMatters: "n/a", keyFacts: [], sourcesUsed: [], tags: [] });
    expect(ArticleDraftSchema.safeParse(thin).success).toBe(true);
  });
});
