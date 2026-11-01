import { notFound } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { JOB_LABELS } from "@tdc/core/pipeline/run";
import { formatIstDateTime, fromDbDate } from "@tdc/core/time/ist";
import { JobStatusBadge, PageHeader, usd } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

export default async function JobDetail({ params }: PageProps<"/admin/jobs/[id]">) {
  await requireUser("jobs:view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const prisma = getPrisma();
  const job = await prisma.jobExecution.findUnique({ where: { id }, include: { logs: { orderBy: { createdAt: "asc" }, take: 500 } } });
  if (!job) notFound();
  const usage = await prisma.apiUsage.aggregate({ where: { jobId: id }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true });
  return (
    <>
      <PageHeader title={JOB_LABELS[job.type]} description={`${job.editionDate ? `Edition ${fromDbDate(job.editionDate)} · ` : ""}${job.trigger.toLowerCase()} · attempt ${job.attempts} of ${job.maxAttempts}`} actions={<JobStatusBadge status={job.status} />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Log</CardTitle>
          </CardHeader>
          <CardContent>
            {job.logs.length ? (
              <ol className="space-y-1 font-mono text-xs">
                {job.logs.map((l) => (
                  <li key={l.id} className={l.level === "error" ? "text-down" : l.level === "warn" ? "text-marigold-ink" : "text-ink-2"}>
                    <span className="text-ink-3">{formatIstDateTime(l.createdAt)}</span> [{l.level}] {l.message}
                    {l.data ? <pre className="ml-4 whitespace-pre-wrap text-ink-3">{JSON.stringify(l.data, null, 1).slice(0, 2000)}</pre> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-3">No log entries yet.</p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Created {formatIstDateTime(job.createdAt)}</p>
              {job.startedAt && <p>Started {formatIstDateTime(job.startedAt)}</p>}
              {job.finishedAt && <p>Finished {formatIstDateTime(job.finishedAt)}</p>}
              {job.lockedBy && <p className="text-ink-3">Worker {job.lockedBy}</p>}
              <p>
                AI model: {usage._count} call(s), {(usage._sum.inputTokens ?? 0).toLocaleString("en-IN")} in / {(usage._sum.outputTokens ?? 0).toLocaleString("en-IN")} out, {usd(Number(usage._sum.costUsd ?? 0))}
              </p>
              {job.error && <p className="whitespace-pre-wrap text-down">{job.error}</p>}
            </CardContent>
          </Card>
          {job.result && (
            <Card>
              <CardHeader>
                <CardTitle>Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap font-mono text-xs text-ink-2">{JSON.stringify(job.result, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
