"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { RotateCcw } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { formatDate, formatNpr, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CompareSeriesItem {
  symbol: string;
  name: string;
  color: string;
  points: { date: string; value: number }[];
  finalValue: number;
  totalGainPct: number;
}

interface TimeMachineCompareChartProps {
  series: CompareSeriesItem[];
  height?: number;
  className?: string;
}

function palette(light: boolean) {
  return {
    background: light ? "#ffffff" : "#0f1115",
    text: light ? "#33383f" : "#c9cdd6",
    grid: light ? "rgba(15,17,21,0.06)" : "rgba(255,255,255,0.05)",
    border: light ? "rgba(15,17,21,0.12)" : "rgba(255,255,255,0.08)",
  };
}

export function TimeMachineCompareChart({
  series,
  height = 380,
  className,
}: TimeMachineCompareChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const { theme } = useSettings();
  const light =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  // Map each series by symbol -> date -> value for rapid crosshair lookup
  const seriesValueMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of series) {
      const dateMap = new Map<string, number>();
      for (const p of s.points) {
        dateMap.set(p.date, p.value);
      }
      map.set(s.symbol, dateMap);
    }
    return map;
  }, [series]);

  // Latest available date across all series
  const latestDate = useMemo(() => {
    let latest = "";
    for (const s of series) {
      const last = s.points[s.points.length - 1];
      if (last && last.date > latest) latest = last.date;
    }
    return latest;
  }, [series]);

  const activeDate = hoverDate ?? latestDate;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || series.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const colors = palette(light);

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 1,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      localization: {
        locale: "en-NP",
        priceFormatter: (val: number) => formatNpr(val, { compact: true }),
      },
    });

    chartRef.current = chart;

    // Add each stock series
    for (const item of series) {
      if (item.points.length === 0) continue;
      const lineSeries = chart.addSeries(LineSeries, {
        color: item.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: item.symbol,
        priceFormat: {
          type: "custom",
          formatter: (val: number) => formatNpr(val, { compact: true }),
        },
      });

      // Filter and sort ascending unique dates
      const byDate = new Map<string, number>();
      for (const p of item.points) {
        byDate.set(p.date, p.value);
      }
      const sorted = Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({ time: date as Time, value }));

      lineSeries.setData(sorted);
    }

    const onCrosshairMove = (param: MouseEventParams) => {
      if (!param.time) {
        setHoverDate(null);
        return;
      }
      setHoverDate(String(param.time));
    };

    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.timeScale().fitContent();

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [series, light]);

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
        Select at least 2 stocks or mutual funds to compare
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col rounded-2xl overflow-hidden border border-border/70 bg-card", className)}>
      {/* Top Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((s) => {
            const val = activeDate
              ? seriesValueMap.get(s.symbol)?.get(activeDate) ?? s.finalValue
              : s.finalValue;

            return (
              <div key={s.symbol} className="flex items-center gap-1.5 text-xs font-mono">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-bold text-foreground">{s.symbol}:</span>
                <span className="font-medium text-foreground">{formatNpr(val)}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {activeDate && (
            <span className="font-mono text-[0.72rem] text-muted-foreground">
              {formatDate(activeDate)}
            </span>
          )}

          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Reset Zoom"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Lightweight-Charts Host */}
      <div
        ref={containerRef}
        className="w-full touch-pan-x"
        style={{ height }}
      />
    </div>
  );
}
