/**
 * Run-and-exit worker for hosts without an always-on process (e.g. a scheduled GitHub
 * Actions job). It runs the same scheduler and job runner as the persistent worker until
 * tonight's edition is finished — or, outside the evening window, until the queue is empty.
 */
import { disconnectPrisma, getPrisma, type JobStatus } from "@tdc/db";
import { createMailer } from "@tdc/core/email/mailer";
import { adminAlertRecipients, getEnv, llmModels } from "@tdc/core/env";
import { claimNextJob, recoverStaleJobs } from "@tdc/core/jobs/queue";
import { executeJob, llmGatewayFactory, sendAlert, type RunnerDeps } from "@tdc/core/jobs/runner";
import { schedulerTick } from "@tdc/core/jobs/scheduler";
import { createLogger } from "@tdc/core/logger";
import { createMarketProvider } from "@tdc/core/market/provider";
import { activeEditionDate, scheduledKey } from "@tdc/core/pipeline/schedule";
import { loadSettings } from "@tdc/core/settings";
import { addMinutes } from "@tdc/core/time/ist";
import { createRevalidator } from "./revalidate";

const TICK_MS = 20_000;
const MAX_MINUTES = Number(process.env.RUN_WINDOW_MAX_MINUTES ?? 170);
const TERMINAL: ReadonlySet<JobStatus> = new Set(["SUCCEEDED", "PARTIAL", "FAILED", "SKIPPED", "CANCELLED"]);

const env = getEnv();
const workerId = `run-window:${process.env.GITHUB_RUN_ID ?? process.pid}`;
const log = createLogger({ service: "worker", mode: "run-window", workerId });
const prisma = getPrisma();
const marketProvider = createMarketProvider(env);
const deps: RunnerDeps = {
  prisma,
  log,
  mailer: createMailer(env, log),
  workerId,
  llmFactory: llmGatewayFactory(env),
  marketProvider,
  revalidate: createRevalidator(env, log),
  alertRecipients: adminAlertRecipients(env),
  models: llmModels(env),
};

/** The edition whose pipeline window is open now or opens within the next 75 minutes. */
async function targetEdition(now: Date): Promise<string | null> {
  const s = await loadSettings(prisma);
  return activeEditionDate(now, s.publishTimeIst, s.latePublishGraceMin) ?? activeEditionDate(addMinutes(now, 75), s.publishTimeIst, s.latePublishGraceMin);
}

async function editionFinished(date: string): Promise<boolean> {
  const rows = await prisma.jobExecution.findMany({
    where: { idempotencyKey: { in: [scheduledKey("COLLECT", date), scheduledKey("POST_PUBLISH", date)] } },
    select: { type: true, status: true },
  });
  const collect = rows.find((r) => r.type === "COLLECT");
  const post = rows.find((r) => r.type === "POST_PUBLISH");
  return collect?.status === "SKIPPED" || (post !== undefined && TERMINAL.has(post.status));
}

async function main() {
  const deadline = Date.now() + MAX_MINUTES * 60_000;
  await recoverStaleJobs(prisma);
  for (;;) {
    await schedulerTick(prisma, { log, marketDataEnabled: marketProvider !== null });
    for (let job = await claimNextJob(prisma, workerId); job; job = await claimNextJob(prisma, workerId)) {
      await executeJob(deps, job);
    }
    const edition = await targetEdition(new Date());
    const pending = await prisma.jobExecution.count({ where: { status: { in: ["QUEUED", "RUNNING"] }, runAfter: { lte: new Date(deadline) } } });
    if (edition ? await editionFinished(edition) : pending === 0) {
      log.info("Nothing left to do in this window; exiting", { edition });
      return;
    }
    if (Date.now() > deadline) {
      await sendAlert(deps, "Evening run reached its time limit", `Edition ${edition ?? "(none)"} was not finished after ${MAX_MINUTES} minutes. Check the Jobs page.`);
      return;
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main()
  .catch(async (error) => {
    log.error("Run window failed", { error });
    await sendAlert(deps, "Evening run crashed", String((error as Error)?.stack ?? error));
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
