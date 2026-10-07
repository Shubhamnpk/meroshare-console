import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/panel";
import { DeltaPill } from "@/components/stat-card";
import { AreaChart } from "@/components/market/area-chart";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { globalHistoryQuery, type GlobalHistoryLot } from "@/lib/queries";
import type { GlobalTxn } from "@/lib/world/import";
import { formatNpr } from "@/lib/format";

const RANGES = ["1M", "3M", "6M", "1Y", "MAX"] as const;
type RangeKey = (typeof RANGES)[number];

/**
 * What the Global book was actually worth over time: positions walk forward
 * through dated buys and sells, so the line starts at the first buy — never
 * renders value before any holding existed.
 */
export function GlobalHistoryPanel({ txns }: { txns: GlobalTxn[] }) {
  const [range, setRange] = useState<RangeKey>("1M");
  const [mode, setMode] = useState<"profit" | "total">("profit");
  const holdings = useMemo<GlobalHistoryLot[]>(() => {
    const lots = new Map<string, { date: string; side: string; qty: number; price: number }[]>();
    const ccy = new Map<string, string>();
    for (const t of txns) {
      if (!t.symbol) continue;
      const arr = lots.get(t.symbol) ?? [];
      arr.push({ date: t.date, side: t.side, qty: t.qty, price: t.price ?? 0 });
      lots.set(t.symbol, arr);
      if (!ccy.has(t.symbol) && t.currency) ccy.set(t.symbol, t.currency);
    }
    return [...lots.entries()].map(([symbol, symbolLots]) => ({
      symbol,
      currency: ccy.get(symbol) ?? "",
      lots: symbolLots,
    }));
  }, [txns]);
  const history = useQuery({ ...globalHistoryQuery(holdings, range) });
  const serverPoints = history.data?.points;
  const failed = history.data?.failed ?? [];
  const points = useMemo(() => {
    const list = serverPoints ?? [];
    return mode === "profit"
      ? list.map((p) => ({ time: p.time, value: p.value - p.cost }))
      : list.map((p) => ({ time: p.time, value: p.value }));
  }, [serverPoints, mode]);
  const start = points.length > 0 ? points[0]!.value : 0;
  const end = points.length > 0 ? points[points.length - 1]!.value : 0;
  const change = end - start;
  const pct = start > 0 ? (change / start) * 100 : 0;

  return (
    <Panel as="section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold">Global history</h2>
          {points.length >= 2 ? (
            <DeltaPill value={change}>
              {`${change >= 0 ? "+" : ""}${formatNpr(change, { compact: true })} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`}
            </DeltaPill>
          ) : null}
          {history.isFetching && !history.isPending ? (
            <span className="animate-pulse text-[0.68rem] text-muted-foreground">Updating…</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <div
            role="group"
            aria-label="History measure"
            className="mr-1 flex overflow-hidden rounded-full border border-border/60"
          >
            {(["profit", "total"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-0.5 text-[0.68rem] font-medium capitalize transition-colors ${
                  mode === m ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium transition-colors ${
                range === r
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {history.isPending ? (
        <LoadingBlock label="Building global history" rows={1} />
      ) : history.isError ? (
        <ErrorBlock error={history.error} retry={() => void history.refetch()} />
      ) : points.length < 2 ? (
        <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
          Not enough price history for these holdings yet.
        </p>
      ) : (
        <>
          <AreaChart
            points={points}
            height={240}
            formatValue={(v) => formatNpr(v, { compact: true })}
            formatLabel={(t) =>
              new Date(t * 1000).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            }
          />
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {mode === "profit"
              ? "Profit = value minus what you paid (average cost); Total = value plus cost. "
              : "Total = what you paid plus profit. "}
            Follows your actual buys and sells — starts at your first buy, not a backcast. Converted
            at current FX rates.
            {failed.length > 0 ? ` Excludes ${failed.join(", ")} (no history).` : ""}
          </p>
        </>
      )}
    </Panel>
  );
}
