import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicGateway, LlmError, ScriptedGateway, validateStructured, type UsageRecord } from "../../src/ai/gateway";
import { estimateCostUsd } from "../../src/ai/pricing";

const Schema = z.object({ answer: z.string(), score: z.number().min(0).max(10) });

/** Canned Messages API responses through the real SDK (no network). */
function fakeFetch(body: Record<string, unknown>, capture?: (req: { url: string; body: any; headers: Headers }) => void): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    capture?.({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")), headers });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
}

const message = (over: Record<string, unknown>) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  content: [{ type: "text", text: JSON.stringify({ answer: "ok", score: 7 }) }],
  ...over,
});

const call = (over: Partial<Parameters<AnthropicGateway["structured"]>[0]> = {}) => ({
  purpose: "test",
  model: "claude-sonnet-5-5",
  system: "system",
  prompt: "prompt",
  schema: Schema,
  maxTokens: 1000,
  effort: "low" as const,
  fallback: true,
  ...over,
});

describe("AnthropicGateway (real SDK, canned responses)", () => {
  it("parses and Zod-validates structured output, records usage and cost", async () => {
    const usage: UsageRecord[] = [];
    let sent: any;
    const gw = new AnthropicGateway("test-key", (u) => void usage.push(u), { fetch: fakeFetch(message({}), (r) => (sent = r)), maxRetries: 0 });
    const res = await gw.structured(call());
    expect(res.data).toEqual({ answer: "ok", score: 7 });
    expect(usage[0]).toMatchObject({ purpose: "test", model: "claude-sonnet-5-5", inputTokens: 1000, outputTokens: 500 });
    expect(usage[0]!.costUsd).toBeCloseTo(0.007);
    // Request shape: adaptive thinking, structured output, server-side fallback.
    expect(sent.body.thinking).toEqual({ type: "adaptive" });
    expect(sent.body.output_config.effort).toBe("low");
    expect(sent.body.output_config.format.type).toBe("json_schema");
    expect(sent.body.fallbacks).toBe("default");
    expect(sent.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("omits fallbacks for models without server-side fallback (Haiku)", async () => {
    let sent: any;
    const gw = new AnthropicGateway("k", () => undefined, { fetch: fakeFetch(message({ model: "claude-haiku-5-5" }), (r) => (sent = r)), maxRetries: 0 });
    await gw.structured(call({ model: "claude-haiku-5-5", fallback: false }));
    expect(sent.body.fallbacks).toBeUndefined();
    expect(sent.headers.get("anthropic-beta")).toBeNull();
  });

  it("raises a typed error on refusal and still records usage", async () => {
    const usage: UsageRecord[] = [];
    const gw = new AnthropicGateway("k", (u) => void usage.push(u), {
      fetch: fakeFetch(message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "x" }, content: [] })),
      maxRetries: 0,
    });
    await expect(gw.structured(call())).rejects.toMatchObject({ code: "refusal" });
    expect(usage).toHaveLength(1);
  });

  it("raises on truncated output", async () => {
    const gw = new AnthropicGateway("k", () => undefined, { fetch: fakeFetch(message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"answer":' }] })), maxRetries: 0 });
    await expect(gw.structured(call())).rejects.toMatchObject({ code: "truncated" });
  });

  it("rejects output that violates the schema", async () => {
    const gw = new AnthropicGateway("k", () => undefined, { fetch: fakeFetch(message({ content: [{ type: "text", text: JSON.stringify({ answer: "ok", score: 42 }) }] })), maxRetries: 0 });
    await expect(gw.structured(call())).rejects.toBeInstanceOf(LlmError);
  });
});

describe("validateStructured", () => {
  it("falls back to parsing the text block", () => {
    expect(validateStructured(Schema, { content: [{ type: "text", text: '{"answer":"a","score":1}' }], parsed_output: null })).toEqual({ answer: "a", score: 1 });
    expect(() => validateStructured(Schema, { content: [{ type: "text", text: "not json" }], parsed_output: null })).toThrow(/not valid JSON/);
  });

  it("ScriptedGateway validates responses with the same schema", async () => {
    const gw = new ScriptedGateway(() => ({ answer: "x", score: 11 }));
    await expect(gw.structured(call())).rejects.toThrow(/schema validation/);
  });
});

describe("pricing", () => {
  it("prices Sonnet 5.5 and Haiku 5.5 per million tokens", () => {
    expect(estimateCostUsd("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(12);
    expect(estimateCostUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0.5); // long-context rate above 100K
    expect(estimateCostUsd("claude-haiku-5-5", { inputTokens: 50_000, outputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(0.01);
  });
});
