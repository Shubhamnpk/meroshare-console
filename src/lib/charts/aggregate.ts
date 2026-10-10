import type { ChartBar } from "@/lib/nepse/types";

export type BarAgg = "day" | "week" | "month" | "year";

/** Sunday (week-start) key for a "YYYY-MM-DD" trading date. */
function sundayKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Bucket daily candles into weekly/monthly/yearly candles: open = first open,
 * high/low = extremes, close = last close, volume = summed. Buckets keep
 * chronological order; weekly buckets are keyed by their Sunday.
 */
export function aggregateBars(bars: ChartBar[], agg: BarAgg): ChartBar[] {
  if (agg === "day" || bars.length === 0) return bars;
  const buckets = new Map<string, ChartBar[]>();
  for (const b of bars) {
    const key = agg === "week" ? sundayKey(b.date) : agg === "month" ? b.date.slice(0, 7) : b.date.slice(0, 4);
    const arr = buckets.get(key);
    if (arr) arr.push(b);
    else buckets.set(key, [b]);
  }
  return [...buckets.values()].map((group) => {
    const firstBar = group[0]!;
    const lastBar = group[group.length - 1]!;
    return {
      date: firstBar.date,
      open: firstBar.open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: lastBar.close,
      volume: group.reduce((sum, g) => sum + g.volume, 0),
      synthetic: false,
    };
  });
}
