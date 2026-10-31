import type { PrismaClient } from "@tdc/db";
import type { Logger } from "../logger";
import { planMarketSnapshot, planPipeline, scheduledKey, type ScheduledExecution } from "../pipeline/schedule";
import { loadSettings } from "../settings";
import { addDays, fromDbDate, istDateString, toDbDate } from "../time/ist";
import { enqueueJob, recordSkipped } from "./queue";

/**
 * One scheduler pass: enqueue whichever pipeline stages are due. Safe to run from several
 * workers at once — the unique idempotency key means each stage is created exactly once.
 */
export async function schedulerTick(prisma: PrismaClient, options: { now?: Date; log: Logger; marketDataEnabled: boolean }) {
  const now = options.now ?? new Date();
  const settings = await loadSettings(prisma);
  const today = istDateString(now);
  const dates = [addDays(today, -1), today, addDays(today, 1)];
  const rows = await prisma.jobExecution.findMany({
    where: { editionDate: { in: dates.map(toDbDate) }, idempotencyKey: { not: null }, trigger: { in: ["SCHEDULE", "RETRY"] } },
    select: { type: true, status: true, editionDate: true, idempotencyKey: true },
  });
  const executions = new Map<string, ScheduledExecution[]>();
  for (const r of rows) {
    if (!r.editionDate) continue;
    const key = fromDbDate(r.editionDate);
    const list = executions.get(key) ?? [];
    list.push({ type: r.type, status: r.status });
    executions.set(key, list);
  }
  const plans = planPipeline({ now, publishTimeIst: settings.publishTimeIst, graceMin: settings.latePublishGraceMin, executions });
  const enqueued: string[] = [];
  for (const plan of plans) {
    if (plan.skipReason) {
      await recordSkipped(prisma, { type: plan.type, editionDate: plan.editionDate, idempotencyKey: plan.idempotencyKey, reason: plan.skipReason });
      options.log.warn("Edition skipped", { editionDate: plan.editionDate, reason: plan.skipReason });
      continue;
    }
    const { created } = await enqueueJob(prisma, { type: plan.type, editionDate: plan.editionDate, idempotencyKey: plan.idempotencyKey, runAfter: plan.runAfter });
    if (created) enqueued.push(plan.idempotencyKey);
  }
  if (options.marketDataEnabled) {
    const keys = new Set(rows.map((r) => r.idempotencyKey!).filter(Boolean));
    const snap = planMarketSnapshot(now, keys);
    if (snap) {
      const { created } = await enqueueJob(prisma, { type: snap.type, editionDate: snap.editionDate, idempotencyKey: snap.idempotencyKey, runAfter: snap.runAfter, maxAttempts: 2 });
      if (created) enqueued.push(snap.idempotencyKey);
    }
  }
  if (enqueued.length) options.log.info("Scheduled jobs enqueued", { keys: enqueued });
  return enqueued;
}

export { scheduledKey };
