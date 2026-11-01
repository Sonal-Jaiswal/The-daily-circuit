/** USD per million tokens (Anthropic first-party pricing as of 2026-10). */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prompts above this many input tokens bill at the `long` rates (Haiku 5.5). */
  longThreshold?: number;
  long?: { input: number; output: number };
}

const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125, longThreshold: 100_000, long: { input: 0.5, output: 2.5 } },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  // Gemini free tier: no charge. Replace with paid-tier rates if billing is enabled on the key.
  "gemini-3.5-flash-lite": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  "gemini-3.1-flash-lite": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function knownModel(model: string): boolean {
  return model in PRICES;
}

/** Estimated cost in USD. Unknown models are priced at Sonnet rates so spend is never under-reported as zero. */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? PRICES["claude-sonnet-5-5"]!;
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const rates = p.long && p.longThreshold && promptTokens > p.longThreshold ? { ...p, ...p.long } : p;
  const cost =
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheWriteTokens * rates.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
