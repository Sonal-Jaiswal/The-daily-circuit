import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deskForSection } from "@tdc/core/content/paths";
import { formatEditionDate, formatIstTime, isValidDateString } from "@tdc/core/time/ist";
import { StoryRow } from "@/components/article-card";
import { Breadcrumbs } from "@/components/site-chrome";
import { getEditionPage, getEditions } from "@/lib/data";

export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const editions = await getEditions();
  return editions.length ? editions.slice(0, 14).map((e) => ({ date: e.date })) : [{ date: "2000-01-01" }];
}

export async function generateMetadata({ params }: PageProps<"/edition/[date]">): Promise<Metadata> {
  const { date } = await params;
  const e = isValidDateString(date) ? await getEditionPage(date) : null;
  if (!e) return { title: "Edition not found", robots: { index: false, follow: false } };
  return {
    title: e.title,
    description: `${e.aiCount} AI and ${e.marketCount} Indian-market stories from the evening edition of ${formatEditionDate(date)}.`,
    alternates: { canonical: `/edition/${date}` },
  };
}

export default async function EditionPage({ params }: PageProps<"/edition/[date]">) {
  const { date } = await params;
  if (!isValidDateString(date)) notFound();
  const e = await getEditionPage(date);
  if (!e || e.articles.length === 0) notFound();
  const ai = e.articles.filter((a) => deskForSection(a.section) === "AI");
  const markets = e.articles.filter((a) => deskForSection(a.section) === "MARKETS");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Daily Edition", href: "/edition" }, { name: formatEditionDate(date) }]} />
      <header className="mt-4 max-w-3xl">
        <h1 className="text-[2.4rem] font-black leading-[1.02] tracking-[-0.04em] sm:text-[3rem]">{e.title}</h1>
        <p className="mt-3 text-ink-2">
          {formatEditionDate(date)}. {e.publishedAt ? `Published at ${formatIstTime(e.publishedAt)}.` : ""} {e.aiCount} AI {e.aiCount === 1 ? "story" : "stories"} and {e.marketCount} market{" "}
          {e.marketCount === 1 ? "story" : "stories"}.
        </p>
      </header>
      <div className="mt-10 grid gap-12 lg:grid-cols-2">
        {[
          { title: "Artificial intelligence and technology", items: ai, border: "border-neel" },
          { title: "Indian markets", items: markets, border: "border-marigold" },
        ].map((col) => (
          <section key={col.title} aria-label={col.title}>
            <h2 className={`border-b-2 ${col.border} pb-2 text-xl font-extrabold tracking-[-0.02em]`}>{col.title}</h2>
            {col.items.length ? (
              <div className="divide-y divide-rule">
                {col.items.map((a) => (
                  <StoryRow key={a.id} article={a} />
                ))}
              </div>
            ) : (
              <p className="py-6 text-ink-2">No stories met our selection threshold for this desk in this edition.</p>
            )}
          </section>
        ))}
      </div>
      <p className="mt-10">
        <Link href="/edition" className="font-semibold text-neel underline underline-offset-4">
          All editions
        </Link>
      </p>
    </div>
  );
}
