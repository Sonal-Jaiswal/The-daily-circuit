const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|ocid|taid|from|src|source|guccounter|_hsenc|_hsmi|mkt_tok)$/i;

/** Canonical form for duplicate detection: https, no tracking params, no fragment, no trailing slash. */
export function canonicalizeUrl(input: string): string {
  const u = new URL(input.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.protocol === "http:") u.protocol = "https:";
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.toString();
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in into is it its of on or over says said say that the this to was were will with after amid new its how why what who report reports update".split(" "),
);

/** Strip " - Publisher" / " | Publisher" suffixes that feeds append to titles. */
export function stripPublisherSuffix(title: string, publisher?: string): string {
  let t = title.trim();
  if (publisher) {
    const esc = publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s*[-|–—:]\\s*${esc}\\s*$`, "i"), "");
  }
  return t.replace(/\s+[|]\s+[^|]{2,40}$/, "").trim();
}

export function normalizeHeadline(title: string, publisher?: string): string {
  return stripPublisherSuffix(title, publisher)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]s\b/g, "")
    .replace(/[^a-z0-9₹%.\s]/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content-bearing tokens, lightly stemmed, for similarity scoring. */
export function headlineTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t));
}
