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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DeltaPill } from "@/components/stat-card";
import { marketSnapshotQuery, mfSchemesQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const schemesQ = useQuery(mfSchemesQuery());
  const watchlist = useWatchlist();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const prices = snapshot.data?.prices ?? [];

  // Merge NEPSE prices + open-ended MF NAV schemes (not in live feed)
  const searchItems = useMemo(() => {
    const seen = new Set(prices.map((p) => p.symbol.toUpperCase()));
    const base = prices.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      ltp: p.ltp,
      pct: p.percentChange,
      kind: (p.asset_type === "open_ended_mutual_fund" ? "open_end_mf" : /mutual fund/i.test(p.sector) ? "mutual_fund" : "equity") as "equity" | "mutual_fund" | "open_end_mf",
    }));
    for (const s of schemesQ.data ?? []) {
      const sym = s.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      base.push({
        symbol: s.symbol,
        name: s.name,
        ltp: null as number | null,
        pct: null as number | null,
        kind: (s.fundType === "open_end" ? "open_end_mf" : "mutual_fund") as "equity" | "mutual_fund" | "open_end_mf",
      });
    }
    return base;
  }, [prices, schemesQ.data]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return searchItems.slice(0, 30);
    return searchItems
      .filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 40);
  }, [searchItems, query]);

  const pick = (symbol: string) => {
    setOpen(false);
    onPick(symbol);
  };

  const list = (
    <Command shouldFilter={false}>
      <CommandInput placeholder="Search any listed scrip…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {snapshot.isLoading
            ? "Loading scrips…"
            : query
              ? "No scrip matches that search."
              : "No scrips in the live feed right now."}
        </CommandEmpty>
        <CommandGroup heading={query ? "Matches" : "Top traded"}>
          {results.map((item) => (
            <CommandItem
              key={item.symbol}
              value={`${item.symbol} ${item.name}`}
              onSelect={() => pick(item.symbol)}
            >
              <LineChart className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{item.symbol}</span>{" "}
                <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                {item.kind === "open_end_mf" ? (
                  <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[0.62rem] font-semibold text-primary">Open-End NAV</span>
                ) : null}
              </span>
              <span className="num text-sm font-medium">{item.ltp != null ? formatNpr(item.ltp) : "NAV"}</span>
              {item.pct != null ? <DeltaPill value={item.pct}>{formatPercent(item.pct)}</DeltaPill> : null}
              {watchlist.has(item.symbol) ? (
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
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[70dvh] px-0 pt-2" onClose={() => setOpen(false)}>
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="px-4 text-left">
            <SheetTitle>Search scrips</SheetTitle>
          </SheetHeader>
          <div className="mt-2 overflow-y-auto px-2">{list}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {list}
    </CommandDialog>
  );
}
