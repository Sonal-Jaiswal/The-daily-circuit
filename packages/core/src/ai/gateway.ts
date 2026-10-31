import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { estimateCostUsd, type TokenUsage } from "./pricing";

export type Effort = "low" | "medium" | "high";

export interface StructuredCall<T> {
  /** Recorded with usage, e.g. "classify", "write-article", "fact-check". */
  purpose: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  effort: Effort;
  /** Use server-side refusal fallbacks (Claude API, Sonnet/Opus tiers only). */
  fallback: boolean;
  context?: { jobId?: string | null; articleId?: string | null };
}

export interface UsageRecord extends TokenUsage {
  purpose: string;
  model: string;
  costUsd: number;
  stopReason: string | null;
  requestId: string | null;
  jobId?: string | null;
  articleId?: string | null;
}

export interface StructuredResult<T> {
  data: T;
  usage: UsageRecord;
}

export interface LlmGateway {
  structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly code: "refusal" | "truncated" | "invalid_output" | "not_configured",
    readonly usage?: UsageRecord,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

type UsageSink = (usage: UsageRecord) => Promise<void> | void;

interface MessageLike {
  id: string;
  model: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  content: Array<{ type: string; text?: string }>;
  parsed_output?: unknown;
}

export class AnthropicGateway implements LlmGateway {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly onUsage: UsageSink,
    options: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: options.maxRetries ?? 3, timeout: 5 * 60 * 1000, ...(options.fetch ? { fetch: options.fetch } : {}) });
  }

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    const system = [{ type: "text" as const, text: call.system, cache_control: { type: "ephemeral" as const } }];
    const messages = [{ role: "user" as const, content: call.prompt }];

    // `create` (not `parse`) so stop reasons are checked before any JSON parsing; the
    // response is then validated with the Zod schema below.
    const message: MessageLike = call.fallback
      ? await this.client.beta.messages.create({
          model: call.model,
          max_tokens: call.maxTokens,
          system,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: call.effort, format: betaZodOutputFormat(call.schema) },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
      : await this.client.messages.create({
          model: call.model,
          max_tokens: call.maxTokens,
          system,
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: call.effort, format: zodOutputFormat(call.schema) },
        });

    const tokens: TokenUsage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    // Bill at the model that actually served the request (a fallback may differ).
    const usage: UsageRecord = {
      ...tokens,
      purpose: call.purpose,
      model: message.model || call.model,
      costUsd: estimateCostUsd(message.model || call.model, tokens),
      stopReason: message.stop_reason,
      requestId: message.id,
      jobId: call.context?.jobId ?? null,
      articleId: call.context?.articleId ?? null,
    };
    await this.onUsage(usage);

    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category ?? "unspecified";
      throw new LlmError(`Model declined the request (category: ${category})`, "refusal", usage);
    }
    if (message.stop_reason === "max_tokens") {
      throw new LlmError(`Output truncated at ${call.maxTokens} tokens`, "truncated", usage);
    }
    return { data: validateStructured(call.schema, message, usage), usage };
  }
}

/** Zod validation of the model's JSON — never trust structured output blindly. */
export function validateStructured<T>(schema: z.ZodType<T>, message: Pick<MessageLike, "content" | "parsed_output">, usage?: UsageRecord): T {
  let candidate: unknown = message.parsed_output;
  if (candidate == null) {
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    try {
      candidate = JSON.parse(text);
    } catch {
      throw new LlmError("Model output was not valid JSON", "invalid_output", usage);
    }
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new LlmError(`Model output failed schema validation: ${issues.join("; ")}`, "invalid_output", usage);
  }
  return parsed.data;
}

/** Deterministic gateway for tests and offline runs. */
export class ScriptedGateway implements LlmGateway {
  readonly calls: StructuredCall<unknown>[] = [];
  constructor(private readonly respond: (call: StructuredCall<unknown>) => unknown) {}

  async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
    this.calls.push(call as StructuredCall<unknown>);
    const raw = this.respond(call as StructuredCall<unknown>);
    const usage: UsageRecord = {
      purpose: call.purpose,
      model: call.model,
      inputTokens: Math.ceil((call.system.length + call.prompt.length) / 4),
      outputTokens: Math.ceil(JSON.stringify(raw ?? "").length / 4),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      stopReason: "end_turn",
      requestId: null,
      jobId: call.context?.jobId ?? null,
      articleId: call.context?.articleId ?? null,
    };
    if (raw instanceof Error) throw raw;
    return { data: validateStructured(call.schema, { content: [], parsed_output: raw }, usage), usage };
  }
}
