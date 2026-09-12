"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
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
  onSelectBar,
  onCreateOrder,
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
  /** Fired when a bar is clicked (bar date) or empty space is clicked (null). */
  onSelectBar?: ((date: string | null) => void) | undefined;
  /** Fired from the hover "+" menu to draft a limit order at a chart price. */
  onCreateOrder?: ((order: { price: number; side: "BUY" | "SELL" }) => void) | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const selectRef = useRef(onSelectBar);
  selectRef.current = onSelectBar;
  const createRef = useRef(onCreateOrder);
  createRef.current = onCreateOrder;
  const apiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Line" | "Area"> | null>(null);
  const [orderAt, setOrderAt] = useState<{ y: number; price: number } | null>(null);
  const [orderMenu, setOrderMenu] = useState(false);

  /** Drag-to-measure: armed by double-tap/double-click, active while dragging. */
  const [measure, setMeasure] = useState<{ from: Time; to: Time } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; bar: Bar } | null>(null);
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
        rightOffset: 0,
        ...(isIntraday
          ? {
              tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
                const timestamp = Number(time);
                if (!Number.isFinite(timestamp)) return String(time);
                // Convert UTC timestamp to Nepal time (UTC+5:45)
                const nepalMs = timestamp * 1000 + 345 * 60 * 1000;
                const d = new Date(nepalMs);
                const h = d.getUTCHours();
                const m = d.getUTCMinutes();
                const ampm = h >= 12 ? "PM" : "AM";
                const h12 = h % 12 || 12;
                return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
              },
            }
          : {}),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: "en-NP",
        ...(isIntraday
          ? {
              timeFormatter: (time: Time) => {
                const timestamp = Number(time);
                if (!Number.isFinite(timestamp)) return String(time);
                const nepalMs = timestamp * 1000 + 345 * 60 * 1000;
                const d = new Date(nepalMs);
                const h = d.getUTCHours();
                const m = d.getUTCMinutes();
                const ampm = h >= 12 ? "PM" : "AM";
                const h12 = h % 12 || 12;
                return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
              },
            }
          : {}),
      },
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
      seriesRef.current = series;
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
      seriesRef.current = series;
    } else if (style === "line") {
      const series = chart.addSeries(LineSeries, { color: "#2563eb", lineWidth: 2 });
      series.setData(bars.map((b) => ({ time: b.date as Time, value: b.close })));
      mainSeries = series;
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: "#2563eb",
        topColor: "#2563eb55",
        bottomColor: "#2563eb05",
        lineWidth: 2,
      });
      series.setData(bars.map((b) => ({ time: b.date as Time, value: b.close })));
      mainSeries = series;
      seriesRef.current = series;
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

    let pane = 1;
    if (indicators.volume) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "" },
        pane,
      );
      if (isIntraday) {
        const hasVolume = intraday.some((p) => (p.volume ?? 0) > 0);
        if (hasVolume) {
          volumeSeries.setData(
            intraday.map((p) => ({
              time: p.time as UTCTimestamp,
              value: p.volume ?? 0,
              color: p.value >= (intraday[0]?.value ?? 0) ? `${UP}66` : `${DOWN}66`,
            })),
          );
        }
      } else {
        volumeSeries.setData(
          bars.map((b) => ({
            time: b.date as Time,
            value: b.volume,
            color: b.close >= b.open ? `${UP}66` : `${DOWN}66`,
          })),
        );
      }
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
    const onClick = (param: MouseEventParams) => {
      const emit = selectRef.current;
      // Clicking empty space (no time) clears the selection and tooltip.
      if (!param.time) {
        setTip(null);
        emit?.(null);
        return;
      }
      if (!emit) return;
      // Skip while a drag-to-measure gesture is in progress.
      if (draggingRef.current) return;
      const direct = byDate.get(String(param.time));
      // Fall back to the nearest bar by logical index in case the event
      // time format ever differs from the stored bar dates.
      const logical = param.logical;
      const nearest =
        !direct && typeof logical === "number" && Number.isFinite(logical) && bars.length > 0
          ? bars[Math.min(bars.length - 1, Math.max(0, Math.round(logical)))]
          : undefined;
      const bar = direct ?? nearest;
      // Pin the floating tooltip at the tapped candle (touch has no hover).
      if (bar && param.point) setTip({ x: param.point.x, y: param.point.y, bar });
      emit(bar ? bar.date : null);
    };
    chart.subscribeClick(onClick);
    const handler = (param: MouseEventParams) => {
      if (anchorRef.current && pointerDownRef.current && param.time) {
        draggingRef.current = true;
        setMeasure({ from: anchorRef.current, to: param.time });
      }
      const emit = hoverRef.current;
      if (!emit && !createRef.current) return;
      const point = param.point ?? null;
      if (!param.time || !point) {
        emit?.(null);
        setTip(null);
        setOrderAt(null);
        setOrderMenu(false);
        return;
      }
      // Hover price for the "+" quick-order button (any series, any scale).
      if (createRef.current && seriesRef.current) {
        try {
          const raw = seriesRef.current.coordinateToPrice(point.y);
          const price = typeof raw === "number" ? Math.round(raw * 100) / 100 : 0;
          if (price > 0) {
            setOrderAt((prev) =>
              prev && Math.abs(prev.y - point.y) < 3 && prev.price === price
                ? prev
                : { y: point.y, price },
            );
          } else {
            setOrderAt(null);
            setOrderMenu(false);
          }
        } catch {
          // ignore out-of-scale coordinates
        }
      }
      if (isIntraday) {
        const value = mainSeries ? param.seriesData.get(mainSeries) : undefined;
        const price = value && "value" in value ? Number(value.value) : 0;
        const first = intraday[0]?.value ?? price;
        // Convert UTC timestamp to Nepal time (UTC+5:45)
        const nepalMs = Number(param.time) * 1000 + 345 * 60 * 1000;
        const nepalDate = new Date(nepalMs);
        const yyyy = nepalDate.getUTCFullYear();
        const mm = (nepalDate.getUTCMonth() + 1).toString().padStart(2, "0");
        const dd = nepalDate.getUTCDate().toString().padStart(2, "0");
        const hh = nepalDate.getUTCHours().toString().padStart(2, "0");
        const mi = nepalDate.getUTCMinutes().toString().padStart(2, "0");
        const ss = nepalDate.getUTCSeconds().toString().padStart(2, "0");
        emit?.({
          date: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`,
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
        emit?.(null);
        setTip(null);
        return;
      }
      setTip((prev) =>
        prev && prev.bar.date === bar.date && Math.abs(prev.x - point.x) < 2 ? prev : { x: point.x, y: point.y, bar },
      );
      emit?.({
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
      chart.unsubscribeClick(onClick);
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

  // "+" quick-order follows the mouse anywhere over the chart body (the
  // crosshair alone only carries a time over data points). While its menu
  // is open the button locks in place instead of chasing the cursor.
  const trackOrderAt = (clientY: number) => {
    if (orderMenu) return;
    if (!createRef.current || !seriesRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = clientY - rect.top;
    if (y < 0 || y > rect.height) {
      setOrderAt(null);
      setOrderMenu(false);
      return;
    }
    try {
      const raw = seriesRef.current.coordinateToPrice(y);
      const price = typeof raw === "number" ? Math.round(raw * 100) / 100 : 0;
      if (price > 0) {
        setOrderAt((prev) =>
          prev && Math.abs(prev.y - y) < 3 && prev.price === price ? prev : { y, price },
        );
      } else {
        setOrderAt(null);
        setOrderMenu(false);
      }
    } catch {
      // ignore out-of-scale coordinates
    }
  };

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
      onMouseMove={(e) => trackOrderAt(e.clientY)}
      onMouseLeave={() => {
        setOrderAt(null);
        setOrderMenu(false);
      }}
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
      {orderAt && !measure && createRef.current ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-[5] border-t border-dashed border-primary/60"
            style={{ top: orderAt.y }}
          />
          <div className="absolute right-0 z-10" style={{ top: Math.max(orderAt.y - 14, 4) }}>
            <button
              type="button"
              aria-label={`Create order at ${orderAt.price}`}
              title={`Create order at ${orderAt.price}`}
              onClick={(e) => {
                e.stopPropagation();
                setOrderMenu((v) => !v);
              }}
              className="num flex items-center gap-1.5 rounded-full border border-primary/50 bg-card/95 py-1 pl-2.5 pr-1 text-[0.68rem] font-bold text-primary shadow-lg backdrop-blur transition-colors hover:border-primary hover:bg-primary/10"
            >
              <span>
                {orderAt.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-3.5" />
              </span>
            </button>
          {orderMenu ? (
            <div className="absolute right-8 top-0 w-44 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xl">
              {(
                [
                  { side: "BUY", cls: "text-gain" },
                  { side: "SELL", cls: "text-destructive" },
                ] as const
              ).map(({ side, cls }) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    createRef.current?.({ price: orderAt.price, side });
                    setOrderMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted/60"
                >
                  <span className={cls}>{side} limit</span>
                  <span className="num text-muted-foreground">
                    @ {orderAt.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          </div>
        </>
      ) : null}
      {tip && !measure
        ? (() => {
            const width = containerRef.current?.offsetWidth ?? 0;
            const left = width > 0 ? Math.min(Math.max(tip.x, 84), width - 84) : tip.x;
            return (
              <div
                className="num pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-border/70 bg-card/95 px-2.5 py-1.5 text-[0.68rem] leading-relaxed shadow-lg backdrop-blur"
                style={{ left, top: Math.max(tip.y - 10, 4), transform: "translate(-50%, -100%)" }}
              >
                <p className="font-semibold text-foreground">{tip.bar.date.slice(0, 10)}</p>
                <p className="text-muted-foreground">
                  O {tip.bar.open.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · H{" "}
                  {tip.bar.high.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
                <p className="text-muted-foreground">
                  L {tip.bar.low.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · C{" "}
                  <span className="font-semibold text-foreground">
                    {tip.bar.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </p>
              </div>
            );
          })()
        : null}
    </div>
  );
}
