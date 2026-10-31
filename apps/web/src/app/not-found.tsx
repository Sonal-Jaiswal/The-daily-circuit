import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold text-neel">404</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.03em]">This page does not exist</h1>
      <p className="mt-3 text-ink-2">The link may be mistyped, or the article may have been withdrawn. Every published story is listed in its section and in the daily edition archive.</p>
      <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/" className="rounded-md bg-neel px-4 py-2.5 text-surface">
          Go to the homepage
        </Link>
        <Link href="/edition" className="rounded-md border border-rule px-4 py-2.5">
          Browse editions
        </Link>
      </div>
    </main>
  );
}
