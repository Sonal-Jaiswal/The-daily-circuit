import { z } from "zod";
import { fetchText } from "../util/http";
import { isTransientError, withRetry } from "../util/retry";

export interface Quote {
  providerSymbol: string;
  lastPrice: number;
  previousClose: number;
  changePercent: number;
  volume: number | null;
  /** Timestamp reported by the provider for this quote. */
  timestamp: Date;
}

export interface MarketDataProvider {
  readonly name: string;
  getQuotes(providerSymbols: string[]): Promise<Map<string, Quote>>;
}

const num = z.union([z.number(), z.string()]).transform((v) => (typeof v === "number" ? v : Number(v)));

const EodhdQuote = z.object({
  code: z.string(),
  timestamp: num,
  close: num,
  previousClose: num,
  change_p: num.optional(),
  volume: num.optional(),
});

/**
 * EODHD real-time (delayed) quotes. Displaying exchange data publicly requires a plan that
 * licenses redistribution; the platform will not show it until MARKET_DATA_REDISTRIBUTION_LICENSED=true.
 */
export class EodhdProvider implements MarketDataProvider {
  readonly name = "eodhd";
  constructor(
    private readonly apiToken: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (let i = 0; i < symbols.length; i += 15) {
      const batch = symbols.slice(i, i + 15);
      const [first, ...rest] = batch;
      const url = new URL(`https://eodhd.com/api/real-time/${encodeURIComponent(first!)}`);
      if (rest.length) url.searchParams.set("s", rest.join(","));
      url.searchParams.set("fmt", "json");
      url.searchParams.set("api_token", this.apiToken);
      const res = await withRetry(() => fetchText(url.toString(), { timeoutMs: 20_000, fetchImpl: this.fetchImpl }), { retries: 2, shouldRetry: isTransientError });
      const body: unknown = JSON.parse(res.text);
      for (const raw of Array.isArray(body) ? body : [body]) {
        const parsed = EodhdQuote.safeParse(raw);
        if (!parsed.success) continue;
        const q = parsed.data;
        if (![q.close, q.previousClose, q.timestamp].every(Number.isFinite) || q.previousClose <= 0) continue; // "NA" values
        const changePercent = Number.isFinite(q.change_p ?? NaN) ? q.change_p! : ((q.close - q.previousClose) / q.previousClose) * 100;
        out.set(q.code, {
          providerSymbol: q.code,
          lastPrice: q.close,
          previousClose: q.previousClose,
          changePercent: Math.round(changePercent * 10_000) / 10_000,
          volume: Number.isFinite(q.volume ?? NaN) ? q.volume! : null,
          timestamp: new Date(q.timestamp * 1000),
        });
      }
    }
    return out;
  }
}

export function createMarketProvider(env: { MARKET_DATA_PROVIDER: string; EODHD_API_TOKEN?: string }, fetchImpl?: typeof fetch): MarketDataProvider | null {
  if (env.MARKET_DATA_PROVIDER === "eodhd" && env.EODHD_API_TOKEN) return new EodhdProvider(env.EODHD_API_TOKEN, fetchImpl);
  return null;
}
