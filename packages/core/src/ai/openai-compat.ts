import type { z } from "zod";
import { LlmError, validateStructured, type LlmGateway, type StructuredCall, type StructuredResult, type UsageRecord } from "./gateway";
import { geminiJsonSchema } from "./gemini";
import { estimateCostUsd } from "./pricing";

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export interface OpenAICompatOptions {
  /** Provider name recorded with usage, e.g. "openrouter", "groq", "xai". */
  name: string;
  baseUrl: string;
  apiKey: string;
  /** Use `response_format: json_schema` (true) or plain JSON mode with the schema in the prompt. */
  jsonSchema: boolean;
  /** Free-tier models are recorded at $0; others use the pricing table (Sonnet rates if unknown). */
  free: boolean;
  /** Extra body fields, e.g. OpenRouter's `models` fallback list. */
  extraBody?: Record<string, unknown>;
  headers?: Record<string, string>;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface ChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null; refusal?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number | string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Any OpenAI-compatible chat-completions API: OpenRouter, Groq, xAI (Grok) and others. */
export class OpenAICompatGateway implements LlmGateway {
  private nextSlot = 0;
  constructor(
    private readonly opts: OpenAICompatOptions,
    private readonly onUsage: (usage: UsageRecord) => Promise<void> | void,
  ) {}

  private async pace() {
    const wait = this.nextSlot - Date.now();
    this.nextSlot = Math.max(Date.now(), this.nextSlot) + (this.opts.minIntervalMs ?? 3_500);
    if (wait > 0) await (this.opts.sleep ?? sleep)(wait);
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const schema = geminiJsonSchema(call.schema as z.ZodType);
    const system = this.opts.jsonSchema
      ? call.system
      : `${call.system}\n\nRespond with a single JSON object that conforms to this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
    const body = {
      model: call.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: call.prompt },
      ],
      max_tokens: call.maxTokens,
      temperature: 0.3,
      response_format: this.opts.jsonSchema ? { type: "json_schema", json_schema: { name: call.purpose.replace(/[^a-z0-9_-]/gi, "_"), schema, strict: false } } : { type: "json_object" },
      ...this.opts.extraBody,
    };
    await this.pace();
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json", ...this.opts.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const json = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok || json.error) {
      const status = res.ok ? Number(json.error?.code) || 502 : res.status;
      throw new ProviderHttpError(`${this.opts.name} returned ${status}: ${json.error?.message ?? res.statusText}`, status);
    }
    const choice = json.choices?.[0];
    const tokens = { inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const model = json.model ?? call.model;
    const usage: UsageRecord = {
      ...tokens,
      purpose: call.purpose,
      model,
      costUsd: this.opts.free ? 0 : estimateCostUsd(model, tokens),
      stopReason: choice?.finish_reason ?? null,
      requestId: json.id ?? null,
      jobId: call.context?.jobId ?? null,
      articleId: call.context?.articleId ?? null,
    };
    await this.onUsage(usage);
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new LlmError(`${this.opts.name} declined the request`, "refusal", usage);
    if (choice?.finish_reason === "length") throw new LlmError(`Output truncated at ${call.maxTokens} tokens`, "truncated", usage);
    // Some models wrap JSON in a Markdown fence despite JSON mode.
    const text = (choice?.message?.content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return { data: validateStructured(call.schema, { content: [{ type: "text", text }], parsed_output: null }, usage), usage };
  }
}
