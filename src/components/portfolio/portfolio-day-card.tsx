import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { AreaChart } from "@/components/market/area-chart";
import { DeltaPill } from "@/components/stat-card";
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

/** Slim picker: 1D 1W 1M 6M 1Y MAX (canonical list keeps the rest elsewhere). */
const RANGES = CHART_RANGES.filter((r) => r !== "3M" && r !== "5Y");
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
  const [mode, setMode] = useState<"profit" | "total">("profit");
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
  // Build a scrip→waccRate map from investment summary for NEPSE cost basis
  const scripWaccMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of investment.data?.scrips ?? []) {
      m.set(s.scrip.toUpperCase(), s.waccRate);
    }
    return m;
  }, [investment.data?.scrips]);

  // NEPSE cost = sum of each held scrip's waccRate * units (constant for a given session)
  const nepseCost = useMemo(
    () => holdings.reduce((s, h) => s + (scripWaccMap.get(h.scrip.toUpperCase()) ?? 0) * h.units, 0),
    [holdings, scripWaccMap],
  );

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
    const pts: { time: number; value: number; cost: number }[] = [];
    for (let t = Math.ceil(cutoff / 60) * 60; t <= now; t += 60) {
      while (ni < inNepse.length && inNepse[ni]!.time <= t) {
        nv = inNepse[ni]!.value;
        ni += 1;
      }
      while (gi < inGlobal.length && inGlobal[gi]!.time <= t) {
        gv = inGlobal[gi]!.value;
        gi += 1;
      }
      pts.push({ time: t, value: nv + gv, cost: invested });
    }
    return pts;
  }, [intraday.data, daySeries.data, nepseLive, globalNow, invested]);

  // Longer-range merge: each leg holds its last print, 0 before its first —
  // the line starts at the first position, never before it existed.
  // Cost tracks: NEPSE cost is constant (waccRate × units); global cost walks
  // forward through buy/sell lots (each GlobalHistoryPoint carries .cost).
  const historyPoints = useMemo(() => {
    const nepsePts = nepseHistory.data?.points ?? [];
    const globalPts = (globalHistory.data?.points ?? []) as { time: number; value: number; cost: number }[];
    const at = (pts: { time: number; value: number }[], t: number) => {
      if (pts.length === 0 || t < pts[0]!.time) return 0;
      let v = pts[0]!.value;
      for (const p of pts) {
        if (p.time <= t) v = p.value;
        else break;
      }
      return v;
    };
    const atCost = (pts: { time: number; cost: number }[], t: number) => {
      if (pts.length === 0 || t < pts[0]!.time) return 0;
      let v = pts[0]!.cost;
      for (const p of pts) {
        if (p.time <= t) v = p.cost;
        else break;
      }
      return v;
    };
    let stamps = [...new Set([...nepsePts.map((p) => p.time), ...globalPts.map((p) => p.time)])].sort((a, b) => a - b);
    if (range === "1W") {
      const cutoff = Date.now() / 1000 - 7 * 86400;
      stamps = stamps.filter((t) => t >= cutoff);
    }
    // On dates where NEPSE is active, nepseCost applies; on dates where only global, just global cost
    const hasNepse = nepsePts.length > 0;
    return stamps.map((t) => {
      const nepseVal = at(nepsePts, t);
      const globalVal = at(globalPts, t);
      // NEPSE cost is static (current WACC); global cost walks from history
      const nc = hasNepse && t >= nepsePts[0]!.time ? nepseCost : 0;
      const gc = atCost(globalPts, t);
      return { time: t, value: nepseVal + globalVal, cost: nc + gc };
    });
  }, [nepseHistory.data, globalHistory.data, range, nepseCost]);

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
      return { time: p.time, value: vals[Math.floor(vals.length / 2)]!, cost: p.cost };
    });
    // Anchor the end to the live total — the median would otherwise leave
    // the line's right edge floating away from the headline number.
    if (smoothed.length > 0 && points.length > 0) {
      smoothed[smoothed.length - 1] = {
        time: points[points.length - 1]!.time,
        value: points[points.length - 1]!.value,
        cost: points[points.length - 1]!.cost,
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
    return [...line, { time: nowSec, value: last.value, cost: last.cost }];
  }, [line, nowSec]);
  // Derive the drawn points and cost series based on mode
  const drawnPoints = useMemo(
    () =>
      mode === "profit"
        ? tailed.map((p) => ({ time: p.time, value: p.value - p.cost }))
        : tailed.map((p) => ({ time: p.time, value: p.value })),
    [tailed, mode],
  );

  const costSeries = useMemo(
    () => tailed.map((p) => ({ time: p.time, value: p.cost })),
    [tailed],
  );

  // Only show the dashed investment line when it falls within the chart's
  // natural data range — otherwise it squashes the actual trace flat.
  const drawnLo = drawnPoints.length > 0 ? Math.min(...drawnPoints.map((p) => p.value)) : 0;
  const drawnHi = drawnPoints.length > 0 ? Math.max(...drawnPoints.map((p) => p.value)) : 0;

  const showZeroLine = mode === "profit" && 0 >= drawnLo && 0 <= drawnHi;
  const showCostSeries =
    mode === "total" &&
    costSeries.length > 0 &&
    costSeries.some((p) => p.value >= drawnLo && p.value <= drawnHi);

  const waccLine = showZeroLine ? 0 : null;
  const waccSeriesData = showCostSeries ? costSeries : undefined;

  /** Window move: last vs first print of the drawn line. Drives the pill and line color. */
  const windowPct =
    drawnPoints.length >= 2 && drawnPoints[0]!.value !== 0
      ? ((drawnPoints[drawnPoints.length - 1]!.value - drawnPoints[0]!.value) / Math.abs(drawnPoints[0]!.value)) * 100
      : tailed.length >= 2 && tailed[0]!.value > 0
        ? ((tailed[tailed.length - 1]!.value - tailed[0]!.value) / tailed[0]!.value) * 100
        : null;
  const windowChange =
    drawnPoints.length >= 2
      ? drawnPoints[drawnPoints.length - 1]!.value - drawnPoints[0]!.value
      : null;

  /** Leg census for the 1D merge: which holdings made it into today's line. */
  const census = useMemo(() => {
    if (!isDay) return null;
    const nepse = holdings.filter((h) => h.units > 0).map((h) => h.scrip.toUpperCase());
    const mappedNepse = new Set(Object.keys(intraday.data?.ticks ?? {}));
    const failed = new Set(
      ((daySeries.data as { failed?: string[] } | undefined)?.failed ?? []).map((s) => s.toUpperCase()),
    );
    const global = globalLots.filter((l) => l.qty > 0).map((l) => l.symbol.toUpperCase());
    const missing = [...nepse.filter((s) => !mappedNepse.has(s)), ...global.filter((s) => failed.has(s))];
    if (daySeries.isPending) missing.push(...global.filter((s) => !failed.has(s)));
    return {
      total: nepse.length + global.length,
      mapped: nepse.length + global.length - [...new Set(missing)].length,
      missing: [...new Set(missing)],
      mapping: intraday.isPending || daySeries.isPending,
    };
  }, [isDay, holdings, globalLots, intraday.data, intraday.isPending, daySeries]);

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
          {windowPct != null && windowChange != null ? (
            <DeltaPill value={windowChange}>
              {`${windowChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(windowChange), { compact: true })} (${windowPct >= 0 ? "+" : ""}${windowPct.toFixed(2)}%)`}
            </DeltaPill>
          ) : null}
          <Link
            to="/terminal"
            search={{ mode: "portfolio" }}
            className="inline-flex items-center gap-0.5 text-[0.68rem] font-medium text-primary opacity-100 transition-opacity hover:underline [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          >
            Net worth <ArrowUpRight className="size-3" />
          </Link>
          {census && census.total > 0 && (census.mapping || census.missing.length > 0) ? (
            <span
              title={
                census.mapping
                  ? "Still pulling today's ticks — the line fills in as legs arrive"
                  : `Not in today's line: ${census.missing.slice(0, 6).join(", ")}${census.missing.length > 6 ? ` +${census.missing.length - 6} more` : ""}`
              }
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-1.5 py-0.5 text-[0.68rem] text-muted-foreground"
            >
              <span className="relative flex size-1.5">
                {census.mapping ? (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                ) : null}
                <span
                  className={`relative inline-flex size-1.5 rounded-full ${census.mapping ? "bg-primary" : "bg-amber-500"}`}
                />
              </span>
              {census.mapping ? (
                <>
                  Mapping {census.mapped}/{census.total}…
                </>
              ) : (
                <>
                  {census.mapped}/{census.total} mapped
                </>
              )}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <div
            role="group"
            aria-label="Portfolio measure"
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
            points={drawnPoints}
            height={144}
            anchor={waccLine}
            wacc={waccLine}
            waccSeries={waccSeriesData}
            includeWaccDomain
            tooltipExtra={(pt) => {
              const orig = tailed.find((p) => p.time === pt.time);
              if (!orig) return null;
              const pl = orig.value - orig.cost;
              const plPct = orig.cost > 0 ? (pl / orig.cost) * 100 : 0;
              return (
                <div className="space-y-1 text-[0.68rem] text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Investment:</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatNpr(orig.cost, { compact: true })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Net P/L:</span>
                    <span className={cn("font-mono font-medium", pl >= 0 ? "text-gain" : "text-loss")}>
                      {pl >= 0 ? "+" : "-"}
                      {formatNpr(Math.abs(pl), { compact: true })} ({plPct >= 0 ? "+" : ""}
                      {plPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              );
            }}
            formatValue={(v) => {
              const absFormatted = formatNpr(Math.abs(v), { compact: true });
              if (mode === "profit") {
                if (Math.abs(v) < 0.01) return absFormatted;
                return `${v >= 0 ? "+" : "-"}${absFormatted}`;
              }
              return absFormatted;
            }}
            formatLabel={(t) => (isDay ? chartTimeLabel(t) : dayLabel(t))}
          />
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {mode === "profit"
              ? "Profit = value minus what you paid (average cost). "
              : "Total = portfolio value over time vs investment line (dashed). "}
            {isDay
              ? "Last day across every market you hold — flat while a market sleeps, global at current FX."
              : "Closes across every market you hold — starts at your first position, global at current FX."}
          </p>
        </Link>
      )}
    </Panel>
  );
}
