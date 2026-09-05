import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpDown,
  BarChart3,
  ChevronUp,
  Coins,
  Filter,
  Flame,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { screenerDataQuery, scripBarsQuery } from "@/lib/queries";
import {
  computeLongTermScore,
  computeShortTermScore,
  type LongTermScore,
  type RankedStock,
  type RedFlag,
  type ShortTermScore,
} from "@/lib/nepse/screener";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/best-shares")({
  head: () => ({
    meta: [
      { title: "Best Shares | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Discover top-ranked NEPSE stocks by short-term momentum and long-term fundamentals.",
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
// Sort helpers
// ---------------------------------------------------------------------------

type ShortTermSortKey = "score" | "percentChange" | "volume" | "rsi" | "turnover";
type LongTermSortKey =
  "score" | "pe" | "pb" | "roe" | "dividendYield" | "dividendStreak" | "volume";

function sortStocks<T extends RankedStock>(
  stocks: T[],
  key: string,
  dir: "asc" | "desc",
  getter: (s: T) => number | null,
): T[] {
  return [...stocks].sort((a, b) => {
    const av = getter(a) ?? (dir === "asc" ? Infinity : -Infinity);
    const bv = getter(b) ?? (dir === "asc" ? Infinity : -Infinity);
    return dir === "asc" ? av - bv : bv - av;
  });
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function BestSharesPage() {
  const [tab, setTab] = useState<"short" | "long">("short");
  const [signalFilter, setSignalFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [picked, setPicked] = useState<string | null>(null);

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
  const longSignals = ["ALL", "VALUE", "INCOME", "GROWTH", "BLUECHIP", "WATCHLIST"];
  const activeSignals = tab === "short" ? shortSignals : longSignals;

  // Apply signal filter
  const filtered = useMemo(() => {
    if (signalFilter === "ALL") return ranked;
    return ranked.filter((s) => {
      const sig = tab === "short" ? s.shortTerm?.signal : s.longTerm?.signal;
      return sig === signalFilter;
    });
  }, [ranked, signalFilter, tab]);

  // Apply sort
  const sorted = useMemo(() => {
    const getter = (s: RankedStock) => {
      if (tab === "short") {
        const st = s.shortTerm!;
        switch (sortKey) {
          case "score":
            return st.score;
          case "percentChange":
            return s.percentChange;
          case "volume":
            return s.volume;
          case "rsi":
            return st.rsi ?? 50;
          case "turnover":
            return s.turnover;
          default:
            return st.score;
        }
      } else {
        const lt = s.longTerm!;
        switch (sortKey) {
          case "score":
            return lt.score;
          case "pe":
            return lt.pe ?? 999;
          case "pb":
            return lt.pb ?? 999;
          case "roe":
            return lt.roe ?? 0;
          case "dividendYield":
            return lt.dividendYield ?? 0;
          case "dividendStreak":
            return lt.dividendStreak;
          case "volume":
            return s.volume;
          default:
            return lt.score;
        }
      }
    };
    return sortStocks(filtered, sortKey, sortDir, getter);
  }, [filtered, sortKey, sortDir, tab]);

  // Stats
  const stats = useMemo(() => {
    if (!ranked.length) return null;
    const shortTermStocks = ranked.filter((s) => s.shortTerm);
    const longTermStocks = ranked.filter((s) => s.longTerm);
    const avgRsi =
      shortTermStocks.reduce((a, s) => a + (s.shortTerm?.rsi ?? 0), 0) /
      (shortTermStocks.length || 1);
    const avgPe =
      longTermStocks.reduce((a, s) => a + (s.longTerm?.pe ?? 0), 0) / (longTermStocks.length || 1);
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

  // Sort toggle
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => (
    <ArrowUpDown
      className={cn("ml-1 inline size-3", active ? "text-primary" : "text-muted-foreground/50")}
    />
  );

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
            setSortKey("score");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "short"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
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
            setSortKey("score");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "long"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BarChart3 className="size-4" />
          Long-Term
          <span className="hidden text-xs opacity-70 sm:inline">(Quality)</span>
        </button>
      </div>

      {screenerQuery.isLoading ? (
        <LoadingBlock label="Loading market data" />
      ) : screenerQuery.isError ? (
        <ErrorBlock error={screenerQuery.error} retry={() => void screenerQuery.refetch()} />
      ) : (
        <>
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
                {sig === "ALL" ? "All" : sig}
                {sig !== "ALL" ? (
                  <span className="ml-1.5 text-[0.65rem] opacity-60">
                    {
                      ranked.filter((s) => {
                        const signal = tab === "short" ? s.shortTerm?.signal : s.longTerm?.signal;
                        return signal === sig;
                      }).length
                    }
                  </span>
                ) : (
                  <span className="ml-1.5 text-[0.65rem] opacity-60">{ranked.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tab === "short" ? (
                <>
                  <StatCard
                    icon={<Target className="size-4" />}
                    label="Stocks Scored"
                    value={String(stats.total)}
                  />
                  <StatCard
                    icon={<TrendingUp className="size-4" />}
                    label="Avg RSI"
                    value={String(stats.avgRsi)}
                  />
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
              ) : (
                <>
                  <StatCard
                    icon={<Target className="size-4" />}
                    label="Stocks Scored"
                    value={String(stats.total)}
                  />
                  <StatCard
                    icon={<TrendingUp className="size-4" />}
                    label="Avg P/E"
                    value={String(stats.avgPe)}
                  />
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
              )}
            </div>
          )}

          {/* Sort controls */}
          <div className="flex flex-wrap gap-2">
            {tab === "short"
              ? (["score", "percentChange", "volume", "rsi", "turnover"] as ShortTermSortKey[]).map(
                  (key) => (
                    <SortButton
                      key={key}
                      label={
                        key === "score"
                          ? "Score"
                          : key === "percentChange"
                            ? "Change%"
                            : key === "volume"
                              ? "Volume"
                              : key === "rsi"
                                ? "RSI"
                                : "Turnover"
                      }
                      active={sortKey === key}
                      dir={sortDir}
                      onClick={() => toggleSort(key)}
                    />
                  ),
                )
              : (
                  [
                    "score",
                    "pe",
                    "pb",
                    "roe",
                    "dividendYield",
                    "dividendStreak",
                    "volume",
                  ] as LongTermSortKey[]
                ).map((key) => (
                  <SortButton
                    key={key}
                    label={
                      key === "score"
                        ? "Score"
                        : key === "pe"
                          ? "P/E"
                          : key === "pb"
                            ? "P/B"
                            : key === "roe"
                              ? "ROE"
                              : key === "dividendYield"
                                ? "Yield"
                                : key === "dividendStreak"
                                  ? "Streak"
                                  : "Volume"
                    }
                    active={sortKey === key}
                    dir={sortDir}
                    onClick={() => toggleSort(key)}
                  />
                ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-card/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 pl-4 sm:pl-4">#</th>
                  <th className="px-3 py-3">Scrip</th>
                  <th className="num px-3 py-3 text-right">LTP</th>
                  <th className="num px-3 py-3 text-right">Chg%</th>
                  <th className="num px-3 py-3 text-right">Score</th>
                  {tab === "short" ? (
                    <>
                      <th className="num px-3 py-3 text-right">RSI</th>
                      <th className="num px-3 py-3 text-right hidden sm:table-cell">Volume</th>
                      <th className="px-3 py-3 text-center">Signal</th>
                    </>
                  ) : (
                    <>
                      <th className="num px-3 py-3 text-right">P/E</th>
                      <th className="num px-3 py-3 text-right hidden sm:table-cell">P/B</th>
                      <th className="num px-3 py-3 text-right hidden md:table-cell">ROE</th>
                      <th className="num px-3 py-3 text-right hidden sm:table-cell">Yield</th>
                      <th className="num px-3 py-3 text-right hidden md:table-cell">Streak</th>
                      <th className="px-3 py-3 text-center">Signal</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sorted.slice(0, 100).map((stock, i) => (
                  <tr
                    key={stock.symbol}
                    className="cursor-pointer transition-colors hover:bg-accent/10"
                    onClick={() => setPicked(stock.symbol)}
                  >
                    <td className="px-3 py-3 pl-4 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{stock.symbol}</p>
                      <p className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-none">
                        {stock.name}
                      </p>
                    </td>
                    <td className="num px-3 py-3 text-right font-medium">{formatNpr(stock.ltp)}</td>
                    <td className="px-3 py-3 text-right">
                      <DeltaPill value={stock.percentChange} className="inline-flex">
                        {formatPercent(stock.percentChange)}
                      </DeltaPill>
                    </td>
                    <td className="num px-3 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold",
                          ((tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score) ??
                            0 >= 70)
                            ? "bg-emerald-500/15 text-emerald-400"
                            : ((tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score) ??
                                0 >= 40)
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-muted/50 text-muted-foreground",
                        )}
                      >
                        {tab === "short" ? stock.shortTerm?.score : stock.longTerm?.score}
                      </span>
                    </td>
                    {tab === "short" ? (
                      <>
                        <td className="num px-3 py-3 text-right text-xs">
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
                        </td>
                        <td className="num hidden px-3 py-3 text-right text-xs text-muted-foreground sm:table-cell">
                          {formatQty(stock.volume)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num px-3 py-3 text-right text-xs">
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
                        </td>
                        <td className="num hidden px-3 py-3 text-right text-xs text-muted-foreground sm:table-cell">
                          {stock.longTerm?.pb != null ? stock.longTerm.pb : "-"}
                        </td>
                        <td className="num hidden px-3 py-3 text-right text-xs md:table-cell">
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
                        </td>
                        <td className="num hidden px-3 py-3 text-right text-xs sm:table-cell">
                          {stock.longTerm?.dividendYield != null ? (
                            <span className="text-amber-400">{stock.longTerm.dividendYield}%</span>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="num hidden px-3 py-3 text-right text-xs md:table-cell">
                          {stock.longTerm?.dividendStreak != null &&
                          stock.longTerm.dividendStreak > 0 ? (
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
                        </td>
                      </>
                    )}
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
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
                        {tab === "long" &&
                          stock.longTerm?.redFlags &&
                          stock.longTerm.redFlags.length > 0 && (
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 && (
            <div className="rounded-xl border border-border/70 bg-card py-12 text-center text-sm text-muted-foreground">
              No stocks match the selected filter.
            </div>
          )}

          {sorted.length > 100 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing top 100 of {sorted.length} stocks.
            </p>
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

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <ChevronUp
        className={cn(
          "ml-1 size-3 transition-transform",
          active && dir === "asc" ? "rotate-180" : "",
          !active && "opacity-30",
        )}
      />
    </button>
  );
}
