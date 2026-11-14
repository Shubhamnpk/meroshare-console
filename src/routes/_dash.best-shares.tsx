import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Coins,
  Filter,
  Flame,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { DividendSimulator } from "@/components/market/dividend-simulator";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { enrichedPortfolioQuery, screenerDataQuery, scripBarsQuery } from "@/lib/queries";
import {
  computeLongTermScore,
  computeShortTermScore,
  type LongTermScore,
  type RankedStock,
  type RedFlag,
  type ShortTermScore,
} from "@/lib/nepse/screener";
import type { DividendRow } from "@/lib/nepse/types";
import { formatNpr, formatPercent, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SortableTh, sortBy, useSort, type SortKind } from "@/components/sortable-table";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/best-shares")({
  head: () => ({
    meta: [
      { title: "Best Shares | MeroShare Investor Console" },
      {
        name: "description",
        content: "Discover top-ranked NEPSE stocks by short-term momentum and long-term fundamentals.",
      },
      { property: "og:title", content: "Best Shares | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Discover top-ranked NEPSE stocks by momentum and fundamentals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      ogImage(),
    ],
    links: [canonicalLink("/best-shares")],
  }),
  component: BestSharesPage,
});

const MOBILE_SORT_KEYS: Record<"short" | "long" | "dividends", SortKey[]> = {
  short: ["score", "ltp", "change", "rsi", "volume", "symbol"],
  long: ["score", "pe", "pb", "roe", "yield", "streak", "ltp", "change", "symbol"],
  dividends: ["yield", "streak", "records", "ltp", "change", "symbol"],
};

const SORT_LABELS: Record<SortKey, string> = {
  symbol: "Stock",
  ltp: "Price",
  change: "Change %",
  score: "Score",
  rsi: "RSI",
  volume: "Volume",
  pe: "P/E",
  pb: "P/B",
  roe: "ROE",
  yield: "Dividend yield",
  streak: "Dividend streak",
  signal: "Signal",
  records: "Dividend records",
};

// ---------------------------------------------------------------------------
// Signal badge colors
// ---------------------------------------------------------------------------

const SHORT_SIGNAL_COLORS: Record<string, string> = {
  BREAKOUT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MOMENTUM: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  OVERSOLD: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  WATCHLIST: "bg-muted/50 text-muted-foreground border-border/50",
};

const LONG_SIGNAL_COLORS: Record<string, string> = {
  VALUE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  INCOME: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  GROWTH: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BLUECHIP: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  LEGENDARY: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  WATCHLIST: "bg-muted/50 text-muted-foreground border-border/50",
};

const RED_FLAG_LABELS: Record<RedFlag, string> = {
  EPS_DECLINING: "EPS declining 3+ quarters",
  NO_DIVIDEND: "No dividend history",
  PE_TOO_HIGH: "P/E above 30x",
  NEGATIVE_EPS: "Negative earnings",
  LOW_ROE: "ROE below 5%",
};

const RED_FLAG_SHORT: Record<RedFlag, string> = {
  EPS_DECLINING: "EPS",
  NO_DIVIDEND: "DIV",
  PE_TOO_HIGH: "PE",
  NEGATIVE_EPS: "NEG",
  LOW_ROE: "ROE",
};

// ---------------------------------------------------------------------------
// Sort model: one shared key set across tabs, driven by the inbuilt
// useSort/sortBy (same mechanism + arrows as market/portfolio).
// ---------------------------------------------------------------------------

type SortKey =
  | "symbol"
  | "ltp"
  | "change"
  | "score"
  | "rsi"
  | "volume"
  | "pe"
  | "pb"
  | "roe"
  | "yield"
  | "streak"
  | "signal"
  | "records";

const SORT_KINDS: Record<SortKey, SortKind> = {
  symbol: "text",
  ltp: "number",
  change: "number",
  score: "number",
  rsi: "number",
  volume: "number",
  pe: "number",
  pb: "number",
  roe: "number",
  yield: "number",
  streak: "number",
  signal: "text",
  records: "number",
};

// ---------------------------------------------------------------------------
// Dividend stock with history
// ---------------------------------------------------------------------------

interface DividendStock extends RankedStock {
  dividendHistory: DividendRow[];
  faceValue: number;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function BestSharesPage() {
  const [tab, setTab] = useState<"short" | "long" | "dividends">("short");
  const [signalFilter, setSignalFilter] = useState<string>("ALL");
  const { sort, toggle, reset } = useSort<SortKey>({ key: "score", dir: "desc" }, SORT_KINDS);
  const [picked, setPicked] = useState<string | null>(null);
  const [simulatorStock, setSimulatorStock] = useState<string | null>(null);

  const screenerQuery = useQuery(screenerDataQuery());
  const prices = screenerQuery.data?.prices ?? [];
  const dividends = screenerQuery.data?.dividends ?? {};
  const faceValues = screenerQuery.data?.faceValues ?? {};
  const financials = screenerQuery.data?.financials ?? {};

  // Bars for top stocks (RSI computation)
  const topSymbols = useMemo(() => {
    if (!prices.length) return [];
    return [...prices]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 40)
      .map((p) => p.symbol);
  }, [prices]);

  const barsQuery = useQuery(scripBarsQuery(topSymbols));
  const allBars = barsQuery.data ?? {};
  const portfolioQ = useQuery(enrichedPortfolioQuery());
  const holdingUnitsBySymbol = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of portfolioQ.data?.holdings ?? []) m.set(h.scrip, h.units);
    return m;
  }, [portfolioQ.data]);

  // Compute scores for all stocks
  const ranked = useMemo<RankedStock[]>(() => {
    if (!prices.length) return [];
    return prices
      .filter((p) => !/mutual fund/i.test(p.sector ?? ""))
      .map((price) => {
        const symDividends = dividends[price.symbol] ?? [];
        const symFinancials = financials[price.symbol] ?? null;
        const fv = faceValues[price.symbol] ?? 100;
        const bars = allBars[price.symbol] ?? [];

        const shortTerm = computeShortTermScore(price, bars, prices);
        const longTerm = computeLongTermScore(price, symFinancials, symDividends, fv);

        return {
          symbol: price.symbol,
          name: price.name,
          ltp: price.ltp,
          change: price.change,
          percentChange: price.percentChange,
          sector: price.sector,
          volume: price.volume,
          turnover: price.turnover,
          fiftyTwoWeekHigh: price.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: price.fiftyTwoWeekLow,
          shortTerm,
          longTerm,
        };
      });
  }, [prices, dividends, faceValues, financials, allBars]);

  // Signal filter options
  const shortSignals = ["ALL", "BREAKOUT", "MOMENTUM", "OVERSOLD", "WATCHLIST"];
  const longSignals = ["ALL", "LEGENDARY", "VALUE", "INCOME", "GROWTH", "BLUECHIP", "WATCHLIST"];
  const dividendSignals = ["ALL", "HIGH_YIELD", "CONSISTENT", "INCOME"];
  const activeSignals = tab === "short" ? shortSignals : tab === "long" ? longSignals : dividendSignals;

  // Apply signal filter
  const filtered = useMemo(() => {
    if (tab === "dividends") {
      const withDividends = ranked.filter((s) => s.longTerm?.dividendYield != null && s.longTerm.dividendYield > 0);
      if (signalFilter === "ALL") return withDividends;
      if (signalFilter === "HIGH_YIELD") return withDividends.filter((s) => (s.longTerm?.dividendYield ?? 0) > 4);
      if (signalFilter === "CONSISTENT") return withDividends.filter((s) => (s.longTerm?.dividendStreak ?? 0) >= 3);
      if (signalFilter === "INCOME") return withDividends.filter((s) => s.longTerm?.signal === "INCOME");
      return withDividends;
    }
    if (signalFilter === "ALL") return ranked;
    return ranked.filter((s) => {
      const sig = tab === "short" ? s.shortTerm?.signal : s.longTerm?.signal;
      return sig === signalFilter;
    });
  }, [ranked, signalFilter, tab]);

  // Apply sort (shared sortBy; nulls coalesced so numbers stay numeric)
  const sorted = useMemo(() => {
    const getter = (s: RankedStock): string | number => {
      switch (sort.key) {
        case "symbol":
          return s.symbol;
        case "ltp":
          return s.ltp;
        case "change":
          return s.percentChange;
        case "score":
          return tab === "short" ? (s.shortTerm?.score ?? 0) : (s.longTerm?.score ?? 0);
        case "rsi":
          return s.shortTerm?.rsi ?? 50;
        case "volume":
          return s.volume;
        case "pe":
          return s.longTerm?.pe ?? 999;
        case "pb":
          return s.longTerm?.pb ?? 999;
        case "roe":
          return s.longTerm?.roe ?? 0;
        case "yield":
          return s.longTerm?.dividendYield ?? 0;
        case "streak":
          return s.longTerm?.dividendStreak ?? 0;
        case "signal":
          return (tab === "short" ? s.shortTerm?.signal : s.longTerm?.signal) ?? "";
        case "records":
          return (dividends[s.symbol] ?? []).length;
        default:
          return 0;
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [filtered, sort, tab, dividends]);

  // Phones show an arrow toggle instead of a table header: up still means the
  // app's "top-heavy" order (A to Z for text, biggest first for numbers).
  const mobileArrowUp = SORT_KINDS[sort.key] === "number" ? sort.dir === "desc" : sort.dir === "asc";

  // Stats
  const stats = useMemo(() => {
    if (!ranked.length) return null;
    const shortTermStocks = ranked.filter((s) => s.shortTerm);
    const longTermStocks = ranked.filter((s) => s.longTerm);
    const avgRsi = shortTermStocks.reduce((a, s) => a + (s.shortTerm?.rsi ?? 0), 0) / (shortTermStocks.length || 1);
    const avgPe = longTermStocks.reduce((a, s) => a + (s.longTerm?.pe ?? 0), 0) / (longTermStocks.length || 1);
    const breakouts = ranked.filter((s) => s.shortTerm?.signal === "BREAKOUT").length;
    const oversold = ranked.filter((s) => s.shortTerm?.signal === "OVERSOLD").length;
    const valuePicks = ranked.filter((s) => s.longTerm?.signal === "VALUE").length;
    const incomePicks = ranked.filter((s) => s.longTerm?.signal === "INCOME").length;

    return {
      total: ranked.length,
      avgRsi: Math.round(avgRsi * 10) / 10,
      avgPe: Math.round(avgPe * 10) / 10,
      breakouts,
      oversold,
      valuePicks,
      incomePicks,
    };
  }, [ranked]);

  return (
    <div className="space-y-3 sm:space-y-5">
      <BackButton fallback="/tools" />
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-3xl">Best Shares</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Discover top-ranked NEPSE stocks by short-term momentum and long-term fundamentals.
        </p>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 rounded-xl border border-border/70 bg-card p-1">
        <button
          type="button"
          onClick={() => {
            setTab("short");
            setSignalFilter("ALL");
            reset({ key: "score", dir: "desc" });
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
            tab === "short" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="size-3.5 sm:size-4" />
          Short-Term
          <span className="hidden text-xs opacity-70 sm:inline">(Momentum)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("long");
            setSignalFilter("ALL");
            reset({ key: "score", dir: "desc" });
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
            tab === "long" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BarChart3 className="size-3.5 sm:size-4" />
          Long-Term
          <span className="hidden text-xs opacity-70 sm:inline">(Quality)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("dividends");
            setSignalFilter("ALL");
            reset({ key: "yield", dir: "desc" });
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
            tab === "dividends" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Coins className="size-3.5 sm:size-4" />
          <span className="sm:hidden">Dividends</span>
          <span className="hidden sm:inline">Best Dividends</span>
        </button>
      </div>

      {screenerQuery.isLoading ? (
        <LoadingBlock label="Loading market data" />
      ) : screenerQuery.isError ? (
        <ErrorBlock error={screenerQuery.error} retry={() => void screenerQuery.refetch()} />
      ) : (
        <>
          {/* What-if dividend simulator - shared logic with stock details, collapsed at top */}
          {tab === "dividends" && sorted.length > 0
            ? (() => {
                const simSymbol = simulatorStock ?? sorted[0]!.symbol;
                const simStock = sorted.find((s) => s.symbol === simSymbol) ?? sorted[0]!;
                const simDividends = dividends[simStock.symbol] ?? [];
                return (
                  <DividendSimulator
                    key={simStock.symbol}
                    symbol={simStock.symbol}
                    dividends={simDividends}
                    holdingUnits={holdingUnitsBySymbol.get(simStock.symbol) ?? null}
                    faceValue={faceValues[simStock.symbol] ?? 100}
                    history={[]}
                    currentLtp={simStock.ltp}
                    transactions={[]}
                    actualCost={null}
                  />
                );
              })()
            : null}

          {/* Signal filter chips */}
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {activeSignals.map((sig) => (
              <button
                key={sig}
                type="button"
                onClick={() => setSignalFilter(sig)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  signalFilter === sig
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {sig === "ALL"
                  ? "All"
                  : sig === "HIGH_YIELD"
                    ? "High Yield (>4%)"
                    : sig === "CONSISTENT"
                      ? "Consistent (3y+)"
                      : sig}
                {sig !== "ALL" ? (
                  <span className="ml-1.5 text-[0.65rem] opacity-60">
                    {tab === "dividends"
                      ? ranked.filter((s) => {
                          if (s.longTerm?.dividendYield == null) return false;
                          if (sig === "HIGH_YIELD") return s.longTerm.dividendYield > 4;
                          if (sig === "CONSISTENT") return (s.longTerm.dividendStreak ?? 0) >= 3;
                          if (sig === "INCOME") return s.longTerm.signal === "INCOME";
                          return true;
                        }).length
                      : ranked.filter((s) => {
                          const signal = tab === "short" ? s.shortTerm?.signal : s.longTerm?.signal;
                          return signal === sig;
                        }).length}
                  </span>
                ) : (
                  <span className="ml-1.5 text-[0.65rem] opacity-60">
                    {tab === "dividends"
                      ? ranked.filter((s) => s.longTerm?.dividendYield != null && s.longTerm.dividendYield > 0).length
                      : ranked.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Stats bar: one swipeable strip on phones, 4 cards on desktop */}
          {stats && (
            <div className="no-scrollbar flex divide-x divide-border/60 overflow-x-auto rounded-xl border border-border/70 bg-card sm:grid sm:grid-cols-4 sm:gap-3 sm:divide-x-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent">
              {tab === "short" ? (
                <>
                  <StatCard icon={<Target className="size-4" />} label="Stocks Scored" value={String(stats.total)} />
                  <StatCard icon={<TrendingUp className="size-4" />} label="Avg RSI" value={String(stats.avgRsi)} />
                  <StatCard
                    icon={<Flame className="size-4" />}
                    label="Breakouts"
                    value={String(stats.breakouts)}
                    accent="text-emerald-400"
                  />
                  <StatCard
                    icon={<TrendingDown className="size-4" />}
                    label="Oversold"
                    value={String(stats.oversold)}
                    accent="text-amber-400"
                  />
                </>
              ) : tab === "long" ? (
                <>
                  <StatCard icon={<Target className="size-4" />} label="Stocks Scored" value={String(stats.total)} />
                  <StatCard icon={<TrendingUp className="size-4" />} label="Avg P/E" value={String(stats.avgPe)} />
                  <StatCard
                    icon={<Coins className="size-4" />}
                    label="Value Picks"
                    value={String(stats.valuePicks)}
                    accent="text-emerald-400"
                  />
                  <StatCard
                    icon={<BarChart3 className="size-4" />}
                    label="Income Picks"
                    value={String(stats.incomePicks)}
                    accent="text-amber-400"
                  />
                </>
              ) : (
                <>
                  <StatCard
                    icon={<Coins className="size-4" />}
                    label="Dividend Stocks"
                    value={String(
                      ranked.filter((s) => s.longTerm?.dividendYield != null && s.longTerm.dividendYield > 0).length,
                    )}
                  />
                  <StatCard
                    icon={<TrendingUp className="size-4" />}
                    label="High Yield (>4%)"
                    value={String(ranked.filter((s) => (s.longTerm?.dividendYield ?? 0) > 4).length)}
                    accent="text-emerald-400"
                  />
                  <StatCard
                    icon={<Flame className="size-4" />}
                    label="Consistent (3y+)"
                    value={String(ranked.filter((s) => (s.longTerm?.dividendStreak ?? 0) >= 3).length)}
                    accent="text-amber-400"
                  />
                  <StatCard
                    icon={<Filter className="size-4" />}
                    label="Income Signal"
                    value={String(stats.incomePicks)}
                    accent="text-blue-400"
                  />
                </>
              )}
            </div>
          )}

          {/* Phone list: same rows, app-style cards instead of a wide table */}
          <div className="sm:hidden">
            {sorted.length > 0 && (
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {sorted.length} {sorted.length === 1 ? "stock" : "stocks"}
                </p>
                <div className="ml-auto flex items-center gap-1.5">
                  <select
                    value={sort.key}
                    onChange={(event) => {
                      const key = event.target.value as SortKey;
                      reset({ key, dir: SORT_KINDS[key] === "number" ? "desc" : "asc" });
                    }}
                    aria-label="Sort stocks by"
                    className="h-8 rounded-lg border border-border/70 bg-card px-2 text-xs font-medium text-foreground"
                  >
                    {MOBILE_SORT_KEYS[tab].map((key) => (
                      <option key={key} value={key}>
                        {SORT_LABELS[key]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => reset({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" })}
                    aria-label="Reverse sort direction"
                    className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors active:bg-accent/20"
                  >
                    {mobileArrowUp ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {sorted.slice(0, 100).map((stock, i) => {
                const isDividendTab = tab === "dividends";
                const divHistory = isDividendTab ? (dividends[stock.symbol] ?? []) : [];
                const score = tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score;
                const signal = isDividendTab
                  ? stock.longTerm?.signal
                  : tab === "short"
                    ? stock.shortTerm?.signal
                    : stock.longTerm?.signal;
                const highlight = isDividendTab && (simulatorStock ? simulatorStock === stock.symbol : i === 0);
                return (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => {
                      setPicked(stock.symbol);
                      if (isDividendTab) setSimulatorStock(stock.symbol);
                    }}
                    className={cn(
                      "w-full rounded-xl border border-border/70 bg-card p-3 text-left transition-colors active:bg-accent/20",
                      highlight && "border-primary/50 bg-accent/20",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{stock.symbol}</span>
                          {signal ? (
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none",
                                isDividendTab || tab === "long"
                                  ? LONG_SIGNAL_COLORS[signal]
                                  : SHORT_SIGNAL_COLORS[signal],
                              )}
                            >
                              {signal}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{stock.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-sm font-semibold">{formatNpr(stock.ltp)}</p>
                        <DeltaPill value={stock.percentChange} className="mt-0.5 inline-flex">
                          {formatPercent(stock.percentChange)}
                        </DeltaPill>
                      </div>
                    </div>
                    <div className="no-scrollbar mt-2 flex items-center gap-1 overflow-x-auto pl-8">
                      {isDividendTab ? (
                        <>
                          <Metric
                            label="Yield"
                            value={stock.longTerm?.dividendYield != null ? `${stock.longTerm.dividendYield}%` : "-"}
                            tone="text-amber-400"
                          />
                          <Metric
                            label="Streak"
                            value={stock.longTerm?.dividendStreak ? `${stock.longTerm.dividendStreak}y` : "-"}
                          />
                          <Metric label="Records" value={divHistory.length} />
                        </>
                      ) : tab === "short" ? (
                        <>
                          <Metric label="Score" value={score ?? "-"} tone={scoreTone(score ?? 0)} />
                          <Metric
                            label="RSI"
                            value={stock.shortTerm?.rsi ?? "-"}
                            tone={rsiTone(stock.shortTerm?.rsi)}
                          />
                          <Metric label="Vol" value={formatQty(stock.volume)} />
                        </>
                      ) : (
                        <>
                          <Metric label="Score" value={score ?? "-"} tone={scoreTone(score ?? 0)} />
                          <Metric label="P/E" value={stock.longTerm?.pe ?? "-"} tone={peTone(stock.longTerm?.pe)} />
                          <Metric
                            label="ROE"
                            value={stock.longTerm?.roe != null ? `${stock.longTerm.roe}%` : "-"}
                            tone={roeTone(stock.longTerm?.roe)}
                          />
                          <Metric
                            label="Yield"
                            value={stock.longTerm?.dividendYield != null ? `${stock.longTerm.dividendYield}%` : "-"}
                            tone="text-amber-400"
                          />
                        </>
                      )}
                      {tab === "long" && stock.longTerm?.redFlags?.length ? (
                        <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-1 text-[10px] font-medium leading-none text-red-400">
                          {stock.longTerm.redFlags.map((flag) => RED_FLAG_SHORT[flag]).join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table (headers sort via the shared SortableTh) */}
          <Panel padding="none" className="hidden overflow-clip sm:block">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-muted">
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-3 py-3 pl-4 sm:pl-4">#</TableHead>
                  <SortableTh
                    label="Stock"
                    active={sort.key === "symbol"}
                    dir={sort.dir}
                    kind="text"
                    align="left"
                    onClick={() => toggle("symbol")}
                    className="px-3 py-3"
                  />
                  <SortableTh
                    label="LTP"
                    active={sort.key === "ltp"}
                    dir={sort.dir}
                    kind="number"
                    align="right"
                    onClick={() => toggle("ltp")}
                    className="num px-3 py-3 text-right"
                  />
                  <SortableTh
                    label="Chg%"
                    active={sort.key === "change"}
                    dir={sort.dir}
                    kind="number"
                    align="right"
                    onClick={() => toggle("change")}
                    className="num px-3 py-3 text-right"
                  />
                  {tab === "dividends" ? (
                    <>
                      <SortableTh
                        label="Yield"
                        active={sort.key === "yield"}
                        dir={sort.dir}
                        kind="number"
                        align="right"
                        onClick={() => toggle("yield")}
                        className="num px-3 py-3 text-right"
                      />
                      <SortableTh
                        label="Streak"
                        active={sort.key === "streak"}
                        dir={sort.dir}
                        kind="number"
                        align="right"
                        onClick={() => toggle("streak")}
                        className="num px-3 py-3 text-right hidden sm:table-cell"
                      />
                      <SortableTh
                        label="Cash/Bonus"
                        active={sort.key === "records"}
                        dir={sort.dir}
                        kind="number"
                        align="left"
                        onClick={() => toggle("records")}
                        className="px-3 py-3 text-center hidden md:table-cell"
                      />
                      <SortableTh
                        label="Signal"
                        active={sort.key === "signal"}
                        dir={sort.dir}
                        kind="text"
                        align="left"
                        onClick={() => toggle("signal")}
                        className="px-3 py-3 text-center"
                      />
                    </>
                  ) : (
                    <>
                      <SortableTh
                        label="Score"
                        active={sort.key === "score"}
                        dir={sort.dir}
                        kind="number"
                        align="right"
                        onClick={() => toggle("score")}
                        className="num px-3 py-3 text-right"
                      />
                      {tab === "short" ? (
                        <>
                          <SortableTh
                            label="RSI"
                            active={sort.key === "rsi"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("rsi")}
                            className="num px-3 py-3 text-right"
                          />
                          <SortableTh
                            label="Volume"
                            active={sort.key === "volume"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("volume")}
                            className="num px-3 py-3 text-right hidden sm:table-cell"
                          />
                          <SortableTh
                            label="Signal"
                            active={sort.key === "signal"}
                            dir={sort.dir}
                            kind="text"
                            align="left"
                            onClick={() => toggle("signal")}
                            className="px-3 py-3 text-center"
                          />
                        </>
                      ) : (
                        <>
                          <SortableTh
                            label="P/E"
                            active={sort.key === "pe"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("pe")}
                            className="num px-3 py-3 text-right"
                          />
                          <SortableTh
                            label="P/B"
                            active={sort.key === "pb"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("pb")}
                            className="num px-3 py-3 text-right hidden sm:table-cell"
                          />
                          <SortableTh
                            label="ROE"
                            active={sort.key === "roe"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("roe")}
                            className="num px-3 py-3 text-right hidden md:table-cell"
                          />
                          <SortableTh
                            label="Yield"
                            active={sort.key === "yield"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("yield")}
                            className="num px-3 py-3 text-right hidden sm:table-cell"
                          />
                          <SortableTh
                            label="Streak"
                            active={sort.key === "streak"}
                            dir={sort.dir}
                            kind="number"
                            align="right"
                            onClick={() => toggle("streak")}
                            className="num px-3 py-3 text-right hidden md:table-cell"
                          />
                          <SortableTh
                            label="Signal"
                            active={sort.key === "signal"}
                            dir={sort.dir}
                            kind="text"
                            align="left"
                            onClick={() => toggle("signal")}
                            className="px-3 py-3 text-center"
                          />
                        </>
                      )}
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/50">
                {sorted.slice(0, 100).map((stock, i) => {
                  const isDividendTab = tab === "dividends";
                  const divHistory = isDividendTab ? (dividends[stock.symbol] ?? []) : [];
                  return (
                    <TableRow
                      key={stock.symbol}
                      className={cn(
                        "transition-colors hover:bg-accent/10",
                        "cursor-pointer",
                        isDividendTab && (simulatorStock ? simulatorStock === stock.symbol : i === 0) && "bg-accent/20",
                      )}
                      onClick={() => {
                        setPicked(stock.symbol);
                        if (isDividendTab) setSimulatorStock(stock.symbol);
                      }}
                    >
                      <TableCell className="px-3 py-3 pl-4 text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="px-3 py-3">
                        <p className="font-semibold">{stock.symbol}</p>
                        <p className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-none">
                          {stock.name}
                        </p>
                      </TableCell>
                      <TableCell className="num px-3 py-3 text-right font-medium">{formatNpr(stock.ltp)}</TableCell>
                      <TableCell className="px-3 py-3 text-right">
                        <DeltaPill value={stock.percentChange} className="inline-flex">
                          {formatPercent(stock.percentChange)}
                        </DeltaPill>
                      </TableCell>
                      {isDividendTab ? (
                        <>
                          <TableCell className="num px-3 py-3 text-right text-xs">
                            {stock.longTerm?.dividendYield != null ? (
                              <span
                                className={cn(
                                  "font-medium",
                                  stock.longTerm.dividendYield > 6
                                    ? "text-emerald-400"
                                    : stock.longTerm.dividendYield > 4
                                      ? "text-blue-400"
                                      : "text-amber-400",
                                )}
                              >
                                {stock.longTerm.dividendYield}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          <TableCell className="num hidden px-3 py-3 text-right text-xs sm:table-cell">
                            {stock.longTerm?.dividendStreak != null && stock.longTerm.dividendStreak > 0 ? (
                              <span
                                className={cn(
                                  stock.longTerm.dividendStreak >= 5
                                    ? "text-emerald-400"
                                    : stock.longTerm.dividendStreak >= 3
                                      ? "text-blue-400"
                                      : "text-muted-foreground",
                                )}
                              >
                                {stock.longTerm.dividendStreak}y
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden px-3 py-3 text-center md:table-cell">
                            <div className="flex flex-col items-center gap-0.5">
                              {stock.longTerm?.dividendYield != null && (
                                <span className="text-[0.65rem] text-amber-400">{stock.longTerm.dividendYield}%</span>
                              )}
                              {divHistory.length > 0 && (
                                <span className="text-[0.55rem] text-muted-foreground">
                                  {divHistory.length} records
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="num px-3 py-3 text-right">
                            <span
                              className={cn(
                                "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold",
                                ((tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score) ?? 0 >= 70)
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : ((tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score) ?? 0 >= 40)
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-muted/50 text-muted-foreground",
                              )}
                            >
                              {tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score}
                            </span>
                          </TableCell>
                          {tab === "short" ? (
                            <>
                              <TableCell className="num px-3 py-3 text-right text-xs">
                                {stock.shortTerm?.rsi != null ? (
                                  <span
                                    className={cn(
                                      "rounded-md px-1.5 py-0.5",
                                      stock.shortTerm.rsi < 30
                                        ? "bg-amber-500/15 text-amber-400"
                                        : stock.shortTerm.rsi > 70
                                          ? "bg-red-500/15 text-red-400"
                                          : "text-muted-foreground",
                                    )}
                                  >
                                    {stock.shortTerm.rsi}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">-</span>
                                )}
                              </TableCell>
                              <TableCell className="num hidden px-3 py-3 text-right text-xs text-muted-foreground sm:table-cell">
                                {formatQty(stock.volume)}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="num px-3 py-3 text-right text-xs">
                                {stock.longTerm?.pe != null ? (
                                  <span
                                    className={cn(
                                      stock.longTerm.pe < 12
                                        ? "text-emerald-400"
                                        : stock.longTerm.pe > 20
                                          ? "text-red-400"
                                          : "text-muted-foreground",
                                    )}
                                  >
                                    {stock.longTerm.pe}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">-</span>
                                )}
                              </TableCell>
                              <TableCell className="num hidden px-3 py-3 text-right text-xs text-muted-foreground sm:table-cell">
                                {stock.longTerm?.pb != null ? stock.longTerm.pb : "-"}
                              </TableCell>
                              <TableCell className="num hidden px-3 py-3 text-right text-xs md:table-cell">
                                {stock.longTerm?.roe != null ? (
                                  <span
                                    className={cn(
                                      stock.longTerm.roe > 15
                                        ? "text-emerald-400"
                                        : stock.longTerm.roe > 9
                                          ? "text-blue-400"
                                          : "text-red-400",
                                    )}
                                  >
                                    {stock.longTerm.roe}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">-</span>
                                )}
                              </TableCell>
                              <TableCell className="num hidden px-3 py-3 text-right text-xs sm:table-cell">
                                {stock.longTerm?.dividendYield != null ? (
                                  <span className="text-amber-400">{stock.longTerm.dividendYield}%</span>
                                ) : (
                                  <span className="text-muted-foreground/50">-</span>
                                )}
                              </TableCell>
                              <TableCell className="num hidden px-3 py-3 text-right text-xs md:table-cell">
                                {stock.longTerm?.dividendStreak != null && stock.longTerm.dividendStreak > 0 ? (
                                  <span
                                    className={cn(
                                      stock.longTerm.dividendStreak >= 5
                                        ? "text-emerald-400"
                                        : stock.longTerm.dividendStreak >= 3
                                          ? "text-blue-400"
                                          : "text-muted-foreground",
                                    )}
                                  >
                                    {stock.longTerm.dividendStreak}y
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">-</span>
                                )}
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                      <TableCell className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {isDividendTab ? (
                            <span
                              className={cn(
                                "inline-block rounded-full border px-2 py-0.5 text-[0.65rem] font-medium",
                                LONG_SIGNAL_COLORS[stock.longTerm?.signal ?? "WATCHLIST"],
                              )}
                            >
                              {stock.longTerm?.signal}
                            </span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  "inline-block rounded-full border px-2 py-0.5 text-[0.65rem] font-medium",
                                  tab === "short"
                                    ? SHORT_SIGNAL_COLORS[stock.shortTerm?.signal ?? "WATCHLIST"]
                                    : LONG_SIGNAL_COLORS[stock.longTerm?.signal ?? "WATCHLIST"],
                                )}
                              >
                                {tab === "short" ? stock.shortTerm?.signal : stock.longTerm?.signal}
                              </span>
                              {tab === "long" && stock.longTerm?.redFlags && stock.longTerm.redFlags.length > 0 && (
                                <div className="flex flex-wrap justify-center gap-0.5">
                                  {stock.longTerm.redFlags.map((flag) => (
                                    <span
                                      key={flag}
                                      className="inline-block rounded bg-red-500/15 px-1 py-px text-[0.55rem] font-medium text-red-400"
                                      title={RED_FLAG_LABELS[flag]}
                                    >
                                      {RED_FLAG_SHORT[flag]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>

          {sorted.length === 0 && (
            <div className="rounded-xl border border-border/70 bg-card py-12 text-center text-sm text-muted-foreground">
              No stocks match the selected filter.
            </div>
          )}

          {sorted.length > 100 && (
            <p className="text-center text-xs text-muted-foreground">Showing top 100 of {sorted.length} stocks.</p>
          )}
        </>
      )}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="min-w-[94px] flex-1 px-3 py-2.5 sm:min-w-0 sm:rounded-xl sm:border sm:border-border/70 sm:bg-card sm:p-3">
      <div className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground sm:gap-2 sm:text-xs">
        <span className="hidden shrink-0 sm:inline-flex">{icon}</span>
        <span className="line-clamp-2">{label}</span>
      </div>
      <p className={cn("mt-1 font-display text-base font-semibold sm:text-xl", accent)}>{value}</p>
    </div>
  );
}

/** One compact stat inside a phone card (yield, RSI, P/E...). */
function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string | undefined }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/50 px-1.5 py-1 text-[10px] leading-none">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", tone)}>{value}</span>
    </span>
  );
}

function scoreTone(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-blue-400";
  return "text-muted-foreground";
}

function rsiTone(rsi: number | null | undefined): string | undefined {
  if (rsi == null) return undefined;
  if (rsi < 30) return "text-amber-400";
  if (rsi > 70) return "text-red-400";
  return "text-muted-foreground";
}

function peTone(pe: number | null | undefined): string | undefined {
  if (pe == null) return undefined;
  if (pe < 12) return "text-emerald-400";
  if (pe > 20) return "text-red-400";
  return "text-muted-foreground";
}

function roeTone(roe: number | null | undefined): string | undefined {
  if (roe == null) return undefined;
  if (roe > 15) return "text-emerald-400";
  if (roe > 9) return "text-blue-400";
  return "text-red-400";
}
