import type { Metadata } from "next";
import Link from "next/link";
import { formatEditionDate } from "@tdc/core/time/ist";
import { Breadcrumbs } from "@/components/site-chrome";
import { getEditions } from "@/lib/data";

export const metadata: Metadata = {
  title: "Daily Edition",
  description: "Every evening edition of The Daily Circuit: the AI and Indian-market stories published each night at 9:00 pm IST.",
  alternates: { canonical: "/edition" },
};

export default async function EditionsPage() {
  const editions = await getEditions();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Daily Edition" }]} />
      <h1 className="mt-4 text-[2.4rem] font-black leading-none tracking-[-0.04em] sm:text-[3rem]">The evening edition</h1>
      <p className="mt-4 font-serif text-[1.2rem] leading-relaxed text-ink-2">
        One edition a day, published at 9:00 pm IST, covering the previous 24 hours. When fewer than ten stories meet our standard, we publish fewer.
      </p>
      {editions.length ? (
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {editions.map((e) => (
            <li key={e.date}>
              <Link href={`/edition/${e.date}`} className="flex flex-col gap-1 py-4 hover:text-neel sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-lg font-bold">{formatEditionDate(e.date)}</span>
                <span className="tabular text-sm text-ink-3">
                  {e.aiCount} AI / {e.marketCount} markets
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-lg border border-rule bg-surface p-5 text-ink-2">The first edition has not been published yet. It will appear here after 9:00 pm IST.</p>
      )}
    </div>
  );
}
