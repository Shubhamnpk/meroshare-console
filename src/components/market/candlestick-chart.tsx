"use client";

import { useEffect, useRef } from "react";
import {
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
  CandlestickSeries,
  createChart,
} from "lightweight-charts";
import type { DailyBar } from "@/lib/nepse/types";

const GREEN = "#059669";
const RED = "#dc2626";
const NEUTRAL = "hsl(210 8% 55%)";

function toCandles(bars: DailyBar[]): CandlestickData[] {
  if (!bars.length) return [];
  let prevClose = bars[0]!.close;
  const out: CandlestickData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const open = i === 0 ? b.close : prevClose;
    out.push({ time: b.date, open, high: b.high, low: b.low, close: b.close });
    prevClose = b.close;
  }
  return out;
}

export function NeoCandlestickChart({
  bars,
  theme = "dark",
  height = 560,
}: {
  bars: DailyBar[];
  theme?: "light" | "dark";
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    chartRef.current?.remove();
    container.innerHTML = "";

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme === "light" ? "#ffffff" : "#0f1115" },
        textColor: theme === "light" ? "#1f2329" : "#d4d7de",
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, borderColor: NEUTRAL, timeVisible: true, secondsVisible: false },
      grid: {
        vertLines: { color: "hsl(210 8% 55% / 0.08)", style: 1 },
        horzLines: { color: "hsl(210 8% 55% / 0.08)", style: 1 },
      },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });
    seriesRef.current = series;
    series.setData(toCandles(bars));

    chart.timeScale().fitContent();

    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [bars, theme]);

  return <div ref={containerRef} className="w-full rounded-lg" style={{ height }} />;
}

NeoCandlestickChart.displayName = "NeoCandlestickChart";
