import type { Metadata } from "next";
import { Suspense } from "react";
import { TokenActionForm } from "@/components/forms";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false } };

async function ConfirmForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  return <TokenActionForm kind="confirm" token={typeof token === "string" ? token : ""} />;
}

export default function ConfirmPage({ searchParams }: PageProps<"/newsletter/confirm">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-[-0.03em]">Confirm your subscription</h1>
      <p className="mt-3 text-ink-2">Press the button to start receiving the evening edition by email.</p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
          <ConfirmForm searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
