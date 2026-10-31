import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_WRITER_MODEL: z.string().default("claude-sonnet-5-5"),
  CLAUDE_CLASSIFIER_MODEL: z.string().default("claude-haiku-5-5"),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  INTERNAL_JOB_SECRET: z.string().min(24).optional(),
  WEB_INTERNAL_URL: z.string().url().optional(),

  EMAIL_TRANSPORT: z.enum(["resend", "log"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("The Daily Circuit <no-reply@localhost>"),
  ADMIN_ALERT_EMAILS: z.string().optional(),

  MARKET_DATA_PROVIDER: z.enum(["none", "eodhd"]).default("none"),
  EODHD_API_TOKEN: z.string().optional(),
  /** Must be "true" before any exchange data is displayed publicly. */
  MARKET_DATA_REDISTRIBUTION_LICENSED: bool,

  CONTACT_EMAIL: z.string().email().optional(),
  CORRECTIONS_EMAIL: z.string().email().optional(),

  WORKER_ID: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests that mutate process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function adminAlertRecipients(env = getEnv()): string[] {
  return (env.ADMIN_ALERT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isMarketDataPublic(env = getEnv()): boolean {
  return env.MARKET_DATA_PROVIDER !== "none" && env.MARKET_DATA_REDISTRIBUTION_LICENSED;
}
