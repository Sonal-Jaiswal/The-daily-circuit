import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LlmError, validateStructured, type LlmGateway, type StructuredCall, type StructuredResult, type UsageRecord } from "./gateway";
import { estimateCostUsd } from "./pricing";

// Keywords Gemini's constrained decoding does not support; Zod re-checks them after the call.
const UNSUPPORTED = new Set(["$schema", "pattern", "minLength", "maxLength", "minProperties", "maxProperties", "uniqueItems"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).filter(([k]) => !UNSUPPORTED.has(k)).map(([k, v]) => [k, stripUnsupported(v)]));
  }
  return node;
}

/** JSON Schema for a Zod schema in the subset Gemini's structured output accepts. */
export function geminiJsonSchema(schema: z.ZodType): unknown {
  return stripUnsupported(z.toJSONSchema(schema, { target: "draft-2020-12", io: "output" }));
}

const BLOCKED: ReadonlySet<string> = new Set([FinishReason.SAFETY, FinishReason.RECITATION, FinishReason.BLOCKLIST, FinishReason.PROHIBITED_CONTENT, FinishReason.SPII, FinishReason.LANGUAGE]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google Gemini via the official SDK. Paces requests so free-tier per-minute limits are not
 * exceeded, and retries rate-limit (429) and server errors with backoff.
 */
export class GeminiGateway implements LlmGateway {
  private readonly client: GoogleGenAI;
  private nextSlot = 0;

  constructor(
    apiKey: string,
    private readonly onUsage: (usage: UsageRecord) => Promise<void> | void,
    private readonly options: { minIntervalMs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async pace() {
    const wait = this.nextSlot - Date.now();
    this.nextSlot = Math.max(Date.now(), this.nextSlot) + (this.options.minIntervalMs ?? 7_000);
    if (wait > 0) await (this.options.sleep ?? sleep)(wait);
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const maxRetries = this.options.maxRetries ?? 4;
    const responseJsonSchema = geminiJsonSchema(call.schema as z.ZodType);
    for (let attempt = 0; ; attempt += 1) {
      await this.pace();
      try {
        const res = await this.client.models.generateContent({
          model: call.model,
          contents: [{ role: "user", parts: [{ text: call.prompt }] }],
          config: {
            systemInstruction: call.system,
            responseMimeType: "application/json",
            responseJsonSchema,
            maxOutputTokens: call.maxTokens,
            temperature: 0.3,
            abortSignal: AbortSignal.timeout(5 * 60_000),
          },
        });
        const meta = res.usageMetadata;
        const tokens = {
          inputTokens: (meta?.promptTokenCount ?? 0) - (meta?.cachedContentTokenCount ?? 0),
          outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
          cacheReadTokens: meta?.cachedContentTokenCount ?? 0,
          cacheWriteTokens: 0,
        };
        const finish = res.candidates?.[0]?.finishReason ?? null;
        const usage: UsageRecord = {
          ...tokens,
          purpose: call.purpose,
          model: res.modelVersion ?? call.model,
          costUsd: estimateCostUsd(call.model, tokens),
          stopReason: res.promptFeedback?.blockReason ?? finish,
          requestId: res.responseId ?? null,
          jobId: call.context?.jobId ?? null,
          articleId: call.context?.articleId ?? null,
        };
        await this.onUsage(usage);
        if (res.promptFeedback?.blockReason) throw new LlmError(`Gemini blocked the prompt (${res.promptFeedback.blockReason})`, "refusal", usage);
        if (finish && BLOCKED.has(finish)) throw new LlmError(`Gemini stopped the response (${finish})`, "refusal", usage);
        if (finish === FinishReason.MAX_TOKENS) throw new LlmError(`Output truncated at ${call.maxTokens} tokens`, "truncated", usage);
        return { data: validateStructured(call.schema, { content: [{ type: "text", text: res.text ?? "" }], parsed_output: null }, usage), usage };
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        const retryable = status === 429 || status >= 500;
        if (!retryable || attempt >= maxRetries) {
          if (status === 429) throw new Error(`Gemini rate limit or daily quota exhausted: ${(error as Error).message}`);
          throw error;
        }
        await (this.options.sleep ?? sleep)(Math.min(120_000, 15_000 * 2 ** attempt));
      }
    }
  }
}
