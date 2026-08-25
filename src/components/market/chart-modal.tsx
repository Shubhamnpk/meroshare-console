import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AreaChart } from "@/components/market/area-chart";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { DeltaPill } from "@/components/stat-card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import type { ChartBar, DailyBar, PricePoint } from "@/lib/nepse/types";

const TZ = "Asia/Kathmandu";

/** "14:32" in NPT, for intraday series. */
export function chartTimeLabel(time: number): string {
  return new Date(time * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "12 Aug" in NPT, for daily series. */
export function chartDayLabel(time: number): string {
  return new Date(time * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: TZ,
  });
}

export const SCRIP_RANGES = [
  { key: "1D", label: "1D", days: null as number | null },
  { key: "1M", label: "1M", days: 22 },
  { key: "3M", label: "3M", days: 66 },
  { key: "6M", label: "6M", days: 132 },
  { key: "1Y", label: "1Y", days: 264 },
] as const;

/** Slice intraday + daily bars into the 1D/1M/3M/6M/1Y buckets. */
export function buildScripRanges(
  intraday: PricePoint[],
  daily: PricePoint[],
): { key: string; label: string; points: PricePoint[] }[] {
  return SCRIP_RANGES.flatMap((range) => {
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
      <span className={cn("num font-semibold", up ? "text-gain" : "text-loss")}>
        {info.date.slice(0, 10)}
      </span>
      {cells.map((c) => (
        <span key={c.label} className="num flex items-center gap-1 text-muted-foreground">
          <span className="text-[0.65rem] uppercase">{c.label}</span>
          <span className={cn("font-medium", c.label === "Δ" && (up ? "text-gain" : "text-loss"))}>
            {c.value}
          </span>
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
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<IndicatorConfig>({
    ...DEFAULT_INDICATORS,
    sma20: true,
    volume: true,
  });
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
    return { start, end, high, low, change: end - start, pct: (end - start) / start };
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                      onClick={() => setIndicators((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Start
                </p>
                <p className="num text-sm font-medium">{formatValue(stats.start)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">End</p>
                <p className="num text-sm font-medium">{formatValue(stats.end)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Change
                </p>
                <p className="text-sm font-medium">
                  <DeltaPill value={stats.change}>{formatPercent(stats.pct)}</DeltaPill>
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  High / Low
                </p>
                <p className="num text-sm font-medium">
                  {formatValue(stats.high)} / {formatValue(stats.low)}
                </p>
              </div>
            </div>
          ) : null}

          {candleBars ? (
            <div className="space-y-2">
              <HoverLegend info={hover} origin={stats?.start ?? 0} />
              <TerminalChart
                bars={candleBars}
                intraday={[]}
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
              formatLabel={(t) =>
                active.key === "1D" ? formatIntradayLabel(t) : formatDailyLabel(t)
              }
              tooltipExtra={(p) => {
                const pct =
                  stats && stats.start ? ((p.value - stats.start) / stats.start) * 100 : 0;
                return (
                  <p
                    className={cn(
                      "num text-right text-[0.65rem] font-semibold",
                      pct >= 0 ? "text-gain" : "text-loss",
                    )}
                  >
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}% from start
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
            Values are indicative figures from the public NEPSE mirror. Hover anywhere on the chart
            to inspect individual points; the crosshair shows the exact price on the vertical axis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
