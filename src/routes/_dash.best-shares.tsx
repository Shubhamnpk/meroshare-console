import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Coins, Filter, Flame, Target, TrendingDown, TrendingUp, Zap } from "lucide-react";
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
    <div className="space-y-5">
      <BackButton fallback="/tools" />
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Best Shares</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "short" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="size-4" />
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
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "long" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BarChart3 className="size-4" />
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
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "dividends" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Coins className="size-4" />
          Best Dividends
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
          <div className="flex flex-wrap gap-2">
            {activeSignals.map((sig) => (
              <button
                key={sig}
                type="button"
                onClick={() => setSignalFilter(sig)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

          {/* Table (headers sort via the shared SortableTh) */}
          <Panel padding="none" className="overflow-clip">
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
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className={cn("mt-1 font-display text-xl font-semibold", accent)}>{value}</p>
    </div>
  );
}
