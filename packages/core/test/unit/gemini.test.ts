import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiGateway, geminiJsonSchema } from "../../src/ai/gemini";
import type { UsageRecord } from "../../src/ai/gateway";
import { ArticleDraftSchema } from "../../src/editorial/schema";

const Schema = z.object({ answer: z.string().min(1), score: z.number().min(0).max(10) });

function geminiResponse(over: { text?: string; finishReason?: string; blockReason?: string } = {}) {
  return {
    candidates: over.blockReason ? [] : [{ content: { role: "model", parts: [{ text: over.text ?? JSON.stringify({ answer: "ok", score: 7 }) }] }, finishReason: over.finishReason ?? "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 20, totalTokenCount: 1520 },
    modelVersion: "gemini-3.5-flash-lite",
    responseId: "resp_1",
    ...(over.blockReason ? { promptFeedback: { blockReason: over.blockReason } } : {}),
  };
}

function stubFetch(...bodies: Array<{ status?: number; body: unknown }>) {
  const sent: any[] = [];
  const fn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? "{}")));
    const next = bodies.shift() ?? { body: geminiResponse() };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, sent };
}

const call = { purpose: "test", model: "gemini-3.5-flash-lite", system: "sys", prompt: "prompt", schema: Schema, maxTokens: 2000, effort: "low" as const, fallback: false };
const noWait = { minIntervalMs: 0, sleep: async () => undefined };

afterEach(() => vi.unstubAllGlobals());

describe("Gemini JSON schema", () => {
  it("drops keywords constrained decoding does not support", () => {
    const json = JSON.stringify(geminiJsonSchema(ArticleDraftSchema));
    expect(json).not.toMatch(/"\$schema"|"pattern"|"minLength"|"maxLength"/);
    expect(json).toContain('"headline"');
    expect(json).toContain('"additionalProperties":false');
  });
});

describe("GeminiGateway (official SDK, stubbed transport)", () => {
  it("requests JSON with the schema, then Zod-validates and records usage", async () => {
    const { sent } = stubFetch({ body: geminiResponse() });
    const usage: UsageRecord[] = [];
    const gw = new GeminiGateway("test-key", (u) => void usage.push(u), noWait);
    const res = await gw.structured(call);
    expect(res.data).toEqual({ answer: "ok", score: 7 });
    expect(sent[0].generationConfig.responseMimeType).toBe("application/json");
    expect(sent[0].generationConfig.responseJsonSchema.properties.answer).toBeDefined();
    expect(sent[0].systemInstruction.parts[0].text).toBe("sys");
    expect(usage[0]).toMatchObject({ inputTokens: 1200, outputTokens: 320, costUsd: 0, requestId: "resp_1" });
  });

  it("treats safety and recitation stops as refusals", async () => {
    stubFetch({ body: geminiResponse({ finishReason: "RECITATION" }) });
    await expect(new GeminiGateway("k", () => undefined, noWait).structured(call)).rejects.toMatchObject({ code: "refusal" });
    stubFetch({ body: geminiResponse({ blockReason: "SAFETY" }) });
    await expect(new GeminiGateway("k", () => undefined, noWait).structured(call)).rejects.toMatchObject({ code: "refusal" });
  });

  it("reports truncation and schema violations", async () => {
    stubFetch({ body: geminiResponse({ finishReason: "MAX_TOKENS", text: '{"answer":' }) });
    await expect(new GeminiGateway("k", () => undefined, noWait).structured(call)).rejects.toMatchObject({ code: "truncated" });
    stubFetch({ body: geminiResponse({ text: JSON.stringify({ answer: "", score: 42 }) }) });
    await expect(new GeminiGateway("k", () => undefined, noWait).structured(call)).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("retries rate limits, then succeeds", async () => {
    const { fn } = stubFetch({ status: 429, body: { error: { code: 429, message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } } }, { body: geminiResponse() });
    const res = await new GeminiGateway("k", () => undefined, noWait).structured(call);
    expect(res.data.score).toBe(7);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up with a clear message when the quota stays exhausted", async () => {
    const limited = { status: 429, body: { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } } };
    stubFetch(limited, limited, limited);
    await expect(new GeminiGateway("k", () => undefined, { ...noWait, maxRetries: 2 }).structured(call)).rejects.toThrow(/daily quota/);
  });
});
