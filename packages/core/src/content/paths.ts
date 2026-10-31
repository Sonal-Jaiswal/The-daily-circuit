import type { Desk, Section } from "@tdc/db";
import { siteUrl } from "../env";

export const SECTIONS: ReadonlyArray<{ section: Section; slug: string; name: string; desk: Desk }> = [
  { section: "AI", slug: "ai", name: "AI News", desk: "AI" },
  { section: "TECHNOLOGY", slug: "technology", name: "Technology", desk: "AI" },
  { section: "MARKETS", slug: "markets", name: "Indian Markets", desk: "MARKETS" },
  { section: "IPO", slug: "ipo", name: "IPO", desk: "MARKETS" },
];

export function sectionInfo(section: Section) {
  return SECTIONS.find((s) => s.section === section)!;
}

export function sectionFromSlug(slug: string) {
  return SECTIONS.find((s) => s.slug === slug) ?? null;
}

export function deskForSection(section: Section): Desk {
  return sectionInfo(section).desk;
}

export function articlePath(article: { section: Section; slug: string }): string {
  return `/${sectionInfo(article.section).slug}/${article.slug}`;
}

export function articleUrl(article: { section: Section; slug: string }): string {
  return `${siteUrl()}${articlePath(article)}`;
}

export function editionPath(editionDate: string): string {
  return `/edition/${editionDate}`;
}
