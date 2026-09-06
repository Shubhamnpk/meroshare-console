import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/prefs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Same theme resolution as the charts: app pref, falling back to the OS. */
function useResolvedLight(): boolean {
  const { theme } = useSettings();
  const [light, setLight] = useState(false);
  useEffect(() => {
    const resolve = () =>
      setLight(
        theme === "light" ||
          (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches),
      );
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);
  return light;
}

export interface HeatTile {
  key: string;
  label: string;
  detail: string;
  value: number;
  change: number;
  title?: string;
  /** Category region (e.g. sector). Tiles without one share a single pool. */
  group?: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
}

interface GroupBox {
  key: string;
  label: string;
  count: number;
  /** Share of total map area, 0–1. */
  share: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap in 0–100 space: tiles stay as square as possible and
 * every tile fills the map — no ragged rows. Same approach as the mutual
 * fund heat map, minus its fund-specific controls.
 */
function squarify(
  entries: { value: number; index: number }[],
  rect: { x: number; y: number; w: number; h: number },
  res: Rect[],
) {
  if (entries.length === 0) return;
  if (!(rect.w > 0) || !(rect.h > 0)) {
    for (const e of entries) res.push({ x: 0, y: 0, w: 0, h: 0, index: e.index });
    return;
  }
  const totalValue = entries.reduce((s, e) => s + e.value, 0);
  if (!(totalValue > 0)) {
    for (const e of entries) res.push({ x: 0, y: 0, w: 0, h: 0, index: e.index });
    return;
  }

  const row: typeof entries = [];
  let rowValue = 0;
  let bestAspect = Infinity;
  const isVertical = rect.w >= rect.h;

  for (let i = 0; i < entries.length; i++) {
    const candidate = [...row, entries[i]!];
    const cv = candidate.reduce((s, e) => s + e.value, 0);
    const frac = cv / totalValue;
    const rowSize = isVertical ? (frac * rect.w * rect.h) / rect.h : (frac * rect.w * rect.h) / rect.w;

    const aspects = candidate.map((e) => {
      const c = isVertical
        ? ((e.value / cv) * rect.w) / rowSize
        : ((e.value / cv) * rect.h) / rowSize;
      return Math.max(c, 1 / c);
    });
    const worst = Math.max(...aspects);
    if (worst < bestAspect) {
      bestAspect = worst;
      row.push(entries[i]!);
      rowValue = cv;
    } else {
      break;
    }
  }

  const remaining = entries.slice(row.length === 0 ? 1 : row.length);
  if (row.length === 0) {
    row.push(entries[0]!);
    rowValue = entries[0]!.value;
  }
  const frac = rowValue / totalValue;
  let rowW: number;
  let rowH: number;
  let rowX: number;
  let rowY: number;
  if (isVertical) {
    rowW = frac * rect.w;
    rowH = rect.h;
    rowX = rect.x;
    rowY = rect.y;
  } else {
    rowW = rect.w;
    rowH = frac * rect.h;
    rowX = rect.x;
    rowY = rect.y;
  }

  const rowTotal = row.reduce((s, e) => s + e.value, 0) || 1;
  let acc = 0;
  for (const e of row) {
    const f = e.value / rowTotal;
    if (isVertical) {
      res.push({ x: rowX, y: rowY + acc * rowH, w: rowW, h: f * rowH, index: e.index });
      acc += f;
    } else {
      res.push({ x: rowX + acc * rowW, y: rowY, w: f * rowW, h: rowH, index: e.index });
      acc += f;
    }
  }

  const remainingRect = isVertical
    ? { x: rect.x + rowW, y: rect.y, w: Math.max(0, rect.w - rowW), h: rect.h }
    : { x: rect.x, y: rect.y + rowH, w: rect.w, h: Math.max(0, rect.h - rowH) };

  squarify(remaining, remainingRect, res);
}

const GAP = 0;

type RGB = [number, number, number];
/** Card surface the translucent tiles sit on (styles.css --card). */
const LIGHT_BASE: RGB = [255, 255, 255];
const DARK_BASE: RGB = [41, 48, 66];

/**
 * Pick tile text from the *blended* result, not the overlay alone.
 * NOTE: `dark:` Tailwind classes can't do this job — the app themes via a
 * `.light` class (dark is the default), so `dark:` selectors keyed on
 * `.dark` never fire. Resolved-JS contrast works in every mode, fixing the
 * fund map's text flaw the same way.
 */
function textOn(base: RGB, overlay: RGB, alpha: number): string {
  const blended = overlay.map((c, i) => c * alpha + base[i]! * (1 - alpha)) as RGB;
  const [r, g, b] = blended.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.35 ? "#0b0d12" : "#ffffff";
}

export function Heatmap({
  tiles,
  onPick,
  sizeLabel,
  heightClass = "h-[340px]",
  hideLegend,
  groupLabels,
  selectedKey,
  highlightedKeys,
  renderTooltip,
}: {
  tiles: HeatTile[];
  onPick?: ((key: string) => void) | undefined;
  sizeLabel: string;
  heightClass?: string | undefined;
  hideLegend?: boolean | undefined;
  /** Display names for group keys (defaults to the raw key). */
  groupLabels?: Record<string, string> | undefined;
  /** Tile key pinned with a selection ring. */
  selectedKey?: string | null | undefined;
  /** When non-empty, tiles outside the set dim; inside get an accent ring. */
  highlightedKeys?: ReadonlySet<string> | undefined;
  /** Rich hover card per tile; falls back to the `title` string when omitted. */
  renderTooltip?: ((tile: HeatTile) => ReactNode) | undefined;
}) {
  const light = useResolvedLight();
  const base = light ? LIGHT_BASE : DARK_BASE;
  const layout = useMemo(() => {
    const rects: Rect[] = [];
    const boxes: GroupBox[] = [];
    // One shared map: each group gets a region proportional to its total so
    // every tile stays on the same scale across categories.
    const buckets = new Map<string, number[]>();
    tiles.forEach((t, i) => {
      const key = t.group ?? "";
      const arr = buckets.get(key);
      if (arr) arr.push(i);
      else buckets.set(key, [i]);
    });
    const groups = [...buckets.entries()]
      .map(([key, idx]) => ({
        key,
        idx,
        total: idx.reduce((s, i) => s + Math.abs(tiles[i]!.value), 0),
      }))
      .sort((a, b) => b.total - a.total);
    const grand = groups.reduce((s, g) => s + g.total, 0) || 1;
    if (groups.length < 2) {
      const entries = tiles
        .map((t, i) => ({ value: Math.abs(t.value) / grand, index: i }))
        .sort((a, b) => b.value - a.value);
      squarify(entries, { x: 0, y: 0, w: 100, h: 100 }, rects);
      return { rects: rects.sort((a, b) => a.index - b.index), boxes };
    }
    // Recursive treemap: squarify the groups themselves by total volume, so
    // each region's *area* (not just a column strip) reflects its weight.
    // Then squarify each group's tiles inside its own region.
    const groupRects: Rect[] = [];
    squarify(
      groups.map((g, gi) => ({ value: g.total / grand, index: gi })),
      { x: 0, y: 0, w: 100, h: 100 },
      groupRects,
    );
    const regionOf = new Map(groupRects.map((r) => [r.index, r]));
    groups.forEach((g, gi) => {
      const region = regionOf.get(gi) ?? { x: 0, y: 0, w: 0, h: 0 };
      const sub =
        g.total > 0
          ? { x: region.x, y: region.y, w: region.w, h: region.h }
          : { x: 0, y: 0, w: 0, h: 0 };
      const entries = g.idx
        .map((i) => ({ value: Math.abs(tiles[i]!.value) / grand, index: i }))
        .sort((a, b) => b.value - a.value);
      squarify(entries, sub, rects);
      const rawGroup = tiles[g.idx[0]!]!.group || "Unclassified";
      const label = groupLabels?.[g.key] ?? groupLabels?.[rawGroup] ?? rawGroup;
      boxes.push({
        key: g.key === "" ? "__all__" : g.key,
        label,
        count: g.idx.length,
        share: g.total / grand,
        ...sub,
      });
    });
    return { rects: rects.sort((a, b) => a.index - b.index), boxes };
  }, [tiles, groupLabels]);

  if (tiles.length === 0) return null;

  return (
    <div>
      <div className={cn("relative w-full overflow-hidden rounded-xl", heightClass)}>
        {layout.boxes.length > 1
          ? layout.boxes.map((g) =>
              g.w > 14 && g.h > 10 ? (
                <div
                  key={g.key}
                  className="num pointer-events-none absolute z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-sm"
                  style={{ left: `${g.x + 0.6}%`, top: `${g.y + 0.8}%` }}
                  title={`${g.count} scrips · ${Math.round(g.share * 100)}% of map area`}
                >
                  {g.label} ({g.count} · {Math.round(g.share * 100)}%)
                </div>
              ) : null,
            )
          : null}
        {tiles.map((t, idx) => {
          const r = layout.rects[idx];
          if (!r || r.w <= 0 || r.h <= 0) return null;
          // Fund-map rendering: translucent intensity overlay, full color at
          // ±6%. Dark mode stays dark — no more glowing pale tiles.
          const isFlat = t.change === 0 || !Number.isFinite(t.change);
          const intensity = isFlat ? 0 : Math.min(1, Math.abs(t.change) / 6);
          const alpha = 0.15 + 0.75 * intensity;
          const overlay: RGB = t.change > 0 ? [34, 197, 94] : [239, 68, 68];
          const fg = isFlat ? undefined : textOn(base, overlay, alpha);

          const cellArea = r.w * r.h;
          const showLabel = cellArea > 12 && r.w > 6 && r.h > 6;
          const showValue = cellArea > 35 && r.w > 8 && r.h > 8;
          const fontSize = Math.max(9, Math.min(22, Math.sqrt(cellArea * 0.18)));
          const shadow =
            !isFlat && fg === "#ffffff"
              ? { textShadow: "0 1px 2px rgba(0,0,0,0.5)" }
              : undefined;

          // Inset hairline so flush tiles still read as individual cards.
          const divider = "inset 0 0 0 1px rgb(128 128 128 / 0.35)";
          const isDimmed =
            highlightedKeys && highlightedKeys.size > 0 && !highlightedKeys.has(t.key);
          const isAccented =
            highlightedKeys && highlightedKeys.size > 0 && highlightedKeys.has(t.key);
          const isSelected = selectedKey != null && selectedKey === t.key;

          const cell = (
            <button
              type="button"
              title={renderTooltip ? undefined : (t.title ?? `${t.label} · ${t.detail}`)}
              onClick={() => onPick?.(t.key)}
              className={cn(
                "absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden text-center transition-transform hover:brightness-110 active:scale-[0.98]",
                isFlat && "bg-muted/60",
                isDimmed && "opacity-30 saturate-50",
                isAccented && !isSelected && "z-20 scale-[1.02] shadow-lg ring-2 ring-primary",
                isSelected && "z-20 scale-[1.01] shadow-md ring-2 ring-foreground",
              )}
              style={{
                left: `${r.x + GAP}%`,
                top: `${r.y + GAP}%`,
                width: `${Math.max(0, r.w - 2 * GAP)}%`,
                height: `${Math.max(0, r.h - 2 * GAP)}%`,
                backgroundColor: isFlat
                  ? undefined
                  : `rgba(${overlay[0]}, ${overlay[1]}, ${overlay[2]}, ${alpha.toFixed(2)})`,
                boxShadow: divider,
              }}
            >
              {showLabel ? (
                <span className="flex max-w-full flex-col items-center px-1">
                  <span
                    className={cn(
                      "max-w-full truncate font-black leading-none",
                      isFlat && "text-muted-foreground",
                    )}
                    style={{ fontSize: `${fontSize}px`, color: fg, ...shadow }}
                  >
                    {t.label}
                  </span>
                  {showValue ? (
                    <span
                      className={cn("num mt-1 font-bold", isFlat && "text-muted-foreground")}
                      style={{
                        fontSize: `${Math.max(7, fontSize * 0.72)}px`,
                        color: fg,
                        opacity: 0.88,
                        ...shadow,
                      }}
                    >
                      {t.detail}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
          if (!renderTooltip) return <Fragment key={t.key}>{cell}</Fragment>;
          return (
            <TooltipProvider key={t.key}>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>{cell}</TooltipTrigger>
                <TooltipContent
                  className="z-50 max-w-xs space-y-2 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-2xl backdrop-blur-md"
                  sideOffset={6}
                  avoidCollisions
                  collisionPadding={12}
                >
                  {renderTooltip(t)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      {hideLegend ? null : (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-muted-foreground">
          <span>Fall</span>
          <div
            className="h-2.5 w-32 rounded-md"
            style={{
              background:
                "linear-gradient(90deg, #991b1b 0%, #dc2626 25%, #fee2e2 42%, #f1f5f9 50%, #dcfce7 58%, #16a34a 75%, #166534 100%)",
            }}
            role="img"
            aria-label="Color scale from -3 percent or worse on the left to +3 percent or better on the right"
          />
          <span>Rise</span>
        </div>
        <p className="text-[0.68rem] text-muted-foreground">
          Size = {sizeLabel} · −3% · −1% · 0 · +1% · +3% · Tap a tile for detail.
        </p>
      </div>
      )}
    </div>
  );
}
