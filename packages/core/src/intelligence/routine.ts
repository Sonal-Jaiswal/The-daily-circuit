import type { SourceKind } from "@tdc/db";

/**
 * Mechanical paperwork that regulators and exchanges publish every day. None of it is a story on
 * its own, and it otherwise scores well because official sources are highly reliable.
 */
const ROUTINE_NOTICES: Array<[RegExp, string]> = [
  [/^money market operations as on\b/i, "daily money market operations data"],
  [/^(result of )?(underwriting )?auctions? (of|for|result)\b.*\b(treasury bills|dated securities|state government securities|g-secs?|sdls?)\b/i, "routine securities auction notice"],
  [/^(reserve money|weekly statistical supplement|lending and deposit rates)\b/i, "routine statistical release"],
  [/\bcitizen'?s charter\b/i, "service-standard status report"],
  [/\brecovery certificate\b/i, "individual recovery proceeding"],
  [/\bnotice of (demand|attachment)\b/i, "individual recovery proceeding"],
  [/\b(completion|release|attachment) order\b/i, "individual recovery proceeding"],
  [/^appeal no\.?\s*\d+/i, "individual appeal filing"],
];

const OFFICIAL_KINDS: ReadonlySet<SourceKind> = new Set(["REGULATOR", "OFFICIAL", "EXCHANGE"]);

/** Why an official item is routine paperwork rather than news, or null when it may be a story. */
export function routineNoticeReason(headline: string, kind: SourceKind): string | null {
  if (!OFFICIAL_KINDS.has(kind)) return null;
  const text = headline.replace(/[’‘]/g, "'").trim();
  return ROUTINE_NOTICES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
