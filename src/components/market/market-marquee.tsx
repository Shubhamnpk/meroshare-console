import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  Layers,
  Flame,
  LineChart,
} from "lucide-react";
import type { LivePrice, MarketIndex, SectorIndex } from "@/lib/nepse/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { marketSnapshotQuery } from "@/lib/queries";

export type MarqueeFilter = "all" | "indices" | "sectors" | "movers";

export interface MarqueeItem {
  id: string;
  type: "index" | "sector" | "scrip";
  label: string;
  subLabel?: string;
  points: number;
  change: number;
  percentChange: number;
  rawItem: MarketIndex | SectorIndex | LivePrice;
}

export function MarketMarquee({
  indices,
  sectorIndices,
  prices = [],
  onSelectIndex,
  onSelectSector,
  onSelectScrip,
  className,
}: {
  indices: MarketIndex[];
  sectorIndices: SectorIndex[];
  prices?: LivePrice[];
  onSelectIndex?: (indexName: string) => void;
  onSelectSector?: (sectorName: string) => void;
  onSelectScrip?: (symbol: string) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<MarqueeFilter>("all");
  const [isPaused, setIsPaused] = useState(false);
  const snapshot = useQuery(marketSnapshotQuery());
  const marketOpen = snapshot.data?.status.isOpen ?? null;

  // Compile items from indices, sectors, and top movers
  const items = useMemo<MarqueeItem[]>(() => {
    const indexItems: MarqueeItem[] = indices.map((idx) => ({
      id: `idx-${idx.name}`,
      type: "index",
      label: idx.name.replace(/\s*Index$/i, ""),
      subLabel: "INDEX",
      points: idx.close,
      change: idx.change,
      percentChange: idx.percentChange,
      rawItem: idx,
    }));

    const sectorItems: MarqueeItem[] = sectorIndices
      .filter((s) => s.close != null && s.close > 0)
      .map((sec) => ({
        id: `sec-${sec.code || sec.name}`,
        type: "sector",
        label: sec.sector || sec.name.replace(/\s*Index$/i, ""),
        subLabel: "SECTOR",
        points: sec.close ?? 0,
        change: sec.change ?? 0,
        percentChange: sec.percentChange ?? 0,
        rawItem: sec,
      }));

    // Top active movers (gainers + active turnover)
    const activePrices = [...prices].filter((p) => p.ltp > 0);
    const topGainers = [...activePrices]
      .sort((a, b) => b.percentChange - a.percentChange)
      .slice(0, 6);
    const topLosers = [...activePrices]
      .sort((a, b) => a.percentChange - b.percentChange)
      .slice(0, 4);
    const topTurnover = [...activePrices]
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 6);

    // De-duplicate scrip items
    const scripMap = new Map<string, LivePrice>();
    for (const p of [...topGainers, ...topTurnover, ...topLosers]) {
      scripMap.set(p.symbol, p);
    }

    const scripItems: MarqueeItem[] = [...scripMap.values()].map((p) => ({
      id: `scrip-${p.symbol}`,
      type: "scrip",
      label: p.symbol,
      subLabel: p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name,
      points: p.ltp,
      change: p.change,
      percentChange: p.percentChange,
      rawItem: p,
    }));

    if (filter === "indices") return indexItems;
    if (filter === "sectors") return sectorItems;
    if (filter === "movers") return scripItems;

    // "all": Interleave indices, sectors, and active scrips for dynamic pacing
    const mixed: MarqueeItem[] = [];
    const maxLen = Math.max(indexItems.length, sectorItems.length, scripItems.length);
    for (let i = 0; i < maxLen; i++) {
      if (indexItems[i]) mixed.push(indexItems[i]!);
      if (sectorItems[i]) mixed.push(sectorItems[i]!);
      if (scripItems[i]) mixed.push(scripItems[i]!);
      if (sectorItems[i + 1] && i % 2 === 1) mixed.push(sectorItems[i + 1]!);
    }
    return mixed;
  }, [indices, sectorIndices, prices, filter]);

  const handleClick = (item: MarqueeItem) => {
    if (item.type === "index") {
      onSelectIndex?.(item.label);
    } else if (item.type === "sector") {
      onSelectSector?.(item.label);
    } else if (item.type === "scrip") {
      onSelectScrip?.(item.label);
    }
  };

  // If no items, return null
  if (items.length === 0) return null;

  // Duplicate items array once so continuous marquee doesn't leave gaps
  const tickerItems = [...items, ...items];
  // Calculate dynamic animation speed based on item count
  const durationSeconds = Math.max(25, items.length * 4.2);

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/60 p-2 sm:p-2.5 backdrop-blur-md shadow-xs transition-all hover:border-primary/30",
        className,
      )}
    >
      {/* Top control bar: category filter tabs & play/pause */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span
            title={
              marketOpen === null
                ? "Checking market status…"
                : marketOpen
                  ? "Market OPEN — live trading"
                  : "Market CLOSED — NEPSE 11 AM – 3 PM NPT"
            }
            className="relative flex size-2 items-center justify-center"
          >
            {marketOpen === true ? (
              <>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </>
            ) : marketOpen === false ? (
              <span className="relative inline-flex size-1.5 rounded-full bg-red-500" />
            ) : (
              <span className="relative inline-flex size-1.5 animate-pulse rounded-full bg-muted-foreground/50" />
            )}
          </span>
          <span
            className={cn(
              "text-[0.68rem] font-semibold uppercase tracking-wider",
              marketOpen === true ? "text-emerald-500" : marketOpen === false ? "text-red-500" : "text-muted-foreground",
            )}
          >
            {marketOpen === true ? "Live Ticker" : marketOpen === false ? "Market Closed" : "Ticker"}
          </span>
          <span className="hidden text-[0.625rem] text-muted-foreground/60 sm:inline">
            {marketOpen === false ? "· Showing last session" : "· Click any item for chart history"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-lg bg-surface p-0.5 border border-border/50 text-[0.65rem] font-medium">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded px-2 py-0.5 transition-colors cursor-pointer",
                filter === "all"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilter("indices")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer",
                filter === "indices"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LineChart className="size-2.5" />
              Indices
            </button>
            <button
              type="button"
              onClick={() => setFilter("sectors")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer",
                filter === "sectors"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Layers className="size-2.5" />
              Sectors
            </button>
            <button
              type="button"
              onClick={() => setFilter("movers")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 transition-colors cursor-pointer",
                filter === "movers"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Flame className="size-2.5" />
              Movers
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            className="flex size-6 items-center justify-center rounded-lg border border-border/50 bg-surface text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={isPaused ? "Resume ticker" : "Pause ticker"}
            aria-label={isPaused ? "Resume ticker" : "Pause ticker"}
          >
            {isPaused ? <Play className="size-2.5" /> : <Pause className="size-2.5" />}
          </button>
        </div>
      </div>

      {/* Marquee viewport with gradient edge masks */}
      <div className="relative overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)]">
        <div
          className="animate-marquee-scroll flex gap-2.5"
          data-paused={isPaused}
          style={{ "--marquee-duration": `${durationSeconds}s` } as React.CSSProperties}
        >
          {tickerItems.map((item, idx) => {
            const isUp = item.change > 0 || (item.change === 0 && item.percentChange > 0);
            const isDown = item.change < 0 || (item.change === 0 && item.percentChange < 0);
            const isFlat = !isUp && !isDown;

            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                onClick={() => handleClick(item)}
                className={cn(
                  "group/item relative flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-left whitespace-nowrap transition-all select-none cursor-pointer",
                  "bg-surface/80 hover:bg-surface hover:scale-[1.02] active:scale-[0.98]",
                  isUp && "border-gain/30 hover:border-gain/50 hover:shadow-xs hover:shadow-gain/10",
                  isDown && "border-loss/30 hover:border-loss/50 hover:shadow-xs hover:shadow-loss/10",
                  isFlat && "border-border/60 hover:border-border",
                )}
              >
                {/* Type Badge & Label */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-bold uppercase tracking-wider",
                        item.type === "index" && "bg-primary/15 text-primary",
                        item.type === "sector" && "bg-info/15 text-info",
                        item.type === "scrip" && "bg-accent/25 text-accent-foreground",
                      )}
                    >
                      {item.type}
                    </span>
                    <span className="font-display text-xs font-semibold text-foreground group-hover/item:text-primary transition-colors">
                      {item.label}
                    </span>
                  </div>
                  {item.subLabel && item.type === "scrip" ? (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                      {item.subLabel}
                    </span>
                  ) : null}
                </div>

                {/* Points / LTP */}
                <div className="flex flex-col items-end">
                  <span className="num font-semibold text-xs text-foreground">
                    {formatNumber(item.points)}
                  </span>
                  <div className="flex items-center gap-0.5 text-[11px] font-medium">
                    {isUp ? (
                      <TrendingUp className="size-2.5 text-gain stroke-[2.5]" />
                    ) : isDown ? (
                      <TrendingDown className="size-2.5 text-loss stroke-[2.5]" />
                    ) : null}
                    <span
                      className={cn(
                        "num font-semibold",
                        isUp && "text-gain",
                        isDown && "text-loss",
                        isFlat && "text-muted-foreground",
                      )}
                    >
                      {isUp ? "+" : ""}
                      {formatNumber(item.change)}{" "}
                      ({formatPercent(item.percentChange)})
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
