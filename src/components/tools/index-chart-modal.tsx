import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChartCandlestick,
  SlidersHorizontal,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getIndexDailyHistory } from "@/lib/nepse/market.functions";
import { indexGraphQuery } from "@/lib/queries";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import type { ChartBar, PricePoint } from "@/lib/nepse/types";

const NO_POINTS: PricePoint[] = [];

const INDEX_RANGES = [
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

type IndexRangeKey = (typeof INDEX_RANGES)[number]["key"];

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  indexName?: string | undefined;
  sectorName?: string | undefined;
}) {
  const [range, setRange] = useState<IndexRangeKey>("1D");
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
  const light = useResolvedLight();

  const activeTargetName = indexName || sectorName || "";
  // Cards query "NEPSE" / "Sensitive"; callers may pass "NEPSE Index". Strip
  // the suffix so the modal hits the same graph endpoint + React Query cache.
  const graphName = activeTargetName.replace(/\s*Index$/i, "").trim() || activeTargetName;

  useEffect(() => {
    setPinnedBar(null);
    setPinnedPoint(null);
    setHover(null);
  }, [range, activeTargetName]);

  // 1D intraday — shared indexGraphQuery (same key as dashboard/market cards)
  const intradayQuery = useQuery({
    ...indexGraphQuery(graphName),
    enabled: open && Boolean(graphName) && range === "1D",
  });

  // Multi-day daily OHLC bars query
  const selectedRangeConfig = INDEX_RANGES.find((r) => r.key === range) ?? INDEX_RANGES[5];
  const queryDays = range === "1D" ? 2 : selectedRangeConfig.days;

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
    enabled: open && Boolean(activeTargetName),
    staleTime: 10 * 60_000,
  });

  const bars: ChartBar[] = dailyQuery.data ?? [];
  const intradayPoints: PricePoint[] = intradayQuery.data ?? [];
  const isLoading =
    range === "1D"
      ? intradayQuery.isLoading || (intradayPoints.length < 2 && dailyQuery.isLoading)
      : dailyQuery.isLoading;

  // 1D uses the session line for area; candles (and empty-session fallback) use daily bars.
  const usingIntraday = range === "1D" && chartStyle !== "candles" && intradayPoints.length >= 2;

  // Summary stats calculated from bars or intraday
  const stats = useMemo(() => {
    if (usingIntraday) {
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
  }, [usingIntraday, intradayPoints, bars]);

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
                <span className="num text-2xl font-bold">{formatNumber(stats.end)}</span>
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

            {/* View Mode & Indicator Controls — same on 1D as other ranges (matches terminal) */}
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
          {/* Chart Display Area — stopPropagation keeps dialog overflow from stealing wheel/zoom */}
          <div
            className="relative rounded-2xl border border-border/70 bg-card p-1 min-h-[360px] [&_canvas]:touch-none"
            onWheel={(e) => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
                <span className="inline-block animate-pulse">Loading historical chart series…</span>
              </div>
            ) : usingIntraday ? (
              <TerminalChart
                bars={[]}
                intraday={intradayPoints}
                style={chartStyle}
                indicators={indicators}
                logScale={false}
                light={light}
                height={360}
                onHover={setHover}
                onSelectPoint={(p) =>
                  setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))
                }
                onSelectBar={(d) =>
                  setPinnedBar(d ? (bars.find((b) => b.date === d) ?? null) : null)
                }
              />
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
                onSelectBar={(d) =>
                  setPinnedBar((cur) =>
                    cur && d === cur.date ? null : (bars.find((b) => b.date === d) ?? null),
                  )
                }
                onSelectPoint={(p) =>
                  setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))
                }
              />
            ) : range === "1D" ? (
              <div className="flex h-[360px] flex-col items-center justify-center gap-1.5 p-6 text-center text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">
                  Intraday session graph not published
                </p>
                <p className="text-xs">
                  Real-time ticks stream during active NEPSE trading hours (11:00 AM – 3:00 PM NPT).
                  Switch to 1W, 1M, or 1Y to view historical daily candles.
                </p>
              </div>
            ) : (
              <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <p className="text-sm">No historical candles found for this range.</p>
              </div>
            )}
          </div>

          {/* Details below chart — hover shows live, tap pins it. Always below chart with progress + terminal link */}
          {(pinnedBar || pinnedPoint || hover) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs">
              {(() => {
                const barFromHover =
                  hover && !usingIntraday
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
                  const pct = (() => {
                    const r = bar.high - bar.low;
                    if (r <= 0) return 50;
                    return Math.max(4, Math.min(100, ((bar.close - bar.low) / r) * 100));
                  })();
                  return (
                    <>
                      <span className="num font-semibold">{bar.date}</span>
                      <span>O:{bar.open.toFixed(2)}</span>
                      <span>H:{bar.high.toFixed(2)}</span>
                      <span>L:{bar.low.toFixed(2)}</span>
                      <span>C:{bar.close.toFixed(2)}</span>
                      <span className={bar.close >= bar.open ? "text-gain" : "text-loss"}>
                        {(((bar.close - bar.open) / (bar.open || 1)) * 100).toFixed(2)}%
                      </span>
                      {bar.volume > 0 && <span>Vol:{bar.volume.toLocaleString()}</span>}
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <div
                          className={bar.close >= bar.open ? "h-full bg-gain" : "h-full bg-loss"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  );
                }
                const pt =
                  pinnedPoint ??
                  (hover && usingIntraday
                    ? ({
                        time: String(Math.floor(new Date(hover.date).getTime() / 1000)),
                        value: hover.close,
                      } as unknown as PricePoint)
                    : null);
                if (pt) {
                  return (
                    <>
                      <span className="num font-semibold">
                        {new Date(Number((pt as PricePoint).time) * 1000).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>Price: {(pt as PricePoint).value.toFixed(2)}</span>
                    </>
                  );
                }
                return null;
              })()}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
