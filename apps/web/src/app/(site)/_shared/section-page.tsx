import type { Metadata } from "next";
import Link from "next/link";
import type { Section } from "@tdc/db";
import { StoryCard, StoryRow } from "@/components/article-card";
import { Breadcrumbs, JsonLd } from "@/components/site-chrome";
import { getSectionArticles } from "@/lib/data";
import { absoluteUrl, SITE } from "@/lib/site";
import { breadcrumbJsonLd } from "@tdc/core/seo/jsonld";

export const SECTION_COPY: Record<Section, { path: string; title: string; heading: string; intro: string; also: Array<{ href: string; label: string }> }> = {
  AI: {
    path: "/ai",
    title: "AI News",
    heading: "Artificial intelligence",
    intro: "Model releases, research results, regulation and the companies building AI, from official announcements and the technology press. Up to ten stories every evening.",
    also: [{ href: "/technology", label: "Technology" }],
  },
  TECHNOLOGY: {
    path: "/technology",
    title: "Technology",
    heading: "Technology",
    intro: "Semiconductors, cloud, devices and the business of technology, with an eye on what it means for India.",
    also: [{ href: "/ai", label: "AI News" }],
  },
  MARKETS: {
    path: "/markets",
    title: "Indian Markets",
    heading: "Indian markets",
    intro: "RBI and SEBI decisions, exchange disclosures, corporate results and the forces moving Indian equities. Factual reporting only, never investment advice.",
    also: [{ href: "/ipo", label: "IPO" }],
  },
  IPO: {
    path: "/ipo",
    title: "IPO News",
    heading: "IPOs",
    intro: "Draft papers, regulatory approvals, subscription figures and listings in India's primary market, reported from filings. We never recommend applying for or avoiding an issue.",
    also: [{ href: "/markets", label: "Indian Markets" }],
  },
};

export async function sectionMetadata(section: Section): Promise<Metadata> {
  const copy = SECTION_COPY[section];
  const articles = await getSectionArticles([section], 1);
  return {
    title: copy.title,
    description: copy.intro,
    alternates: { canonical: copy.path },
    openGraph: { title: `${copy.title} | ${SITE.name}`, description: copy.intro, url: copy.path },
    // Thin pages stay out of the index until they carry real stories.
    robots: articles.length ? undefined : { index: false, follow: true },
  };
}

export async function SectionPage({ section }: { section: Section }) {
  const copy = SECTION_COPY[section];
  const articles = await getSectionArticles([section], 40);
  const [lead, ...rest] = articles;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", url: absoluteUrl("/") }, { name: copy.title, url: absoluteUrl(copy.path) }])} />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: copy.title }]} />
      <header className="mt-4 max-w-3xl">
        <h1 className="text-[2.4rem] font-black leading-none tracking-[-0.04em] sm:text-[3.25rem]">{copy.heading}</h1>
        <p className="mt-4 font-serif text-[1.2rem] leading-relaxed text-ink-2">{copy.intro}</p>
        <p className="mt-3 text-sm text-ink-3">
          Related:{" "}
          {copy.also.map((l) => (
            <Link key={l.href} href={l.href} className="font-semibold text-neel hover:underline">
              {l.label}
            </Link>
          ))}
          <span aria-hidden="true"> / </span>
          <Link href="/edition" className="font-semibold text-neel hover:underline">
            Past editions
          </Link>
        </p>
      </header>

      {lead ? (
        <>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <StoryCard article={lead} />
            <div className="divide-y divide-rule border-t border-rule lg:border-t-0">
              {rest.slice(0, 3).map((a) => (
                <StoryRow key={a.id} article={a} showSection={false} />
              ))}
            </div>
          </div>
          {rest.length > 3 && (
            <section aria-label={`More ${copy.title}`} className="mt-12 max-w-3xl divide-y divide-rule border-t border-rule">
              {rest.slice(3).map((a) => (
                <StoryRow key={a.id} article={a} showSection={false} />
              ))}
            </section>
          )}
        </>
      ) : (
        <div className="mt-10 max-w-2xl rounded-lg border border-rule bg-surface p-6">
          <h2 className="text-lg font-bold">No stories published yet</h2>
          <p className="mt-2 text-ink-2">Stories for this section are published with the evening edition at 9:00 pm IST. Until then, read about how we select and verify stories.</p>
          <Link href="/editorial-policy" className="mt-3 inline-block font-semibold text-neel underline underline-offset-4">
            Read the editorial policy
          </Link>
        </div>
      )}
    </div>
  );
}
