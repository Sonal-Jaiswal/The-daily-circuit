export interface SiteIdentity {
  name: string;
  url: string;
  description: string;
  logoUrl: string;
}

export function organizationJsonLd(site: SiteIdentity) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: site.name,
    url: site.url,
    description: site.description,
    logo: { "@type": "ImageObject", url: site.logoUrl, width: 512, height: 512 },
    publishingPrinciples: `${site.url}/editorial-policy`,
    correctionsPolicy: `${site.url}/corrections`,
    ethicsPolicy: `${site.url}/editorial-policy`,
    actionableFeedbackPolicy: `${site.url}/contact`,
  };
}

export function websiteJsonLd(site: SiteIdentity) {
  return { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url, inLanguage: "en-IN" };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: item.url })),
  };
}

export interface NewsArticleInput {
  url: string;
  headline: string;
  description: string;
  imageUrl: string;
  publishedAt: Date;
  modifiedAt: Date;
  section: string;
  keywords: string[];
  authorName: string;
  authorUrl: string;
  wordCount: number;
  isAccessibleForFree?: boolean;
}

/** Mirrors exactly what the article page shows (headline, dates, byline). */
export function newsArticleJsonLd(site: SiteIdentity, a: NewsArticleInput) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": a.url },
    url: a.url,
    headline: a.headline.slice(0, 110),
    description: a.description,
    image: [a.imageUrl],
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.modifiedAt.toISOString(),
    articleSection: a.section,
    keywords: a.keywords.join(", "),
    wordCount: a.wordCount,
    inLanguage: "en-IN",
    isAccessibleForFree: a.isAccessibleForFree ?? true,
    author: [{ "@type": "Organization", name: a.authorName, url: a.authorUrl }],
    publisher: { "@type": "NewsMediaOrganization", name: site.name, url: site.url, logo: { "@type": "ImageObject", url: site.logoUrl } },
  };
}

/** Safe for embedding in <script type="application/ld+json">. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
