import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  Layers,
  ChartCandlestick,
  SlidersHorizontal,
  Maximize2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getIndexGraph,
  getIndexDailyHistory,
} from "@/lib/nepse/market.functions";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { formatNpr, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import type { ChartBar, LivePrice, PricePoint } from "@/lib/nepse/types";
import { DeltaPill } from "@/components/stat-card";

const NO_POINTS: PricePoint[] = [];

export const INDEX_RANGES = [
  { key: "1D", label: "1D", days: 1 },
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "3Y", label: "3Y", days: 1095 },
  { key: "5Y", label: "5Y", days: 1825 },
  { key: "ALL", label: "All", days: 0 },
] as const;

export type IndexRangeKey = (typeof INDEX_RANGES)[number]["key"];

const INDICATOR_TOGGLES: { key: keyof IndicatorConfig; label: string }[] = [
  { key: "volume", label: "Vol" },
  { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" },
  { key: "ema20", label: "EMA 20" },
  { key: "bollinger", label: "BB" },
  { key: "rsi", label: "RSI" },
];

function useResolvedLight(): boolean {
  const { theme } = useSettings();
  const [light, setLight] = useState(false);
  useEffect(() => {
    const resolve = () =>
      setLight(
        theme === "light" ||
          (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches),
      );
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);
  return light;
}

export function IndexChartModal({
  open,
  onOpenChange,
  title,
  indexName,
  sectorName,
  prices = [],
  onSelectScrip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  indexName?: string;
  sectorName?: string;
  prices?: LivePrice[];
  onSelectScrip?: (symbol: string) => void;
}) {
  const [range, setRange] = useState<IndexRangeKey>("1Y");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("area");
  const [indicators, setIndicators] = useState<IndicatorConfig>({
    ...DEFAULT_INDICATORS,
    sma20: true,
    volume: true,
  });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [pinnedBar, setPinnedBar] = useState<ChartBar | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<PricePoint | null>(null);
  const navigate = useNavigate();
  const light = useResolvedLight();

  const activeTargetName = indexName || sectorName || "";
  useEffect(() => {
    setPinnedBar(null);
    setPinnedPoint(null);
    setHover(null);
  }, [range, activeTargetName]);

  // 1D intraday ticks query
  const intradayQuery = useQuery({
    queryKey: ["index-intraday-graph", activeTargetName],
    queryFn: async () => {
      if (!activeTargetName) return [];
      try {
        const res = await getIndexGraph({ data: { indexName: activeTargetName } });
        return res ?? [];
      } catch {
        return [];
      }
    },
    enabled: open && Boolean(activeTargetName) && range === "1D",
    staleTime: 60_000,
  });

  // Multi-day daily OHLC bars query
  const selectedRangeConfig = INDEX_RANGES.find((r) => r.key === range) ?? INDEX_RANGES[5];
  const queryDays = selectedRangeConfig.days;

  const dailyQuery = useQuery({
    queryKey: ["index-daily-bars", activeTargetName, queryDays],
    queryFn: async () => {
      if (!activeTargetName) return [];
      const res = await getIndexDailyHistory({
        data: {
          indexName: activeTargetName,
          days: queryDays,
        },
      });
      return res ?? [];
    },
    enabled: open && Boolean(activeTargetName) && range !== "1D",
    staleTime: 10 * 60_000,
  });

  const isLoading = range === "1D" ? intradayQuery.isLoading : dailyQuery.isLoading;
  const bars: ChartBar[] = dailyQuery.data ?? [];
  const intradayPoints: PricePoint[] = intradayQuery.data ?? [];

  // Summary stats calculated from bars or intraday
  const stats = useMemo(() => {
    if (range === "1D") {
      if (intradayPoints.length < 2) return null;
      const first = intradayPoints[0]!.value;
      const last = intradayPoints[intradayPoints.length - 1]!.value;
      const values = intradayPoints.map((p) => p.value);
      const high = Math.max(...values);
      const low = Math.min(...values);
      const change = last - first;
      const pct = first > 0 ? (change / first) * 100 : 0;
      return { start: first, end: last, high, low, change, pct, count: intradayPoints.length };
    }

    if (bars.length < 1) return null;
    const first = bars[0]!.open || bars[0]!.close;
    const last = bars[bars.length - 1]!.close;
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const change = last - first;
    const pct = first > 0 ? (change / first) * 100 : 0;
    const totalVolume = bars.reduce((s, b) => s + (b.volume || 0), 0);
    return { start: first, end: last, high, low, change, pct, count: bars.length, totalVolume };
  }, [range, intradayPoints, bars]);

  // Sector constituents list
  const sectorConstituents = useMemo(() => {
    if (!sectorName) return [];
    const targetSector = sectorName.toLowerCase().replace(/\s*index$/i, "").trim();
    return prices
      .filter((p) => {
        const sec = (p.sector ?? "").toLowerCase().trim();
        return sec.includes(targetSector) || targetSector.includes(sec.split(" ")[0] ?? "");
      })
      .sort((a, b) => b.turnover - a.turnover);
  }, [sectorName, prices]);

  const isUp = (stats?.change ?? 0) >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left border-b border-border/50 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="font-display text-lg font-bold sm:text-xl">
                  {title}
                </DialogTitle>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Historical trading data &amp; technical performance across all ranges.
              </p>
            </div>

            {stats && (
              <div className="flex items-baseline gap-3 text-right">
                <span className="num text-2xl font-bold">
                  {formatNumber(stats.end)}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Controls Bar: Range Selectors + Chart Mode + Indicators */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Range Pills */}
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface p-1 border border-border/60">
              {INDEX_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    range === r.key
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* View Mode & Indicator Controls */}
            <div className="flex items-center gap-1.5">
              {range !== "1D" && (
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
              )}

              {range !== "1D" && (
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
                    <div className="absolute right-0 top-full z-30 mt-1 flex flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-xl">
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
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Start Points
                </p>
                <p className="num text-sm font-semibold">{formatNumber(stats.start)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Current Points
                </p>
                <p className="num text-sm font-semibold">{formatNumber(stats.end)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Range High / Low
                </p>
                <p className="num text-sm font-semibold">
                  {formatNumber(stats.high)} / {formatNumber(stats.low)}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Data Points / Volume
                </p>
                <p className="num text-sm font-semibold">
                  {stats.count} bars
                  {stats.totalVolume && stats.totalVolume > 0
                    ? ` · ${(stats.totalVolume / 1_000_000).toFixed(1)}M vol`
                    : ""}
                </p>
              </div>
            </div>
          )}



          {/* Chart Display Area */}
          <div className="relative rounded-2xl border border-border/70 bg-card p-1 min-h-[360px]">
            {isLoading ? (
              <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
                <span className="inline-block animate-pulse">Loading historical chart series…</span>
              </div>
            ) : range === "1D" ? (
              intradayPoints.length >= 2 ? (
                <TerminalChart
                  bars={[]}
                  intraday={intradayPoints}
                  style="area"
                  indicators={indicators}
                  logScale={false}
                  light={light}
                  height={360}
                  onHover={setHover}
                  onSelectPoint={(p) => setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))}
                  onSelectBar={(d) => setPinnedBar(d ? (bars.find((b) => b.date === d) ?? null) : null)}
                />
              ) : (
                <div className="flex h-[360px] flex-col items-center justify-center gap-1.5 p-6 text-center text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">
                    Intraday session graph not published
                  </p>
                  <p className="text-xs">
                    Real-time ticks stream during active NEPSE trading hours (11:00 AM – 3:00 PM NPT).
                    Switch to 1W, 1M, or 1Y to view historical daily candles.
                  </p>
                </div>
              )
            ) : bars.length >= 2 ? (
              <TerminalChart
                bars={bars}
                intraday={NO_POINTS}
                style={chartStyle}
                indicators={indicators}
                logScale={false}
                light={light}
                height={360}
                onHover={setHover}
                onSelectBar={(d) => setPinnedBar((cur) => (cur && d === cur.date ? null : (bars.find((b) => b.date === d) ?? null)))}
                onSelectPoint={(p) => setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))}
              />
            ) : (
              <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <p className="text-sm">No historical candles found for this range.</p>
              </div>
            )}
          </div>

          {/* Details below chart — hover shows live, tap pins it. Always below chart with progress + terminal link */}
          {(pinnedBar || pinnedPoint || hover) && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-surface p-3">
              {(() => {
                const barFromHover =
                  hover && range !== "1D"
                    ? ({
                        date: hover.date.slice(0, 10),
                        open: hover.open,
                        high: hover.high,
                        low: hover.low,
                        close: hover.close,
                        volume: hover.volume,
                      } as ChartBar)
                    : null;
                const bar = pinnedBar ?? barFromHover;
                if (bar) {
                  const isPinned = Boolean(pinnedBar);
                  return (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="num text-sm font-bold text-foreground">
                            {bar.date}{" "}
                            <span
                              className={cn(
                                "ml-2 rounded-full px-2 py-0.5 text-xs font-semibold",
                                bar.close >= bar.open ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss",
                              )}
                            >
                              {bar.close >= bar.open ? "+" : ""}
                              {(((bar.close - bar.open) / (bar.open || 1)) * 100).toFixed(2)}%
                            </span>
                            {!isPinned && <span className="ml-2 text-[11px] font-normal text-muted-foreground">hover — tap chart to pin</span>}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                              O: <span className="font-semibold text-foreground">{bar.open.toFixed(2)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              H: <span className="font-semibold text-foreground">{bar.high.toFixed(2)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              L: <span className="font-semibold text-foreground">{bar.low.toFixed(2)}</span>
                            </span>
                            <span className="text-muted-foreground">
                              C: <span className="font-semibold text-foreground">{bar.close.toFixed(2)}</span>
                            </span>
                            {bar.volume > 0 && (
                              <span className="text-muted-foreground">
                                Vol: <span className="font-semibold text-foreground">{bar.volume.toLocaleString()}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => {
                            onOpenChange(false);
                            const sym = activeTargetName.replace(/\s*Index$/i, "").trim().toUpperCase() || "NEPSE";
                            void navigate({ to: "/terminal", search: { symbol: sym } });
                          }}
                        >
                          <Maximize2 className="size-3.5" /> Expand in Terminal
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Low {bar.low.toFixed(2)}</span>
                          <span>High {bar.high.toFixed(2)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-all", bar.close >= bar.open ? "bg-gain" : "bg-loss")}
                            style={{
                              width: `${(() => {
                                const r = bar.high - bar.low;
                                if (r <= 0) return 50;
                                const pct = ((bar.close - bar.low) / r) * 100;
                                return Math.max(4, Math.min(100, pct));
                              })()}%`,
                            }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Close within day range ·{" "}
                          <span className={cn("font-semibold", bar.close >= bar.open ? "text-gain" : "text-loss")}>{bar.close.toFixed(2)}</span>
                          {isPinned ? " — tap chart again to clear" : ""}
                        </p>
                      </div>
                    </>
                  );
                }
                const pt = pinnedPoint ?? (hover && range === "1D" ? ({ time: String(Math.floor(new Date(hover.date).getTime() / 1000)), value: hover.close } as unknown as PricePoint) : null);
                if (pt) {
                  const isPinnedPt = Boolean(pinnedPoint);
                  return (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="num text-sm font-bold text-foreground">
                          {new Date(Number((pt as PricePoint).time) * 1000).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {!isPinnedPt && <span className="ml-2 text-[11px] font-normal text-muted-foreground">hover — tap to pin</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Price: <span className="font-semibold text-foreground">{(pt as PricePoint).value.toFixed(2)}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => {
                          onOpenChange(false);
                          const sym = activeTargetName.replace(/\s*Index$/i, "").trim().toUpperCase() || "NEPSE";
                          void navigate({ to: "/terminal", search: { symbol: sym } });
                        }}
                      >
                        <Maximize2 className="size-3.5" /> Expand in Terminal
                      </Button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Sector Constituents Section (when looking at a sector index) */}
          {sectorName && sectorConstituents.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/60 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Layers className="size-3.5 text-primary" />
                  <span>Top {sectorName} Constituents ({sectorConstituents.length} stocks)</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Sorted by session turnover
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {sectorConstituents.slice(0, 12).map((stock) => {
                  const scripUp = stock.change >= 0;
                  return (
                    <button
                      key={stock.symbol}
                      type="button"
                      onClick={() => onSelectScrip?.(stock.symbol)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card p-2 text-left transition-all hover:border-primary/40 hover:scale-[1.01] cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-foreground">
                          {stock.symbol}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {stock.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num text-xs font-semibold text-foreground">
                          {formatNpr(stock.ltp)}
                        </p>
                        <p
                          className={cn(
                            "num text-[10px] font-bold flex items-center justify-end gap-0.5",
                            scripUp ? "text-gain" : "text-loss",
                          )}
                        >
                          {scripUp ? (
                            <TrendingUp className="size-2.5" />
                          ) : (
                            <TrendingDown className="size-2.5" />
                          )}
                          {formatPercent(stock.percentChange)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
