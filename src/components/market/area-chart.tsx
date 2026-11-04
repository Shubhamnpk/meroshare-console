import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/lib/nepse/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Interactive SVG area chart with hover inspection: a guide line and a dot
 * follow the pointer, and a tooltip shows the nearest point's label + value.
 * Pure SVG, no chart library.
 */
export function AreaChart({
  points,
  height = 72,
  formatValue,
  formatLabel,
  tooltipExtra,
  onSelect,
  selectedTime,
  showAxes = false,
  wacc,
  waccSeries,
  includeWaccDomain = false,
  anchor,
  className,
}: {
  points: PricePoint[];
  height?: number;
  formatValue: (v: number) => string;
  formatLabel: (time: number) => string;
  /** Optional extra content rendered inside the hover tooltip (e.g. a per-scrip breakdown). */
  tooltipExtra?: (point: PricePoint) => ReactNode;
  /** Optional handler called when a point is clicked/pinned; clicking again deselects. */
  onSelect?: (point: PricePoint) => void;
  /** Time (unix seconds) of the currently pinned point, if any. */
  selectedTime?: number | null;
  /** Whether to render X-axis time labels and Y-axis amount grid/ticks. */
  showAxes?: boolean;
  /** Gray dashed avg-cost line (e.g. WACC or total investment) — drawn when in range */
  wacc?: number | null;
  /** Historical cost series — drawn as a dashed line following cost changes over time */
  waccSeries?: PricePoint[];
  /** When true, Y domain expands to include wacc (used for All/Max). Otherwise wacc clamps to edge. */
  includeWaccDomain?: boolean;
  /** Direction anchor (e.g. previous close): up = last >= anchor, else first point. Day charts. */
  anchor?: number | null;
  className?: string;
}) {
  const W = 320;
  const H = 96;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const hasWacc = includeWaccDomain && wacc != null && Number.isFinite(wacc);
    const hasSeries = Boolean(waccSeries && waccSeries.length > 0);
    const domainValues = hasSeries
      ? [...values, ...waccSeries!.map((p) => p.value)]
      : hasWacc
        ? [...values, wacc as number]
        : values;
    const min = Math.min(...domainValues);
    const max = Math.max(...domainValues);
    const range = max - min || 1;
    const pad = showAxes ? 8 : 6;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => pad + (1 - (v - min) / range) * (H - pad * 2);

    // Y-axis ticks across range
    const yTicks = [0, 0.33, 0.66, 1].map((pct) => {
      const val = min + pct * range;
      return {
        pct,
        y: y(val),
        value: val,
      };
    });

    // X-axis ticks evenly spaced across the time range
    const count = Math.min(5, points.length);
    const xTickIndices = Array.from(
      new Set(Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (points.length - 1)))),
    ).sort((a, b) => a - b);

    const xTicks = xTickIndices.map((idx) => ({
      index: idx,
      x: x(idx),
      time: points[idx]!.time,
    }));

    const effectiveAnchor = anchor ?? (wacc != null && Number.isFinite(wacc) ? wacc : values[0]!);
    const lastRef = hasSeries ? waccSeries![waccSeries!.length - 1]!.value : effectiveAnchor;
    return {
      up: values[values.length - 1]! >= lastRef,
      effectiveAnchor,
      min,
      max,
      yTicks,
      xTicks,
      line: points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`),
      waccLine: hasSeries
        ? `M ${waccSeries!.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" L ")}`
        : null,
      pts: points.map((p, i) => ({ x: x(i), y: y(p.value), time: p.time, value: p.value })),
    };
  }, [points, showAxes, wacc, waccSeries, includeWaccDomain, anchor]);

  const waccY = useMemo(() => {
    if (!geom || wacc == null || !Number.isFinite(wacc)) return null;
    // Other ranges: leave it — don't clamp to border, not realistic
    if (!includeWaccDomain && (wacc < geom.min || wacc > geom.max)) return null;
    const range = geom.max - geom.min || 1;
    const pad = showAxes ? 8 : 6;
    return pad + (1 - (wacc - geom.min) / range) * (H - pad * 2);
  }, [geom, wacc, showAxes, includeWaccDomain]);

  // Keep hooks before the empty-chart return: points can load asynchronously,
  // so this component may move between empty and populated states.
  const chartId = useId().replace(/:/g, "_");

  if (!geom) {
    return (
      <div className={cn("flex h-16 items-center justify-center text-xs text-muted-foreground", className)}>
        No history yet
      </div>
    );
  }

  const linePath = `M ${geom.line.join(" L ")}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  const hasSeriesSplit = Boolean(waccSeries && waccSeries.length > 0);
  const hasSplit = !hasSeriesSplit && waccY != null && waccY > 0 && waccY < H;
  const splitRatio = waccY != null ? Math.max(0, Math.min(1, waccY / H)) : 0.5;
  const solidStroke = geom.up ? "var(--gain)" : "var(--loss)";

  let stroke = solidStroke;
  if (hasSeriesSplit) {
    stroke = `url(#split-x-stroke-${chartId})`;
  } else if (hasSplit) {
    stroke = `url(#split-stroke-${chartId})`;
  }

  let fill = hasSplit ? `url(#split-fill-${chartId})` : `url(#area-fill-${chartId})`;
  if (hasSeriesSplit) {
    fill = `url(#split-x-fill-${chartId})`;
  }

  const isPointUp = (val: number, idx?: number | null) => {
    if (idx != null && waccSeries && waccSeries[idx] != null) {
      return val >= waccSeries[idx]!.value;
    }
    return val >= geom.effectiveAnchor;
  };
  const h = hover != null ? geom.pts[hover] : null;
  const svgRect = svgRef.current?.getBoundingClientRect();
  const selIdx = selectedTime != null ? geom.pts.findIndex((p) => p.time === selectedTime) : -1;
  const sel = selIdx >= 0 ? geom.pts[selIdx] : null;

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(frac * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const onPointerClick = (e: React.MouseEvent) => {
    if (!onSelect) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(frac * (points.length - 1))));
    setHover(idx);
    onSelect(points[idx]!);
  };

  return (
    <div className={cn("relative min-w-0 select-none", className)} onPointerLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full touch-none"
        role="img"
        aria-label="Price history chart"
        onPointerMove={onPointerMove}
        onClick={onPointerClick}
      >
        <defs>
          {hasSeriesSplit ? (
            <>
              <linearGradient id={`split-x-stroke-${chartId}`} x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
                {points.map((p, i) => {
                  const isUp = p.value >= (waccSeries![i]?.value ?? 0);
                  const frac = points.length <= 1 ? 0 : i / (points.length - 1);
                  return <stop key={i} offset={`${(frac * 100).toFixed(2)}%`} stopColor={isUp ? "var(--gain)" : "var(--loss)"} />;
                })}
              </linearGradient>
              <linearGradient id={`split-x-fill-${chartId}`} x1="0" y1="0" x2={W} y2="0" gradientUnits="userSpaceOnUse">
                {points.map((p, i) => {
                  const isUp = p.value >= (waccSeries![i]?.value ?? 0);
                  const frac = points.length <= 1 ? 0 : i / (points.length - 1);
                  return (
                    <stop
                      key={i}
                      offset={`${(frac * 100).toFixed(2)}%`}
                      stopColor={isUp ? "var(--gain)" : "var(--loss)"}
                      stopOpacity="0.22"
                    />
                  );
                })}
              </linearGradient>
            </>
          ) : hasSplit ? (
            <>
              <linearGradient id={`split-stroke-${chartId}`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--gain)" />
                <stop offset={`${splitRatio * 100}%`} stopColor="var(--gain)" />
                <stop offset={`${splitRatio * 100}%`} stopColor="var(--loss)" />
                <stop offset="100%" stopColor="var(--loss)" />
              </linearGradient>
              <linearGradient id={`split-fill-${chartId}`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="var(--gain)" stopOpacity="0.28" />
                <stop offset={`${splitRatio * 100}%`} stopColor="var(--gain)" stopOpacity="0.04" />
                <stop offset={`${splitRatio * 100}%`} stopColor="var(--loss)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.28" />
              </linearGradient>
            </>
          ) : (
            <linearGradient id={`area-fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={solidStroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={solidStroke} stopOpacity="0" />
            </linearGradient>
          )}
        </defs>
        {showAxes
          ? geom.yTicks.map((tick, i) => (
              <line
                key={i}
                x1={0}
                y1={tick.y}
                x2={W}
                y2={tick.y}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="3 3"
                className="text-border/35"
                vectorEffect="non-scaling-stroke"
              />
            ))
          : null}
        <path d={areaPath} fill={fill} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {geom.waccLine ? (
          <path
            d={geom.waccLine}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.2"
            strokeDasharray="6 4"
            opacity="0.85"
            vectorEffect="non-scaling-stroke"
          />
        ) : waccY != null ? (
          <line
            x1={0}
            y1={waccY}
            x2={W}
            y2={waccY}
            stroke="#9ca3af"
            strokeWidth="1.2"
            strokeDasharray="6 4"
            opacity="0.85"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {h ? (
          <line
            x1={h.x}
            y1="0"
            x2={h.x}
            y2={H}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {sel ? (
          <line
            x1={sel.x}
            y1="0"
            x2={sel.x}
            y2={H}
            stroke={stroke}
            strokeWidth="1.5"
            opacity="0.9"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {/* Dots are HTML overlays, not SVG circles: the viewBox is aspect-ratio
          stretched, so SVG circles render as ellipses. */}
      {h ? (
        <div
          className="pointer-events-none absolute z-50 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            left: `${(h.x / W) * 100}%`,
            top: `${(h.y / H) * 100}%`,
            backgroundColor: isPointUp(h.value, hover) ? "var(--gain)" : "var(--loss)",
            borderColor: "var(--background)",
          }}
        />
      ) : null}
      {sel ? (
        <div
          className="pointer-events-none absolute z-40 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-background"
          style={{
            left: `${(sel.x / W) * 100}%`,
            top: `${(sel.y / H) * 100}%`,
            borderColor: isPointUp(sel.value, selIdx) ? "var(--gain)" : "var(--loss)",
          }}
        />
      ) : null}

      {h && svgRect
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[99999] w-max min-w-32 max-w-56 rounded-lg border border-border/70 bg-background/95 px-2.5 py-1.5 text-center shadow-lg backdrop-blur"
              style={{
                left: clamp(svgRect.left + (h.x / W) * svgRect.width, 72, window.innerWidth - 72),
                top: Math.max(12, svgRect.top + (h.y / H) * svgRect.height - 12),
                transform: "translate(-50%, -100%)",
              }}
            >
              <p
                className="num whitespace-nowrap text-sm font-semibold"
                style={{ color: isPointUp(h.value, hover) ? "var(--gain)" : "var(--loss)" }}
              >
                {formatValue(h.value)}
              </p>
              <p className="num whitespace-nowrap text-[0.65rem] text-muted-foreground">{formatLabel(h.time)}</p>
              {tooltipExtra ? (
                <div className="mt-1.5 border-t border-border/60 pt-1.5 text-left">
                  {tooltipExtra({ time: h.time, value: h.value })}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {showAxes ? (
        <div className="pointer-events-none absolute inset-y-0 right-1.5 flex flex-col justify-between py-1 text-right select-none z-10">
          {geom.yTicks
            .slice()
            .reverse()
            .map((tick, i) => (
              <span
                key={i}
                className="font-mono text-[10px] text-muted-foreground/80 bg-background/70 px-1 py-0.5 rounded backdrop-blur-[2px]"
              >
                {formatValue(tick.value)}
              </span>
            ))}
        </div>
      ) : null}

      {showAxes ? (
        <div className="flex items-center justify-between pt-2 px-1 text-[11px] font-mono text-muted-foreground/80 border-t border-border/40 select-none">
          {geom.xTicks.map((tick, i) => (
            <span
              key={i}
              className={cn(i === 0 ? "text-left" : i === geom.xTicks.length - 1 ? "text-right" : "text-center")}
            >
              {formatLabel(tick.time)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
