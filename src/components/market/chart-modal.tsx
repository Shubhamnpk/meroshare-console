import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AreaChart } from "@/components/market/area-chart";
import { DeltaPill } from "@/components/stat-card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/lib/nepse/types";

const TZ = "Asia/Kathmandu";

/** "14:32" in NPT — for intraday series. */
export function chartTimeLabel(time: number): string {
  return new Date(time * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "12 Aug" in NPT — for daily series. */
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

export function ChartModal({
  open,
  onOpenChange,
  title,
  subtitle,
  ranges,
  formatValue,
  formatIntradayLabel,
  formatDailyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  ranges: { key: string; label: string; points: PricePoint[] }[];
  formatValue: (v: number) => string;
  formatIntradayLabel: (time: number) => string;
  formatDailyLabel: (time: number) => string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = ranges.find((r) => r.key === activeKey) ?? ranges[0];

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
            <div className="flex flex-wrap gap-1.5">
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

          {active && active.points.length >= 2 ? (
            <AreaChart
              points={active.points}
              height={300}
              formatValue={formatValue}
              formatLabel={(t) =>
                active.key === "1D" ? formatIntradayLabel(t) : formatDailyLabel(t)
              }
            />
          ) : (
            <p className="rounded-xl border border-border/60 bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
              No chart data for this range yet.
            </p>
          )}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Values are indicative figures from the public NEPSE mirror. Hover anywhere on the chart
            to inspect individual points.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
