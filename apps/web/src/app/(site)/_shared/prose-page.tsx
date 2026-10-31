import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/site-chrome";

export function ProsePage({ title, lede, updated, children }: { title: string; lede?: string; updated?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: title }]} />
      <h1 className="mt-4 text-[2.2rem] font-black leading-[1.05] tracking-[-0.04em] sm:text-[2.8rem]">{title}</h1>
      {lede && <p className="mt-4 font-serif text-[1.25rem] leading-relaxed text-ink-2">{lede}</p>}
      {updated && <p className="mt-3 text-sm text-ink-3">Last updated {updated}</p>}
      <div className="prose-article mt-8 [&_h2]:mt-10">{children}</div>
    </div>
  );
}

export function ContactLine({ email, fallback }: { email: string | null; fallback: ReactNode }) {
  return email ? <a href={`mailto:${email}`}>{email}</a> : <>{fallback}</>;
}
