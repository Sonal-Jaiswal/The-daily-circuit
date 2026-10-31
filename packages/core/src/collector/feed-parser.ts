import { XMLParser } from "fast-xml-parser";
import { collapseWhitespace, decodeEntities, htmlToText, truncate } from "../util/text";

export interface FeedItem {
  title: string;
  link: string;
  guid: string | null;
  summary: string | null;
  /** The item's own publication time. Never derived from channel/feed-level dates. */
  publishedAt: Date | null;
  /** The item's "updated" time, if the feed gives one. Kept separate on purpose. */
  updatedAt: Date | null;
  categories: string[];
}

export interface ParsedFeed {
  format: "rss" | "atom" | "rdf";
  title: string | null;
  items: FeedItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  cdataPropName: "#cdata",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ["item", "entry", "link", "category"].includes(name),
});

function asText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return asText(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o["#cdata"] != null) return asText(o["#cdata"]);
    if (o["#text"] != null) return asText(o["#text"]);
  }
  return "";
}

/**
 * Parses RFC 822 / RFC 3339 dates, plus the "30 Oct, 2026 +0530" style used by some Indian
 * government feeds. Returns null rather than guessing.
 */
export function parseFeedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const direct = new Date(v);
  if (!Number.isNaN(direct.getTime())) return direct;
  const cleaned = v.replace(/,/g, " ").replace(/\s+/g, " ");
  const m = cleaned.match(/^(\d{1,2}) ([A-Za-z]{3,9}) (\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?(?: ([+-]\d{4}|GMT|UTC|IST))?$/);
  if (m) {
    const [, d, mon, y, hh = "00", mm = "00", ss = "00", tz = "+0530"] = m;
    const zone = tz === "IST" ? "+0530" : tz === "GMT" || tz === "UTC" ? "+0000" : tz;
    const iso = new Date(`${d} ${mon} ${y} ${hh.padStart(2, "0")}:${mm}:${ss} ${zone}`);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  return null;
}

function pickLink(node: unknown): string {
  if (!node) return "";
  const links = Array.isArray(node) ? node : [node];
  // Atom: prefer rel="alternate" (or no rel) with an href.
  for (const l of links) {
    if (l && typeof l === "object" && "@href" in (l as object)) {
      const rel = (l as Record<string, string>)["@rel"];
      if (!rel || rel === "alternate") return (l as Record<string, string>)["@href"] ?? "";
    }
  }
  for (const l of links) {
    const t = asText(l);
    if (t) return t;
  }
  return "";
}

function normaliseSummary(raw: string): string | null {
  const text = collapseWhitespace(htmlToText(decodeEntities(raw)));
  return text ? truncate(text, 1200) : null;
}

export function parseFeed(xml: string): ParsedFeed {
  const doc = parser.parse(xml) as Record<string, any>;
  if (doc.rss?.channel) {
    const ch = Array.isArray(doc.rss.channel) ? doc.rss.channel[0] : doc.rss.channel;
    return {
      format: "rss",
      title: asText(ch.title) || null,
      items: (ch.item ?? []).map((it: any) => toItem(it, "rss")).filter(isUsable),
    };
  }
  if (doc.feed) {
    return {
      format: "atom",
      title: asText(doc.feed.title) || null,
      items: (doc.feed.entry ?? []).map((it: any) => toItem(it, "atom")).filter(isUsable),
    };
  }
  const rdf = doc["rdf:RDF"];
  if (rdf) {
    return {
      format: "rdf",
      title: asText(rdf.channel?.title) || null,
      items: (rdf.item ?? []).map((it: any) => toItem(it, "rdf")).filter(isUsable),
    };
  }
  throw new Error("Unrecognised feed format");
}

function toItem(it: any, format: "rss" | "atom" | "rdf"): FeedItem {
  const title = collapseWhitespace(htmlToText(asText(it.title)));
  const link = pickLink(it.link) || (format === "rss" && it.guid?.["@isPermaLink"] !== "false" ? asText(it.guid) : "");
  const guid = asText(it.guid) || asText(it.id) || null;
  const summaryRaw = asText(it.description) || asText(it.summary) || asText(it["content:encoded"]) || asText(it.content);
  const published =
    format === "atom"
      ? parseFeedDate(asText(it.published) || asText(it.issued))
      : parseFeedDate(asText(it.pubDate) || asText(it["dc:date"]) || asText(it.published));
  const updated = parseFeedDate(asText(it.updated) || asText(it["atom:updated"]) || asText(it["dc:modified"]));
  const categories = (it.category ?? [])
    .map((c: any) => asText(c) || c?.["@term"] || "")
    .filter(Boolean)
    .slice(0, 10);
  return {
    title,
    link: link.trim(),
    guid,
    summary: summaryRaw ? normaliseSummary(summaryRaw) : null,
    publishedAt: published,
    updatedAt: updated,
    categories,
  };
}

function isUsable(item: FeedItem): boolean {
  return Boolean(item.title && /^https?:\/\//i.test(item.link));
}
