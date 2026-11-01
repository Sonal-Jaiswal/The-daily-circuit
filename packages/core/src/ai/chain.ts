import { ApiError } from "@google/genai";
import { LlmError, type LlmGateway, type StructuredCall, type StructuredResult } from "./gateway";
import { ProviderHttpError } from "./openai-compat";

export interface ChainEntry {
  /** Provider name, e.g. "gemini", "openrouter". */
  name: string;
  gateway: LlmGateway;
  /** Model used for article writing on this provider. */
  writer: string;
  /** Model used for classification and fact-checking on this provider. */
  classifier: string;
  /** Pass Anthropic server-side refusal fallbacks through (Claude only). */
  supportsFallback?: boolean;
}

function statusOf(error: unknown): number {
  if (error instanceof ProviderHttpError) return error.status;
  if (error instanceof ApiError) return error.status;
  return 0;
}

/** A provider that hit its quota or rejected our key is skipped for the rest of the run. */
function disablesProvider(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 402 || status === 403 || status === 429 || /quota|credit balance|rate limit/i.test(String((error as Error)?.message));
}

/**
 * Tries each configured provider in order (e.g. Gemini → OpenRouter → Groq → Claude) until
 * one returns output that passes the schema. Every result still goes through the same Zod
 * validation and editorial checks, whichever model produced it.
 */
export class ChainGateway implements LlmGateway {
  private readonly exhausted = new Set<string>();

  constructor(
    private readonly entries: ChainEntry[],
    private readonly log?: { warn: (message: string, data?: Record<string, unknown>) => void },
  ) {
    if (!entries.length) throw new Error("ChainGateway needs at least one provider");
  }

  get providers(): string[] {
    return this.entries.map((e) => e.name);
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const failures: string[] = [];
    let last: unknown;
    for (const entry of this.entries) {
      if (this.exhausted.has(entry.name)) continue;
      const model = call.purpose === "write-article" ? entry.writer : entry.classifier;
      try {
        return await entry.gateway.structured({ ...call, model, fallback: Boolean(entry.supportsFallback && call.fallback) });
      } catch (error) {
        last = error;
        const reason = error instanceof LlmError ? `${error.code}: ${error.message}` : (error as Error)?.message ?? String(error);
        failures.push(`${entry.name}/${model}: ${reason}`);
        if (disablesProvider(error)) this.exhausted.add(entry.name);
        this.log?.warn("Model provider failed; trying the next one", { provider: entry.name, model, purpose: call.purpose, error: reason.slice(0, 300) });
      }
    }
    if (last instanceof LlmError && failures.length === 1) throw last;
    const code = last instanceof LlmError ? last.code : "invalid_output";
    throw new LlmError(failures.length ? `All model providers failed — ${failures.join(" | ")}` : "Every model provider is exhausted for this run", code);
  }
}
