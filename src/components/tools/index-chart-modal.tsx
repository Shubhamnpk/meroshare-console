import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartCandlestick, SlidersHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getIndexDailyHistory } from "@/lib/nepse/market.functions";
import { indexGraphQuery, marketSectorsQuery, marketSnapshotQuery } from "@/lib/queries";
import {
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { formatNumber } from "@/lib/format";
import { CHART_RANGES, type ChartRangeKey } from "@/lib/charts/ranges";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import type { ChartBar, PricePoint } from "@/lib/nepse/types";

const NO_POINTS: PricePoint[] = [];
// Stable empty bars: an inline [] would rebuild the whole chart on every
// hover render (see the spinning 1D chart).
const NO_BARS: ChartBar[] = [];

/** Archive days per range key; MAX (0) means the whole archive, uncapped. */
const INDEX_RANGE_DAYS: Record<ChartRangeKey, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "5Y": 1825,
  MAX: 0,
};

const INDEX_RANGES = CHART_RANGES.map((key) => ({ key, label: key, days: INDEX_RANGE_DAYS[key] }));

type IndexRangeKey = ChartRangeKey;

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
      setLight(theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches));
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
  const { chart, setChart } = useSettings();
  const chartStyle = chart.style;
  const setChartStyle = (s: ChartStyle) => setChart({ style: s });
  const indicators = chart.indicators;
  const setIndicators = (v: IndicatorConfig) => setChart({ indicators: v });
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [selectedSector, setSelectedSector] = useState(sectorName ?? "");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [pinnedBar, setPinnedBar] = useState<ChartBar | null>(null);
  const [pinnedPoint, setPinnedPoint] = useState<PricePoint | null>(null);
  const [chartHeight, setChartHeight] = useState(420);
  const light = useResolvedLight();

  useEffect(() => {
    if (sectorName) setSelectedSector(sectorName);
  }, [sectorName]);

  useEffect(() => {
    const resize = () => setChartHeight(Math.max(300, window.innerHeight - (window.innerWidth < 640 ? 330 : 300)));
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const activeTargetName = indexName || selectedSector || sectorName || "";
  const market = useQuery({ ...marketSnapshotQuery(), enabled: open && Boolean(sectorName) });
  const sectorsQuery = useQuery({ ...marketSectorsQuery(), enabled: open && Boolean(sectorName) });
  const sectorLabel = selectedSector.replace(/\s*Index$/i, "").trim();
  const sectorStocks = (market.data?.prices ?? []).filter((stock) =>
    stock.sector?.toLowerCase().includes(sectorLabel.toLowerCase()),
  );
  const advancing = sectorStocks.filter((stock) => stock.percentChange > 0).length;
  const declining = sectorStocks.filter((stock) => stock.percentChange < 0).length;
  const breadth = advancing + declining;
  const sentimentPct = breadth ? Math.round((advancing / breadth) * 100) : null;
  const sectorIndex = sectorsQuery.data?.find((item) =>
    `${item.name} ${item.sector ?? ""}`.toLowerCase().includes(sectorLabel.toLowerCase()),
  );
  const topSectorStocks = [...sectorStocks].sort((a, b) => b.turnover - a.turnover).slice(0, 3);
  const otherSectors = (sectorsQuery.data ?? [])
    .filter((item) => item.name !== sectorIndex?.name && item.percentChange != null)
    .sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0))
    .slice(0, 5);
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
  const selectedRangeConfig =
    INDEX_RANGES.find((r) => r.key === range) ??
    ({ key: "1Y", label: "1Y", days: 365 } as (typeof INDEX_RANGES)[number]);
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
  /** Previous session close anchors the 1D line color (never the opening tick). */
  const prevSessionClose = bars.length >= 2 ? (bars[bars.length - 2]?.close ?? null) : null;
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
  // Every 1D % anchors on the previous close, never the opening tick —
  // pre-market prints must not move the day number. Bar ranges keep their
  // genuine first-to-last move.
  const dayBase = prevSessionClose && prevSessionClose > 0 ? prevSessionClose : sessionBase;
  const restPct =
    range === "1D" && intradayPoints.length >= 2
      ? (() => {
          const last = intradayPoints[intradayPoints.length - 1]!.value;
          return dayBase ? ((last - dayBase) / dayBase) * 100 : 0;
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
      ? dayBase
        ? ((hoveredPt.value - dayBase) / dayBase) * 100
        : 0
      : restPct;
  const hasPinnedSelection = Boolean(pinnedBar || pinnedPoint);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 !gap-0 !overflow-hidden !rounded-none !border-0 p-3 sm:p-6">
        <DialogHeader className="shrink-0 pr-8 text-left border-b border-border/50 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate font-display text-lg font-bold sm:text-xl">{sectorName ? `${sectorLabel} Index` : title}</DialogTitle>
              </div>
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                Historical trading data &amp; technical performance across all ranges.
              </p>
            </div>

            {shownValue != null && (
              <div className="flex shrink-0 flex-col items-end text-right">
                <span className="num text-2xl font-bold">{formatNumber(shownValue)}</span>
                {shownPct != null && (
                  <span className={`num text-sm font-semibold ${shownPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {shownPct >= 0 ? "+" : ""}
                    {shownPct.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pt-3 sm:space-y-4 sm:pt-4">
          {/* Controls Bar: Range Selectors + Chart Mode + Indicators */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Range Pills — single scrollable row on mobile */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-surface p-1 border border-border/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {INDEX_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
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
                          onClick={() => setIndicators({ ...indicators, [t.key]: !indicators[t.key] })}
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
            className="relative min-h-[300px] rounded-2xl border border-border/70 bg-card p-1 [&_canvas]:touch-none"
            onWheel={(e) => e.stopPropagation()}
          >
            {isLoading ? (
              <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: chartHeight }}>
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
                height={chartHeight}
                dayBase={prevSessionClose}
                selectedTime={pinnedPoint?.time ?? null}
                onHover={setHover}
                onSelectPoint={(p) => setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))}
                onSelectBar={(d) => setPinnedBar(d ? (bars.find((b) => b.date === d) ?? null) : null)}
              />
            ) : bars.length >= 2 ? (
              <TerminalChart
                bars={bars}
                intraday={NO_POINTS}
                style={chartStyle}
                indicators={indicators}
                logScale={false}
                light={light}
                height={chartHeight}
                selectedTime={pinnedBar?.date ?? null}
                onHover={setHover}
                onSelectBar={(d) => setPinnedBar((cur) => (cur && d === cur.date ? null : bars.find((b) => b.date === d) ?? null))}
                onSelectPoint={(p) => setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))}
              />
            ) : range === "1D" ? (
              <div className="flex flex-col items-center justify-center gap-1.5 p-6 text-center text-muted-foreground" style={{ height: chartHeight }}>
                <p className="text-sm font-semibold text-foreground">Intraday session graph not published</p>
                <p className="text-xs">
                  Real-time ticks stream during active NEPSE trading hours (11:00 AM – 3:00 PM NPT). Switch to 1W, 1M,
                  or 1Y to view historical daily candles.
                </p>
              </div>
            ) : dailyQuery.isError ? (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center" style={{ height: chartHeight }}>
                <p className="text-sm font-semibold text-foreground">Couldn't load chart data</p>
                <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => void dailyQuery.refetch()}
                  className="mt-1 inline-flex min-h-11 items-center rounded-lg border border-border/60 bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground" style={{ height: chartHeight }}>
                <p className="text-sm">No historical candles found for this range.</p>
              </div>
            )}
            {(hoveredBar || hoveredPt) && (
              <div className="pointer-events-none absolute left-3 top-3 z-10 min-w-40 rounded-xl border border-border/70 bg-popover/95 px-3 py-2.5 text-xs shadow-xl backdrop-blur-md sm:left-4 sm:top-4">
                {hoveredBar ? (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-4 border-b border-border/60 pb-1.5">
                      <span className="font-semibold text-foreground">{hoveredBar.date}</span>
                      {hasPinnedSelection && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">Pinned · tap to clear</span>}
                      <span className={cn("num font-semibold", hoveredBar.close >= hoveredBar.open ? "text-gain" : "text-loss")}>
                        {hoveredBar.close >= hoveredBar.open ? "+" : ""}{(((hoveredBar.close - hoveredBar.open) / (hoveredBar.open || 1)) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-muted-foreground">
                      <span>Open <b className="num text-foreground">{hoveredBar.open.toFixed(2)}</b></span>
                      <span>High <b className="num text-foreground">{hoveredBar.high.toFixed(2)}</b></span>
                      <span>Low <b className="num text-foreground">{hoveredBar.low.toFixed(2)}</b></span>
                      <span>Close <b className="num text-foreground">{hoveredBar.close.toFixed(2)}</b></span>
                      {hoveredBar.volume > 0 && <span className="col-span-2">Volume <b className="num text-foreground">{hoveredBar.volume.toLocaleString()}</b></span>}
                    </div>
                  </>
                ) : hoveredPt ? (
                  <>
                    <div className="mb-1 text-muted-foreground">
                      {new Date(Number(hoveredPt.time) * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {hasPinnedSelection && <div className="mb-1.5 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300">Pinned · tap to clear</div>}
                    <div className="num text-lg font-bold text-foreground">{formatNumber(hoveredPt.value)}</div>
                    <div className={cn("num font-semibold", shownPct != null && shownPct >= 0 ? "text-gain" : "text-loss")}>
                      {shownPct != null && shownPct >= 0 ? "+" : ""}{shownPct?.toFixed(2)}%
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {sectorName ? (
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-bold">{sectorLabel} at a glance</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Live breadth and the most active stocks in this sector.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">Sector sentiment</div>
                    <div className={cn("text-sm font-bold", sentimentPct == null ? "text-muted-foreground" : sentimentPct >= 50 ? "text-gain" : "text-loss")}>
                      {sentimentPct == null ? "No breadth data" : `${sentimentPct >= 60 ? "Bullish" : sentimentPct <= 40 ? "Bearish" : "Mixed"} · ${sentimentPct}% advancing`}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">Index change</div>
                    <div className={cn("num text-sm font-bold", (sectorIndex?.percentChange ?? 0) >= 0 ? "text-gain" : "text-loss")}>
                      {sectorIndex?.percentChange == null ? "—" : `${sectorIndex.percentChange >= 0 ? "+" : ""}${sectorIndex.percentChange.toFixed(2)}%`}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <div className="text-[10px] text-muted-foreground">Advancing / declining</div>
                    <div className="num text-sm font-bold text-foreground">{advancing} / {declining}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-muted-foreground">Most active stocks by turnover</div>
                {topSectorStocks.length ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {topSectorStocks.map((stock) => (
                      <div key={stock.symbol} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2">
                        <div className="min-w-0"><div className="truncate text-xs font-bold">{stock.symbol}</div><div className="truncate text-[10px] text-muted-foreground">{stock.name}</div></div>
                        <div className="shrink-0 text-right"><div className="num text-xs font-semibold">{formatNumber(stock.ltp)}</div><div className={cn("num text-[10px] font-semibold", stock.percentChange >= 0 ? "text-gain" : "text-loss")}>{stock.percentChange >= 0 ? "+" : ""}{stock.percentChange.toFixed(2)}%</div></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">Stock level sector data is not available right now.</p>}
              </div>

              {otherSectors.length ? (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">Explore other sectors</div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {otherSectors.map((item) => (
                      <button key={item.name} type="button" onClick={() => setSelectedSector(item.sector ?? item.name)} className="shrink-0 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                        <span className="block max-w-40 truncate text-xs font-semibold">{item.sector ?? item.name}</span>
                        <span className={cn("num text-[11px] font-bold", (item.percentChange ?? 0) >= 0 ? "text-gain" : "text-loss")}>{(item.percentChange ?? 0) >= 0 ? "+" : ""}{item.percentChange?.toFixed(2)}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

        </div>
      </DialogContent>
    </Dialog>
  );
}
