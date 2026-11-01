import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ChainGateway } from "../../src/ai/chain";
import { LlmError, ScriptedGateway, type LlmGateway, type StructuredCall } from "../../src/ai/gateway";
import { OpenAICompatGateway, ProviderHttpError } from "../../src/ai/openai-compat";
import { buildChainEntries, providerOrder } from "../../src/ai/providers";
import { CloudflareImageGenerator } from "../../src/images/cloudflare";
import { illustrationPrompt } from "../../src/images/illustrate";

const Schema = z.object({ answer: z.string().min(1) });
const call = (purpose = "classify"): StructuredCall<{ answer: string }> => ({ purpose, model: "ignored", system: "s", prompt: "p", schema: Schema, maxTokens: 500, effort: "low", fallback: true });

function failing(error: unknown): LlmGateway {
  return { structured: vi.fn(async () => { throw error; }) };
}

describe("provider chain", () => {
  it("falls through to the next provider and picks each provider's model by purpose", async () => {
    const second = new ScriptedGateway(() => ({ answer: "from second" }));
    const chain = new ChainGateway([
      { name: "gemini", gateway: failing(new ProviderHttpError("quota", 429)), writer: "g-w", classifier: "g-c" },
      { name: "openrouter", gateway: second, writer: "o-w", classifier: "o-c" },
    ]);
    expect((await chain.structured(call("write-article"))).data.answer).toBe("from second");
    expect(second.calls[0]!.model).toBe("o-w");
    await chain.structured(call("classify"));
    expect(second.calls[1]!.model).toBe("o-c");
  });

  it("skips a provider for the rest of the run once its quota is exhausted", async () => {
    const quota = failing(new ProviderHttpError("Resource exhausted", 429));
    const chain = new ChainGateway([
      { name: "gemini", gateway: quota, writer: "a", classifier: "a" },
      { name: "openrouter", gateway: new ScriptedGateway(() => ({ answer: "ok" })), writer: "b", classifier: "b" },
    ]);
    await chain.structured(call());
    await chain.structured(call());
    expect(quota.structured).toHaveBeenCalledTimes(1);
  });

  it("tries the next provider after invalid output, but keeps the first provider for later calls", async () => {
    const flaky = failing(new LlmError("bad json", "invalid_output"));
    const chain = new ChainGateway([
      { name: "gemini", gateway: flaky, writer: "a", classifier: "a" },
      { name: "groq", gateway: new ScriptedGateway(() => ({ answer: "ok" })), writer: "b", classifier: "b" },
    ]);
    await chain.structured(call());
    await chain.structured(call());
    expect(flaky.structured).toHaveBeenCalledTimes(2);
  });

  it("reports every provider's failure when all fail", async () => {
    const chain = new ChainGateway([
      { name: "gemini", gateway: failing(new ProviderHttpError("quota", 429)), writer: "a", classifier: "a" },
      { name: "openrouter", gateway: failing(new LlmError("declined", "refusal")), writer: "b", classifier: "b" },
    ]);
    await expect(chain.structured(call())).rejects.toThrow(/gemini\/a: quota \| openrouter\/b: refusal: declined/);
  });

  it("only passes Claude's refusal fallback to providers that support it", async () => {
    const g = new ScriptedGateway(() => ({ answer: "ok" }));
    await new ChainGateway([{ name: "gemini", gateway: g, writer: "a", classifier: "a" }]).structured(call());
    expect(g.calls[0]!.fallback).toBe(false);
  });
});

describe("provider configuration", () => {
  const base = {
    LLM_PROVIDER: "anthropic",
    LLM_PROVIDERS: "gemini, openrouter ,groq,unknown,anthropic",
    CLAUDE_WRITER_MODEL: "claude-sonnet-5-5",
    CLAUDE_CLASSIFIER_MODEL: "claude-haiku-5-5",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    GEMINI_MIN_INTERVAL_MS: 0,
    OPENROUTER_MODELS: "x/model-a:free,openrouter/free",
    NEXT_PUBLIC_SITE_URL: "https://aiblog.fun",
  };

  it("orders providers and ignores unknown names", () => {
    expect(providerOrder(base)).toEqual(["gemini", "openrouter", "groq", "anthropic"]);
    expect(providerOrder({ LLM_PROVIDER: "gemini", LLM_PROVIDERS: undefined })).toEqual(["gemini"]);
  });

  it("includes only providers with keys (and a model where one is required)", () => {
    const entries = buildChainEntries({ ...base, GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o", GROQ_API_KEY: "q" }, () => () => undefined);
    expect(entries.map((e) => e.name)).toEqual(["gemini", "openrouter"]); // groq has no GROQ_MODEL; anthropic no key
    expect(entries[1]!.writer).toBe("x/model-a:free");
  });
});

describe("OpenAI-compatible gateway", () => {
  const reply = (over: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ id: "gen-1", model: "x/model-a:free", choices: [{ finish_reason: "stop", message: { content: '```json\n{"answer":"hi"}\n```' } }], usage: { prompt_tokens: 100, completion_tokens: 20 }, ...over }), { status: 200 });

  it("sends a JSON schema, strips code fences, validates and records $0 for free models", async () => {
    let sent: any;
    const usage: any[] = [];
    const gw = new OpenAICompatGateway(
      { name: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", jsonSchema: true, free: true, extraBody: { models: ["x/model-a:free"] }, minIntervalMs: 0, fetchImpl: (async (_u: unknown, init: RequestInit) => ((sent = JSON.parse(String(init.body))), reply())) as typeof fetch },
      (u) => void usage.push(u),
    );
    const res = await gw.structured({ ...call(), model: "x/model-a:free" });
    expect(res.data).toEqual({ answer: "hi" });
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.models).toEqual(["x/model-a:free"]);
    expect(usage[0]).toMatchObject({ model: "x/model-a:free", inputTokens: 100, costUsd: 0 });
  });

  it("puts the schema in the prompt for JSON-mode providers and maps errors", async () => {
    let sent: any;
    const gw = new OpenAICompatGateway({ name: "groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", jsonSchema: false, free: true, minIntervalMs: 0, fetchImpl: (async (_u: unknown, init: RequestInit) => ((sent = JSON.parse(String(init.body))), reply())) as typeof fetch }, () => undefined);
    await gw.structured(call());
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages[0].content).toContain("JSON Schema");

    const limited = new OpenAICompatGateway({ name: "groq", baseUrl: "https://x", apiKey: "k", jsonSchema: false, free: true, minIntervalMs: 0, fetchImpl: (async () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })) as typeof fetch }, () => undefined);
    await expect(limited.structured(call())).rejects.toMatchObject({ status: 429 });
    const truncated = new OpenAICompatGateway({ name: "groq", baseUrl: "https://x", apiKey: "k", jsonSchema: false, free: true, minIntervalMs: 0, fetchImpl: (async () => reply({ choices: [{ finish_reason: "length", message: { content: '{"ans' } }] })) as typeof fetch }, () => undefined);
    await expect(truncated.structured(call())).rejects.toMatchObject({ code: "truncated" });
  });
});

describe("illustrations", () => {
  it("builds prompts that exclude people, logos and text", () => {
    const p = illustrationPrompt({ section: "MARKETS", imageAlt: 'Illustration of "SEBI" regulatory order' });
    expect(p).toContain("SEBI regulatory order");
    expect(p).toMatch(/no text.*logos.*people, faces/);
    expect(p).toContain("marigold");
  });

  it("realistic style stays to objects and places, never people or events", () => {
    const p = illustrationPrompt({ section: "AI", imageAlt: "data centre expansion", style: "photo" });
    expect(p).toMatch(/Realistic professional photography/);
    expect(p).toMatch(/no people, faces/);
    expect(p).toMatch(/rather than a depiction of a specific real event/);
  });

  it("decodes Cloudflare's base64 JPEG", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    let url = "";
    const gen = new CloudflareImageGenerator("acct", "tok", "@cf/black-forest-labs/flux-1-schnell", (async (u: unknown) => {
      url = String(u);
      return new Response(JSON.stringify({ success: true, result: { image: jpeg.toString("base64") } }), { status: 200 });
    }) as typeof fetch);
    const img = await gen.generate("prompt", 42);
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/black-forest-labs/flux-1-schnell");
    expect(img.mimeType).toBe("image/jpeg");
    expect(img.data.equals(jpeg)).toBe(true);
  });

  it("surfaces Cloudflare errors", async () => {
    const gen = new CloudflareImageGenerator("acct", "tok", undefined, (async () => new Response(JSON.stringify({ success: false, errors: [{ message: "Authentication error" }] }), { status: 401 })) as typeof fetch);
    await expect(gen.generate("p", 1)).rejects.toThrow(/Authentication error/);
  });
});
