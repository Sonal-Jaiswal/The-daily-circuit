import { Prisma, type JobExecution, type JobTrigger, type JobType, type PrismaClient } from "@tdc/db";
import { toDbDate } from "../time/ist";
import { backoffDelay } from "../util/retry";

export interface EnqueueInput {
  type: JobType;
  editionDate?: string | null;
  trigger?: JobTrigger;
  idempotencyKey?: string | null;
  payload?: Prisma.InputJsonValue;
  requestedById?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
  parentId?: string | null;
}

/** Enqueue a job. With an idempotency key, a second enqueue returns the existing job instead. */
export async function enqueueJob(prisma: PrismaClient, input: EnqueueInput): Promise<{ job: JobExecution; created: boolean }> {
  const data = {
    type: input.type,
    trigger: input.trigger ?? "SCHEDULE",
    editionDate: input.editionDate ? toDbDate(input.editionDate) : null,
    idempotencyKey: input.idempotencyKey ?? null,
    payload: input.payload ?? Prisma.JsonNull,
    requestedById: input.requestedById ?? null,
    runAfter: input.runAfter ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
    parentId: input.parentId ?? null,
  };
  try {
    const job = await prisma.jobExecution.create({ data });
    return { job, created: true };
  } catch (error) {
    if (input.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const job = await prisma.jobExecution.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      return { job, created: false };
    }
    throw error;
  }
}

/** Record a scheduled stage as skipped (idempotent). */
export async function recordSkipped(prisma: PrismaClient, input: EnqueueInput & { reason: string }): Promise<JobExecution> {
  const { job, created } = await enqueueJob(prisma, { ...input, runAfter: new Date(8.64e15) });
  if (!created) return job;
  return prisma.jobExecution.update({
    where: { id: job.id },
    data: { status: "SKIPPED", error: input.reason, finishedAt: new Date() },
  });
}

/**
 * Atomically claim the next runnable job. `FOR UPDATE SKIP LOCKED` lets several workers
 * poll the same table without ever running a job twice.
 */
export async function claimNextJob(prisma: PrismaClient, workerId: string): Promise<JobExecution | null> {
  // Compare with application time, the same clock that wrote `runAfter`; the database clock
  // can drift from the app servers' by more than the time between enqueue and claim.
  const now = new Date();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "JobExecution"
       SET "status" = 'RUNNING'::"JobStatus",
           "lockedBy" = ${workerId},
           "lockedAt" = ${now},
           "heartbeatAt" = ${now},
           "startedAt" = COALESCE("startedAt", ${now}),
           "attempts" = "attempts" + 1,
           "updatedAt" = ${now}
     WHERE "id" = (
       SELECT "id" FROM "JobExecution"
        WHERE "status" = 'QUEUED'::"JobStatus" AND "runAfter" <= ${now}
        ORDER BY "runAfter" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
  RETURNING "id"`;
  const id = rows[0]?.id;
  return id ? prisma.jobExecution.findUnique({ where: { id } }) : null;
}

export async function heartbeat(prisma: PrismaClient, jobId: string, workerId: string): Promise<void> {
  await prisma.jobExecution.updateMany({ where: { id: jobId, lockedBy: workerId, status: "RUNNING" }, data: { heartbeatAt: new Date() } });
}

export async function completeJob(
  prisma: PrismaClient,
  jobId: string,
  outcome: { status: "SUCCEEDED" | "PARTIAL" | "SKIPPED"; result?: Prisma.InputJsonValue; error?: string | null },
): Promise<JobExecution> {
  return prisma.jobExecution.update({
    where: { id: jobId },
    data: { status: outcome.status, result: outcome.result ?? Prisma.JsonNull, error: outcome.error ?? null, finishedAt: new Date(), lockedBy: null, lockedAt: null },
  });
}

/**
 * Record a failure. If attempts remain the job is re-queued with exponential backoff;
 * otherwise it is marked FAILED and `final` is true so the caller can alert.
 */
export async function failJob(prisma: PrismaClient, job: JobExecution, error: unknown): Promise<{ job: JobExecution; final: boolean }> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (job.attempts < job.maxAttempts) {
    const delay = backoffDelay(job.attempts, 30_000, 10 * 60_000);
    const updated = await prisma.jobExecution.update({
      where: { id: job.id },
      data: { status: "QUEUED", error: message, runAfter: new Date(Date.now() + delay), lockedBy: null, lockedAt: null },
    });
    return { job: updated, final: false };
  }
  const updated = await prisma.jobExecution.update({
    where: { id: job.id },
    data: { status: "FAILED", error: message, finishedAt: new Date(), lockedBy: null, lockedAt: null },
  });
  return { job: updated, final: true };
}

/** Jobs whose worker died mid-run (no heartbeat) go back to the queue. */
export async function recoverStaleJobs(prisma: PrismaClient, staleAfterMs = 10 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const res = await prisma.jobExecution.updateMany({
    where: { status: "RUNNING", heartbeatAt: { lt: cutoff } },
    data: { status: "QUEUED", lockedBy: null, lockedAt: null, error: "Recovered after worker stopped responding", runAfter: new Date() },
  });
  return res.count;
}

export async function cancelQueuedJob(prisma: PrismaClient, jobId: string): Promise<boolean> {
  const res = await prisma.jobExecution.updateMany({ where: { id: jobId, status: "QUEUED" }, data: { status: "CANCELLED", finishedAt: new Date() } });
  return res.count === 1;
}

export async function appendJobLog(
  prisma: PrismaClient,
  jobId: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await prisma.jobLog.create({ data: { jobId, level, message, data: data ? (JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue) : Prisma.JsonNull } });
}
