import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { marketSnapshotQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";

/**
 * Watchlist as a side panel, shared by Market, Dashboard and Terminal.
 * Same data everywhere: search-to-add plus live cards, tap a row to open it.
 */
export function WatchlistPanel({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (symbol: string) => void;
}) {
  const watchlist = useWatchlist();
  const snapshot = useQuery(marketSnapshotQuery());
  const [term, setTerm] = useState("");

  const prices = snapshot.data?.prices ?? [];
  const rows = useMemo(
    () =>
      watchlist.symbols.map((symbol) => ({
        symbol,
        price: prices.find((p) => p.symbol === symbol) ?? null,
      })),
    [watchlist.symbols, prices],
  );

  const suggestions = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return prices
      .filter((p) => !watchlist.has(p.symbol))
      .filter((p) => p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [term, prices, watchlist]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 font-display text-base font-semibold">
              <Star className="size-4 fill-warning text-warning" aria-hidden />
              Watchlist
              {rows.length > 0 ? (
                <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {rows.length}
                </span>
              ) : null}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            Stored privately on this device only.
          </SheetDescription>
        </SheetHeader>

        <div className="border-b border-border/60 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Add a scrip by symbol or name…"
              className="h-9 rounded-xl pl-9"
            />
          </div>
          {suggestions.length > 0 ? (
            <ul className="mt-2 overflow-hidden rounded-xl border border-border/60">
              {suggestions.map((s) => (
                <li key={s.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      watchlist.toggle(s.symbol);
                      setTerm("");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/10"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{s.symbol}</span>{" "}
                      <span className="truncate text-xs text-muted-foreground">{s.name}</span>
                    </span>
                    <Star className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {rows.length === 0 ? (
            <EmptyBlock
              title="Nothing on your watchlist yet"
              description="Search above, or tap the star next to any scrip."
              icon={<Star className="size-6" />}
            />
          ) : (
            <ul className="space-y-2">
              {rows.map(({ symbol, price }) => (
                <li
                  key={symbol}
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => onPick(symbol)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{symbol}</span>
                      <span className="num shrink-0 text-sm font-semibold">
                        {price ? formatNpr(price.ltp) : "-"}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {price?.name ?? "Not in the live feed"}
                      </span>
                      {price ? (
                        <DeltaPill value={price.percentChange}>
                          {formatPercent(price.percentChange)}
                        </DeltaPill>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${symbol}`}
                    onClick={() => watchlist.remove(symbol)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
