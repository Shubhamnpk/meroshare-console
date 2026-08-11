import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/lib/nepse/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Interactive SVG area chart with hover inspection: a guide line and a dot
 * follow the pointer, and a tooltip shows the nearest point's label + value.
 * Pure SVG — no chart library.
 */
export function AreaChart({
  points,
  height = 72,
  formatValue,
  formatLabel,
  tooltipExtra,
  onSelect,
  selectedTime,
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
  className?: string;
}) {
  const W = 320;
  const H = 96;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 6;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => pad + (1 - (v - min) / range) * (H - pad * 2);
    return {
      up: values[values.length - 1]! >= values[0]!,
      min,
      max,
      line: points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`),
      pts: points.map((p, i) => ({ x: x(i), y: y(p.value), time: p.time, value: p.value })),
    };
  }, [points]);

  if (!geom) {
    return (
      <div
        className={cn(
          "flex h-16 items-center justify-center text-xs text-muted-foreground",
          className,
        )}
      >
        No history yet
      </div>
    );
  }

  const linePath = `M ${geom.line.join(" L ")}`;
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`;
  const stroke = geom.up ? "var(--gain)" : "var(--loss)";
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
    <div className={cn("relative select-none", className)} onPointerLeave={() => setHover(null)}>
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
          <linearGradient id={`area-fill-${geom.up ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#area-fill-${geom.up ? "up" : "down"})`} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
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

      {/* Dots are HTML overlays, not SVG circles — the viewBox is aspect-ratio
          stretched, so SVG circles render as ellipses. */}
      {h ? (
        <div
          className="pointer-events-none absolute z-50 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            left: `${(h.x / W) * 100}%`,
            top: `${(h.y / H) * 100}%`,
            backgroundColor: stroke,
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
            borderColor: stroke,
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
              <p className="num whitespace-nowrap text-sm font-semibold" style={{ color: stroke }}>
                {formatValue(h.value)}
              </p>
              <p className="num whitespace-nowrap text-[0.65rem] text-muted-foreground">
                {formatLabel(h.time)}
              </p>
              {tooltipExtra ? (
                <div className="mt-1.5 border-t border-border/60 pt-1.5 text-left">
                  {tooltipExtra({ time: h.time, value: h.value })}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
