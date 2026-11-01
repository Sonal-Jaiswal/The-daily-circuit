"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { Check, Link2, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="data-theme" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const subscribeNoop = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const order = ["light", "dark", "system"] as const;
  const current = mounted ? ((theme as (typeof order)[number]) ?? "light") : "light";
  const next = order[(order.indexOf(current) + 1) % order.length]!;
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex size-9 items-center justify-center rounded-md text-ink-2 hover:bg-neel-soft hover:text-ink"
      aria-label={`Colour theme: ${current}. Switch to ${next}.`}
      title={`Theme: ${current}`}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}

export function NavLinks({ items, className, onNavigate }: { items: ReadonlyArray<{ href: string; label: string }>; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap rounded-md px-2.5 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink",
                active && "text-ink underline decoration-neel decoration-2 underline-offset-[10px]",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileMenu({ items }: { items: ReadonlyArray<{ href: string; label: string }> }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="group lg:hidden">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border border-rule px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Menu</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <nav aria-label="Sections" className="absolute inset-x-0 top-full z-40 border-b border-rule bg-paper px-4 pb-4 shadow-sm">
        <NavLinks items={items} className="flex flex-col gap-1 pt-2" onNavigate={() => ref.current?.removeAttribute("open")} />
      </nav>
    </details>
  );
}

// ─── Consent-gated analytics and advertising ────────────────────────────────

type Consent = "granted" | "denied" | null;
const CONSENT_KEY = "tdc-consent-v1";

function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    adsbygoogle?: unknown[];
  }
}

/**
 * Google Consent Mode v2 defaults to "denied". GA4 and AdSense scripts load only after the
 * visitor accepts. With neither configured, no banner is shown and no third-party script loads.
 */
export function ConsentAndAnalytics({ gaId, adsenseClient }: { gaId: string | null; adsenseClient: string | null }) {
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setConsent(readConsent());
    setReady(true);
  }, []);
  if (!gaId && !adsenseClient) return null;

  const choose = (value: "granted" | "denied") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* storage blocked: the choice applies to this page view only */
    }
    window.gtag?.("consent", "update", { analytics_storage: value, ad_storage: value, ad_user_data: value, ad_personalization: value });
    setConsent(value);
  };

  return (
    <>
      {consent === "granted" && gaId && (
        <>
          {/* Consent Mode defaults are set before any tag runs, then updated to the visitor's choice. */}
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`} strategy="afterInteractive" />
        </>
      )}
      {consent === "granted" && adsenseClient && (
        <Script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`} crossOrigin="anonymous" strategy="afterInteractive" />
      )}
      {ready && consent === null && (
        <div role="dialog" aria-live="polite" aria-label="Cookie preferences" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-rule bg-surface p-4 shadow-lg sm:inset-x-6">
          <p className="text-sm leading-relaxed text-ink-2">
            We use cookies for audience measurement{adsenseClient ? " and advertising" : ""} only if you allow it. Essential cookies are always on.{" "}
            <Link href="/privacy-policy" className="text-neel underline underline-offset-2">
              Privacy policy
            </Link>
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => choose("granted")} className="h-9 rounded-md bg-neel px-4 text-sm font-semibold text-surface">
              Allow cookies
            </button>
            <button type="button" onClick={() => choose("denied")} className="h-9 rounded-md border border-rule px-4 text-sm font-semibold">
              Essential only
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Renders nothing unless an approved AdSense publisher and slot ID are configured. */
export function AdSlot({ client, slot, label = "Advertisement", className }: { client: string | null; slot: string | undefined; label?: string; className?: string }) {
  const pushed = useRef(false);
  const consented = useSyncExternalStore(subscribeNoop, () => readConsent() === "granted", () => false);
  useEffect(() => {
    if (!client || !slot || !consented || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blocked or script unavailable: the layout does not depend on it */
    }
  }, [client, slot, consented]);
  if (!client || !slot || !consented) return null;
  return (
    <aside aria-label={label} className={cn("my-8", className)}>
      <p className="mb-1 text-[0.6875rem] text-ink-3">{label}</p>
      <ins className="adsbygoogle block" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}

// ─── Reader interactions ────────────────────────────────────────────────────

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ status: "sending" });
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), consent: form.get("consent") === "on", website: form.get("website") }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      setState(res.ok ? { status: "done", message: body.message } : { status: "error", message: body.error ?? "Subscription failed. Try again in a minute." });
    } catch {
      setState({ status: "error", message: "We couldn't reach the server. Check your connection and try again." });
    }
  }
  if (state.status === "done") {
    return (
      <p role="status" className="text-base font-medium text-ink">
        {state.message ?? "Check your inbox and confirm your address to start receiving the evening edition."}
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="w-full" noValidate={false}>
      <div className={cn("flex gap-2", compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row")}>
        <label htmlFor={compact ? "nl-email-c" : "nl-email"} className="sr-only">
          Email address
        </label>
        <input
          id={compact ? "nl-email-c" : "nl-email"}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11 min-w-0 flex-1 rounded-md border border-rule bg-surface px-3 text-base text-ink placeholder:text-ink-3"
        />
        {/* Honeypot: real readers never see or fill this field. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <button type="submit" disabled={state.status === "sending"} className="h-11 rounded-md bg-neel px-5 text-sm font-semibold text-surface disabled:opacity-60">
          {state.status === "sending" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="consent" required className="mt-1 size-4 accent-[var(--neel)]" />
        <span>Send me the evening edition. I can unsubscribe from any email.</span>
      </label>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-sm text-down">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function ViewBeacon({ articleId }: { articleId: string }) {
  useEffect(() => {
    const key = `tdc-viewed-${articleId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still count the view */
    }
    const body = JSON.stringify({ articleId });
    if (!navigator.sendBeacon?.("/api/views", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/views", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  }, [articleId]);
  return null;
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link", url);
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rule px-3 text-sm font-medium hover:bg-neel-soft"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
