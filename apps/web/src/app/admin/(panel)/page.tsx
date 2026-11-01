import Link from "next/link";
import { getPrisma } from "@tdc/db";
import { loadSettings } from "@tdc/core/settings";
import { stageTime } from "@tdc/core/pipeline/schedule";
import { addDays, formatIstDateTime, fromDbDate, istDateString } from "@tdc/core/time/ist";
import { ArticleStatusBadge, Empty, JobStatusBadge, PageHeader, Stat, usd } from "@/components/admin/ui";
import { TriggerJobForm } from "@/components/admin/trigger-form";
import { Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

export default async function Overview({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser("dashboard:view");
  const { denied } = await searchParams;
  const prisma = getPrisma();
  const settings = await loadSettings(prisma);
  const now = new Date();
  const today = istDateString(now);
  const nextEdition = stageTime(today, settings.publishTimeIst, "PUBLISH") > now ? today : addDays(today, 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [byStatus, editions, jobs, spend, failingSources, review] = await Promise.all([
    prisma.article.groupBy({ by: ["status"], _count: true }),
    prisma.dailyEdition.findMany({ orderBy: { editionDate: "desc" }, take: 14 }),
    prisma.jobExecution.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.apiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
    prisma.newsSource.findMany({ where: { isEnabled: true, consecutiveFailures: { gte: 3 } }, select: { id: true, name: true, lastError: true, consecutiveFailures: true } }),
    prisma.article.findMany({ where: { status: "NEEDS_REVIEW" }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, headline: true, status: true, reviewFlags: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const spent = Number(spend._sum.costUsd ?? 0);

  return (
    <>
      <PageHeader title={`Good to see you, ${user.name.split(" ")[0]}`} description={`Next edition: ${nextEdition}, publishing at ${formatIstDateTime(stageTime(nextEdition, settings.publishTimeIst, "PUBLISH"))}. Collection starts an hour earlier.`} />
      {denied && <p className="mb-4 rounded-md bg-marigold-soft p-3 text-sm text-marigold-ink">Your role does not have access to that page.</p>}
      <p className="mb-4 text-xs text-ink-3">
        Articles are written by the background runner using {process.env.LLM_PROVIDER === "gemini" ? "Google Gemini" : "Anthropic Claude"}. Its API key lives with the runner (GitHub Actions secrets), not this website.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Published" value={count("PUBLISHED")} href="/admin/articles?status=PUBLISHED" />
        <Stat label="Needs review" value={count("NEEDS_REVIEW")} href="/admin/articles?status=NEEDS_REVIEW" />
        <Stat label="Approved, scheduled" value={count("APPROVED")} href="/admin/articles?status=APPROVED" />
        <Stat label="Drafts" value={count("DRAFT")} href="/admin/articles?status=DRAFT" />
        <Stat label="Failed" value={count("FAILED")} href="/admin/articles?status=FAILED" />
        <Stat label="AI spend this month" value={usd(spent)} note={`of $${settings.monthlyBudgetUsd} budget`} href="/admin/usage" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Daily publication history</CardTitle>
          </CardHeader>
          <CardContent>
            {editions.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Edition</Th>
                    <Th>Status</Th>
                    <Th>AI</Th>
                    <Th>Markets</Th>
                    <Th>Review / failed</Th>
                    <Th>Published</Th>
                  </tr>
                </thead>
                <tbody>
                  {editions.map((e) => {
                    const stats = (e.stats as { needsReview?: number; failed?: number } | null) ?? {};
                    return (
                      <tr key={e.id}>
                        <Td>
                          <Link className="font-semibold text-neel hover:underline" href={`/admin/candidates?date=${fromDbDate(e.editionDate)}`}>
                            {fromDbDate(e.editionDate)}
                          </Link>
                        </Td>
                        <Td>{e.status.toLowerCase()}</Td>
                        <Td className="tabular">{e.aiCount}</Td>
                        <Td className="tabular">{e.marketCount}</Td>
                        <Td className="tabular">
                          {stats.needsReview ?? 0} / {stats.failed ?? 0}
                        </Td>
                        <Td className="tabular text-ink-3">{e.publishedAt ? formatIstDateTime(e.publishedAt) : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <Empty>No editions yet. The first runs automatically at {settings.publishTimeIst} IST.</Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Run a pipeline stage</CardTitle>
          </CardHeader>
          <CardContent>
            <TriggerJobForm defaultDate={today} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for an editor</CardTitle>
          </CardHeader>
          <CardContent>
            {review.length ? (
              <ul className="divide-y divide-border">
                {review.map((a) => (
                  <li key={a.id} className="py-3">
                    <Link href={`/admin/articles/${a.id}`} className="font-semibold hover:text-neel">
                      {a.headline}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
                      <ArticleStatusBadge status={a.status} />
                      <span className="line-clamp-1">{a.reviewFlags[0]}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing waiting for review.</Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length ? (
              <ul className="divide-y divide-border text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/jobs/${j.id}`} className="font-medium hover:text-neel">
                      {j.type} {j.editionDate ? fromDbDate(j.editionDate) : ""}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-3">{j.trigger.toLowerCase()}</span>
                      <JobStatusBadge status={j.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No jobs have run yet.</Empty>
            )}
            {failingSources.length > 0 && (
              <div className="mt-4 rounded-md bg-marigold-soft p-3 text-sm text-marigold-ink">
                <p className="font-semibold">Sources failing repeatedly</p>
                <ul className="mt-1 list-disc pl-5">
                  {failingSources.map((s) => (
                    <li key={s.id}>
                      {s.name} ({s.consecutiveFailures}×): {s.lastError}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
