import type { Prisma, PrismaClient } from "@tdc/db";
import type { LlmGateway } from "../ai/gateway";
import type { Mailer } from "../email/mailer";
import type { Logger } from "../logger";
import type { MarketDataProvider } from "../market/provider";
import type { ResolvedSettings } from "../settings";

export interface PipelineContext {
  prisma: PrismaClient;
  llm: LlmGateway | null;
  mailer: Mailer;
  log: Logger;
  settings: ResolvedSettings;
  editionDate: string;
  jobId: string | null;
  now: () => Date;
  models: { writer: string; classifier: string };
  marketProvider: MarketDataProvider | null;
  /** Ask the web app to refresh cached pages (sitemaps, home, sections). */
  revalidate: (paths: string[]) => Promise<void>;
  alertRecipients: string[];
  fetchImpl?: typeof fetch;
  /** Free-form options from a manual trigger (e.g. { force: true }). */
  payload: Record<string, unknown>;
}

export interface StageResult {
  status: "SUCCEEDED" | "PARTIAL" | "SKIPPED";
  summary: Prisma.InputJsonObject;
  problems?: string[];
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function requireLlm(ctx: PipelineContext): LlmGateway {
  if (!ctx.llm) throw new ConfigurationError("ANTHROPIC_API_KEY is not configured; this stage needs the Claude API");
  return ctx.llm;
}
