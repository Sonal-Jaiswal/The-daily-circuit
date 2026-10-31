import { formatIstDateTime } from "@tdc/core/time/ist";
import type { PublicSnapshot, SnapshotRow } from "@/lib/data";
import { cn } from "@/lib/utils";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function Change({ value }: { value: number }) {
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={cn("tabular font-semibold", flat ? "text-ink-3" : up ? "text-up" : "text-down")}>
      <span className="sr-only">{up ? "up" : flat ? "unchanged" : "down"} </span>
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function Rows({ rows }: { rows: SnapshotRow[] }) {
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => (
        <li key={`${r.exchange}:${r.symbol}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            <span className="font-semibold">{r.symbol}</span>
            <span className="ml-2 truncate text-ink-3">{r.name}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <span className="tabular text-ink-2">₹{inr.format(r.lastPrice)}</span>
            <Change value={r.changePercent} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Shown only when a licensed market-data provider is configured. Otherwise the homepage
 * states plainly that live data is not displayed, rather than showing invented numbers.
 */
export function MarketSnapshot({ snapshot }: { snapshot: PublicSnapshot | null }) {
  if (!snapshot) {
    return (
      <section aria-labelledby="snapshot-heading" className="rounded-lg border border-rule bg-surface p-5">
        <h2 id="snapshot-heading" className="text-lg font-bold tracking-tight">
          Market snapshot
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Index and stock prices appear here once a licensed exchange-data feed is connected. Until then, our markets desk reports from RBI, SEBI and company disclosures, and every figure in an article links to its source.
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="snapshot-heading" className="rounded-lg border border-rule bg-surface p-5">
      <h2 id="snapshot-heading" className="text-lg font-bold tracking-tight">
        Market snapshot
      </h2>
      <p className="tabular mt-1 text-xs text-ink-3">
        As of {formatIstDateTime(snapshot.asOf)}. Data: {snapshot.provider}. Delayed; for information only.
      </p>
      <div className="mt-3">
        {snapshot.indices.map((i) => (
          <div key={i.symbol} className="flex items-baseline justify-between border-b border-rule py-2">
            <span className="font-semibold">{i.name}</span>
            <span className="flex items-baseline gap-3">
              <span className="tabular text-lg font-bold">{inr.format(i.lastPrice)}</span>
              <Change value={i.changePercent} />
            </span>
          </div>
        ))}
      </div>
      {snapshot.gainers.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-ink-2">Top gainers in our watchlist</h3>
          <Rows rows={snapshot.gainers} />
        </>
      )}
      {snapshot.losers.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-ink-2">Top losers in our watchlist</h3>
          <Rows rows={snapshot.losers} />
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">Price moves are not recommendations. See our financial disclaimer.</p>
    </section>
  );
}
