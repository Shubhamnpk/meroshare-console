import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutGrid,
  X,
  Search,
  Info,
  Filter,
  PieChart,
  Eye,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface HeatRow {
  symbol: string;
  name: string;
  manager: string;
  fundType: string;
  size: number;
  units: number | null;
  ltp: number | null;
  nav: number | null;
  /** Negative = trading below NAV (bargain). */
  discount: number | null;
  dayChange: number | null;
}

type SizeMode = "size" | "units";
type ColorMode = "day" | "discount";
type TypeFilter = "all" | "open" | "close";

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

function HeatMapContent({
  items,
  sizeMode,
  colorMode,
  searchQuery,
  selectedItem,
  setSelectedItem,
  onPick,
  heightClass,
  grouped,
}: {
  items: HeatRow[];
  sizeMode: SizeMode;
  colorMode: ColorMode;
  searchQuery: string;
  selectedItem: HeatRow | null;
  setSelectedItem: (item: HeatRow | null) => void;
  onPick: (symbol: string) => void;
  heightClass: string;
  grouped: boolean;
}) {
  // Positive displayPct = green. Discount is inverted: below NAV (negative) is good.
  const displayOf = (r: HeatRow): number | null => {
    if (colorMode === "day") return r.dayChange;
    return r.discount == null ? null : -r.discount;
  };
  const labelOf = (r: HeatRow): number | null => (colorMode === "day" ? r.dayChange : r.discount);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const r of items) {
      const v = displayOf(r);
      if (v != null && Number.isFinite(v)) m = Math.max(m, Math.abs(v));
    }
    return m > 0 ? m : 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, colorMode]);

  const sizingKey = sizeMode === "size" ? "size" : "units";

  const layout = useMemo(() => {
    const result: Rect[] = [];
    const boxes: GroupBox[] = [];

    function squarify(
      entries: { value: number; index: number }[],
      rect: { x: number; y: number; w: number; h: number },
      res: Rect[],
    ) {
      if (entries.length === 0) return;
      // Degenerate rect (float overshoot clamped to 0 upstream) or no value:
      // emit empty cells so every call consumes entries and always terminates.
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
        const rowSize = isVertical
          ? (frac * rect.w * rect.h) / rect.h
          : (frac * rect.w * rect.h) / rect.w;

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
        // Aspect math refused every candidate (degenerate rect sliver):
        // force the largest entry through so recursion always shrinks.
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
        : {
            x: rect.x,
            y: rect.y + rowH,
            w: rect.w,
            h: Math.max(0, rect.h - rowH),
          };

      squarify(remaining, remainingRect, res);
    }

    // One shared map: each structure gets its own region, split from the root
    // in proportion to its total, so every tile stays on the same scale.
    const buckets = new Map<string, number[]>();
    items.forEach((r, i) => {
      const key = r.fundType === "open_end" ? "open" : "close";
      const arr = buckets.get(key);
      if (arr) arr.push(i);
      else buckets.set(key, [i]);
    });
    const groups = [...buckets.entries()]
      .map(([key, idx]) => ({
        key,
        label: key === "open" ? "Open-end" : "Close-end",
        idx,
        total: idx.reduce((s, i) => s + Math.abs(items[i]![sizingKey] ?? 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
    const grand = groups.reduce((s, g) => s + g.total, 0) || 1;
    if (!grouped || groups.length < 2) {
      // All-together: every fund competes in one pool, biggest tile wins
      // regardless of category.
      const entries = items
        .map((item, i) => ({ value: Math.abs(item[sizingKey] ?? 0) / grand, index: i }))
        .sort((a, b) => b.value - a.value);
      squarify(entries, { x: 0, y: 0, w: 100, h: 100 }, result);
      return { rects: result.sort((a, b) => a.index - b.index), boxes };
    }
    let edge = 0;
    for (const g of groups) {
      const share = (g.total / grand) * 100;
      const sub = g.total > 0 ? { x: edge, y: 0, w: share, h: 100 } : { x: 0, y: 0, w: 0, h: 0 };
      const entries = g.idx
        .map((i) => ({ value: Math.abs(items[i]![sizingKey] ?? 0) / grand, index: i }))
        .sort((a, b) => b.value - a.value);
      squarify(entries, sub, result);
      boxes.push({
        key: g.key,
        label: g.label,
        count: g.idx.length,
        share: g.total / grand,
        ...sub,
      });
      edge += share;
    }
    return { rects: result.sort((a, b) => a.index - b.index), boxes };
  }, [items, sizingKey, grouped]);

  const gap = 0;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-border/40 bg-muted/5 transition-all duration-300 ${heightClass}`}
    >
      {layout.boxes.length > 1
        ? layout.boxes.map((g) =>
            g.w > 14 && g.h > 10 ? (
              <div
                key={g.key}
                className="num pointer-events-none absolute z-10 rounded-md bg-background/85 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-sm"
                style={{ left: `${g.x + 0.6}%`, top: `${g.y + 0.8}%` }}
                title={`${g.count} schemes · ${Math.round(g.share * 100)}% of map area`}
              >
                {g.label} ({g.count} · {Math.round(g.share * 100)}%)
              </div>
            ) : null,
          )
        : null}
      {items.map((item, idx) => {
        const r = layout.rects[idx];
        if (!r || r.w <= 0 || r.h <= 0) return null;

        const displayPct = displayOf(item);
        const rawLabel = labelOf(item);
        const isNeutral = displayPct == null || (colorMode === "discount" && displayPct === 0);
        const intensity = isNeutral ? 0 : Math.min(Math.abs(displayPct!) / maxAbs, 1);

        const grayRGB = "148, 163, 184";
        let rgb: string;
        let alpha: number;
        if (isNeutral) {
          rgb = grayRGB;
          alpha = 0.12;
        } else {
          rgb = displayPct! > 0 ? "34, 197, 94" : "239, 68, 68";
          alpha = 0.15 + intensity * 0.75;
        }
        const bgColor = `rgba(${rgb}, ${alpha})`;

        const cellArea = r.w * r.h;
        const showLabel = cellArea > 12 && r.w > 6 && r.h > 6;
        const showValue = cellArea > 35 && r.w > 8 && r.h > 8;
        const fontSize = Math.max(9, Math.min(22, Math.sqrt(cellArea * 0.18)));

        const isHighlighted = searchQuery
          ? item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
          : false;
        const isSelected = selectedItem?.symbol === item.symbol;

        const opacityClass =
          searchQuery && !isHighlighted
            ? "opacity-30 scale-[0.98] saturate-50 blur-[0.3px]"
            : "opacity-100";
        const highlightRing = isHighlighted
          ? "ring-2 ring-primary ring-offset-1 z-20 scale-[1.02] shadow-lg shadow-primary/20 animate-pulse"
          : isSelected
            ? "ring-2 ring-foreground scale-[1.01] z-20 shadow-md"
            : "";

        const isDarkText = intensity <= 0.6;
        const textClass = isNeutral
          ? "text-zinc-400 dark:text-zinc-600"
          : isDarkText
            ? "text-zinc-950 dark:text-white"
            : "text-white";
        const subtextClass = isNeutral
          ? "text-zinc-400 dark:text-zinc-600"
          : isDarkText
            ? "text-zinc-700 dark:text-white/80"
            : "text-white/90";
        const textShadowStyle =
          isNeutral || isDarkText ? undefined : { textShadow: "0 1px 2px rgba(0,0,0,0.5)" };

        const cellContent = (
          <div
            onClick={() => {
              const next = selectedItem?.symbol === item.symbol ? null : item;
              setSelectedItem(next);
              if (next) onPick(item.symbol);
            }}
            className={cn(
              "group absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden text-center shadow-sm transition-all duration-300 ease-in-out hover:brightness-110 active:scale-[0.98]",
              opacityClass,
              highlightRing,
            )}
            style={{
              left: `${r.x + gap}%`,
              top: `${r.y + gap}%`,
              width: `${Math.max(0, r.w - 2 * gap)}%`,
              height: `${Math.max(0, r.h - 2 * gap)}%`,
              backgroundColor: bgColor,
            }}
          >
            {showLabel ? (
              <div className="flex max-w-full flex-col items-center justify-center px-1">
                <span
                  className={cn(
                    "max-w-full truncate font-black leading-none tracking-tight transition-colors duration-200",
                    textClass,
                  )}
                  style={{ fontSize: `${fontSize}px`, ...textShadowStyle }}
                >
                  {item.symbol}
                </span>
                {showValue && rawLabel != null ? (
                  <span
                    className={cn("mt-1 font-bold transition-colors duration-200", subtextClass)}
                    style={{ fontSize: `${Math.max(7, fontSize * 0.72)}px`, ...textShadowStyle }}
                  >
                    {formatPercent(rawLabel)}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="text-[9px] font-black tracking-tighter text-foreground">
                  {item.symbol}
                </span>
              </div>
            )}
          </div>
        );

        return (
          <TooltipProvider key={item.symbol}>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
              <TooltipContent
                className="z-50 max-w-xs animate-in space-y-2 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-2xl backdrop-blur-md fade-in-50"
                sideOffset={6}
                avoidCollisions
                collisionPadding={12}
              >
                <div className="flex flex-col gap-0.5 border-b border-border/50 pb-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-black uppercase tracking-wider">
                      {item.symbol}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-4 bg-primary/10 px-1 text-[9px] uppercase tracking-wider text-primary"
                    >
                      {item.fundType === "open_end" ? "Open-end" : "Close-end"}
                    </Badge>
                  </div>
                  <span className="truncate text-[9px] font-medium text-muted-foreground">
                    {item.name}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] font-semibold text-muted-foreground">
                  <div className="flex justify-between gap-6">
                    <span>Fund size:</span>
                    <span className="font-bold text-foreground">
                      {formatNpr(item.size, { compact: true })}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span>Units:</span>
                    <span className="font-bold text-foreground">
                      {item.units != null ? formatQty(item.units) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span>NAV:</span>
                    <span className="font-bold text-foreground">
                      {item.nav != null ? formatNpr(item.nav) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6 border-t border-border/20 pt-1">
                    <span>LTP:</span>
                    <span className="font-bold text-foreground">
                      {item.ltp != null ? formatNpr(item.ltp) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span>Discount:</span>
                    <span
                      className={cn(
                        "font-bold",
                        item.discount == null
                          ? "text-muted-foreground/60"
                          : item.discount < 0
                            ? "text-gain"
                            : "text-loss",
                      )}
                    >
                      {item.discount != null ? formatPercent(item.discount) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-6">
                    <span>Day change:</span>
                    <span
                      className={cn(
                        "font-bold",
                        item.dayChange == null
                          ? "text-muted-foreground/60"
                          : item.dayChange >= 0
                            ? "text-gain"
                            : "text-loss",
                      )}
                    >
                      {item.dayChange != null ? formatPercent(item.dayChange) : "—"}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function FundHeatmap({
  rows,
  onPick,
}: {
  rows: HeatRow[];
  onPick: (symbol: string) => void;
}) {
  const [sizeMode, setSizeMode] = useState<SizeMode>("size");
  const [colorMode, setColorMode] = useState<ColorMode>("discount");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [grouped, setGrouped] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HeatRow | null>(null);

  const heatMapItems = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter === "all") return true;
      if (typeFilter === "open") return r.fundType === "open_end";
      return r.fundType !== "open_end";
    });
  }, [rows, typeFilter]);

  if (rows.length === 0) {
    return (
      <Card className="overflow-hidden border border-border/40 bg-card/45 text-left shadow-lg backdrop-blur-md">
        <CardHeader className="border-b border-border/10 px-4 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
            <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Fund Heat Map
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <p className="px-4 py-8 text-center text-[11px] font-medium text-muted-foreground">
            No sized schemes available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sizeModeLabel = sizeMode === "size" ? "Fund Size" : "Units Outstanding";
  const colorModeLabel = colorMode === "day" ? "Day Change" : "Discount to NAV";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search schemes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-xl pl-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 self-start rounded-xl border border-border/60 bg-card p-1 sm:self-auto">
          {(
            [
              { key: "all", label: "All" },
              { key: "open", label: "Open-end" },
              { key: "close", label: "Close-end" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setTypeFilter(f.key);
                setSelectedItem(null);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                typeFilter === f.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-border/40 bg-card/45 text-left shadow-xl backdrop-blur-md">
        <CardHeader className="space-y-1.5 border-b border-border/10 px-4 pb-0 pt-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Fund Heat Map
              </CardTitle>
              <CardDescription className="mt-0.5 text-[9px] font-bold text-muted-foreground/80">
                {heatMapItems.length} schemes · Sized by{" "}
                <span className="text-primary">{sizeModeLabel}</span> · Colored by{" "}
                <span className="text-primary">{colorModeLabel}</span>
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              title="What do these options mean?"
              onClick={() => setShowInfo(true)}
              className="h-7 w-7 shrink-0 rounded-lg border-border/35 bg-card/60 text-muted-foreground transition-all hover:bg-muted/30"
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-0.5 border-t border-border/5">
            <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-muted/20 p-0.5">
              <span className="px-1.5 text-[9px] font-black uppercase text-muted-foreground">
                Size:
              </span>
              {(
                [
                  { key: "size", label: "Fund size" },
                  { key: "units", label: "Units" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSizeMode(m.key)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[9px] font-bold transition-all",
                    sizeMode === m.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-muted/20 p-0.5">
              <span className="px-1.5 text-[9px] font-black uppercase text-muted-foreground">
                Color:
              </span>
              {(
                [
                  { key: "day", label: "Day %" },
                  { key: "discount", label: "Discount %" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setColorMode(m.key)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[9px] font-bold transition-all",
                    colorMode === m.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border/20 bg-muted/20 p-0.5">
              <span className="px-1.5 text-[9px] font-black uppercase text-muted-foreground">
                Layout:
              </span>
              {(
                [
                  { key: true, label: "Grouped" },
                  { key: false, label: "All mixed" },
                ] as const
              ).map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setGrouped(m.key)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[9px] font-bold transition-all",
                    grouped === m.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-0.5 p-1 pt-0">
          {heatMapItems.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/30 p-8 text-center">
              <span className="text-[11px] font-semibold text-muted-foreground">
                No schemes found for the selected filter.
              </span>
            </div>
          ) : (
            <>
              <HeatMapContent
                items={heatMapItems}
                sizeMode={sizeMode}
                colorMode={colorMode}
                searchQuery={searchQuery}
                selectedItem={selectedItem}
                setSelectedItem={setSelectedItem}
                onPick={onPick}
                grouped={grouped}
                heightClass="h-[62vh] sm:h-[68vh] lg:h-[74vh]"
              />

              <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-border/20 bg-muted/10 px-3 py-2 text-[10px] font-bold text-muted-foreground sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span>{colorMode === "day" ? "Fall" : "Premium"}</span>
                  <div className="h-2.5 w-28 rounded-md bg-gradient-to-r from-red-500/80 via-muted/30 to-emerald-500/80" />
                  <span>{colorMode === "day" ? "Rise" : "Bargain"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="bg-background/50 py-0 text-[8px] font-semibold tracking-tight text-muted-foreground"
                  >
                    Intensity: % strength
                  </Badge>
                  {selectedItem && (
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedItem(null)}
                      className="h-5 gap-0.5 px-1.5 text-[9px] font-bold text-primary hover:bg-muted"
                    >
                      Clear selection
                    </Button>
                  )}
                </div>
              </div>

              {selectedItem && (
                <div className="relative flex flex-col gap-2.5 rounded-xl border border-border/50 bg-muted/10 p-3 shadow-sm duration-300 animate-in slide-in-from-bottom-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                    title="Close details"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-foreground">
                          {selectedItem.symbol}
                        </span>
                        <Badge className="h-4 border-0 bg-primary/10 px-1 text-[8px] font-extrabold uppercase tracking-wider text-primary">
                          {selectedItem.fundType === "open_end" ? "Open-end" : "Close-end"}
                        </Badge>
                      </div>
                      <span className="text-[9px] font-medium text-muted-foreground">
                        {selectedItem.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onPick(selectedItem.symbol)}
                      className="h-7 gap-1 px-2.5 text-[11px]"
                    >
                      Open fund <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Fund size
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {formatNpr(selectedItem.size, { compact: true })}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Units
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {selectedItem.units != null ? formatQty(selectedItem.units) : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        NAV / LTP
                      </span>
                      <span className="text-xs font-black text-foreground">
                        {selectedItem.nav != null ? formatNpr(selectedItem.nav) : "—"}
                        {" / "}
                        {selectedItem.ltp != null ? formatNpr(selectedItem.ltp) : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Discount
                      </span>
                      <span
                        className={cn(
                          "text-xs font-black",
                          selectedItem.discount == null
                            ? "text-muted-foreground/60"
                            : selectedItem.discount < 0
                              ? "text-gain"
                              : "text-loss",
                        )}
                      >
                        {selectedItem.discount != null ? formatPercent(selectedItem.discount) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>

        <Dialog open={showInfo} onOpenChange={setShowInfo}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                <Info className="h-4 w-4 text-primary" /> How the Heat Map works
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <PieChart className="h-3.5 w-3.5" /> Tile Size
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Fund size</span>, each tile's
                    area represents its share of total fund size. Larger tiles = bigger schemes.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Units</span>, tile size reflects
                    units outstanding, regardless of price.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" /> Tile Color
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">Day %</span>, today's LTP move.
                    Green = up, red = down. Intensity reflects how big the move was.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Discount %</span>, LTP vs NAV.
                    Green = bargain (below NAV), red = premium. Intensity reflects the gap size.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" /> Filters
                </p>
                <div className="space-y-1.5 pl-5 text-xs text-muted-foreground">
                  <p>
                    <span className="font-semibold text-foreground">
                      All / Open-end / Close-end
                    </span>{" "}
                    , narrow the map to one fund structure. With All, both share one map: each keeps
                    its own labeled region, sized on the same scale.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Grouped / All mixed</span>,
                    grouped keeps each structure in its own region; all mixed throws every fund into
                    one pool so the biggest overall stands out.
                  </p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" /> Interacting
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  <li>Hover any tile to see NAV, LTP, discount and size in a tooltip.</li>
                  <li>Tap or click a tile to pin its details below the map and open the fund.</li>
                  <li>Use the search bar to highlight a specific scheme.</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
