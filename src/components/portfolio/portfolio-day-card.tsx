import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/panel";
import { AreaChart } from "@/components/market/area-chart";
import { LoadingBlock } from "@/components/states";
import { chartTimeLabel } from "@/components/market/chart-modal";
import {
  globalDaySeriesQuery,
  globalHistoryQuery,
  globalValuationQuery,
  investmentSummaryQuery,
  portfolioHistoryQuery,
  portfolioIntradayQuery,
  type GlobalHistoryLot,
} from "@/lib/queries";
import { deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "All"] as const;
type RangeKey = (typeof RANGES)[number];

/** NEPSE history window per range; 1W reuses the 1-month daily fetch, sliced. */
const NEPSE_MONTHS: Record<Exclude<RangeKey, "1D">, number> = {
  "1W": 1,
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  All: 60,
};

const GLOBAL_RANGE: Record<Exclude<RangeKey, "1D">, "1M" | "3M" | "6M" | "1Y" | "MAX"> = {
  "1W": "1M",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  All: "MAX",
};

function dayLabel(time: number): string {
  return new Date(time * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  });
}

/**
 * Whole-book worth line. 1D is the round-the-clock session merge (NEPSE
 * ticks plus each global market's own session, flat while a market sleeps);
 * longer ranges walk NEPSE daily closes plus dated global buys/sells, so the
 * line starts at the first position — never renders value before it existed.
 * Shared by dashboard and analytics.
 */
export function PortfolioDayCard({ holdings }: { holdings: { scrip: string; units: number; price: number }[] }) {
  const [range, setRange] = useState<RangeKey>("1D");
  const isDay = range === "1D";

  const intraday = useQuery(portfolioIntradayQuery(holdings, isDay));
  const investment = useQuery(investmentSummaryQuery());
  const globalTxns = useGlobalTxns();
  const globalLots = useMemo(
    () =>
      deriveHoldings(globalTxns).map((h) => ({
        symbol: h.symbol,
        qty: h.qty,
        avgPrice: h.avgPrice,
        currency: h.currency,
      })),
    [globalTxns],
  );
  const globalValuation = useQuery({ ...globalValuationQuery(globalLots, true) });
  const daySeries = useQuery({ ...globalDaySeriesQuery(globalLots, isDay) });

  // Longer ranges: NEPSE daily closes (units-aware) + dated global lots.
  const nepseHistory = useQuery(
    portfolioHistoryQuery(
      holdings.map((h) => ({ scrip: h.scrip, units: h.units })),
      isDay ? 1 : NEPSE_MONTHS[range],
      "day",
      !isDay,
    ),
  );
  const historyLots = useMemo<GlobalHistoryLot[]>(() => {
    const lots = new Map<string, { date: string; side: string; qty: number; price: number }[]>();
    const ccy = new Map<string, string>();
    for (const t of globalTxns) {
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
  }, [globalTxns]);
  const globalHistory = useQuery({
    ...globalHistoryQuery(historyLots, isDay ? "1M" : GLOBAL_RANGE[range]),
    enabled: !isDay && historyLots.length > 0,
  });

  const globalRows = useMemo(() => (globalValuation.data?.rows ?? []).filter((r) => r.ok), [globalValuation.data]);
  const globalNow = useMemo(() => globalRows.reduce((s, r) => s + r.valueNpr, 0), [globalRows]);
  const globalCost = useMemo(() => globalRows.reduce((s, r) => s + r.qty * r.avgBuyNpr, 0), [globalRows]);
  const invested = (investment.data?.totalInvestment ?? 0) + globalCost;
  const nepseLive = useMemo(() => holdings.reduce((s, h) => s + h.units * h.price, 0), [holdings]);

  // 1D merge: union of NEPSE + global timestamps, each leg flat outside its
  // own prints (pre-open holds the first print, nights hold the last).
  const dayPoints = useMemo(() => {
    const nepsePts = intraday.data?.points ?? [];
    const globalPts = daySeries.data?.points ?? [];
    const cutoff = Date.now() / 1000 - 24 * 3600;
    const stamps = [...new Set([...nepsePts.map((p) => p.time), ...globalPts.map((p) => p.time)])]
      .filter((t) => t >= cutoff)
      .sort((a, b) => a - b);
    if (stamps.length === 0) return [];
    const at = (pts: { time: number; value: number }[], t: number, flat: number) => {
      if (pts.length === 0) return flat;
      let v = pts[0]!.value;
      for (const p of pts) {
        if (p.time <= t) v = p.value;
        else break;
      }
      return v;
    };
    return stamps.map((t) => ({
      time: t,
      value: at(nepsePts, t, nepseLive) + at(globalPts, t, globalNow),
    }));
  }, [intraday.data, daySeries.data, nepseLive, globalNow]);

  // Longer-range merge: each leg holds its last print, 0 before its first —
  // the line starts at the first position, never before it existed.
  const historyPoints = useMemo(() => {
    const nepsePts = nepseHistory.data?.points ?? [];
    const globalPts = globalHistory.data?.points ?? [];
    const at = (pts: { time: number; value: number }[], t: number) => {
      if (pts.length === 0 || t < pts[0]!.time) return 0;
      let v = pts[0]!.value;
      for (const p of pts) {
        if (p.time <= t) v = p.value;
        else break;
      }
      return v;
    };
    let stamps = [...new Set([...nepsePts.map((p) => p.time), ...globalPts.map((p) => p.time)])].sort((a, b) => a - b);
    if (range === "1W") {
      const cutoff = Date.now() / 1000 - 7 * 86400;
      stamps = stamps.filter((t) => t >= cutoff);
    }
    return stamps.map((t) => ({ time: t, value: at(nepsePts, t) + at(globalPts, t) }));
  }, [nepseHistory.data, globalHistory.data, range]);

  // Session ticks print rough (one illiquid holding jumps the whole sum),
  // so the 1D trace is a trailing median of 5 instead of the raw spikes.
  // Median keeps real level moves but erases lone bad ticks (a mean would
  // smear them). Daily closes don't need it.
  const line = useMemo(() => {
    const points = isDay ? dayPoints : historyPoints;
    if (!isDay) return points;
    const n = 5;
    const smoothed = points.map((p, i) => {
      const vals = points
        .slice(Math.max(0, i - n + 1), i + 1)
        .map((q) => q.value)
        .sort((a, b) => a - b);
      return { time: p.time, value: vals[Math.floor(vals.length / 2)]! };
    });
    // Anchor the end to the live total — the median would otherwise leave
    // the line's right edge floating away from the headline number.
    if (smoothed.length > 0 && points.length > 0) {
      smoothed[smoothed.length - 1] = {
        time: points[points.length - 1]!.time,
        value: points[points.length - 1]!.value,
      };
    }
    return smoothed;
  }, [dayPoints, historyPoints, isDay]);
  // Cost baseline only earns its pixels when it lands inside the range —
  // a far-away line would squash the whole chart flat.
  const lo = line.length > 0 ? Math.min(...line.map((p) => p.value)) : 0;
  const hi = line.length > 0 ? Math.max(...line.map((p) => p.value)) : 0;
  const showCost = invested > 0 && invested >= lo && invested <= hi;

  if (holdings.length === 0 && globalLots.length === 0) return null;

  // Loading only when the active range is fetching with nothing to draw yet —
  // background refetches keep the current line on screen. (isFetching, not
  // isPending: disabled ranges never fetch and must not spin forever.)
  const fetching = isDay
    ? intraday.isFetching || daySeries.isFetching
    : nepseHistory.isFetching || globalHistory.isFetching;
  const pending = fetching && line.length < 2;

  return (
    <Panel as="section">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Portfolio</h2>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Portfolio range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[0.68rem] font-medium transition-colors",
                range === r
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {pending ? (
        <LoadingBlock label={isDay ? "Building the last 24 hours" : `Building ${range}`} rows={1} />
      ) : line.length < 2 ? (
        <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
          {isDay
            ? "No prints in the last 24 hours yet — the line appears once a market you hold moves."
            : "No history in this range yet — try a longer one."}
        </p>
      ) : (
        <>
          <AreaChart
            points={line}
            height={144}
            wacc={showCost ? invested : null}
            formatValue={(v) => formatNpr(v)}
            formatLabel={(t) => (isDay ? chartTimeLabel(t) : dayLabel(t))}
          />
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {isDay
              ? "Last day across every market you hold — flat while a market sleeps, global at current FX."
              : "Closes across every market you hold — starts at your first position, global at current FX."}
            {showCost ? " Dotted line = what you paid in." : ""}
          </p>
        </>
      )}
    </Panel>
  );
}
