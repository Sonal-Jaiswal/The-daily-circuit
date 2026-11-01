import { HttpError, isTransientError, withRetry } from "../util/retry";
import type { GeneratedImage, ImageGenerator } from "./illustrate";

/**
 * Cloudflare Workers AI text-to-image (FLUX.1 schnell by default). The free daily allocation
 * covers far more than the ten illustrations an edition needs.
 */
export class CloudflareImageGenerator implements ImageGenerator {
  readonly name = "cloudflare";
  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly model = "@cf/black-forest-labs/flux-1-schnell",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(prompt: string, seed: number): Promise<GeneratedImage> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}/ai/run/${this.model}`;
    const body = await withRetry(
      async () => {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, steps: 4, seed }),
          signal: AbortSignal.timeout(60_000),
        });
        const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { image?: string }; image?: string; errors?: Array<{ message?: string }> };
        if (!res.ok || json.success === false) throw new HttpError(`Cloudflare AI returned ${res.status}: ${json.errors?.[0]?.message ?? "unknown error"}`, res.status || 502, url);
        return json;
      },
      { retries: 2, shouldRetry: isTransientError },
    );
    const b64 = body.result?.image ?? body.image;
    if (!b64) throw new Error("Cloudflare AI response contained no image");
    const data = Buffer.from(b64, "base64");
    // FLUX returns JPEG; sniff PNG just in case the model changes.
    const mimeType = data[0] === 0x89 && data[1] === 0x50 ? "image/png" : "image/jpeg";
    return { data, mimeType, model: this.model };
  }
}

export function createImageGenerator(env: { IMAGE_PROVIDER: string; CLOUDFLARE_ACCOUNT_ID?: string; CLOUDFLARE_AI_TOKEN?: string; CLOUDFLARE_IMAGE_MODEL: string }): ImageGenerator | null {
  if (env.IMAGE_PROVIDER === "cloudflare" && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) {
    return new CloudflareImageGenerator(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_AI_TOKEN, env.CLOUDFLARE_IMAGE_MODEL);
  }
  return null;
}
