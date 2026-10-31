import Link from "next/link";
import type { ArticleStatus, JobStatus } from "@tdc/db";
import { Badge } from "@/components/ui/primitives";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

const ARTICLE_TONE: Record<ArticleStatus, "neutral" | "good" | "bad" | "warn" | "info"> = {
  DRAFT: "neutral",
  NEEDS_REVIEW: "warn",
  APPROVED: "info",
  PUBLISHED: "good",
  REJECTED: "bad",
  FAILED: "bad",
  ARCHIVED: "neutral",
};

export function ArticleStatusBadge({ status }: { status: ArticleStatus }) {
  return <Badge tone={ARTICLE_TONE[status]}>{status.replace("_", " ").toLowerCase()}</Badge>;
}

const JOB_TONE: Record<JobStatus, "neutral" | "good" | "bad" | "warn" | "info"> = {
  QUEUED: "neutral",
  RUNNING: "info",
  SUCCEEDED: "good",
  PARTIAL: "warn",
  FAILED: "bad",
  SKIPPED: "neutral",
  CANCELLED: "neutral",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone={JOB_TONE[status]}>{status.toLowerCase()}</Badge>;
}

export function Stat({ label, value, href, note }: { label: string; value: React.ReactNode; href?: string; note?: string }) {
  const body = (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold text-ink-3">{label}</p>
      <p className="tabular mt-1 text-2xl font-black tracking-tight">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-3">{children}</p>;
}

export const usd = (n: number) => `$${n.toFixed(n < 10 ? 3 : 2)}`;
