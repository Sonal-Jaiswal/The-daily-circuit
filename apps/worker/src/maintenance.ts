/**
 * Operator tasks that need the production secrets, run from the "Evening edition" workflow:
 *   node dist/maintenance.js check       one tiny request to every configured AI provider + one test image
 *   node dist/maintenance.js illustrate  add AI illustrations to published articles that have none
 */
import { z } from "zod";
import { disconnectPrisma, getPrisma } from "@tdc/db";
import { buildChainEntries } from "@tdc/core/ai/providers";
import { getEnv } from "@tdc/core/env";
import { createImageGenerator } from "@tdc/core/images/cloudflare";
import { attachIllustration } from "@tdc/core/images/illustrate";
import { createLogger } from "@tdc/core/logger";
import type { PipelineContext } from "@tdc/core/pipeline/context";
import { createRevalidator } from "./revalidate";

const env = getEnv();
const log = createLogger({ service: "worker", mode: "maintenance" });

async function check(): Promise<boolean> {
  const entries = buildChainEntries(env, () => () => undefined);
  console.log(`\nAI providers in order: ${entries.map((e) => e.name).join(" → ") || "(none configured)"}`);
  let anyOk = false;
  for (const e of entries) {
    const started = Date.now();
    try {
      const { data, usage } = await e.gateway.structured({
        purpose: "health-check",
        model: e.classifier,
        system: "You are a health check. Reply only with the JSON requested.",
        prompt: 'Return exactly {"ok": true}.',
        schema: z.object({ ok: z.boolean() }),
        maxTokens: 300,
        effort: "low",
        fallback: false,
      });
      anyOk ||= data.ok;
      console.log(`  ✓ ${e.name.padEnd(10)} ${usage.model}  ${Date.now() - started} ms  (${usage.inputTokens} in / ${usage.outputTokens} out)`);
    } catch (error) {
      console.log(`  ✗ ${e.name.padEnd(10)} ${e.classifier}  ${(error as Error).message.slice(0, 300)}`);
    }
  }
  // Providers with a key but no model chosen yet: list what the account can use.
  for (const [name, key, model, url] of [
    ["groq", env.GROQ_API_KEY, env.GROQ_MODEL, "https://api.groq.com/openai/v1/models"],
    ["xai", env.XAI_API_KEY, env.XAI_MODEL, "https://api.x.ai/v1/models"],
  ] as const) {
    if (!key || model) continue;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
      const body = (await res.json()) as { data?: Array<{ id: string; context_window?: number }>; error?: unknown };
      console.log(`
${name}: key ${res.ok ? "valid" : `rejected (${res.status})`}; no model set. Available: ${(body.data ?? []).map((m) => m.id).sort().join(", ") || JSON.stringify(body.error ?? body).slice(0, 200)}`);
    } catch (error) {
      console.log(`
${name}: could not list models: ${(error as Error).message}`);
    }
  }

  const images = createImageGenerator(env);
  if (!images) {
    console.log(`\nImages: not configured (IMAGE_PROVIDER=${env.IMAGE_PROVIDER}, account id ${env.CLOUDFLARE_ACCOUNT_ID ? "set" : "missing"}, token ${env.CLOUDFLARE_AI_TOKEN ? "set" : "missing"})`);
  } else {
    const started = Date.now();
    try {
      const img = await images.generate("Abstract geometric editorial illustration, indigo and marigold circuit lines, no text, no people.", 7);
      console.log(`\nImages: ✓ ${images.name} ${img.model}  ${img.mimeType} ${Math.round(img.data.byteLength / 1024)} KB  ${Date.now() - started} ms`);
    } catch (error) {
      console.log(`\nImages: ✗ ${images.name}  ${(error as Error).message.slice(0, 300)}`);
    }
  }
  return anyOk;
}

async function illustrate(): Promise<void> {
  const prisma = getPrisma();
  const imageGenerator = createImageGenerator(env);
  if (!imageGenerator) throw new Error("Image generation is not configured");
  const articles = await prisma.article.findMany({ where: { status: "PUBLISHED", illustration: null }, orderBy: { publishedAt: "desc" }, take: 20, select: { id: true, headline: true } });
  const ctx = { prisma, log, imageGenerator } as unknown as PipelineContext;
  for (const a of articles) {
    await attachIllustration(ctx, a.id);
    console.log(`  ${(await prisma.articleImage.count({ where: { articleId: a.id } })) ? "✓" : "✗"} ${a.headline}`);
  }
  await createRevalidator(env, log)(["/"]).catch((e) => console.log(`Cache refresh failed: ${(e as Error).message}`));
}

const mode = process.argv[2];
(mode === "check" ? check().then((ok) => (process.exitCode = ok ? 0 : 1)) : mode === "illustrate" ? illustrate() : Promise.reject(new Error("Usage: maintenance.js check|illustrate")))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
