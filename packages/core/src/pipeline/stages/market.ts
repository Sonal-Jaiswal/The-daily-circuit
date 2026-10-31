import { Prisma } from "@tdc/db";
import { toDbDate } from "../../time/ist";
import type { PipelineContext, StageResult } from "../context";

/** Stores a snapshot of the watchlist from the licensed provider. Never runs without one. */
export async function marketSnapshotStage(ctx: PipelineContext): Promise<StageResult> {
  if (!ctx.marketProvider) {
    return { status: "SKIPPED", summary: { reason: "No market-data provider configured (MARKET_DATA_PROVIDER=none)" } };
  }
  const watchlist = ctx.settings.watchlist;
  if (!watchlist.length) return { status: "SKIPPED", summary: { reason: "Watchlist is empty" } };
  const quotes = await ctx.marketProvider.getQuotes(watchlist.map((w) => w.providerSymbol));
  const rows: Prisma.StockSnapshotCreateManyInput[] = [];
  const missing: string[] = [];
  for (const w of watchlist) {
    const q = quotes.get(w.providerSymbol);
    if (!q) {
      missing.push(w.symbol);
      continue;
    }
    rows.push({
      provider: ctx.marketProvider.name,
      exchange: w.exchange,
      symbol: w.symbol,
      companyName: w.name,
      instrumentType: w.type,
      sector: w.sector ?? null,
      lastPrice: new Prisma.Decimal(q.lastPrice),
      previousClose: new Prisma.Decimal(q.previousClose),
      changePercent: new Prisma.Decimal(q.changePercent),
      volume: q.volume !== null ? BigInt(Math.round(q.volume)) : null,
      dataTimestamp: q.timestamp,
      editionDate: toDbDate(ctx.editionDate),
    });
  }
  const created = rows.length ? (await ctx.prisma.stockSnapshot.createMany({ data: rows, skipDuplicates: true })).count : 0;
  const movers = rows
    .filter((r) => r.instrumentType === "EQUITY" && Math.abs(Number(r.changePercent)) >= ctx.settings.significantMovePct)
    .map((r) => `${r.symbol} ${Number(r.changePercent).toFixed(2)}%`);
  return {
    status: missing.length && !rows.length ? "PARTIAL" : "SUCCEEDED",
    summary: { requested: watchlist.length, stored: created, missing, significantMovers: movers },
    problems: missing.length ? [`No quote returned for: ${missing.join(", ")}`] : [],
  };
}
