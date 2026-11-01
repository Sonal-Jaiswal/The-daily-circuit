import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),

  /** Which model provider writes and checks articles. */
  LLM_PROVIDER: z.string().default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  /** Minimum gap between Gemini requests; keeps free-tier per-minute limits. */
  GEMINI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(7000),
  /** Ordered fallback chain, e.g. "gemini,openrouter,groq,anthropic". Overrides LLM_PROVIDER. */
  LLM_PROVIDERS: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  /** Comma-separated; OpenRouter falls back through them in order. ":free" models cost nothing. */
  OPENROUTER_MODELS: z.string().default("nvidia/nemotron-3.5-super-vl:free,xingchen-agi/xing4.0-29b-a4b:free,openrouter/free"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().optional(),

  /** "cloudflare" generates an AI illustration per article (Workers AI free allocation); "none" keeps generated SVG covers. */
  IMAGE_PROVIDER: z.enum(["none", "cloudflare"]).default("none"),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_AI_TOKEN: z.string().optional(),
  CLOUDFLARE_IMAGE_MODEL: z.string().default("@cf/black-forest-labs/flux-1-schnell"),
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

/** Writer and classifier model IDs for the configured provider. */
export function llmModels(env = getEnv()): { writer: string; classifier: string } {
  const first = (env.LLM_PROVIDERS?.trim() ? env.LLM_PROVIDERS : env.LLM_PROVIDER).split(",")[0]!.trim().toLowerCase();
  if (first === "openrouter") {
    const m = env.OPENROUTER_MODELS.split(",")[0]!.trim();
    return { writer: m, classifier: m };
  }
  if (first === "groq" && env.GROQ_MODEL) return { writer: env.GROQ_MODEL, classifier: env.GROQ_MODEL };
  if (first === "xai" && env.XAI_MODEL) return { writer: env.XAI_MODEL, classifier: env.XAI_MODEL };
  return first === "gemini"
    ? { writer: env.GEMINI_MODEL, classifier: env.GEMINI_MODEL }
    : { writer: env.CLAUDE_WRITER_MODEL, classifier: env.CLAUDE_CLASSIFIER_MODEL };
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
