import type { Metadata } from "next";
import { Suspense } from "react";
import { TokenActionForm } from "@/components/forms";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

async function UnsubscribeForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return <TokenActionForm kind="unsubscribe" token={typeof token === "string" ? token : ""} />;
}

export default function UnsubscribePage({ searchParams }: PageProps<"/newsletter/unsubscribe">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-[-0.03em]">Unsubscribe from the evening edition</h1>
      <p className="mt-3 text-ink-2">You will stop receiving our emails immediately.</p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
          <UnsubscribeForm searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
