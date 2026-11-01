import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Section } from "@tdc/db";
import { articlePath, sectionInfo } from "@tdc/core/content/paths";
import { breadcrumbJsonLd, newsArticleJsonLd } from "@tdc/core/seo/jsonld";
import { formatIstDate, formatIstDateTime } from "@tdc/core/time/ist";
import { StoryCard } from "@/components/article-card";
import { RichText } from "@/components/article-body";
import { AdSlot, CopyLinkButton, ViewBeacon } from "@/components/client";
import { ArticleVisual } from "@/components/cover";
import { Breadcrumbs, JsonLd } from "@/components/site-chrome";
import { getArticle, getPublicSettings, getRecentSlugs, getRelated, type PublicArticle } from "@/lib/data";
import { absoluteUrl, modelFamilyLabel, SITE, siteUrl } from "@/lib/site";
import { SECTION_COPY } from "./section-page";

/** Build-time params for an article route. Placeholder keeps the build valid on an empty database. */
export async function articleStaticParams(section: Section) {
  const slugs = await getRecentSlugs(section, 30);
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "__placeholder__" }];
}

function ogImageUrl(a: { section: Section; slug: string }) {
  return `${siteUrl()}/api/og?section=${a.section}&slug=${encodeURIComponent(a.slug)}`;
}

export async function articleMetadata(section: Section, slug: string): Promise<Metadata> {
  const a = await getArticle(section, slug);
  if (!a) return { title: "Article not found", robots: { index: false, follow: false } };
  const url = articlePath(a);
  return {
    title: a.seoTitle || a.headline,
    description: a.seoDescription || a.excerpt,
    alternates: { canonical: url },
    keywords: a.tags.map((t) => t.name),
    authors: [{ name: a.author.name, url: `${siteUrl()}/authors#${a.author.slug}` }],
    openGraph: {
      type: "article",
      url,
      title: a.headline,
      description: a.excerpt,
      siteName: SITE.name,
      publishedTime: a.publishedAt.toISOString(),
      modifiedTime: a.modifiedAt.toISOString(),
      section: sectionInfo(a.section).name,
      tags: a.tags.map((t) => t.name),
      images: [{ url: ogImageUrl(a), width: 1200, height: 630, alt: a.imageAlt }],
    },
    twitter: { card: "summary_large_image", title: a.headline, description: a.excerpt, images: [ogImageUrl(a)] },
  };
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function StockMoverBox({ stock }: { stock: NonNullable<PublicArticle["stock"]> }) {
  const up = stock.changePercent >= 0;
  return (
    <aside aria-labelledby="mover-heading" className="my-8 rounded-lg border border-marigold/50 bg-marigold-soft p-5">
      <h2 id="mover-heading" className="text-sm font-bold text-marigold-ink">
        Why is this stock moving?
      </h2>
      <p className="mt-2 text-lg font-bold">
        {stock.companyName} <span className="font-medium text-ink-2">({stock.exchange}: {stock.symbol})</span>
      </p>
      <dl className="tabular mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-ink-3">Last price</dt>
          <dd className="font-semibold">₹{inr.format(stock.lastPrice)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Previous close</dt>
          <dd className="font-semibold">₹{inr.format(stock.previousClose)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Change</dt>
          <dd className={up ? "font-semibold text-up" : "font-semibold text-down"}>
            {up ? "+" : ""}
            {stock.changePercent.toFixed(2)}%
          </dd>
        </div>
        {stock.volume !== null && (
          <div>
            <dt className="text-ink-3">Volume</dt>
            <dd className="font-semibold">{stock.volume.toLocaleString("en-IN")}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-ink-2">
        Data from {stock.provider} as of {formatIstDateTime(stock.dataTimestamp)}. The reasons below are limited to what company, exchange or regulator disclosures state. A price move is not a signal to buy or sell.
      </p>
    </aside>
  );
}

function ShareLinks({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "X", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { label: "Email", href: `mailto:?subject=${t}&body=${u}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this article">
      <span className="mr-1 text-sm font-semibold text-ink-2">Share</span>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md border border-rule px-3 text-sm font-medium hover:bg-neel-soft">
          {l.label}
        </a>
      ))}
      <CopyLinkButton url={url} />
    </div>
  );
}

export async function ArticlePage({ section, slug }: { section: Section; slug: string }) {
  const a = await getArticle(section, slug);
  if (!a) notFound();
  const [related, settings] = await Promise.all([getRelated(a.id, a.section, a.tags.map((t) => t.id)), getPublicSettings()]);
  const info = sectionInfo(a.section);
  const copy = SECTION_COPY[a.section];
  const url = absoluteUrl(articlePath(a));
  const citations = new Map<string, number>();
  a.sources.forEach((s, i) => s.citationId && citations.set(s.citationId, i + 1));
  const adClient = settings.ads.enabled && settings.ads.publisherId ? `ca-${settings.ads.publisherId}` : null;
  const identity = { name: SITE.name, url: siteUrl(), description: SITE.description, logoUrl: `${siteUrl()}/logo.png` };
  const markets = info.desk === "MARKETS";

  return (
    <article className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <JsonLd
        data={[
          newsArticleJsonLd(identity, {
            url,
            headline: a.headline,
            description: a.excerpt,
            imageUrl: ogImageUrl(a),
            publishedAt: a.publishedAt,
            modifiedAt: a.modifiedAt,
            section: info.name,
            keywords: a.tags.map((t) => t.name),
            authorName: a.author.name,
            authorUrl: `${siteUrl()}/authors#${a.author.slug}`,
            wordCount: a.wordCount,
          }),
          breadcrumbJsonLd([
            { name: "Home", url: absoluteUrl("/") },
            { name: copy.title, url: absoluteUrl(copy.path) },
            { name: a.headline, url },
          ]),
        ]}
      />
      <ViewBeacon articleId={a.id} />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: copy.title, href: copy.path }, { name: a.headline }]} />

      <header className="mt-5 max-w-3xl">
        <Link href={copy.path} className={`text-sm font-semibold hover:underline ${markets ? "text-marigold-ink" : "text-neel"}`}>
          {info.name}
        </Link>
        <h1 className="mt-2 text-[2.15rem] font-black leading-[1.07] tracking-[-0.035em] sm:text-[2.9rem]">{a.headline}</h1>
        <p className="mt-4 font-serif text-[1.3rem] leading-relaxed text-ink-2">{a.excerpt}</p>
        <div className="mt-5 flex flex-col gap-1 border-y border-rule py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            By{" "}
            <Link href={`/authors#${a.author.slug}`} className="font-semibold hover:underline">
              {a.author.name}
            </Link>
            {a.author.isAutomated && <span className="text-ink-3"> (automated, AI-generated)</span>}
          </p>
          <p className="text-ink-3">
            <time dateTime={a.publishedAt.toISOString()}>{formatIstDateTime(a.publishedAt)}</time>
            {a.wasUpdated && (
              <>
                {" "}
                <span aria-hidden="true">/</span> Updated <time dateTime={a.modifiedAt.toISOString()}>{formatIstDateTime(a.modifiedAt)}</time>
              </>
            )}{" "}
            <span aria-hidden="true">/</span> {a.readingTimeMinutes} min read
          </p>
        </div>
      </header>

      <div className="mt-8 aspect-[1.9/1] max-w-4xl overflow-hidden rounded-lg">
        <ArticleVisual seed={a.slug} section={a.section} alt={a.imageAlt} imageUrl={a.imageUrl} imageCredit={a.imageCredit} illustration={a.illustration} />
      </div>
      {a.illustration && !a.imageUrl && <p className="mt-2 max-w-4xl text-xs text-ink-3">AI-generated image ({a.illustration.model.split("/").pop()}), not a photograph of the events described.</p>}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,40rem)_1fr]">
        <div className="min-w-0">
          {a.stock && <StockMoverBox stock={a.stock} />}

          {a.keyFacts.length > 0 && <section aria-labelledby="key-facts" className="mb-8 rounded-lg border border-rule bg-surface p-5">
            <h2 id="key-facts" className="text-sm font-bold">
              Key facts
            </h2>
            <ul className="mt-3 space-y-2 text-[0.98rem] leading-relaxed">
              {a.keyFacts.map((k, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${markets ? "bg-marigold" : "bg-neel"}`} />
                  <span>
                    {k.fact}
                    {k.sourceIds.map((id) =>
                      citations.has(id) ? (
                        <a key={id} href={`#source-${citations.get(id)}`} className="cite">
                          [{citations.get(id)}]
                        </a>
                      ) : null,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>}

          <div className="prose-article">
            <RichText text={a.introduction} citations={citations} />
            <RichText text={a.body} citations={citations} />
            <AdSlot client={adClient} slot={settings.ads.slots.inArticle} />
            {a.context && (
              <>
                <h2>Context</h2>
                <RichText text={a.context} citations={citations} />
              </>
            )}
            {a.whyItMatters && (
              <>
                <h2>Why it matters</h2>
                <RichText text={a.whyItMatters} citations={citations} />
              </>
            )}
            {a.implications && (
              <>
                <h2>What could happen next</h2>
                {a.author.isAutomated && <p className="!mb-2 font-sans text-sm text-ink-3">AI-generated analysis based on the sources below. Not a forecast or recommendation.</p>}
                <RichText text={a.implications} citations={citations} />
              </>
            )}
            {a.risks && (
              <>
                <h2>Risks and open questions</h2>
                <RichText text={a.risks} citations={citations} />
              </>
            )}
          </div>

          {a.disclaimerRequired && (
            <aside className="mt-8 rounded-lg border border-rule bg-surface p-5 text-sm leading-relaxed text-ink-2">
              <p className="font-semibold text-ink">Not investment advice</p>
              <p className="mt-1">
                This article reports facts and attributed views for general information. It is not a recommendation to buy, sell or hold any security, and {SITE.name} is not a SEBI-registered investment adviser or research analyst. Past performance does not indicate future results. Consult a registered adviser before investing.{" "}
                <Link href="/disclaimer" className="text-neel underline underline-offset-2">
                  Full disclaimer
                </Link>
              </p>
            </aside>
          )}

          {a.sources.length > 0 && <section aria-labelledby="sources-heading" className="mt-10">
            <h2 id="sources-heading" className="text-xl font-extrabold tracking-[-0.02em]">
              Sources
            </h2>
            <ol className="mt-3 space-y-3 text-[0.95rem]">
              {a.sources.map((s, i) => (
                <li key={s.id} id={`source-${i + 1}`} className="grid grid-cols-[1.75rem_1fr] scroll-mt-24">
                  <span className="tabular font-semibold text-ink-3">{i + 1}.</span>
                  <span>
                    <span className="font-semibold">{s.publisher}</span>
                    {s.isPrimary && <span className="text-ink-3"> (primary source)</span>}
                    {": "}
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-neel underline underline-offset-2 [overflow-wrap:anywhere]">
                      {s.title}
                    </a>
                    {s.publishedAt && <span className="tabular text-ink-3">, {formatIstDate(s.publishedAt)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>}

          <section aria-label="How this article was produced" className="mt-8 rounded-lg bg-neel-soft p-5 text-sm leading-relaxed text-ink-2">
            <p>
              <span className="font-semibold text-ink">How this article was produced.</span>{" "}
              {a.author.isAutomated
                ? <>This story was researched and written by an automated system using {modelFamilyLabel(a.generatedByModel)}, working only from the sources listed above. Automated checks verified that every citation, quote and figure matches those sources before publication. It was not written by a human reporter.{" "}</>
                : <>This article was written by {a.author.name}, an editor at {SITE.name}.{" "}</>}
              <Link href="/editorial-policy" className="text-neel underline underline-offset-2">
                Editorial policy
              </Link>
              {" · "}
              <Link href="/corrections" className="text-neel underline underline-offset-2">
                Report an error
              </Link>
            </p>
          </section>

          {a.tags.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Topics">
              {a.tags.map((t) => (
                <li key={t.id} className="rounded-sm bg-surface px-2.5 py-1 text-sm text-ink-2 ring-1 ring-rule">
                  {t.name}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 border-t border-rule pt-6">
            <ShareLinks url={url} title={a.headline} />
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-6">
            {a.edition && (
              <p className="text-sm text-ink-2">
                Part of the{" "}
                <Link href={`/edition/${a.edition.date}`} className="font-semibold text-neel hover:underline">
                  {a.edition.title.toLowerCase()}
                </Link>
                .
              </p>
            )}
            <AdSlot client={adClient} slot={settings.ads.slots.sidebar} className="my-0" />
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-16 border-t border-rule pt-8">
          <h2 id="related-heading" className="text-xl font-extrabold tracking-[-0.02em]">
            Related stories
          </h2>
          <div className="mt-6 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => (
              <StoryCard key={r.id} article={r} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
