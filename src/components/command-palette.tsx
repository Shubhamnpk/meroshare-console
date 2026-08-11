import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Star } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DeltaPill } from "@/components/stat-card";
import { marketSnapshotQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import type { LivePrice } from "@/lib/nepse/types";

/**
 * Ctrl+K / Cmd+K palette: search every listed scrip and open its detail sheet.
 * Mounted once inside the app shell so it works on every page.
 */
export function CommandPalette({
  open,
  setOpen,
  onPick,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (symbol: string) => void;
}) {
  const snapshot = useQuery(marketSnapshotQuery());
  const watchlist = useWatchlist();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const prices = snapshot.data?.prices ?? [];

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return prices.slice(0, 30);
    return prices
      .filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 40);
  }, [prices, query]);

  const pick = (symbol: string) => {
    setOpen(false);
    onPick(symbol);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search any listed scrip…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {snapshot.isLoading
              ? "Loading scrips…"
              : query
                ? "No scrip matches that search."
                : "No scrips in the live feed right now."}
          </CommandEmpty>
          <CommandGroup heading={query ? "Matches" : "Top traded"}>
            {results.map((price: LivePrice) => (
              <CommandItem
                key={price.symbol}
                value={`${price.symbol} ${price.name}`}
                onSelect={() => pick(price.symbol)}
              >
                <LineChart className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{price.symbol}</span>{" "}
                  <span className="truncate text-xs text-muted-foreground">{price.name}</span>
                </span>
                <span className="num text-sm font-medium">{formatNpr(price.ltp)}</span>
                <DeltaPill value={price.percentChange}>
                  {formatPercent(price.percentChange)}
                </DeltaPill>
                {watchlist.has(price.symbol) ? (
                  <Star
                    className="size-3.5 fill-warning text-warning"
                    aria-label="On your watchlist"
                  />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
