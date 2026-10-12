import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { AreaChart } from "@/components/market/area-chart";
import { ErrorBlock, LoadingBlock } from "@/components/states";
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
import { CHART_RANGES, type ChartRangeKey } from "@/lib/charts/ranges";

const RANGES = CHART_RANGES;
type RangeKey = ChartRangeKey;

/** NEPSE history window per range; 1W reuses the 1-month daily fetch, sliced. */
const NEPSE_MONTHS: Record<Exclude<RangeKey, "1D">, number> = {
  "1W": 1,
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  "5Y": 60,
  MAX: 120,
};

const GLOBAL_RANGE: Record<Exclude<RangeKey, "1D">, "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX"> = {
  "1W": "1M",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  "5Y": "5Y",
  MAX: "MAX",
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

  // 1D is a true time grid: one point per minute for the last 24 hours, each
  // leg holding its last print (pre-open holds the first print, nights hold
  // the last). Index spacing equals time spacing, so session bumps read as
  // bumps and closed stretches read as flat — a normal value-over-time line
  // that never blanks, even with zero prints (then it is flat at the live
  // total, which holdings alone price).
  const dayPoints = useMemo(() => {
    const nepsePts = intraday.data?.points ?? [];
    const globalPts = daySeries.data?.points ?? [];
    const now = Date.now() / 1000;
    const cutoff = now - 24 * 3600;
    const liveTotal = nepseLive + globalNow;
    if (!(liveTotal > 0)) return [];
    // Per-leg cursors walk forward once across the grid (both inputs ascend).
    const inNepse = nepsePts.filter((p) => p.time >= cutoff - 3600);
    const inGlobal = globalPts.filter((p) => p.time >= cutoff - 3600);
    let ni = 0;
    let gi = 0;
    let nv = inNepse.length > 0 ? inNepse[0]!.value : nepseLive;
    let gv = inGlobal.length > 0 ? inGlobal[0]!.value : globalNow;
    const pts: { time: number; value: number }[] = [];
    for (let t = Math.ceil(cutoff / 60) * 60; t <= now; t += 60) {
      while (ni < inNepse.length && inNepse[ni]!.time <= t) {
        nv = inNepse[ni]!.value;
        ni += 1;
      }
      while (gi < inGlobal.length && inGlobal[gi]!.time <= t) {
        gv = inGlobal[gi]!.value;
        gi += 1;
      }
      pts.push({ time: t, value: nv + gv });
    }
    return pts;
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
  // Continuous flow: when nothing moved lately, run the line flat to right
  // now instead of ending it hours ago. No change prints as a flat tail.
  const nowSec = Math.floor(Date.now() / 1000);
  const tailed = useMemo(() => {
    if (line.length === 0) return line;
    const last = line[line.length - 1]!;
    if (last.time >= nowSec - 60) return line;
    return [...line, { time: nowSec, value: last.value }];
  }, [line, nowSec]);
  // Cost baseline only earns its pixels when it lands inside the range —
  // a far-away line would squash the whole chart flat.
  const lo = tailed.length > 0 ? Math.min(...tailed.map((p) => p.value)) : 0;
  const hi = tailed.length > 0 ? Math.max(...tailed.map((p) => p.value)) : 0;
  const showCost = invested > 0 && invested >= lo && invested <= hi;

  if (holdings.length === 0 && globalLots.length === 0) return null;

  // Loading only when the active range is fetching with nothing to draw yet —
  // background refetches keep the current line on screen. (isFetching, not
  // isPending: disabled ranges never fetch and must not spin forever.)
  const fetching = isDay
    ? intraday.isFetching || daySeries.isFetching
    : nepseHistory.isFetching || globalHistory.isFetching;
  const pending = fetching && tailed.length < 2;
  // A dead feed and a closed market both yield zero points — say which.
  const loadError = isDay ? (intraday.error ?? daySeries.error) : (nepseHistory.error ?? globalHistory.error);
  const retry = () => {
    if (isDay) {
      void intraday.refetch();
      void daySeries.refetch();
    } else {
      void nepseHistory.refetch();
      void globalHistory.refetch();
    }
  };

  return (
    <Panel as="section" className="group">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-semibold">Portfolio</h2>
          <Link
            to="/terminal"
            search={{ mode: "portfolio" }}
            className="inline-flex items-center gap-0.5 text-[0.68rem] font-medium text-primary opacity-100 transition-opacity hover:underline [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          >
            Net worth <ArrowUpRight className="size-3" />
          </Link>
        </div>
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
      ) : tailed.length < 2 && loadError ? (
        <ErrorBlock error={loadError} retry={retry} />
      ) : tailed.length < 2 ? (
        <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
          {isDay
            ? "No prints in the last 24 hours yet. The line appears once a market you hold moves."
            : "No history in this range yet. Try a longer one."}
        </p>
      ) : (
        <Link
          to="/terminal"
          search={{ mode: "portfolio" }}
          className="block cursor-pointer"
          aria-label="Open net worth in terminal"
        >
          <AreaChart
            points={tailed}
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
        </Link>
      )}
    </Panel>
  );
}
