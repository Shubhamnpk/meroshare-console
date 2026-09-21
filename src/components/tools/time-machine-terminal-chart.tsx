"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  AreaSeries,
  LineSeries,
  LineStyle,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { Gift, RotateCcw, TrendingUp } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { formatDate, formatNpr, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TerminalChartPoint {
  date: string;
  value: number;
  invested: number;
  price: number;
  units: number;
  event?: {
    bonusPct: number;
    cashPct: number;
    bonusUnits: number;
    cashAmount: number;
  } | undefined;
}

interface TimeMachineTerminalChartProps {
  points: TerminalChartPoint[];
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

export function TimeMachineTerminalChart({
  points,
  height = 360,
  className,
}: TimeMachineTerminalChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const valSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const invSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [hoverPoint, setHoverPoint] = useState<TerminalChartPoint | null>(null);
  const [showInvested, setShowInvested] = useState(true);

  const { theme } = useSettings();
  const light =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  // Map for fast date lookup on crosshair hover
  const pointsMap = useMemo(() => {
    const map = new Map<string, TerminalChartPoint>();
    for (const p of points) {
      map.set(p.date, p);
    }
    return map;
  }, [points]);

  const latestPoint = points[points.length - 1] ?? null;
  const active = hoverPoint ?? latestPoint;

  const isGain = (latestPoint?.value ?? 0) >= (latestPoint?.invested ?? 0);
  const UP_COLOR = "#10b981";
  const DOWN_COLOR = "#ef4444";
  const primaryColor = isGain ? UP_COLOR : DOWN_COLOR;

  // Initialize and update Lightweight-Chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    // Clean up previous chart instance
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

    // 1. Portfolio Value Series (Area)
    const valSeries = chart.addSeries(AreaSeries, {
      lineColor: primaryColor,
      topColor: `${primaryColor}40`,
      bottomColor: `${primaryColor}00`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: {
        type: "custom",
        formatter: (val: number) => formatNpr(val, { compact: true }),
      },
    });

    valSeries.setData(
      points.map((p) => ({
        time: p.date as Time,
        value: p.value,
      }))
    );
    valSeriesRef.current = valSeries;

    // 2. Invested Capital Series (Gray Dashed Line)
    if (showInvested) {
      const invSeries = chart.addSeries(LineSeries, {
        color: "#9ca3af",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: {
          type: "custom",
          formatter: (val: number) => formatNpr(val, { compact: true }),
        },
      });

      invSeries.setData(
        points.map((p) => ({
          time: p.date as Time,
          value: p.invested,
        }))
      );
      invSeriesRef.current = invSeries;
    }

    // Crosshair hover listener
    const onCrosshairMove = (param: MouseEventParams) => {
      if (!param.time) {
        setHoverPoint(null);
        return;
      }
      const dateStr = String(param.time);
      const pt = pointsMap.get(dateStr);
      if (pt) {
        setHoverPoint(pt);
      }
    };

    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.timeScale().fitContent();

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [points, light, showInvested, primaryColor, pointsMap]);

  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
        Insufficient price data to plot chart
      </div>
    );
  }

  const pnl = (active?.value ?? 0) - (active?.invested ?? 0);
  const pnlPct =
    (active?.invested ?? 0) > 0 ? (pnl / (active?.invested ?? 1)) * 100 : 0;
  const wacc = (active?.units ?? 0) > 0 ? (active?.invested ?? 0) / active!.units : 0;

  return (
    <div className={cn("relative flex flex-col rounded-2xl overflow-hidden border border-border/70 bg-card", className)}>
      {/* Top Terminal HUD / Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3.5">
          {/* Portfolio Value */}
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: primaryColor }}
            />
            <span className="font-mono text-xs font-bold text-foreground">
              {formatNpr(active?.value ?? 0)}
            </span>
            <span className="text-[0.68rem] text-muted-foreground">Portfolio</span>
          </div>

          {/* Invested Capital */}
          {showInvested && (
            <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
              <span className="inline-block size-2 rounded-full border border-dashed border-muted-foreground" />
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {formatNpr(active?.invested ?? 0)}
              </span>
              <span className="text-[0.68rem] text-muted-foreground">Invested</span>
            </div>
          )}

          {/* Net P&L */}
          <div className="flex items-center gap-1.5 border-l border-border/60 pl-3 text-xs">
            <span className="text-muted-foreground text-[0.68rem]">P&L:</span>
            <span
              className={cn(
                "num font-mono font-semibold",
                pnl >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {pnl >= 0 ? "+" : ""}
              {formatNpr(pnl)} ({formatPercent(pnlPct)})
            </span>
          </div>

          {/* Holdings info */}
          {active && (
            <div className="hidden sm:flex items-center gap-1 text-[0.68rem] text-muted-foreground border-l border-border/60 pl-3">
              <span>Holding:</span>
              <span className="font-mono font-medium text-foreground">
                {active.units.toLocaleString()} units @ {formatNpr(active.price)}
              </span>
            </div>
          )}
          {/* WACC / avg cost */}
          {active && wacc > 0 && (
            <div className="hidden lg:flex items-center gap-1.5 border-l border-border/60 pl-3 text-[0.68rem]">
              <span className="text-muted-foreground">Avg cost:</span>
              <span className="font-mono font-semibold text-foreground">{formatNpr(wacc)}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold",
                  active.price >= wacc ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
                )}
              >
                {active.price >= wacc ? "+" : ""}
                {formatPercent(active.price > 0 ? ((active.price - wacc) / wacc) * 100 : 0)}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Active date & toggles */}
        <div className="flex items-center gap-2">
          {active?.event && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-primary">
              <Gift className="size-3" />
              {active.event.bonusPct > 0 && `Bonus +${active.event.bonusPct}% `}
              {active.event.cashPct > 0 && `Cash ${active.event.cashPct}%`}
            </span>
          )}

          <span className="font-mono text-[0.72rem] text-muted-foreground">
            {formatDate(active?.date)}
          </span>

          <button
            type="button"
            onClick={() => setShowInvested(!showInvested)}
            className={cn(
              "rounded px-2 py-0.5 text-[0.68rem] font-medium border transition-colors",
              showInvested
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground"
            )}
          >
            Invested Line
          </button>

          <button
            type="button"
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Fit / Reset Zoom"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Lightweight-Charts Canvas Host */}
      <div
        ref={containerRef}
        className="w-full touch-pan-x"
        style={{ height }}
      />
    </div>
  );
}
