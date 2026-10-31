import type { JobStatus, JobType } from "@tdc/db";
import { addDays, addMinutes, istDateString, istWallTimeToUtc, istWeekday } from "../time/ist";

/**
 * The evening pipeline, as offsets from the publish time (default 21:00 IST):
 *   20:00 collect · 20:15 process · 20:25 rank · 20:30 research+write · 20:50 validate
 *   20:55 prepare edition · 21:00 publish · 21:05 sitemaps, report, digest
 * A stage starts at its slot *and* only once the previous stage has finished, so a slow
 * stage delays the rest instead of overlapping with it.
 */
export const PIPELINE: ReadonlyArray<{ type: JobType; offsetMin: number }> = [
  { type: "COLLECT", offsetMin: -60 },
  { type: "PROCESS", offsetMin: -45 },
  { type: "RANK", offsetMin: -35 },
  { type: "GENERATE", offsetMin: -30 },
  { type: "VALIDATE", offsetMin: -10 },
  { type: "PREPARE_EDITION", offsetMin: -5 },
  { type: "PUBLISH", offsetMin: 0 },
  { type: "POST_PUBLISH", offsetMin: 5 },
];

/** Weekday market snapshot after the 15:30 IST close. */
export const MARKET_SNAPSHOT_TIME_IST = "15:50";

const SKIP_REPORT_WINDOW_MS = 6 * 3_600_000;

const TERMINAL: ReadonlySet<JobStatus> = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "SKIPPED", "CANCELLED"]);

export interface ScheduledExecution {
  type: JobType;
  status: JobStatus;
}

export interface PlannedJob {
  type: JobType;
  editionDate: string;
  idempotencyKey: string;
  runAfter: Date;
  /** Set when the stage should be recorded as skipped instead of run. */
  skipReason?: string;
}

export function scheduledKey(type: JobType, editionDate: string): string {
  return `${type}:${editionDate}`;
}

export function stageTime(editionDate: string, publishTimeIst: string, type: JobType): Date {
  const stage = PIPELINE.find((s) => s.type === type);
  if (!stage) throw new Error(`${type} is not a pipeline stage`);
  return addMinutes(istWallTimeToUtc(editionDate, publishTimeIst), stage.offsetMin);
}

/**
 * The edition a given instant belongs to: the IST date whose pipeline window
 * (collection start … publish + grace) contains `now`, preferring the later one.
 */
export function activeEditionDate(now: Date, publishTimeIst: string, graceMin: number): string | null {
  const today = istDateString(now);
  for (const date of [addDays(today, 1), today, addDays(today, -1)]) {
    const publishAt = istWallTimeToUtc(date, publishTimeIst);
    const start = addMinutes(publishAt, PIPELINE[0]!.offsetMin);
    const end = addMinutes(publishAt, graceMin);
    if (now >= start && now <= end) return date;
  }
  return null;
}

/**
 * Decide which scheduled pipeline jobs to enqueue now. Pure: the caller supplies the
 * executions already recorded for the edition (scheduled ones, keyed by type).
 */
export function planPipeline(input: {
  now: Date;
  publishTimeIst: string;
  graceMin: number;
  executions: Map<string, ScheduledExecution[]>; // editionDate -> executions
}): PlannedJob[] {
  const { now, publishTimeIst, graceMin } = input;
  const planned: PlannedJob[] = [];
  const today = istDateString(now);

  for (const editionDate of [addDays(today, -1), today, addDays(today, 1)]) {
    const executions = input.executions.get(editionDate) ?? [];
    const byType = new Map(executions.map((e) => [e.type, e]));
    const publishAt = istWallTimeToUtc(editionDate, publishTimeIst);
    const collectAt = addMinutes(publishAt, PIPELINE[0]!.offsetMin);
    if (now < collectAt) continue;

    const lateCutoff = addMinutes(publishAt, graceMin);
    if (!byType.has("COLLECT")) {
      if (now > lateCutoff) {
        // Too late to produce an evening edition for this date. Record the miss once, but only
        // shortly after it happened, so a fresh deployment does not report long-past editions.
        if (now.getTime() - lateCutoff.getTime() <= SKIP_REPORT_WINDOW_MS) {
          planned.push({
            type: "COLLECT",
            editionDate,
            idempotencyKey: scheduledKey("COLLECT", editionDate),
            runAfter: now,
            skipReason: `Pipeline did not start before ${lateCutoff.toISOString()} (publish time + ${graceMin} min grace)`,
          });
        }
        continue;
      }
      planned.push({ type: "COLLECT", editionDate, idempotencyKey: scheduledKey("COLLECT", editionDate), runAfter: now });
      continue;
    }

    for (let i = 1; i < PIPELINE.length; i += 1) {
      const stage = PIPELINE[i]!;
      if (byType.has(stage.type)) continue;
      const previous = byType.get(PIPELINE[i - 1]!.type);
      if (!previous || !TERMINAL.has(previous.status)) break; // wait for the previous stage
      const at = addMinutes(publishAt, stage.offsetMin);
      if (now < at) break;
      planned.push({ type: stage.type, editionDate, idempotencyKey: scheduledKey(stage.type, editionDate), runAfter: now });
      break; // one stage at a time per edition
    }
  }
  return planned;
}

/** Weekday (Mon–Fri) post-close market snapshot. Exchange holidays simply return no new data. */
export function planMarketSnapshot(now: Date, existingKeys: Set<string>): PlannedJob | null {
  const date = istDateString(now);
  const weekday = istWeekday(date);
  if (weekday === 0 || weekday === 6) return null;
  const at = istWallTimeToUtc(date, MARKET_SNAPSHOT_TIME_IST);
  const key = scheduledKey("MARKET_SNAPSHOT", date);
  if (now < at || existingKeys.has(key)) return null;
  // Do not backfill a snapshot more than 5 hours late.
  if (now.getTime() - at.getTime() > 5 * 3_600_000) return null;
  return { type: "MARKET_SNAPSHOT", editionDate: date, idempotencyKey: key, runAfter: now };
}
