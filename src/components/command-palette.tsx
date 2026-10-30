import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, LineChart, Star } from "lucide-react";
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
import { marketSnapshotQuery, mfSchemesQuery, worldSearchQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { worldBadge } from "@/lib/world/symbols";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LivePrice } from "@/lib/nepse/types";

interface SearchItem {
  symbol: string;
  name: string;
  ltp: number | null;
  pct: number | null;
  badge: string | null;
  kind: "equity" | "mutual_fund" | "open_end_mf" | "world";
}

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
  const navigate = useNavigate();
  const snapshot = useQuery(marketSnapshotQuery());
  const schemesQ = useQuery(mfSchemesQuery());
  const watchlist = useWatchlist();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Debounced world search (Yahoo): NEPSE matches first, global after.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const worldQ = useQuery({
    ...worldSearchQuery(open ? debouncedQuery : ""),
    enabled: open && debouncedQuery.trim().length >= 2,
  });

  const prices = snapshot.data?.prices ?? [];

  // Merge NEPSE prices + open-ended MF NAV schemes (not in live feed) +
  // world hits (global stocks/crypto, terminal deep-link on pick).
  const searchItems = useMemo(() => {
    const seen = new Set(prices.map((p) => p.symbol.toUpperCase()));
    const base: SearchItem[] = prices.map((p) => ({
      symbol: p.symbol,
      name: p.name,
      ltp: p.ltp,
      pct: p.percentChange,
      badge: null,
      kind: (
        (p as unknown as { asset_type?: string }).asset_type === "open_ended_mutual_fund"
          ? "open_end_mf"
          : /mutual fund/i.test(p.sector ?? "")
            ? "mutual_fund"
            : "equity"
      ) as SearchItem["kind"],
    }));
    for (const s of schemesQ.data ?? []) {
      const sym = s.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      seen.add(sym);
      base.push({
        symbol: s.symbol,
        name: s.name,
        ltp: null,
        pct: null,
        badge: null,
        kind: s.fundType === "open_end" ? "open_end_mf" : "mutual_fund",
      });
    }
    for (const h of worldQ.data?.hits ?? []) {
      if (!h.symbol || seen.has(h.symbol.toUpperCase())) continue;
      seen.add(h.symbol.toUpperCase());
      base.push({
        symbol: h.symbol,
        name: h.name,
        ltp: null,
        pct: null,
        badge: worldBadge({ type: h.type ?? "", exchange: h.exchange ?? "" }),
        kind: "world",
      });
    }
    return base;
  }, [prices, schemesQ.data, worldQ.data]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return searchItems.slice(0, 30);
    return searchItems
      .filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 40);
  }, [searchItems, query]);

  const pick = (symbol: string, kind: SearchItem["kind"]) => {
    setOpen(false);
    if (kind === "world") void navigate({ to: "/terminal", search: { symbol } });
    else onPick(symbol);
  };

  const list = (
    <Command shouldFilter={false}>
          <CommandInput placeholder="Search stocks, funds, global…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {snapshot.isLoading
            ? "Loading stocks…"
            : query
              ? "No stock matches that search."
              : "No stocks in the live feed right now."}
        </CommandEmpty>
        <CommandGroup heading={query ? "Matches" : "Top traded"}>
          {results.map((item) => (
            <CommandItem
              key={item.symbol}
              value={`${item.symbol} ${item.name}`}
              onSelect={() => pick(item.symbol, item.kind)}
            >
              {item.kind === "world" ? (
                <Globe className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <LineChart className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{item.symbol}</span>{" "}
                <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                {item.kind === "open_end_mf" ? (
                  <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[0.62rem] font-semibold text-primary">
                    Open-End NAV
                  </span>
                ) : null}
                {item.kind === "world" && item.badge ? (
                  <span className="ml-1 rounded bg-info/10 px-1 py-0.5 text-[0.62rem] font-semibold text-info">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              {item.kind === "world" ? null : (
                <span className="num text-sm font-medium">{item.ltp != null ? formatNpr(item.ltp) : "NAV"}</span>
              )}
              {item.pct != null ? <DeltaPill value={item.pct}>{formatPercent(item.pct)}</DeltaPill> : null}
              {watchlist.has(item.symbol) ? (
                <Star className="size-3.5 fill-warning text-warning" aria-label="On your watchlist" />
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
            <SheetTitle>Search stocks</SheetTitle>
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
