import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Point {
  time: number;
  value: number;
}

/**
 * Lightweight SVG area/line chart. No chart library, just a path built from
 * values with a gradient fill, colored by whether the series rose or fell.
 */
export function Sparkline({
  points,
  height = 72,
  fill = true,
  showLastDot = false,
  className,
}: {
  points: Point[];
  height?: number;
  fill?: boolean;
  showLastDot?: boolean;
  className?: string;
}) {
  const W = 320;
  const H = 96;

  const { line, area, lastX, lastY, up } = useMemo(() => {
    if (points.length < 2) return { line: "", area: "", lastX: 0, lastY: 0, up: true };
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 6;
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => pad + (1 - (v - min) / range) * (H - pad * 2);

    const linePoints = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`);
    const last = points[points.length - 1]!;
    return {
      line: `M ${linePoints.join(" L ")}`,
      area: `M ${linePoints.join(" L ")} L ${W},${H} L 0,${H} Z`,
      lastX: x(points.length - 1),
      lastY: y(last.value),
      up: last.value >= points[0]!.value,
    };
  }, [points]);

  if (points.length < 2) {
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

  const stroke = up ? "var(--gain)" : "var(--loss)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="Price history chart"
    >
      {fill && area ? (
        <>
          <defs>
            <linearGradient id={`spark-fill-${up ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-fill-${up ? "up" : "down"})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {showLastDot ? <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} /> : null}
    </svg>
  );
}
