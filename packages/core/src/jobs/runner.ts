import { Prisma, type JobExecution, type PrismaClient } from "@tdc/db";
import { AnthropicGateway, type LlmGateway, type UsageRecord } from "../ai/gateway";
import { GeminiGateway } from "../ai/gemini";
import type { Env } from "../env";
import { alertEmail } from "../email/templates";
import type { Mailer } from "../email/mailer";
import { siteUrl } from "../env";
import type { Logger } from "../logger";
import type { MarketDataProvider } from "../market/provider";
import { ConfigurationError, type PipelineContext } from "../pipeline/context";
import { runStage } from "../pipeline/run";
import { loadSettings } from "../settings";
import { fromDbDate, istDateString } from "../time/ist";
import { appendJobLog, completeJob, failJob, heartbeat } from "./queue";

export interface RunnerDeps {
  prisma: PrismaClient;
  log: Logger;
  mailer: Mailer;
  workerId: string;
  /** Build the Claude gateway; null when no API key is configured. */
  llmFactory: (prisma: PrismaClient) => LlmGateway | null;
  marketProvider: MarketDataProvider | null;
  revalidate: (paths: string[]) => Promise<void>;
  alertRecipients: string[];
  models: { writer: string; classifier: string };
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/** Writes each model call to ApiUsage for the usage and spend dashboard. */
export function usageRecorder(prisma: PrismaClient, provider: string) {
  return async (u: UsageRecord) => {
          await prisma.apiUsage.create({
            data: {
              provider,
              model: u.model,
              purpose: u.purpose,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              cacheReadTokens: u.cacheReadTokens,
              cacheWriteTokens: u.cacheWriteTokens,
              costUsd: new Prisma.Decimal(u.costUsd),
              stopReason: u.stopReason,
              requestId: u.requestId,
              jobId: u.jobId ?? null,
              articleId: u.articleId ?? null,
            },
          });
  };
}

/** The configured model gateway (Claude or Gemini), or null when its API key is missing. */
export function createLlmGateway(env: Pick<Env, "LLM_PROVIDER" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY" | "GEMINI_MIN_INTERVAL_MS">, prisma: PrismaClient): LlmGateway | null {
  if (env.LLM_PROVIDER === "gemini") {
    return env.GEMINI_API_KEY ? new GeminiGateway(env.GEMINI_API_KEY, usageRecorder(prisma, "google"), { minIntervalMs: env.GEMINI_MIN_INTERVAL_MS }) : null;
  }
  return env.ANTHROPIC_API_KEY ? new AnthropicGateway(env.ANTHROPIC_API_KEY, usageRecorder(prisma, "anthropic")) : null;
}

export function llmGatewayFactory(env: Parameters<typeof createLlmGateway>[0]) {
  return (prisma: PrismaClient) => createLlmGateway(env, prisma);
}

/** Job-scoped logger that also persists entries for the admin job log view. */
function jobLogger(deps: RunnerDeps, job: JobExecution): Logger {
  const base = deps.log.child({ jobId: job.id, jobType: job.type });
  const persist = (level: "debug" | "info" | "warn" | "error") => (message: string, data?: Record<string, unknown>) => {
    base[level](message, data);
    if (level !== "debug") void appendJobLog(deps.prisma, job.id, level, message, data).catch(() => undefined);
  };
  return { debug: persist("debug"), info: persist("info"), warn: persist("warn"), error: persist("error"), child: (b) => base.child(b) };
}

export async function executeJob(deps: RunnerDeps, job: JobExecution): Promise<JobExecution> {
  const log = jobLogger(deps, job);
  const now = deps.now ?? (() => new Date());
  const beat = setInterval(() => void heartbeat(deps.prisma, job.id, deps.workerId).catch(() => undefined), 30_000);
  try {
    const settings = await loadSettings(deps.prisma);
    const editionDate = job.editionDate ? fromDbDate(job.editionDate) : istDateString(now());
    const ctx: PipelineContext = {
      prisma: deps.prisma,
      llm: deps.llmFactory(deps.prisma),
      mailer: deps.mailer,
      log,
      settings,
      editionDate,
      jobId: job.id,
      now,
      models: deps.models,
      marketProvider: deps.marketProvider,
      revalidate: deps.revalidate,
      alertRecipients: deps.alertRecipients,
      fetchImpl: deps.fetchImpl,
      payload: (job.payload as Record<string, unknown> | null) ?? {},
    };
    log.info(`Starting ${job.type}`, { editionDate, attempt: job.attempts, trigger: job.trigger });
    const result = await runStage(job.type, ctx);
    for (const p of result.problems ?? []) log.warn(p);
    log.info(`Finished ${job.type}`, { status: result.status, summary: result.summary });
    return await completeJob(deps.prisma, job.id, {
      status: result.status,
      result: { ...result.summary, problems: result.problems ?? [] },
      error: result.problems?.length ? result.problems.slice(0, 5).join("; ") : null,
    });
  } catch (error) {
    log.error(`${job.type} failed`, { error });
    // Misconfiguration will not fix itself on retry.
    const toFail = error instanceof ConfigurationError ? { ...job, attempts: job.maxAttempts } : job;
    const { job: updated, final } = await failJob(deps.prisma, toFail, error);
    if (final) await sendAlert(deps, `${job.type} failed for ${job.editionDate ? fromDbDate(job.editionDate) : "manual run"}`, `${(error as Error).stack ?? String(error)}\n\nJob: ${job.id}\nAttempts: ${job.attempts}/${job.maxAttempts}`);
    return updated;
  } finally {
    clearInterval(beat);
  }
}

export async function sendAlert(deps: Pick<RunnerDeps, "mailer" | "alertRecipients" | "log">, subject: string, details: string): Promise<void> {
  deps.log.error(`ALERT: ${subject}`, { details });
  if (!deps.alertRecipients.length) return;
  try {
    await deps.mailer.send(alertEmail(deps.alertRecipients, { siteName: "The Daily Circuit", subject, details, adminUrl: `${siteUrl()}/admin/jobs` }));
  } catch (error) {
    deps.log.error("Could not send alert email", { error });
  }
}
