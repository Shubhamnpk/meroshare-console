"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartBar, PricePoint } from "@/lib/nepse/types";
import { bollinger, ema, macd, rsi, sma, vwap, type Bar, type LinePoint } from "@/lib/nepse/indicators";

export type ChartStyle = "candles" | "line" | "area";

export interface IndicatorConfig {
  sma20: boolean;
  sma50: boolean;
  ema20: boolean;
  bollinger: boolean;
  vwap: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
}

export const DEFAULT_INDICATORS: IndicatorConfig = {
  sma20: true,
  sma50: false,
  ema20: false,
  bollinger: false,
  vwap: false,
  volume: true,
  rsi: false,
  macd: false,
};

export interface HoverInfo {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePercent: number;
}

const UP = "#16a34a";
const DOWN = "#dc2626";

function palette(light: boolean) {
  return {
    background: light ? "#ffffff" : "#0f1115",
    text: light ? "#33383f" : "#c9cdd6",
    grid: light ? "rgba(15,17,21,0.06)" : "rgba(255,255,255,0.05)",
    border: light ? "rgba(15,17,21,0.12)" : "rgba(255,255,255,0.08)",
  };
}

const toLine = (points: LinePoint[]) => points.map((p) => ({ time: p.date as Time, value: p.value }));

export function TerminalChart({
  bars,
  intraday,
  style,
  indicators,
  compare,
  compareLabel,
  logScale,
  light,
  height,
  onHover,
}: {
  bars: ChartBar[];
  intraday: PricePoint[];
  style: ChartStyle;
  indicators: IndicatorConfig;
  compare?: LinePoint[] | undefined;
  compareLabel?: string | undefined;
  logScale: boolean;
  light: boolean;
  height: number;
  onHover?: (info: HoverInfo | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  const isIntraday = bars.length === 0 && intraday.length > 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const colors = palette(light);

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
        panes: { separatorColor: colors.border, separatorHoverColor: colors.border },
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderVisible: false, mode: logScale ? 1 : 0 },
      timeScale: {
        borderVisible: false,
        timeVisible: isIntraday,
        secondsVisible: false,
        rightOffset: 4,
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "en-NP" },
    });

    let mainSeries: ISeriesApi<"Candlestick" | "Line" | "Area"> | null = null;

    if (isIntraday) {
      const points = intraday.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
      const first = points[0]?.value ?? 0;
      const last = points[points.length - 1]?.value ?? 0;
      const colour = last >= first ? UP : DOWN;
      const series = chart.addSeries(AreaSeries, {
        lineColor: colour,
        topColor: `${colour}55`,
        bottomColor: `${colour}05`,
        lineWidth: 2,
        priceLineVisible: false,
      });
      series.setData(points);
      mainSeries = series;
    } else if (style === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
      });
      series.setData(
        bars.map((b) => ({
          time: b.date as Time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      );
      mainSeries = series;
    } else if (style === "line") {
      const series = chart.addSeries(LineSeries, { color: "#2563eb", lineWidth: 2 });
      series.setData(bars.map((b) => ({ time: b.date as Time, value: b.close })));
      mainSeries = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: "#2563eb",
        topColor: "#2563eb55",
        bottomColor: "#2563eb05",
        lineWidth: 2,
      });
      series.setData(bars.map((b) => ({ time: b.date as Time, value: b.close })));
      mainSeries = series;
    }

    const indicatorBars: Bar[] = bars.map((b) => ({
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    if (!isIntraday) {
      if (indicators.sma20) {
        chart
          .addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          .setData(toLine(sma(indicatorBars, 20)));
      }
      if (indicators.sma50) {
        chart
          .addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          .setData(toLine(sma(indicatorBars, 50)));
      }
      if (indicators.ema20) {
        chart
          .addSeries(LineSeries, { color: "#06b6d4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          .setData(toLine(ema(indicatorBars, 20)));
      }
      if (indicators.vwap) {
        chart
          .addSeries(LineSeries, { color: "#ec4899", lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
          .setData(toLine(vwap(indicatorBars)));
      }
      if (indicators.bollinger) {
        const bands = bollinger(indicatorBars, 20, 2);
        const opts = {
          color: "rgba(148,163,184,0.75)",
          lineWidth: 1 as const,
          priceLineVisible: false,
          lastValueVisible: false,
        };
        chart.addSeries(LineSeries, opts).setData(toLine(bands.upper));
        chart.addSeries(LineSeries, opts).setData(toLine(bands.lower));
        chart
          .addSeries(LineSeries, { ...opts, lineStyle: LineStyle.Dotted })
          .setData(toLine(bands.middle));
      }

      if (compare && compare.length > 1) {
        const series = chart.addSeries(LineSeries, {
          color: "#94a3b8",
          lineWidth: 1,
          priceScaleId: "compare",
          priceLineVisible: false,
          title: compareLabel ?? "Compare",
        });
        series.setData(toLine(compare));
        chart.priceScale("compare").applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.3 },
          visible: false,
        });
      }
    }

    let pane = 1;
    if (indicators.volume) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "" },
        pane,
      );
      const source = isIntraday ? [] : bars;
      volumeSeries.setData(
        source.map((b) => ({
          time: b.date as Time,
          value: b.volume,
          color: b.close >= b.open ? `${UP}66` : `${DOWN}66`,
        })),
      );
      chart.panes()[pane]?.setHeight(Math.round(height * 0.16));
      pane += 1;
    }

    if (!isIntraday && indicators.rsi) {
      const series = chart.addSeries(
        LineSeries,
        { color: "#eab308", lineWidth: 1, priceLineVisible: false },
        pane,
      );
      series.setData(toLine(rsi(indicatorBars, 14)));
      series.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      series.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      chart.panes()[pane]?.setHeight(Math.round(height * 0.18));
      pane += 1;
    }

    if (!isIntraday && indicators.macd) {
      const series = macd(indicatorBars);
      const hist = chart.addSeries(HistogramSeries, { priceScaleId: "" }, pane);
      hist.setData(
        series.histogram.map((p) => ({
          time: p.date as Time,
          value: p.value,
          color: p.value >= 0 ? `${UP}88` : `${DOWN}88`,
        })),
      );
      chart
        .addSeries(LineSeries, { color: "#2563eb", lineWidth: 1, priceLineVisible: false }, pane)
        .setData(toLine(series.macd));
      chart
        .addSeries(LineSeries, { color: "#f97316", lineWidth: 1, priceLineVisible: false }, pane)
        .setData(toLine(series.signal));
      chart.panes()[pane]?.setHeight(Math.round(height * 0.18));
      pane += 1;
    }

    const byDate = new Map(bars.map((b) => [b.date, b]));
    const handler = (param: MouseEventParams) => {
      const emit = hoverRef.current;
      if (!emit) return;
      if (!param.time || !param.point) {
        emit(null);
        return;
      }
      if (isIntraday) {
        const value = mainSeries ? param.seriesData.get(mainSeries) : undefined;
        const price = value && "value" in value ? Number(value.value) : 0;
        const first = intraday[0]?.value ?? price;
        emit({
          date: new Date(Number(param.time) * 1000).toISOString(),
          open: first,
          high: price,
          low: price,
          close: price,
          volume: 0,
          changePercent: first ? ((price - first) / first) * 100 : 0,
        });
        return;
      }
      const bar = byDate.get(String(param.time));
      if (!bar) {
        emit(null);
        return;
      }
      emit({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        changePercent: bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0,
      });
    };
    chart.subscribeCrosshairMove(handler);
    chart.timeScale().fitContent();

    return () => {
      chart.unsubscribeCrosshairMove(handler);
      chart.remove();
    };
  }, [bars, intraday, style, indicators, compare, compareLabel, logScale, light, height, isIntraday]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
