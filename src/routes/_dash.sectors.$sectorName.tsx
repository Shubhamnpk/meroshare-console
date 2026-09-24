import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  Flame,
  Crown,
  History,
  ListOrdered,
  ChartCandlestick,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  screenerDataQuery,
  marketSectorsQuery,
  marketSnapshotQuery,
  indexDailyQuery,
  indexGraphQuery,
} from "@/lib/queries";
import { formatNpr, formatNumber, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { canonicalLink, ogImage } from "@/lib/seo";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { MoverRows, SentimentGauge } from "@/components/tools/market-overview";
import { SectorBadge } from "@/components/market/sector-icon";
import { CompactNpr, CompactQty } from "@/components/market/compact-value";
import { normalizeSectorKey, subindexKeyFor } from "@/lib/nepse/sectors";
import { ScripSheet } from "@/components/market/scrip-sheet";
import type { LivePrice, SectorIndex } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/sectors/$sectorName")({
  head: () => ({
    meta: [
      { title: "Sector Detail | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Deep dive into one NEPSE sector: index chart, breadth, sentiment, top movers, turnover leaders and every constituent.",
      },
      { property: "og:title", content: "Sector Detail | MeroShare Investor Console" },
      ogImage(),
    ],
    links: [canonicalLink("/market-depth")],
  }),
  component: SectorDetailPage,
});

const RANGES = [
  { key: "1D", label: "1D", days: 2 },
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "3Y", label: "3Y", days: 1095 },
  { key: "5Y", label: "5Y", days: 1825 },
  { key: "ALL", label: "All", days: 0 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const INDICATOR_TOGGLES: { key: keyof IndicatorConfig; label: string }[] = [
  { key: "volume", label: "Vol" },
  { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" },
  { key: "ema20", label: "EMA 20" },
  { key: "bollinger", label: "BB" },
  { key: "rsi", label: "RSI" },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*(sub)?index$/i, "")
    .trim();

function resolveSector(
  param: string,
  groups: Map<string, LivePrice[]>,
  sectorIndices: SectorIndex[],
): { name: string; quote: SectorIndex | undefined } | null {
  const want = norm(param);
  if (!want) return null;
  for (const name of groups.keys()) {
    if (norm(name) === want) {
      return { name, quote: findQuote(name, sectorIndices) };
    }
  }
  for (const si of sectorIndices) {
    for (const cand of [si.sector ?? "", si.name, si.code]) {
      if (cand && norm(cand) === want) {
        const groupName = [...groups.keys()].find((g) => norm(g) === want);
        return {
          name: groupName ?? si.sector ?? si.name,
          quote: si,
        };
      }
    }
  }
  // Fuzzy: sector name contains the param or vice versa.
  for (const name of groups.keys()) {
    const n = norm(name);
    if (n.includes(want) || want.includes(n.split(" ")[0] ?? "")) {
      return { name, quote: findQuote(name, sectorIndices) };
    }
  }
  return null;
}

function findQuote(name: string, sectorIndices: SectorIndex[]): SectorIndex | undefined {
  const n = norm(name);
  const aliased = subindexKeyFor(name);
  const first = n.split(" ")[0] ?? "";
  const normEq = (v: string | null | undefined) => normalizeSectorKey(v) === aliased;
  return (
    sectorIndices.find((si) => norm(si.sector ?? "") === n) ??
    sectorIndices.find((si) => norm(si.name) === n) ??
    sectorIndices.find((si) => norm(si.code) === n) ??
    sectorIndices.find((si) => normEq(si.name) || normEq(si.code) || normEq(si.sector)) ??
    sectorIndices.find((si) => norm(si.name).includes(first) && first.length > 2)
  );
}

type ConstituentKey =
  | "symbol"
  | "ltp"
  | "change"
  | "yield"
  | "eps"
  | "high"
  | "low"
  | "volume"
  | "turnover"
  | "trades";

// Latest-dividend yield % + latest reported EPS per symbol, same convention
// as Best Shares / stock compare: yield = latest totalDividend × faceValue
// ÷ (ltp × 100), EPS = newest financial report's EPS.
function useFundamentals(
  prices: LivePrice[],
  dividends: Record<string, import("@/lib/nepse/types").DividendRow[]>,
  financials: Record<string, import("@/lib/nepse/types").FinancialReport[]>,
  faceValues: Record<string, number>,
) {
  return useMemo(() => {
    const map = new Map<string, { yieldPct: number | null; eps: number | null }>();
    for (const p of prices) {
      const latest = (dividends[p.symbol] ?? [])[0] ?? null;
      const fv = faceValues[p.symbol] ?? 100;
      const raw =
        latest && fv > 0 && p.ltp > 0 ? (latest.totalDividend * fv) / (p.ltp * 100) : null;
      map.set(p.symbol, {
        yieldPct: raw != null ? Math.round(raw * 100) / 100 : null,
        eps: financials[p.symbol]?.[0]?.eps ?? null,
      });
    }
    return map;
  }, [prices, dividends, financials, faceValues]);
}

interface MoodStats {
  items: LivePrice[];
  adv: number;
  dec: number;
  flat: number;
  turnover: number;
  volume: number;
  trades: number;
  avgChange: number;
}

function breadthMood(adv: number, dec: number, total: number, avg: number): {
  label: string;
  color: string;
} {
  if (!total) return { label: "Neutral", color: "#a1a1aa" };
  const a = adv / total;
  const d = dec / total;
  if (a >= 0.6) return { label: "Strong Bullish", color: "#22c55e" };
  if (d >= 0.6) return { label: "Strong Bearish", color: "#ef4444" };
  if (avg >= 1) return { label: "Bullish", color: "#22c55e" };
  if (avg <= -1) return { label: "Bearish", color: "#ef4444" };
  if (a > d) return { label: "Mild Bullish", color: "#84cc16" };
  if (d > a) return { label: "Mild Bearish", color: "#f97316" };
  return { label: "Neutral", color: "#a1a1aa" };
}

/**
 * Sector mood indicator: sentiment pill on top wired by a needle + floating
 * tag down into the breadth bar, so the verdict visibly connects to the data.
 */
function MoodCard({ stats }: { stats: MoodStats }) {
  const total = stats.items.length;
  const advPct = total > 0 ? (stats.adv / total) * 100 : 0;
  const flatPct = total > 0 ? (stats.flat / total) * 100 : 0;
  const mood = breadthMood(stats.adv, stats.dec, total, stats.avgChange);
  // Keep the needle + tag inside the card at the extremes.
  const needle = Math.max(3, Math.min(97, advPct));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs sm:p-5">
      {/* Mood glow */}
      <div
        className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full blur-3xl transition-colors duration-500"
        style={{ background: mood.color, opacity: 0.14 }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Sector Mood</h3>
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors duration-500"
            style={{ background: `${mood.color}22`, color: mood.color }}
          >
            <span className="relative flex size-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                style={{ background: mood.color }}
              />
              <span
                className="relative inline-flex size-1.5 rounded-full"
                style={{ background: mood.color }}
              />
            </span>
            {mood.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {stats.adv} of {total} stocks advancing · avg{" "}
          <span className={cn("num font-semibold", stats.avgChange >= 0 ? "text-emerald-400" : "text-red-400")}>
            {formatPercent(stats.avgChange)}
          </span>
        </p>

        {/* Meter: floating tag → needle → breadth bar */}
        <div className="relative mt-8">
          <div
            className="absolute -top-7 -translate-x-1/2 transition-all duration-500"
            style={{ left: `${needle}%` }}
          >
            <span
              className="num rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap"
              style={{ background: `${mood.color}22`, color: mood.color }}
            >
              ▲ {advPct.toFixed(0)}%
            </span>
          </div>
          <div
            className="absolute -top-1.5 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] transition-all duration-500"
            style={{ left: `${needle}%` }}
            title={`${stats.adv} advancing (${advPct.toFixed(1)}%)`}
          />
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${advPct}%` }}
              title={`${stats.adv} Advancers`}
            />
            <div
              className="bg-muted-foreground/30 transition-all duration-500"
              style={{ width: `${flatPct}%` }}
              title={`${stats.flat} Unchanged`}
            />
            <div
              className="bg-red-500 transition-all duration-500"
              style={{ width: `${Math.max(0, 100 - advPct - flatPct)}%` }}
              title={`${stats.dec} Decliners`}
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap justify-between gap-2 text-xs">
          <span className="font-semibold text-emerald-400">▲ {stats.adv} Advancing</span>
          <span className="text-muted-foreground">- {stats.flat} Unchanged</span>
          <span className="font-semibold text-red-400">▼ {stats.dec} Declining</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          <span>
            Turnover{" "}
            <CompactNpr value={stats.turnover} className="num font-bold text-foreground" />
          </span>
          <span>
            Volume <CompactQty value={stats.volume} className="num font-bold text-foreground" />
          </span>
          <span>
            Trades <CompactQty value={stats.trades} className="num font-bold text-foreground" />
          </span>
        </div>
      </div>
    </div>
  );
}

function SectorDetailPage() {
  const navigate = useNavigate();
  const { sectorName } = Route.useParams();
  const { theme } = useSettings();
  const light =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const screenerQuery = useQuery(screenerDataQuery());
  const sectorsQuery = useQuery(marketSectorsQuery());
  const snapshotQuery = useQuery(marketSnapshotQuery());

  const [range, setRange] = useState<RangeKey>("1D");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("area");
  const [indicators, setIndicators] = useState<IndicatorConfig>({ ...DEFAULT_INDICATORS });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const prices = screenerQuery.data?.prices ?? [];
  const sectorIndices = sectorsQuery.data ?? [];
  const marketPrices = snapshotQuery.data?.prices ?? prices;

  const groups = useMemo(() => {
    const map = new Map<string, LivePrice[]>();
    for (const p of prices) {
      const sector = p.sector ?? "Others";
      const arr = map.get(sector) ?? [];
      arr.push(p);
      map.set(sector, arr);
    }
    return map;
  }, [prices]);

  const resolved = useMemo(
    () => resolveSector(sectorName, groups, sectorIndices),
    [sectorName, groups, sectorIndices],
  );

  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? 365;
  const dailyQuery = useQuery(indexDailyQuery(resolved?.name ?? "", rangeDays, Boolean(resolved)));
  const bars = useMemo(
    () => (dailyQuery.data ?? []).filter((b) => b.close > 0),
    [dailyQuery.data],
  );

  // Intraday session line — default view. Falls back to 1W when unpublished.
  const intradayQuery = useQuery({
    ...indexGraphQuery(resolved?.name ?? ""),
    enabled: Boolean(resolved?.name),
  });
  const intradayPoints = intradayQuery.data ?? [];
  const hasIntraday = intradayPoints.length >= 2;

  // Reset to intraday when switching sectors.
  useEffect(() => {
    setRange("1D");
  }, [resolved?.name]);

  // Clear a stale hover readout when the range or sector changes.
  useEffect(() => {
    setHover(null);
  }, [range, resolved?.name]);

  // No intraday published → drop to 1W and leave 1D disabled.
  useEffect(() => {
    if (!intradayQuery.isLoading && intradayPoints.length < 2 && range === "1D") {
      setRange("1W");
    }
  }, [intradayQuery.isLoading, intradayPoints.length, range]);

  const intradayUnavailable = !intradayQuery.isLoading && !hasIntraday;
  const usingIntraday = range === "1D" && chartStyle !== "candles" && hasIntraday;

  // Full-range return for the header default, terminal-style: first close →
  // last close of what's drawn.
  const rangeReturn = useMemo(() => {
    if (usingIntraday) {
      if (intradayPoints.length < 2) return null;
      const first = intradayPoints[0]!.value;
      const last = intradayPoints[intradayPoints.length - 1]!.value;
      return first > 0 ? ((last - first) / first) * 100 : 0;
    }
    if (bars.length === 0) return null;
    const first = bars[0]!.close;
    const last = bars[bars.length - 1]!.close;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [usingIntraday, intradayPoints, bars]);

  const stats = useMemo(() => {
    if (!resolved) return null;
    const items = groups.get(resolved.name) ?? [];
    const adv = items.filter((p) => p.percentChange > 0);
    const dec = items.filter((p) => p.percentChange < 0);
    const flat = items.length - adv.length - dec.length;
    const turnover = items.reduce((s, p) => s + p.turnover, 0);
    const volume = items.reduce((s, p) => s + p.volume, 0);
    const trades = items.reduce((s, p) => s + p.trades, 0);
    const avgChange =
      items.length > 0 ? items.reduce((s, p) => s + p.percentChange, 0) / items.length : 0;
    const grand = marketPrices.reduce((s, p) => s + p.turnover, 0);
    const byChange = [...items].sort((a, b) => b.percentChange - a.percentChange);
    const gainers = byChange.filter((p) => p.percentChange > 0).slice(0, 10);
    const losers = [...byChange]
      .reverse()
      .filter((p) => p.percentChange < 0)
      .slice(0, 10);
    const flats = [...items]
      .filter((p) => p.percentChange === 0)
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 10);
    const leaders = [...items].sort((a, b) => b.turnover - a.turnover).slice(0, 5);
    const nearHigh = items
      .filter((p) => p.fiftyTwoWeekHigh && p.ltp > 0 && p.ltp / p.fiftyTwoWeekHigh >= 0.97)
      .sort((a, b) => b.ltp / (b.fiftyTwoWeekHigh ?? 1) - a.ltp / (a.fiftyTwoWeekHigh ?? 1))
      .slice(0, 5);
    const nearLow = items
      .filter((p) => p.fiftyTwoWeekLow && p.ltp > 0 && p.ltp / p.fiftyTwoWeekLow <= 1.03)
      .sort((a, b) => a.ltp / (a.fiftyTwoWeekLow ?? 1) - b.ltp / (b.fiftyTwoWeekLow ?? 1))
      .slice(0, 5);
    const chg = resolved.quote?.percentChange ?? avgChange;
    const breadthPct = items.length > 0 ? (adv.length / items.length) * 100 : 50;
    const chgSignal = Math.max(0, Math.min(100, 50 + (chg / 3) * 50));
    const sumTurnover = (rows: LivePrice[]) => rows.reduce((s, p) => s + p.turnover, 0);
    return {
      items,
      adv: adv.length,
      dec: dec.length,
      flat,
      turnover,
      volume,
      trades,
      avgChange,
      chg,
      share: grand > 0 ? (turnover / grand) * 100 : 0,
      gainers,
      losers,
      flats,
      gainersTurnover: sumTurnover(gainers),
      losersTurnover: sumTurnover(losers),
      flatsTurnover: sumTurnover(flats),
      leaders,
      nearHigh,
      nearLow,
      score: breadthPct * 0.6 + chgSignal * 0.4,
    };
  }, [resolved, groups, marketPrices]);

  const fundamentals = useFundamentals(
    prices,
    screenerQuery.data?.dividends ?? {},
    screenerQuery.data?.financials ?? {},
    screenerQuery.data?.faceValues ?? {},
  );

  const { sort, toggle } = useSort<ConstituentKey>(
    { key: "turnover", dir: "desc" },
    {
      symbol: "text",
      ltp: "number",
      change: "number",
      yield: "number",
      eps: "number",
      high: "number",
      low: "number",
      volume: "number",
      turnover: "number",
      trades: "number",
    },
  );

  const rows = useMemo(() => {
    if (!stats) return [];
    const getter = (p: LivePrice): number | string => {
      switch (sort.key) {
        case "symbol":
          return p.symbol;
        case "ltp":
          return p.ltp;
        case "change":
          return p.percentChange;
        case "yield":
          return fundamentals.get(p.symbol)?.yieldPct ?? Number.NEGATIVE_INFINITY;
        case "eps":
          return fundamentals.get(p.symbol)?.eps ?? Number.NEGATIVE_INFINITY;
        case "high":
          return p.high;
        case "low":
          return p.low;
        case "volume":
          return p.volume;
        case "turnover":
          return p.turnover;
        default:
          return p.trades;
      }
    };
    return sortBy(stats.items, getter, sort.dir);
  }, [stats, sort, fundamentals]);

  if (screenerQuery.isLoading) return <LoadingBlock label="Loading sector" />;
  if (screenerQuery.isError)
    return <ErrorBlock error={screenerQuery.error} retry={() => void screenerQuery.refetch()} />;
  if (!resolved || !stats)
    return (
      <div className="space-y-5">
        <BackButton onBack={() => void navigate({ to: "/market-depth" })} />
        <EmptyBlock
          title="Sector not found"
          description={`No scrips grouped under "${sectorName}". Pick a sector from the market depth heatmap.`}
        />
      </div>
    );

  const quote = resolved.quote;
  const points = quote?.close ?? null;
  const up = stats.chg >= 0;
  const headerRangeLabel = usingIntraday
    ? "Live intraday session"
    : (RANGES.find((r) => r.key === range)?.label ?? "");
  const maxLeader = stats.leaders[0]?.turnover ?? 1;
  const moverCols = stats.flats.length > 0 ? 3 : 2;
  const extremeCols =
    1 + (stats.nearHigh.length > 0 ? 1 : 0) + (stats.nearLow.length > 0 ? 1 : 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <BackButton onBack={() => void navigate({ to: "/market-depth" })} />
        <SectorBadge sector={resolved.name} className="size-11 rounded-2xl shadow-xs" iconClassName="size-5" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold sm:text-3xl">{resolved.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {stats.items.length} listed scrips · {stats.share.toFixed(1)}% of market turnover
          </p>
        </div>
        <div className="text-right">
          <p className="num text-2xl font-bold">
            {points != null ? formatNumber(points) : "—"}
          </p>
          <p className={cn("num text-xs font-bold", up ? "text-emerald-400" : "text-red-400")}>
            {formatPercent(stats.chg)}
          </p>
        </div>
      </div>

      {/* Breadth + sentiment */}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <MoodCard stats={stats} />
        <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-card/70 px-6 py-3 shadow-xs">
          <SentimentGauge score={stats.score} />
        </div>
      </div>

      {/* Index history chart */}
      <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
        <ChartHeader
          name={resolved.name}
          points={
            hover?.close ??
            (usingIntraday
              ? (intradayPoints[intradayPoints.length - 1]?.value ?? null)
              : (bars[bars.length - 1]?.close ?? quote?.close ?? null))
          }
          chg={hover?.changePercent ?? rangeReturn ?? stats.chg}
          rangeLabel={headerRangeLabel}
          hoverLabel={hover ? "day" : headerRangeLabel}
        />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface p-1 border border-border/60">
            {RANGES.map((r) => {
              const disabled = r.key === "1D" && intradayUnavailable;
              return (
                <button
                  key={r.key}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Intraday not published for this sector" : undefined}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    disabled
                      ? "cursor-not-allowed opacity-35"
                      : "cursor-pointer",
                    range === r.key && !disabled
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg bg-surface border border-border/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChartStyle("area")}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  chartStyle === "area"
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Area
              </button>
              <button
                type="button"
                onClick={() => setChartStyle("candles")}
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                  chartStyle === "candles"
                    ? "bg-muted text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ChartCandlestick className="size-3" />
                Candles
              </button>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowIndicatorMenu((s) => !s)}
                className={cn(
                  "flex items-center gap-1 rounded-lg border border-border/60 bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer",
                  showIndicatorMenu && "border-primary/50 text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3" />
                <span className="hidden sm:inline">Indicators</span>
              </button>

              {showIndicatorMenu && (
                <div className="absolute right-0 top-full z-30 mt-1 flex min-w-40 flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
                  {INDICATOR_TOGGLES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() =>
                        setIndicators((prev) => ({ ...prev, [t.key]: !prev[t.key] }))
                      }
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[0.68rem] font-medium transition-colors cursor-pointer",
                        indicators[t.key]
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="[&_canvas]:touch-none">
          {range === "1D" && (intradayQuery.isLoading || (!hasIntraday && dailyQuery.isLoading)) ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              <span className="inline-block animate-pulse">Loading sector session…</span>
            </div>
          ) : usingIntraday ? (
            <TerminalChart
              bars={[]}
              intraday={intradayPoints}
              style={chartStyle}
              indicators={indicators}
              logScale={false}
              light={light}
              height={300}
              onHover={setHover}
            />
          ) : dailyQuery.isLoading ? (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              <span className="inline-block animate-pulse">Loading sector history…</span>
            </div>
          ) : bars.length >= 2 ? (
            <TerminalChart
              bars={bars}
              intraday={[]}
              style={chartStyle}
              indicators={indicators}
              logScale={false}
              light={light}
              height={300}
              onHover={setHover}
            />
          ) : range === "1D" ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-1.5 p-6 text-center text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">
                Intraday session graph not published
              </p>
              <p className="text-xs">
                Real-time ticks stream during active NEPSE trading hours (11:00 AM – 3:00 PM NPT).
                Switch to 1W or a longer range instead.
              </p>
            </div>
          ) : (
            <div className="flex h-[300px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <p>
                {dailyQuery.isError
                  ? "Couldn't load sector history."
                  : "No sector history found for this range."}
              </p>
              {dailyQuery.isError && (
                <button
                  type="button"
                  onClick={() => void dailyQuery.refetch()}
                  className="rounded-lg border border-border/60 bg-surface px-3 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 cursor-pointer"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Movers: gainers / neutral (when present) / losers */}
      <div className={cn("grid grid-cols-1 gap-3", moverCols === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
        <MoverRows
          title="Top gainers"
          rows={stats.gainers}
          emptyLabel="No gainers this session"
          tone="gain"
          onPick={setPicked}
          stat={stats.gainers.length > 0 ? <CompactNpr value={stats.gainersTurnover} /> : undefined}
        />
        {stats.flats.length > 0 && (
          <MoverRows
            title="Neutral"
            rows={stats.flats}
            emptyLabel="No flat scrips this session"
            tone="flat"
            onPick={setPicked}
            stat={<CompactNpr value={stats.flatsTurnover} />}
          />
        )}
        <MoverRows
          title="Top losers"
          rows={stats.losers}
          emptyLabel="No losers this session"
          tone="loss"
          onPick={setPicked}
          stat={stats.losers.length > 0 ? <CompactNpr value={stats.losersTurnover} /> : undefined}
        />
      </div>

      {/* Turnover leaders + 52w extremes (cards only render when they have data) */}
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          extremeCols === 3 ? "lg:grid-cols-3" : extremeCols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1",
        )}
      >
        <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
          <div className="mb-2.5 flex items-center gap-1.5">
            <Flame className="size-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Turnover Leaders</h3>
          </div>
          <ul className="space-y-2">
            {stats.leaders.map((p, i) => (
              <li key={p.symbol}>
                <button
                  type="button"
                  onClick={() => setPicked(p.symbol)}
                  className="block w-full cursor-pointer text-left"
                >
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-bold text-foreground">
                      <span className="num mr-1.5 text-muted-foreground">{i + 1}.</span>
                      {p.symbol}
                    </span>
                    <CompactNpr value={p.turnover} className="num text-muted-foreground" />
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${maxLeader > 0 ? (p.turnover / maxLeader) * 100 : 0}%` }}
                    />
                  </div>
                </button>
              </li>
            ))}
            {stats.leaders.length === 0 && (
              <p className="text-xs text-muted-foreground">No turnover yet.</p>
            )}
          </ul>
        </div>

        {stats.nearHigh.length > 0 && (
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Crown className="size-4 text-emerald-400" />
              <h3 className="font-display text-sm font-semibold">Near 52-Week High</h3>
            </div>
            <ExtremeList items={stats.nearHigh} onPick={setPicked} high />
          </div>
        )}

        {stats.nearLow.length > 0 && (
          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
            <div className="mb-2.5 flex items-center gap-1.5">
              <History className="size-4 text-red-400" />
              <h3 className="font-display text-sm font-semibold">Near 52-Week Low</h3>
            </div>
            <ExtremeList items={stats.nearLow} onPick={setPicked} high={false} />
          </div>
        )}
      </div>

      {/* All constituents */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <ListOrdered className="size-4 text-primary" />
          <h3 className="font-display text-sm font-semibold">
            All Constituents ({stats.items.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-surface/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <SortableTh label="Symbol" active={sort.key === "symbol"} dir={sort.dir} onClick={() => toggle("symbol")} kind="text" className="py-2.5 pl-4 pr-2" />
                <SortableTh label="LTP" active={sort.key === "ltp"} dir={sort.dir} onClick={() => toggle("ltp")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Change" active={sort.key === "change"} dir={sort.dir} onClick={() => toggle("change")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Yield" active={sort.key === "yield"} dir={sort.dir} onClick={() => toggle("yield")} align="right" className="py-2.5 px-3" />
                <SortableTh label="EPS" active={sort.key === "eps"} dir={sort.dir} onClick={() => toggle("eps")} align="right" className="py-2.5 px-3" />
                <SortableTh label="High" active={sort.key === "high"} dir={sort.dir} onClick={() => toggle("high")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Low" active={sort.key === "low"} dir={sort.dir} onClick={() => toggle("low")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Volume" active={sort.key === "volume"} dir={sort.dir} onClick={() => toggle("volume")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Turnover" active={sort.key === "turnover"} dir={sort.dir} onClick={() => toggle("turnover")} align="right" className="py-2.5 px-3" />
                <SortableTh label="Trades" active={sort.key === "trades"} dir={sort.dir} onClick={() => toggle("trades")} align="right" className="py-2.5 px-3 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((p) => {
                const upRow = p.percentChange >= 0;
                const fund = fundamentals.get(p.symbol);
                return (
                  <tr
                    key={p.symbol}
                    onClick={() => setPicked(p.symbol)}
                    className="cursor-pointer transition-colors hover:bg-surface/50"
                  >
                    <td className="py-2.5 pl-4 pr-2">
                      <p className="font-bold text-foreground">{p.symbol}</p>
                      <p className="max-w-[220px] truncate text-[10px] text-muted-foreground">
                        {p.name}
                      </p>
                    </td>
                    <td className="num py-2.5 px-3 text-right font-semibold text-foreground">
                      {formatNpr(p.ltp)}
                    </td>
                    <td className={cn("num py-2.5 px-3 text-right font-semibold", upRow ? "text-gain" : "text-loss")}>
                      {formatPercent(p.percentChange)}
                    </td>
                    <td
                      className="num py-2.5 px-3 text-right font-semibold text-primary"
                      title={fund?.yieldPct != null ? "Latest dividend yield on LTP" : "No dividend on record"}
                    >
                      {fund?.yieldPct != null ? `${fund.yieldPct.toFixed(2)}%` : "—"}
                    </td>
                    <td
                      className="num py-2.5 px-3 text-right text-muted-foreground"
                      title={fund?.eps != null ? "Latest reported EPS" : "No financials on record"}
                    >
                      {fund?.eps != null ? formatNumber(fund.eps) : "—"}
                    </td>
                    <td className="num py-2.5 px-3 text-right text-muted-foreground">
                      {formatNpr(p.high)}
                    </td>
                    <td className="num py-2.5 px-3 text-right text-muted-foreground">
                      {formatNpr(p.low)}
                    </td>
                    <td className="num py-2.5 px-3 text-right text-muted-foreground">
                      {formatQty(p.volume)}
                    </td>
                    <td className="num py-2.5 px-3 text-right text-foreground">
                      {formatNpr(p.turnover, { compact: true })}
                    </td>
                    <td className="num py-2.5 px-3 pr-4 text-right text-muted-foreground">
                      {formatQty(p.trades)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {picked && (
        <ScripSheet
          symbol={picked}
          open={Boolean(picked)}
          onOpenChange={(open) => {
            if (!open) setPicked(null);
          }}
        />
      )}
    </div>
  );
}

function ChartHeader({
  name,
  points,
  chg,
  rangeLabel,
  hoverLabel,
}: {
  name: string;
  points: number | null;
  chg: number;
  rangeLabel: string;
  hoverLabel: string;
}) {
  const up = chg >= 0;
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-3">
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold text-foreground">
          {name} Index
        </p>
        <p className="text-[11px] text-muted-foreground">{rangeLabel}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="num text-xl font-bold text-foreground">
          {points != null && points > 0 ? formatNumber(points) : "—"}
        </span>
        <span className={cn("num text-xs font-bold", up ? "text-emerald-400" : "text-red-400")}>
          {formatPercent(chg)}
        </span>
        <span className="text-[11px] text-muted-foreground opacity-70">{hoverLabel}</span>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      onClick={onBack}
      aria-label="Go back"
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}

function ExtremeList({
  items,
  onPick,
  high,
}: {
  items: LivePrice[];
  onPick: (symbol: string) => void;
  high: boolean;
}) {
  if (items.length === 0)
    return <p className="text-xs text-muted-foreground">None in range this session.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((p) => {
        const ref = high ? p.fiftyTwoWeekHigh : p.fiftyTwoWeekLow;
        const dist = ref && ref > 0 ? ((p.ltp - ref) / ref) * 100 : 0;
        const Icon = high ? TrendingUp : TrendingDown;
        return (
          <li key={p.symbol}>
            <button
              type="button"
              onClick={() => onPick(p.symbol)}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface cursor-pointer"
            >
              <Icon className={cn("size-3.5 shrink-0", high ? "text-emerald-400" : "text-red-400")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-foreground">{p.symbol}</span>
                <span className="num block text-[10px] text-muted-foreground">
                  {formatNpr(p.ltp)}
                </span>
              </span>
              <span className={cn("num text-[11px] font-bold", high ? "text-emerald-400" : "text-red-400")}>
                {dist >= 0 ? "+" : ""}
                {dist.toFixed(2)}%
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
