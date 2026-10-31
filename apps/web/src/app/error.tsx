"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-[-0.03em]">This page could not be loaded</h1>
      <p className="mt-3 text-ink-2">Something went wrong on our side. Try again, or come back in a few minutes.{error.digest ? ` Reference: ${error.digest}.` : ""}</p>
      <div className="mt-6 flex gap-3 text-sm font-semibold">
        <button type="button" onClick={reset} className="rounded-md bg-neel px-4 py-2.5 text-surface">
          Try again
        </button>
        <Link href="/" className="rounded-md border border-rule px-4 py-2.5">
          Go to the homepage
        </Link>
      </div>
    </main>
  );
}
