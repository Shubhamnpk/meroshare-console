"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  vwap,
  type Bar,
  type LinePoint,
} from "@/lib/nepse/indicators";

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

const toLine = (points: LinePoint[]) =>
  points.map((p) => ({ time: p.date as Time, value: p.value }));

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
  const apiRef = useRef<IChartApi | null>(null);

  /** Drag-to-measure: armed by double-tap/double-click, active while dragging. */
  const [measure, setMeasure] = useState<{ from: Time; to: Time } | null>(null);
  const anchorRef = useRef<Time | null>(null);
  const pointerDownRef = useRef(false);
  const draggingRef = useRef(false);

  const isIntraday = bars.length === 0 && intraday.length > 0;

  const barByDate = useMemo(() => new Map(bars.map((b) => [b.date, b] as const)), [bars]);

  const endMeasure = () => {
    // A plain double-click (no drag yet) keeps the anchor armed; releasing after
    // an actual drag closes the selection automatically.
    if (draggingRef.current) {
      draggingRef.current = false;
      anchorRef.current = null;
      setMeasure(null);
      apiRef.current?.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });
    }
    pointerDownRef.current = false;
  };

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
    apiRef.current = chart;

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
          .addSeries(LineSeries, {
            color: "#f59e0b",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          .setData(toLine(sma(indicatorBars, 20)));
      }
      if (indicators.sma50) {
        chart
          .addSeries(LineSeries, {
            color: "#8b5cf6",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          .setData(toLine(sma(indicatorBars, 50)));
      }
      if (indicators.ema20) {
        chart
          .addSeries(LineSeries, {
            color: "#06b6d4",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          .setData(toLine(ema(indicatorBars, 20)));
      }
      if (indicators.vwap) {
        chart
          .addSeries(LineSeries, {
            color: "#ec4899",
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
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
      series.createPriceLine({
        price: 70,
        color: DOWN,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: "",
      });
      series.createPriceLine({
        price: 30,
        color: UP,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: "",
      });
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

    // Double-tap/double-click arms the drag-to-measure anchor and freezes panning
    // so the drag selects a range instead of scrolling the chart.
    const onDblClick = (param: MouseEventParams) => {
      if (!param.time) return;
      anchorRef.current = param.time;
      setMeasure(null);
      chart.applyOptions({
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        },
      });
    };
    chart.subscribeDblClick(onDblClick);

    const byDate = new Map(bars.map((b) => [b.date, b]));
    const handler = (param: MouseEventParams) => {
      if (anchorRef.current && pointerDownRef.current && param.time) {
        draggingRef.current = true;
        setMeasure({ from: anchorRef.current, to: param.time });
      }
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
      chart.unsubscribeDblClick(onDblClick);
      chart.remove();
      apiRef.current = null;
    };
  }, [
    bars,
    intraday,
    style,
    indicators,
    compare,
    compareLabel,
    logScale,
    light,
    height,
    isIntraday,
  ]);

  // Highlight band between the anchor and the current drag point.
  let measureOverlay: ReactNode = null;
  if (measure) {
    const ts = apiRef.current?.timeScale();
    const fromX = ts?.timeToCoordinate(measure.from) ?? null;
    const toX = ts?.timeToCoordinate(measure.to) ?? null;
    if (fromX != null && toX != null) {
      const left = Math.min(fromX, toX);
      const width = Math.max(Math.abs(toX - fromX), 2);
      const fromBar = barByDate.get(String(measure.from));
      const toBar = barByDate.get(String(measure.to));
      const gain = fromBar && toBar ? toBar.close >= fromBar.close : true;
      const pct =
        fromBar && toBar && fromBar.close
          ? ((toBar.close - fromBar.close) / fromBar.close) * 100
          : 0;
      measureOverlay = (
        <>
          <div
            className={`pointer-events-none absolute inset-y-0 rounded-sm border ${
              gain ? "border-gain/50 bg-gain/15" : "border-loss/50 bg-loss/15"
            }`}
            style={{ left, width }}
          />
          <div
            className={`num pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
              gain ? "bg-gain text-white" : "bg-loss text-white"
            }`}
            style={{ left: left + width / 2 }}
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </div>
        </>
      );
    }
  }

  return (
    <div
      className="relative w-full select-none"
      style={{ height }}
      onPointerDown={() => {
        pointerDownRef.current = true;
      }}
      onPointerUp={endMeasure}
      onPointerCancel={endMeasure}
      onPointerLeave={(e) => {
        if (e.buttons === 0) endMeasure();
        else pointerDownRef.current = false;
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {measureOverlay}
    </div>
  );
}
