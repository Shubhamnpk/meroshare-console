import { useEffect, useState } from "react";
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
// Stable empty bars: an inline [] would rebuild the whole chart on every
// hover render (see the spinning 1D chart).
const NO_BARS: ChartBar[] = [];

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

  // Hover details (terminal-style): hovering or pinning a bar/point feeds
  // the readout below the chart. Day % for candles, session % for ticks.
  const hoveredBar: ChartBar | null = !usingIntraday
    ? (pinnedBar ??
      (hover
        ? ({
            date: hover.date.slice(0, 10),
            open: hover.open,
            high: hover.high,
            low: hover.low,
            close: hover.close,
            volume: hover.volume,
          } as ChartBar)
        : null))
    : null;
  const hoveredPt: PricePoint | null = usingIntraday
    ? (pinnedPoint ??
      (hover
        ? ({
            time: String(Math.floor(new Date(hover.date).getTime() / 1000)),
            value: hover.close,
          } as unknown as PricePoint)
        : null))
    : null;
  const sessionBase = intradayPoints[0]?.value ?? 0;
  // Headline value next to the title: last tick on 1D, last close otherwise.
  const headValue =
    range === "1D" && intradayPoints.length > 0
      ? intradayPoints[intradayPoints.length - 1]!.value
      : bars.length > 0
        ? bars[bars.length - 1]!.close
        : null;
  // Hovered/pinned point takes over the headline, with its % change beside
  // it (day % for candles, session % for ticks). At rest the % below the
  // number covers the visible range (session move on 1D, bar range above).
  const restPct =
    range === "1D" && intradayPoints.length >= 2
      ? (() => {
          const first = intradayPoints[0]!.value;
          const last = intradayPoints[intradayPoints.length - 1]!.value;
          return first ? ((last - first) / first) * 100 : 0;
        })()
      : bars.length > 0
        ? (() => {
            const first = bars[0]!.open || bars[0]!.close;
            const last = bars[bars.length - 1]!.close;
            return first ? ((last - first) / first) * 100 : 0;
          })()
        : null;
  const shownValue = hoveredBar ? hoveredBar.close : hoveredPt ? hoveredPt.value : headValue;
  const shownPct = hoveredBar
    ? hoveredBar.open
      ? ((hoveredBar.close - hoveredBar.open) / hoveredBar.open) * 100
      : 0
    : hoveredPt
      ? sessionBase
        ? ((hoveredPt.value - sessionBase) / sessionBase) * 100
        : 0
      : restPct;

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

            {shownValue != null && (
              <div className="flex flex-col items-end text-right">
                <span className="num text-2xl font-bold">{formatNumber(shownValue)}</span>
                {shownPct != null && (
                  <span
                    className={`num text-sm font-semibold ${shownPct >= 0 ? "text-gain" : "text-loss"}`}
                  >
                    {shownPct >= 0 ? "+" : ""}
                    {shownPct.toFixed(2)}%
                  </span>
                )}
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
                  aria-pressed={range === r.key}
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
                  aria-pressed={chartStyle === "area"}
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
                  aria-pressed={chartStyle === "candles"}
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

              <div
                className="relative"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowIndicatorMenu(false);
                }}
              >
                <button
                  type="button"
                  aria-expanded={showIndicatorMenu}
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
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden
                      onClick={() => setShowIndicatorMenu(false)}
                      className="fixed inset-0 z-20 cursor-default"
                    />
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
                  </>
                )}
              </div>
            </div>
          </div>

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
                bars={NO_BARS}
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
            ) : dailyQuery.isError ? (
              <div className="flex h-[360px] flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-semibold text-foreground">Couldn't load chart data</p>
                <p className="text-xs text-muted-foreground">
                  Check your connection and try again.
                </p>
                <button
                  type="button"
                  onClick={() => void dailyQuery.refetch()}
                  className="mt-1 inline-flex min-h-11 items-center rounded-lg border border-border/60 bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <p className="text-sm">No historical candles found for this range.</p>
              </div>
            )}
          </div>

          {/* Details below chart — hover shows live, tap pins it. Always below chart with progress + terminal link */}
          {(hoveredBar || hoveredPt) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs">
              {(() => {
                const bar = hoveredBar;
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
                const pt = hoveredPt;
                if (pt) {
                  const first = sessionBase || pt.value;
                  const ptPct = first ? ((pt.value - first) / first) * 100 : 0;
                  return (
                    <>
                      <span className="num font-semibold">
                        {new Date(Number(pt.time) * 1000).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>Price: {pt.value.toFixed(2)}</span>
                      <span className={ptPct >= 0 ? "text-gain" : "text-loss"}>
                        {ptPct >= 0 ? "+" : ""}
                        {ptPct.toFixed(2)}%
                      </span>
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
