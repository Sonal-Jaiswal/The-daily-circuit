import { describe, expect, it } from "vitest";
import type { JobStatus, JobType } from "@tdc/db";
import { activeEditionDate, planMarketSnapshot, planPipeline, stageTime } from "../../src/pipeline/schedule";
import { formatIstDateTime, istDateString, istWallTimeToUtc, toDbDate } from "../../src/time/ist";

const ist = (date: string, hhmm: string) => istWallTimeToUtc(date, hhmm);
const execs = (date: string, list: Array<[JobType, JobStatus]>) => new Map([[date, list.map(([type, status]) => ({ type, status }))]]);
const plan = (now: Date, executions = new Map(), publishTimeIst = "21:00", graceMin = 180) => planPipeline({ now, publishTimeIst, graceMin, executions });

describe("IST time helpers", () => {
  it("maps IST wall-clock time to UTC (UTC+05:30, no DST)", () => {
    expect(ist("2026-11-01", "21:00").toISOString()).toBe("2026-11-01T15:30:00.000Z");
    expect(ist("2026-06-15", "00:30").toISOString()).toBe("2026-06-14T19:00:00.000Z");
  });

  it("derives the IST calendar date at the UTC 18:30 boundary", () => {
    expect(istDateString(new Date("2026-11-01T18:29:59Z"))).toBe("2026-11-01");
    expect(istDateString(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02");
  });

  it("stores edition dates as UTC-midnight Date values", () => {
    expect(toDbDate("2026-11-01").toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(() => toDbDate("2026-02-30")).toThrow();
  });

  it("formats for editorial display in IST", () => {
    expect(formatIstDateTime(new Date("2026-11-01T15:30:00Z"))).toMatch(/1 Nov 2026, 9:00\s?pm IST/i);
  });
});

describe("pipeline schedule planner", () => {
  const D = "2026-11-01";

  it("does nothing before 20:00 IST", () => {
    expect(plan(ist(D, "19:59"))).toEqual([]);
  });

  it("starts collection at 20:00 IST", () => {
    const p = plan(ist(D, "20:00"));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ type: "COLLECT", editionDate: D, idempotencyKey: `COLLECT:${D}` });
  });

  it("does not enqueue a stage twice", () => {
    expect(plan(ist(D, "20:05"), execs(D, [["COLLECT", "RUNNING"]]))).toEqual([]);
  });

  it("waits for the stage's time slot even when the previous stage finished early", () => {
    expect(plan(ist(D, "20:10"), execs(D, [["COLLECT", "SUCCEEDED"]]))).toEqual([]);
    expect(plan(ist(D, "20:15"), execs(D, [["COLLECT", "SUCCEEDED"]]))[0]?.type).toBe("PROCESS");
  });

  it("waits for the previous stage to finish even when the slot has passed", () => {
    expect(plan(ist(D, "20:40"), execs(D, [["COLLECT", "SUCCEEDED"], ["PROCESS", "RUNNING"]]))).toEqual([]);
    expect(plan(ist(D, "20:40"), execs(D, [["COLLECT", "SUCCEEDED"], ["PROCESS", "QUEUED"]]))).toEqual([]);
  });

  it("continues after a stage that failed permanently or partially", () => {
    const p = plan(ist(D, "20:26"), execs(D, [["COLLECT", "PARTIAL"], ["PROCESS", "FAILED"]]));
    expect(p[0]?.type).toBe("RANK");
  });

  it("publishes at 21:00 only after the edition is prepared", () => {
    const before: Array<[JobType, JobStatus]> = [["COLLECT", "SUCCEEDED"], ["PROCESS", "SUCCEEDED"], ["RANK", "SUCCEEDED"], ["GENERATE", "SUCCEEDED"], ["VALIDATE", "SUCCEEDED"], ["PREPARE_EDITION", "SUCCEEDED"]];
    expect(plan(ist(D, "20:59"), execs(D, before))).toEqual([]);
    expect(plan(ist(D, "21:00"), execs(D, before))[0]?.type).toBe("PUBLISH");
    expect(plan(ist(D, "21:05"), execs(D, [...before, ["PUBLISH", "SUCCEEDED"]]))[0]?.type).toBe("POST_PUBLISH");
    expect(plan(ist(D, "21:30"), execs(D, [...before, ["PUBLISH", "SUCCEEDED"], ["POST_PUBLISH", "SUCCEEDED"]]))).toEqual([]);
  });

  it("catches up when the worker starts late but within the grace period", () => {
    expect(plan(ist(D, "20:45"))[0]?.type).toBe("COLLECT");
  });

  it("records a skip instead of publishing hours late", () => {
    const p = plan(ist(D, "23:59"), new Map(), "21:00", 120);
    expect(p).toHaveLength(1);
    expect(p[0]?.skipReason).toMatch(/did not start/);
  });

  it("never runs later stages of an edition that was skipped", () => {
    expect(plan(ist(D, "23:30"), execs(D, [["COLLECT", "SKIPPED"]]))).toEqual([]);
  });

  it("follows a configured publish time", () => {
    expect(plan(ist(D, "20:00"), new Map(), "22:30")).toEqual([]);
    expect(plan(ist(D, "21:30"), new Map(), "22:30")[0]?.type).toBe("COLLECT");
    expect(stageTime(D, "22:30", "PUBLISH").toISOString()).toBe(ist(D, "22:30").toISOString());
  });

  it("handles a publish time just after midnight (collection starts the previous IST day)", () => {
    const p = plan(ist("2026-11-01", "23:30"), new Map(), "00:30");
    expect(p[0]).toMatchObject({ type: "COLLECT", editionDate: "2026-11-02" });
    expect(activeEditionDate(ist("2026-11-01", "23:45"), "00:30", 180)).toBe("2026-11-02");
  });

  it("schedules the market snapshot on weekdays only", () => {
    // 2026-11-02 is a Monday, 2026-11-01 a Sunday.
    expect(planMarketSnapshot(ist("2026-11-02", "16:00"), new Set())?.idempotencyKey).toBe("MARKET_SNAPSHOT:2026-11-02");
    expect(planMarketSnapshot(ist("2026-11-01", "16:00"), new Set())).toBeNull();
    expect(planMarketSnapshot(ist("2026-11-02", "15:00"), new Set())).toBeNull();
    expect(planMarketSnapshot(ist("2026-11-02", "16:00"), new Set(["MARKET_SNAPSHOT:2026-11-02"]))).toBeNull();
  });
});
