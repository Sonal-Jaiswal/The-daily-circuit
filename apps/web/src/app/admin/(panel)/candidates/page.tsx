import Link from "next/link";
import { getPrisma, type CandidateStatus, type Desk } from "@tdc/db";
import { formatIstDateTime, isValidDateString, istDateString, toDbDate } from "@tdc/core/time/ist";
import { Empty, PageHeader } from "@/components/admin/ui";
import { Badge, Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

const TONE: Partial<Record<CandidateStatus, "good" | "bad" | "warn" | "info" | "neutral">> = {
  SELECTED: "good",
  USED: "good",
  NOT_SELECTED: "neutral",
  STALE: "warn",
  DUPLICATE: "warn",
  IRRELEVANT: "neutral",
  CLASSIFIED: "info",
  NEW: "info",
};

export default async function CandidatesPage({ searchParams }: PageProps<"/admin/candidates">) {
  await requireUser("candidates:view");
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isValidDateString(sp.date) ? sp.date : istDateString();
  const desk: Desk = sp.desk === "MARKETS" ? "MARKETS" : "AI";
  const prisma = getPrisma();
  const [candidates, counts] = await Promise.all([
    prisma.newsCandidate.findMany({
      where: { editionDate: toDbDate(date), desk },
      orderBy: [{ totalScore: { sort: "desc", nulls: "last" } }, { collectedAt: "desc" }],
      take: 300,
      include: { source: { select: { name: true, kind: true } } },
    }),
    prisma.newsCandidate.groupBy({ by: ["status"], where: { editionDate: toDbDate(date), desk }, _count: true }),
  ]);
  return (
    <>
      <PageHeader title="News candidates" description="Every collected item for an edition, with its publication time, status and the ranking explanation stored by the selection agent." />
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/candidates">
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Edition</span>
          <input type="date" name="date" defaultValue={date} className="h-9 rounded-md border border-border bg-surface px-3" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">Desk</span>
          <select name="desk" defaultValue={desk} className="h-9 rounded-md border border-border bg-surface px-3">
            <option value="AI">AI and technology</option>
            <option value="MARKETS">Indian markets</option>
          </select>
        </label>
        <button className="h-9 rounded-md bg-neel px-4 text-sm font-semibold text-surface">Show</button>
        <p className="ml-auto text-sm text-ink-3">
          {counts.map((c) => `${c.status.toLowerCase().replace("_", " ")}: ${c._count}`).join(" · ") || "No candidates"}
        </p>
      </form>
      {candidates.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Headline</Th>
              <Th>Source</Th>
              <Th>Published</Th>
              <Th>Status</Th>
              <Th>Score</Th>
              <Th>Explanation</Th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <Td className="max-w-sm">
                  <a href={c.originalUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-neel">
                    {c.originalHeadline}
                  </a>
                  {c.isClusterPrimary && <span className="ml-1 text-xs text-up">lead</span>}
                </Td>
                <Td className="whitespace-nowrap">{c.source.name}</Td>
                <Td className="tabular whitespace-nowrap text-xs text-ink-3">
                  {c.publishedAt ? formatIstDateTime(c.publishedAt) : "unknown"}
                  <div>{c.publishedAtSource.toLowerCase().replace("_", " ")}</div>
                </Td>
                <Td>
                  <Badge tone={TONE[c.status] ?? "neutral"}>{c.status.toLowerCase().replace("_", " ")}</Badge>
                </Td>
                <Td className="tabular">{c.totalScore?.toFixed(2) ?? "—"}</Td>
                <Td className="max-w-md text-xs text-ink-2">{c.rankingExplanation ?? (c.classification as { rationale?: string } | null)?.rationale ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>
          No candidates for {date}. Collection runs at 8:00 pm IST, or start it from the <Link href="/admin/jobs" className="text-neel underline">jobs page</Link>.
        </Empty>
      )}
    </>
  );
}
