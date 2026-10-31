import type { ArticleDraft } from "../../src/editorial/schema";

/** Test fixture only — never seeded into a real database. */
export const SOURCE_TEXT =
  "The Securities and Exchange Board of India issued a final order on 30 October 2026 against Example Energy Services Ltd. " +
  "The order directs the company to pay a penalty of ₹25 lakh within 45 days. The regulator said the company failed to disclose " +
  "related-party transactions worth ₹1,250 crore in its annual reports. The company has the right to appeal before the Securities Appellate Tribunal. " +
  "According to the order, \"the noticee failed to make timely and adequate disclosures to investors\".";

const paragraph = (n: number) =>
  `Paragraph ${n} restates the order's findings in plain language for readers following the case and explains the regulatory process that led to it, noting the penalty of ₹25 lakh [S1]. ` +
  `It sets out what the regulator examined, which disclosures were missing from the annual reports, and what options remain open to the company under the law [S1].`;

export function goodDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  return {
    insufficientInformation: false,
    insufficientReason: "",
    headline: "SEBI orders Example Energy Services to pay ₹25 lakh penalty over disclosures",
    excerpt: "The markets regulator found the company failed to disclose related-party transactions worth ₹1,250 crore, according to its final order.",
    introduction: "The Securities and Exchange Board of India (SEBI) has ordered Example Energy Services to pay a penalty of ₹25 lakh within 45 days [S1].",
    body: Array.from({ length: 7 }, (_, i) => paragraph(i + 1)).join("\n\n") + "\n\n### What the order says\n\nThe regulator said the company failed to disclose related-party transactions worth ₹1,250 crore [S1].",
    context: "SEBI requires listed companies to disclose related-party transactions so investors can judge conflicts of interest [S1].",
    whyItMatters: "Disclosure enforcement affects how much investors can trust annual reports of listed companies in India [S1].",
    keyFacts: [
      { fact: "SEBI imposed a penalty of ₹25 lakh.", sourceIds: ["S1"] },
      { fact: "The penalty is payable within 45 days.", sourceIds: ["S1"] },
      { fact: "Undisclosed related-party transactions were worth ₹1,250 crore.", sourceIds: ["S1"] },
    ],
    implications: "Other companies may review their related-party disclosures, though the order itself applies only to this company.",
    risks: "The company may appeal before the Securities Appellate Tribunal, and the outcome of any appeal is not yet known.",
    confirmed: ["Penalty of ₹25 lakh"],
    unconfirmed: ["Whether the company will appeal"],
    containsAnalystOpinion: false,
    sourcesUsed: ["S1"],
    tags: ["SEBI", "Enforcement"],
    seoTitle: "SEBI fines Example Energy Services ₹25 lakh",
    seoDescription: "SEBI's final order fines Example Energy Services ₹25 lakh for failing to disclose ₹1,250 crore of related-party transactions.",
    imageAlt: "Abstract illustration representing a regulatory order",
    ...overrides,
  };
}
