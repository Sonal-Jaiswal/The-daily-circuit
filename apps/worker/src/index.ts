import http from "node:http";
import os from "node:os";
import { disconnectPrisma, getPrisma } from "@tdc/db";
import { purgeExpiredSessions } from "@tdc/core/auth/session";
import { createMailer } from "@tdc/core/email/mailer";
import { adminAlertRecipients, getEnv, llmModels } from "@tdc/core/env";
import { claimNextJob, recoverStaleJobs } from "@tdc/core/jobs/queue";
import { executeJob, llmGatewayFactory, sendAlert, type RunnerDeps } from "@tdc/core/jobs/runner";
import { schedulerTick } from "@tdc/core/jobs/scheduler";
import { activeEditionDate, MARKET_SNAPSHOT_TIME_IST } from "@tdc/core/pipeline/schedule";
import { loadSettings } from "@tdc/core/settings";
import { addMinutes, istDateString, istWallTimeToUtc } from "@tdc/core/time/ist";
import { createLogger } from "@tdc/core/logger";
import { createMarketProvider } from "@tdc/core/market/provider";
import { createImageGenerator } from "@tdc/core/images/cloudflare";
import { enforceRetention } from "@tdc/core/privacy";
import { purgeRateLimitBuckets } from "@tdc/core/security/ratelimit";
import { createRevalidator } from "./revalidate";

// Poll quickly around the evening run, slowly otherwise, so a serverless database
// (e.g. Neon) can scale to zero between editions.
const ACTIVE_TICK_MS = 20_000;
const IDLE_TICK_MS = 10 * 60_000;
const MAINTENANCE_MS = 60 * 60_000;
const SHUTDOWN_GRACE_MS = 25_000;

const env = getEnv();
const workerId = env.WORKER_ID ?? `${os.hostname()}:${process.pid}`;
const log = createLogger({ service: "worker", workerId });
const prisma = getPrisma();
const mailer = createMailer(env, log);
const alertRecipients = adminAlertRecipients(env);
const marketProvider = createMarketProvider(env);

const deps: RunnerDeps = {
  prisma,
  log,
  mailer,
  workerId,
  llmFactory: llmGatewayFactory(env, log),
  imageGenerator: createImageGenerator(env),
  marketProvider,
  revalidate: createRevalidator(env, log),
  alertRecipients,
  models: llmModels(env),
};

const state = {
  startedAt: new Date(),
  lastTickAt: null as Date | null,
  lastTickError: null as string | null,
  currentJob: null as { id: string; type: string; startedAt: Date } | null,
  jobsRun: 0,
  stopping: false,
};

async function drainQueue() {
  while (!state.stopping) {
    const job = await claimNextJob(prisma, workerId);
    if (!job) return;
    state.currentJob = { id: job.id, type: job.type, startedAt: new Date() };
    try {
      await executeJob(deps, job);
      state.jobsRun += 1;
    } finally {
      state.currentJob = null;
    }
  }
}

let consecutiveTickFailures = 0;
let busyUntil = 0;

/** Fast polling from 15 minutes before collection until the edition's grace period ends. */
async function nextDelay(): Promise<number> {
  if (Date.now() < busyUntil) return ACTIVE_TICK_MS;
  try {
    const settings = await loadSettings(prisma);
    const soon = addMinutes(new Date(), 75);
    if (activeEditionDate(new Date(), settings.publishTimeIst, settings.latePublishGraceMin) || activeEditionDate(soon, settings.publishTimeIst, settings.latePublishGraceMin)) return ACTIVE_TICK_MS;
    const snapshotAt = istWallTimeToUtc(istDateString(), MARKET_SNAPSHOT_TIME_IST);
    if (marketProvider && Math.abs(Date.now() - snapshotAt.getTime()) < 15 * 60_000) return ACTIVE_TICK_MS;
  } catch {
    return ACTIVE_TICK_MS;
  }
  return IDLE_TICK_MS;
}

async function tick() {
  try {
    await schedulerTick(prisma, { log, marketDataEnabled: marketProvider !== null });
    const before = state.jobsRun;
    await drainQueue();
    // After running a job, stay responsive for a while (manual reruns tend to come in groups).
    if (state.jobsRun > before) busyUntil = Date.now() + 30 * 60_000;
    state.lastTickAt = new Date();
    state.lastTickError = null;
    consecutiveTickFailures = 0;
  } catch (error) {
    state.lastTickError = (error as Error).message;
    consecutiveTickFailures += 1;
    log.error("Scheduler tick failed", { error });
    if (consecutiveTickFailures === 5) {
      await sendAlert(deps, "Worker scheduler is failing repeatedly", `${(error as Error).stack ?? error}`);
    }
  }
}

async function maintenance() {
  try {
    const recovered = await recoverStaleJobs(prisma);
    if (recovered) log.warn("Recovered stale jobs", { recovered });
    await purgeExpiredSessions(prisma);
    await purgeRateLimitBuckets(prisma);
    const retention = await enforceRetention(prisma);
    if (retention.anonymised || retention.messagesDeleted) log.info("Retention policy applied", retention);
  } catch (error) {
    log.error("Maintenance failed", { error });
  }
}

// ── Health endpoint for Render/Railway health checks and uptime monitors
const server = http.createServer(async (req, res) => {
  if (req.url !== "/health" && req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "unreachable";
  }
  const stale = !state.lastTickAt || Date.now() - state.lastTickAt.getTime() > IDLE_TICK_MS + 5 * 60_000;
  const healthy = db === "ok" && !state.stopping && (!stale || state.currentJob !== null || Date.now() - state.startedAt.getTime() < 2 * 60_000);
  res.writeHead(healthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(
    JSON.stringify({
      status: healthy ? "ok" : "degraded",
      workerId,
      db,
      uptimeSeconds: Math.round(process.uptime()),
      lastTickAt: state.lastTickAt,
      lastTickError: state.lastTickError,
      currentJob: state.currentJob,
      jobsRun: state.jobsRun,
      llmProviders: env.LLM_PROVIDERS ?? env.LLM_PROVIDER,
      images: env.IMAGE_PROVIDER,
      marketData: marketProvider?.name ?? "none",
      email: mailer.transport,
    }),
  );
});

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => log.info("Worker started", { port, llmProvider: env.LLM_PROVIDER, email: mailer.transport }));

let ticking: Promise<void> | null = null;
let loop: NodeJS.Timeout | undefined;
async function schedule() {
  if (state.stopping) return;
  const delay = await nextDelay();
  loop = setTimeout(() => {
    ticking = tick().finally(() => {
      ticking = null;
      void schedule();
    });
  }, delay);
}
const maint = setInterval(() => void maintenance(), MAINTENANCE_MS);
ticking = maintenance()
  .then(tick)
  .finally(() => {
    ticking = null;
    void schedule();
  });

async function shutdown(signal: string) {
  if (state.stopping) return;
  state.stopping = true;
  log.info("Shutting down", { signal, currentJob: state.currentJob });
  clearTimeout(loop);
  clearInterval(maint);
  server.close();
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (ticking && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  if (state.currentJob) {
    // Every stage is idempotent, so handing the job back to the queue is safe.
    await prisma.jobExecution
      .updateMany({ where: { id: state.currentJob.id, status: "RUNNING", lockedBy: workerId }, data: { status: "QUEUED", lockedBy: null, lockedAt: null, attempts: { decrement: 1 }, runAfter: new Date() } })
      .catch(() => undefined);
    log.warn("Released in-flight job for another worker", { jobId: state.currentJob.id });
  }
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => log.error("Unhandled rejection", { reason: String(reason) }));
