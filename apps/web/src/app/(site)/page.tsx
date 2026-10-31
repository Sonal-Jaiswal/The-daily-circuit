import Link from "next/link";
import { articlePath } from "@tdc/core/content/paths";
import { formatEditionDate } from "@tdc/core/time/ist";
import { Meta, SectionLabel, StoryCard, StoryRow } from "@/components/article-card";
import { AdSlot, NewsletterForm } from "@/components/client";
import { Cover } from "@/components/cover";
import { MarketSnapshot } from "@/components/market-snapshot";
import { getHomeData, getPublicSettings } from "@/lib/data";

function DeskColumn({ title, href, articles, empty, accent }: { title: string; href: string; articles: Awaited<ReturnType<typeof getHomeData>>["ai"]; empty: string; accent: "neel" | "marigold" }) {
  return (
    <section aria-labelledby={`${href.slice(1)}-desk`}>
      <div className={`flex items-baseline justify-between border-b-2 pb-2 ${accent === "neel" ? "border-neel" : "border-marigold"}`}>
        <h2 id={`${href.slice(1)}-desk`} className="text-xl font-extrabold tracking-[-0.02em]">
          {title}
        </h2>
        <Link href={href} className="text-sm font-semibold text-ink-2 hover:text-ink hover:underline">
          All stories
        </Link>
      </div>
      {articles.length ? (
        <div className="divide-y divide-rule">
          {articles.map((a) => (
            <StoryRow key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-ink-2">{empty}</p>
      )}
    </section>
  );
}

export default async function HomePage() {
  const [data, settings] = await Promise.all([getHomeData(), getPublicSettings()]);
  const { featured } = data;
  const adClient = settings.ads.enabled && settings.ads.publisherId ? `ca-${settings.ads.publisherId}` : null;
  const publishLabel = settings.publishTimeIst === "21:00" ? "9:00 pm IST" : `${settings.publishTimeIst} IST`;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <AdSlot client={adClient} slot={settings.ads.slots.header} className="mb-0 mt-6" />

      {/* Featured story — the lead of the latest edition */}
      <section aria-label="Lead story" className="pt-8 sm:pt-10">
        <p className="text-sm font-medium text-ink-3">
          {data.editionDate ? (
            <>
              <Link href={`/edition/${data.editionDate}`} className="hover:text-ink hover:underline">
                Evening edition for {formatEditionDate(data.editionDate)}
              </Link>
            </>
          ) : (
            <>The evening edition publishes every day at {publishLabel}.</>
          )}
        </p>
        {featured ? (
          <article className="mt-4 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
            <Link href={articlePath(featured)} tabIndex={-1} aria-hidden="true" className="block aspect-[1.9/1] overflow-hidden rounded-lg lg:order-2 lg:aspect-auto lg:min-h-[340px]">
              <Cover seed={featured.slug} section={featured.section} priority />
            </Link>
            <div className="flex flex-col justify-center">
              <SectionLabel section={featured.section} />
              <h1 className="mt-2 text-[2.1rem] font-black leading-[1.06] tracking-[-0.035em] text-ink sm:text-[2.75rem] lg:text-[3.1rem]">
                <Link href={articlePath(featured)} className="hover:text-neel">
                  {featured.headline}
                </Link>
              </h1>
              <p className="mt-4 max-w-xl font-serif text-[1.2rem] leading-relaxed text-ink-2">{featured.excerpt}</p>
              <Meta article={featured} className="mt-4" />
            </div>
          </article>
        ) : (
          <div className="mt-4 max-w-2xl">
            <h1 className="text-[2.4rem] font-black leading-[1.05] tracking-[-0.035em] sm:text-[3rem]">AI and Indian markets, explained every evening.</h1>
            <p className="mt-4 font-serif text-[1.2rem] leading-relaxed text-ink-2">
              Each night at {publishLabel} we publish up to ten artificial-intelligence stories and up to ten Indian-market stories from the previous 24 hours, each one linked to its sources. The first edition has not been published yet.
            </p>
            <p className="mt-4">
              <Link href="/editorial-policy" className="font-semibold text-neel underline underline-offset-4">
                How the newsroom works
              </Link>
            </p>
          </div>
        )}
      </section>

      {/* Today's desks */}
      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <DeskColumn title="Today in AI" href="/ai" articles={data.ai} accent="neel" empty="AI stories from tonight's edition appear here after publication." />
        <DeskColumn title="Today in Indian markets" href="/markets" articles={data.markets} accent="marigold" empty="Market stories from tonight's edition appear here after publication." />
      </div>

      {/* Trending + market snapshot */}
      <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="trending-heading">
          <h2 id="trending-heading" className="border-b border-rule pb-2 text-xl font-extrabold tracking-[-0.02em]">
            Most read this week
          </h2>
          {data.trending.length ? (
            <ol className="divide-y divide-rule">
              {data.trending.map((a, i) => (
                <li key={a.id} className="grid grid-cols-[2.25rem_1fr] gap-3 py-4">
                  <span className="tabular text-2xl font-black leading-none text-neel" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <SectionLabel section={a.section} />
                    <h3 className="mt-0.5 font-bold leading-snug">
                      <Link href={articlePath(a)} className="hover:text-neel">
                        {a.headline}
                      </Link>
                    </h3>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-ink-2">Reading trends appear once articles have readers.</p>
          )}
        </section>
        <MarketSnapshot snapshot={data.snapshot} />
      </div>

      {/* Latest */}
      {data.latest.length > 0 && (
        <section aria-labelledby="latest-heading" className="mt-14">
          <h2 id="latest-heading" className="border-b border-rule pb-2 text-xl font-extrabold tracking-[-0.02em]">
            Latest
          </h2>
          <div className="mt-6 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {data.latest.map((a) => (
              <StoryCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section id="newsletter" aria-labelledby="newsletter-heading" className="mt-16 grid gap-6 rounded-lg bg-neel-soft p-6 sm:p-10 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <h2 id="newsletter-heading" className="text-2xl font-black tracking-[-0.03em]">
            The evening edition, in your inbox
          </h2>
          <p className="mt-2 font-serif text-lg leading-relaxed text-ink-2">One email a day after the {publishLabel} publication. Headlines, one-line summaries and links. No other mail.</p>
        </div>
        <NewsletterForm />
      </section>

      <AdSlot client={adClient} slot={settings.ads.slots.footer} />
    </div>
  );
}
