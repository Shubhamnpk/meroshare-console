import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Wallet } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { formatNpr, formatQty } from "@/lib/format";
import type { MfHolding } from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";

const DONUT_COLORS = [
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#14b8d4",
  "#f43f5e",
  "#6366f1",
];

interface HoldingsDetailSheetProps {
  holdings: MfHolding[];
  stockNames: Map<string, string>;
  symbol: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenStock?: ((symbol: string) => void) | undefined;
}

export function HoldingsDetailSheet({
  holdings,
  stockNames,
  symbol,
  onOpenChange,
  onOpenStock,
}: HoldingsDetailSheetProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"value" | "weight" | "name">("value");

  const sorted = useMemo(() => {
    const list = [...holdings];
    if (sortBy === "name") return list.sort((a, b) => a.stockSymbol.localeCompare(b.stockSymbol));
    return list.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
  }, [holdings, sortBy]);

  const total = useMemo(() => holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0), [holdings]);

  const maxWeight = useMemo(() => {
    if (total <= 0) return 0;
    return Math.max(...holdings.map((h) => ((h.marketValue ?? 0) / total) * 100));
  }, [holdings, total]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter((h) => {
      const name = stockNames.get(h.stockSymbol) ?? "";
      return h.stockSymbol.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [sorted, search, stockNames]);

  // Donut data: top 6 + others
  const donut = useMemo(() => {
    const top = sorted.slice(0, 6);
    const topSum = top.reduce((s, h) => s + (h.marketValue ?? 0), 0);
    const rest = total - topSum;
    const slices = top.map((h) => ({ name: h.stockSymbol, value: h.marketValue ?? 0 }));
    if (rest > 0.001) slices.push({ name: "Others", value: rest });
    return slices;
  }, [sorted, total]);

  let donutAcc = 25;

  return (
    <Sheet open={Boolean(symbol)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        {/* Header */}
        <SheetHeader className="items-start px-4 pb-3 pt-5 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Wallet className="size-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="font-display text-lg leading-tight">
                {symbol?.toUpperCase()}
              </SheetTitle>
              <SheetDescription className="text-xs">{holdings.length} stocks held</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {holdings.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No holdings data available for this fund.
            </p>
          ) : (
            <>
              {/* Donut + summary */}
              <div className="mb-4 rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="flex items-center gap-4">
                  <div className="relative size-24 shrink-0 sm:size-28">
                    <svg viewBox="0 0 42 42" className="size-full">
                      <circle
                        cx="21"
                        cy="21"
                        r="15.9155"
                        fill="none"
                        strokeWidth="5"
                        className="stroke-border/40"
                      />
                      {donut.map((s, i) => {
                        const pct = total > 0 ? (s.value / total) * 100 : 0;
                        const el = (
                          <circle
                            key={s.name}
                            cx="21"
                            cy="21"
                            r="15.9155"
                            fill="none"
                            strokeWidth="5"
                            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                            strokeDasharray={`${Math.max(0, pct - 0.5)} 100`}
                            strokeDashoffset={-donutAcc}
                            strokeLinecap="butt"
                          />
                        );
                        donutAcc += pct;
                        return el;
                      })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="num text-sm font-bold">
                        {formatNpr(total, { compact: true })}
                      </span>
                      <span className="text-[0.55rem] font-bold uppercase tracking-widest text-muted-foreground">
                        Total
                      </span>
                    </div>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1">
                    {donut.slice(0, 5).map((s, i) => (
                      <li key={s.name} className="flex items-center gap-1.5 text-[11px]">
                        <span
                          className="size-2 shrink-0 rounded-sm"
                          style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                        <span className="num font-bold text-muted-foreground">
                          {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Search + sort */}
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search stocks…"
                    className="h-8 rounded-lg pl-8 text-xs"
                  />
                </div>
                <div className="flex rounded-lg border border-border/60 bg-surface p-0.5">
                  {(["value", "name"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSortBy(k)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                        sortBy === k ? "bg-primary/15 text-primary" : "text-muted-foreground",
                      )}
                    >
                      {k === "value" ? "Value" : "A–Z"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Holding cards */}
              <div className="space-y-2">
                {filtered.map((h, i) => {
                  const weight = total > 0 ? ((h.marketValue ?? 0) / total) * 100 : 0;
                  const name = stockNames.get(h.stockSymbol);
                  const colorIdx = sorted.findIndex((s) => s.stockSymbol === h.stockSymbol);
                  return (
                    <button
                      key={h.stockSymbol}
                      type="button"
                      onClick={() => onOpenStock?.(h.stockSymbol)}
                      className="group w-full rounded-xl border border-border/40 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: DONUT_COLORS[colorIdx % DONUT_COLORS.length] }}
                            />
                            <span className="text-sm font-bold text-primary group-hover:underline">
                              {h.stockSymbol}
                            </span>
                          </div>
                          {name ? (
                            <p className="mt-0.5 truncate pl-4 text-[0.68rem] text-muted-foreground">
                              {name}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="num text-sm font-bold">
                            {h.marketValue != null
                              ? formatNpr(h.marketValue, { compact: true })
                              : "-"}
                          </p>
                          <p className="num text-[0.68rem] text-muted-foreground">
                            {weight.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      {/* Weight bar */}
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${maxWeight > 0 ? Math.max(2, (weight / maxWeight) * 100) : 0}%`,
                            background: DONUT_COLORS[colorIdx % DONUT_COLORS.length],
                          }}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[0.68rem] text-muted-foreground">
                        <span>
                          {h.quantity != null ? `${formatQty(h.quantity)} units` : ""}
                          {h.quantity != null && h.ltp != null ? " · " : ""}
                          {h.ltp != null ? `@ ${formatNpr(h.ltp)}` : ""}
                        </span>
                        <span className="num font-medium text-foreground">
                          {weight.toFixed(1)}% of portfolio
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filtered.length === 0 && search ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No stocks match "{search}"
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
