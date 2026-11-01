import Link from "next/link";
import { cacheLife } from "next/cache";
import { aiModelsLabel, FOOTER_LINKS, NAV, SITE } from "@/lib/site";
import { MobileMenu, NavLinks, ThemeToggle } from "./client";

export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--neel)" />
      <path d="M7 21h7l5-5h6" fill="none" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 12h5" fill="none" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
      <circle cx="25" cy="16" r="3.2" fill="var(--marigold)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="relative border-b border-rule bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name}, home`}>
          <Logomark className="size-8" />
          <span className="text-[1.375rem] font-black leading-none tracking-[-0.035em] text-ink sm:text-[1.5rem]">{SITE.name}</span>
        </Link>
        <nav aria-label="Sections" className="hidden lg:block">
          <NavLinks items={NAV} className="flex items-center gap-0.5" />
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/#newsletter" className="hidden h-9 items-center rounded-md bg-neel px-3.5 text-sm font-semibold text-surface sm:inline-flex">
            Get the edition
          </Link>
          <ThemeToggle />
          <MobileMenu items={NAV} />
        </div>
      </div>
    </header>
  );
}

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getUTCFullYear()}</>;
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2.5">
            <Logomark className="size-7" />
            <span className="text-lg font-black tracking-[-0.03em]">{SITE.name}</span>
          </Link>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">
            An automated newsroom. Articles are researched and drafted with {aiModelsLabel()} from the sources linked in each story, checked by automated validation, and held for an editor when a check fails.
          </p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">Nothing on this site is investment advice.</p>
        </div>
        <nav aria-label="Publication">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-2 hover:text-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-rule">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-ink-3 sm:px-6">
          © <CopyrightYear /> {SITE.name}. Source material belongs to its publishers and is linked, not reproduced.
        </p>
      </div>
    </footer>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  // Escaped so a value containing "</script>" cannot break out of the tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function Breadcrumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[0.8125rem] text-ink-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-ink hover:underline">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="line-clamp-1 text-ink-2">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
