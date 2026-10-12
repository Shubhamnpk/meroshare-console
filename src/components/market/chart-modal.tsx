import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AreaChart } from "@/components/market/area-chart";
import { TerminalChart, type HoverInfo, type IndicatorConfig } from "@/components/market/terminal-chart";
import { DeltaPill } from "@/components/stat-card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { CHART_RANGES, type ChartRangeKey } from "@/lib/charts/ranges";
import type { ChartBar, DailyBar, PricePoint } from "@/lib/nepse/types";

const TZ = "Asia/Kathmandu";

/** Stable empty intraday (a fresh `[]` literal would rebuild TerminalChart each render). */
const NO_POINTS: PricePoint[] = [];

/** "2:32 PM" in NPT, for intraday series. */
export function chartTimeLabel(time: number): string {
  return new Date(time * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
}

/** "12 Aug 2024" in NPT, for daily series. */
export function chartDayLabel(time: number): string {
  return new Date(time * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

/** True when the unix time falls on today's NPT calendar day (session check). */
export function isTodayNpt(time: number): boolean {
  const fmt = (t: number) =>
    new Date(t * 1000).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: TZ,
    });
  return fmt(time) === fmt(Date.now() / 1000);
}

/** Trading days per range key (≈264 sessions/year); MAX keeps the whole array. */
const SCRIP_RANGE_DAYS: Record<ChartRangeKey, number | null> = {
  "1D": null,
  "1W": 5,
  "1M": 22,
  "3M": 66,
  "6M": 132,
  "1Y": 264,
  "5Y": 1320,
  MAX: Number.POSITIVE_INFINITY,
};

export const SCRIP_RANGES = CHART_RANGES.map((key) => ({ key, label: key, days: SCRIP_RANGE_DAYS[key] }));

/** Slice intraday + daily bars into the 1D/1W/1M/3M/6M/1Y/5Y/MAX buckets. */
export function buildScripRanges(
  intraday: PricePoint[],
  daily: PricePoint[],
): { key: string; label: string; points: PricePoint[] }[] {
  return SCRIP_RANGES.flatMap((range) => {
    // slice(-Infinity) keeps the whole array, giving the full-archive range.
    const points = range.days === null ? intraday : daily.slice(-range.days);
    return points.length >= 2 ? [{ key: range.key, label: range.label, points }] : [];
  });
}

/** Close-only daily rows → OHLCV candles (open ≈ previous close). */
function toChartBars(bars: DailyBar[]): ChartBar[] {
  let prev = bars[0]?.close ?? 0;
  return bars.map((b) => {
    const bar: ChartBar = {
      date: b.date,
      open: prev,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      synthetic: false,
    };
    prev = b.close;
    return bar;
  });
}

const INDICATOR_TOGGLES: { key: keyof IndicatorConfig; label: string }[] = [
  { key: "volume", label: "Vol" },
  { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" },
  { key: "ema20", label: "EMA 20" },
  { key: "bollinger", label: "BB" },
  { key: "vwap", label: "VWAP" },
  { key: "rsi", label: "RSI" },
  { key: "macd", label: "MACD" },
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

function HoverLegend({ info, origin }: { info: HoverInfo | null; origin: number }) {
  if (!info) return null;
  const up = info.close >= info.open;
  const fromOrigin = origin ? ((info.close - origin) / origin) * 100 : 0;
  const cells: { label: string; value: string }[] = [
    { label: "O", value: info.open.toFixed(2) },
    { label: "H", value: info.high.toFixed(2) },
    { label: "L", value: info.low.toFixed(2) },
    { label: "C", value: info.close.toFixed(2) },
    { label: "Δ", value: `${info.changePercent >= 0 ? "+" : ""}${info.changePercent.toFixed(2)}%` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className={cn("num font-semibold", up ? "text-gain" : "text-loss")}>{info.date.slice(0, 10)}</span>
      {cells.map((c) => (
        <span key={c.label} className="num flex items-center gap-1 text-muted-foreground">
          <span className="text-[0.65rem] uppercase">{c.label}</span>
          <span className={cn("font-medium", c.label === "Δ" && (up ? "text-gain" : "text-loss"))}>{c.value}</span>
        </span>
      ))}
      <span
        className={cn(
          "num rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
          fromOrigin >= 0 ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss",
        )}
      >
        {fromOrigin >= 0 ? "+" : ""}
        {fromOrigin.toFixed(2)}% from start
      </span>
      {info.volume > 0 ? (
        <span className="num flex items-center gap-1 text-muted-foreground">
          <span className="text-[0.65rem] uppercase">Vol</span>
          <span className="font-medium">{info.volume.toLocaleString()}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ChartModal({
  open,
  onOpenChange,
  title,
  subtitle,
  ranges,
  bars,
  formatValue,
  formatIntradayLabel,
  formatDailyLabel,
  changeBase,
  officialChange,
  sessionRange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  ranges: { key: string; label: string; points: PricePoint[] }[];
  /** Daily OHLC rows enabling candlestick mode for non-intraday ranges. */
  bars?: DailyBar[] | undefined;
  formatValue: (v: number) => string;
  formatIntradayLabel: (time: number) => string;
  formatDailyLabel: (time: number) => string;
  /** Official reference (e.g. index previous close): Change reads end-vs-base. */
  changeBase?: { value: number; label: string } | undefined;
  /** Provider-stated change: trusted verbatim (pre-market gaps break tick math). */
  officialChange?: { change: number; pct: number } | undefined;
  /** Official session extremes; tick-derived when absent. */
  sessionRange?: { high: number; low: number } | undefined;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { chart, setChart } = useSettings();
  const indicators = chart.indicators;
  const setIndicators = (v: IndicatorConfig) => setChart({ indicators: v });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const light = useResolvedLight();

  const active = ranges.find((r) => r.key === activeKey) ?? ranges[0];
  const rangeDays = SCRIP_RANGES.find((r) => r.key === active?.key)?.days ?? null;

  // Candle mode: daily OHLC available and the range is not the intraday session.
  const candleBars = useMemo(() => {
    if (!bars?.length || rangeDays === null || !active) return null;
    const times = new Set(active.points.map((p) => p.time));
    const sliced = bars.filter((b) => times.has(new Date(b.date).getTime() / 1000));
    return sliced.length >= 2 ? toChartBars(sliced) : null;
  }, [bars, rangeDays, active]);

  const stats = useMemo(() => {
    if (!active || active.points.length < 2) return null;
    const pts = active.points;
    const start = pts[0]!.value;
    const end = pts[pts.length - 1]!.value;
    const high = Math.max(...pts.map((p) => p.value));
    const low = Math.min(...pts.map((p) => p.value));
    // Change reads against the official base when given (index previous
    // close), in percent units like every other DeltaPill in the app.
    const base = changeBase && changeBase.value > 0 ? changeBase.value : start;
    const change = end - base;
    return { start, end, high, low, base, change, pct: base > 0 ? ((end - base) / base) * 100 : 0 };
  }, [active, changeBase]);
  const shownHigh = sessionRange && sessionRange.high > 0 ? sessionRange.high : (stats?.high ?? 0);
  const shownLow = sessionRange && sessionRange.low > 0 ? sessionRange.low : (stats?.low ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {ranges.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {ranges.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => setActiveKey(range.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active?.key === range.key
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {range.label}
                </button>
              ))}
              {candleBars ? (
                <span className="ml-auto hidden items-center gap-1 sm:flex">
                  {INDICATOR_TOGGLES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setIndicators({ ...indicators, [t.key]: !indicators[t.key] })}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.68rem] font-medium transition-colors",
                        indicators[t.key]
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}

          {stats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  {changeBase ? changeBase.label : "Start"}
                </p>
                <p className="num text-sm font-medium">{formatValue(stats.base)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">End</p>
                <p className="num text-sm font-medium">{formatValue(stats.end)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Change</p>
                <p className="text-sm font-medium">
                  <DeltaPill value={officialChange?.change ?? stats.change}>
                    {formatPercent(officialChange?.pct ?? stats.pct)}
                  </DeltaPill>
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">High</p>
                <p className="num text-sm font-medium">{formatValue(shownHigh)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Low</p>
                <p className="num text-sm font-medium">{formatValue(shownLow)}</p>
              </div>
            </div>
          ) : null}

          {candleBars ? (
            <div className="space-y-2">
              <HoverLegend info={hover} origin={stats?.base ?? stats?.start ?? 0} />
              <TerminalChart
                bars={candleBars}
                intraday={NO_POINTS}
                style="candles"
                indicators={indicators}
                logScale={false}
                light={light}
                height={340}
                onHover={setHover}
              />
            </div>
          ) : active && active.points.length >= 2 ? (
            <AreaChart
              points={active.points}
              height={300}
              formatValue={formatValue}
              formatLabel={(t) => (active.key === "1D" ? formatIntradayLabel(t) : formatDailyLabel(t))}
              tooltipExtra={(p) => {
                const base = stats?.base ?? 0;
                const pct = base > 0 ? ((p.value - base) / base) * 100 : 0;
                return (
                  <p
                    className={cn("num text-center text-[0.65rem] font-semibold", pct >= 0 ? "text-gain" : "text-loss")}
                  >
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}% from {changeBase ? changeBase.label.toLowerCase() : "start"}
                  </p>
                );
              }}
            />
          ) : (
            <p className="rounded-xl border border-border/60 bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
              No chart data for this range yet.
            </p>
          )}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Values are indicative figures from the public NEPSE mirror. Hover anywhere on the chart to inspect
            individual points; the crosshair shows the exact price on the vertical axis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
