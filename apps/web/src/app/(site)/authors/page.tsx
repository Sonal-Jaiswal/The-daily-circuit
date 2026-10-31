import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site-chrome";
import { getAuthors } from "@/lib/data";

export const metadata: Metadata = {
  title: "Authors",
  description: "Who produces The Daily Circuit: the automated AI and markets desks, and how they work.",
  alternates: { canonical: "/authors" },
};

export default async function AuthorsPage() {
  const authors = await getAuthors();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Authors" }]} />
      <h1 className="mt-4 text-[2.4rem] font-black leading-none tracking-[-0.04em] sm:text-[3rem]">Authors</h1>
      <p className="mt-4 font-serif text-[1.2rem] leading-relaxed text-ink-2">
        Our stories are written by automated desks, not human reporters. Each desk is described below, along with how its work is checked.
      </p>
      <div className="mt-8 space-y-6">
        {authors.map((a) => (
          <section key={a.slug} id={a.slug} className="scroll-mt-24 rounded-lg border border-rule bg-surface p-6">
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">{a.name}</h2>
            <p className="mt-1 text-sm text-ink-3">
              {a.role}
              {a.isAutomated ? ", AI-generated content" : ""}. {a.published} published {a.published === 1 ? "article" : "articles"}.
            </p>
            <p className="mt-3 font-serif text-[1.08rem] leading-relaxed text-ink-2">{a.bio}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-ink-2">
        Read the{" "}
        <Link href="/editorial-policy" className="font-semibold text-neel underline underline-offset-4">
          editorial policy
        </Link>{" "}
        for the full process.
      </p>
    </div>
  );
}
