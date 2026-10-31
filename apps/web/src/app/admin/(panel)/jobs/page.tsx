import Link from "next/link";
import { getPrisma } from "@tdc/db";
import { JOB_LABELS } from "@tdc/core/pipeline/run";
import { PIPELINE } from "@tdc/core/pipeline/schedule";
import { loadSettings } from "@tdc/core/settings";
import { addMinutes, formatIstDateTime, formatIstTime, fromDbDate, istDateString, istWallTimeToUtc } from "@tdc/core/time/ist";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Empty, JobStatusBadge, PageHeader } from "@/components/admin/ui";
import { TriggerJobForm } from "@/components/admin/trigger-form";
import { Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from "@/components/ui/primitives";
import { cancelJob } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function JobsPage() {
  await requireUser("jobs:view");
  const prisma = getPrisma();
  const settings = await loadSettings(prisma);
  const today = istDateString();
  const jobs = await prisma.jobExecution.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { requestedBy: { select: { name: true } } } });
  const publishAt = istWallTimeToUtc(today, settings.publishTimeIst);
  return (
    <>
      <PageHeader title="Jobs" description="Execution history of the background worker. Failed stages retry automatically with backoff; you can rerun any stage manually." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          {jobs.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Stage</Th>
                  <Th>Edition</Th>
                  <Th>Status</Th>
                  <Th>Trigger</Th>
                  <Th>Attempts</Th>
                  <Th>Started</Th>
                  <Th>Duration</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <Td>
                      <Link href={`/admin/jobs/${j.id}`} className="font-semibold hover:text-neel">
                        {JOB_LABELS[j.type]}
                      </Link>
                      {j.error && <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-down">{j.error}</div>}
                    </Td>
                    <Td className="tabular">{j.editionDate ? fromDbDate(j.editionDate) : "—"}</Td>
                    <Td>
                      <JobStatusBadge status={j.status} />
                    </Td>
                    <Td className="text-xs text-ink-3">
                      {j.trigger.toLowerCase()}
                      {j.requestedBy ? ` by ${j.requestedBy.name}` : ""}
                    </Td>
                    <Td className="tabular">
                      {j.attempts}/{j.maxAttempts}
                    </Td>
                    <Td className="tabular whitespace-nowrap text-xs text-ink-3">{j.startedAt ? formatIstDateTime(j.startedAt) : "—"}</Td>
                    <Td className="tabular text-xs text-ink-3">{j.startedAt && j.finishedAt ? `${Math.max(1, Math.round((j.finishedAt.getTime() - j.startedAt.getTime()) / 1000))}s` : ""}</Td>
                    <Td>
                      {j.status === "QUEUED" && (
                        <ActionForm action={cancelJob}>
                          <input type="hidden" name="id" value={j.id} />
                          <SubmitButton size="sm" variant="ghost">
                            Cancel
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty>No jobs yet. The worker schedules the pipeline automatically.</Empty>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Run a stage manually</CardTitle>
            </CardHeader>
            <CardContent>
              <TriggerJobForm defaultDate={today} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tonight&apos;s schedule (IST)</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1 text-sm">
                {PIPELINE.map((s) => (
                  <li key={s.type} className="flex justify-between gap-3">
                    <span>{JOB_LABELS[s.type]}</span>
                    <span className="tabular text-ink-3">{formatIstTime(addMinutes(publishAt, s.offsetMin))}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-ink-3">Each stage also waits for the previous one to finish. Change the publish time in Settings.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
