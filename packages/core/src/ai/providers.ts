import type { Env } from "../env";
import type { Logger } from "../logger";
import { ChainGateway, type ChainEntry } from "./chain";
import { AnthropicGateway, type UsageRecord } from "./gateway";
import { GeminiGateway } from "./gemini";
import { OpenAICompatGateway } from "./openai-compat";

export type ProviderName = "gemini" | "openrouter" | "groq" | "xai" | "anthropic";
export const PROVIDER_NAMES: readonly ProviderName[] = ["gemini", "openrouter", "groq", "xai", "anthropic"];

type ProviderEnv = Pick<
  Env,
  | "LLM_PROVIDER"
  | "LLM_PROVIDERS"
  | "ANTHROPIC_API_KEY"
  | "CLAUDE_WRITER_MODEL"
  | "CLAUDE_CLASSIFIER_MODEL"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
  | "GEMINI_MIN_INTERVAL_MS"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODELS"
  | "GROQ_API_KEY"
  | "GROQ_MODEL"
  | "XAI_API_KEY"
  | "XAI_MODEL"
  | "NEXT_PUBLIC_SITE_URL"
>;

/** Provider order from LLM_PROVIDERS ("gemini,openrouter,anthropic"), else the single LLM_PROVIDER. */
export function providerOrder(env: Pick<ProviderEnv, "LLM_PROVIDER" | "LLM_PROVIDERS">): ProviderName[] {
  const raw = env.LLM_PROVIDERS?.trim() ? env.LLM_PROVIDERS : env.LLM_PROVIDER;
  return [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()))].filter((s): s is ProviderName => (PROVIDER_NAMES as readonly string[]).includes(s));
}

type UsageSinkFor = (provider: string) => (usage: UsageRecord) => Promise<void> | void;

/** One chain entry per configured provider that has an API key (and a model, where required). */
export function buildChainEntries(env: ProviderEnv, sinkFor: UsageSinkFor): ChainEntry[] {
  const entries: ChainEntry[] = [];
  for (const name of providerOrder(env)) {
    if (name === "anthropic" && env.ANTHROPIC_API_KEY) {
      entries.push({ name, gateway: new AnthropicGateway(env.ANTHROPIC_API_KEY, sinkFor("anthropic")), writer: env.CLAUDE_WRITER_MODEL, classifier: env.CLAUDE_CLASSIFIER_MODEL, supportsFallback: true });
    }
    if (name === "gemini" && env.GEMINI_API_KEY) {
      entries.push({ name, gateway: new GeminiGateway(env.GEMINI_API_KEY, sinkFor("google"), { minIntervalMs: env.GEMINI_MIN_INTERVAL_MS }), writer: env.GEMINI_MODEL, classifier: env.GEMINI_MODEL });
    }
    if (name === "openrouter" && env.OPENROUTER_API_KEY) {
      const models = env.OPENROUTER_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
      entries.push({
        name,
        gateway: new OpenAICompatGateway(
          {
            name,
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: env.OPENROUTER_API_KEY,
            jsonSchema: true,
            free: models.every((m) => m.endsWith(":free") || m === "openrouter/free"),
            // OpenRouter tries the listed models in order and only routes to ones supporting our parameters.
            extraBody: { models, provider: { require_parameters: true } },
            headers: { "HTTP-Referer": env.NEXT_PUBLIC_SITE_URL, "X-Title": "The Daily Circuit" },
          },
          sinkFor("openrouter"),
        ),
        writer: models[0]!,
        classifier: models[0]!,
      });
    }
    if (name === "groq" && env.GROQ_API_KEY && env.GROQ_MODEL) {
      entries.push({
        name,
        gateway: new OpenAICompatGateway({ name, baseUrl: "https://api.groq.com/openai/v1", apiKey: env.GROQ_API_KEY, jsonSchema: false, free: true }, sinkFor("groq")),
        writer: env.GROQ_MODEL,
        classifier: env.GROQ_MODEL,
      });
    }
    if (name === "xai" && env.XAI_API_KEY && env.XAI_MODEL) {
      entries.push({
        name,
        gateway: new OpenAICompatGateway({ name, baseUrl: "https://api.x.ai/v1", apiKey: env.XAI_API_KEY, jsonSchema: true, free: false }, sinkFor("xai")),
        writer: env.XAI_MODEL,
        classifier: env.XAI_MODEL,
      });
    }
  }
  return entries;
}

export function buildLlmChain(env: ProviderEnv, sinkFor: UsageSinkFor, log?: Logger): ChainGateway | null {
  const entries = buildChainEntries(env, sinkFor);
  return entries.length ? new ChainGateway(entries, log) : null;
}
