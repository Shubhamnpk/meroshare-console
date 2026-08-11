import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { marketSnapshotQuery } from "@/lib/queries";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";

export const Route = createFileRoute("/_dash/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Track NEPSE scrips you do not hold yet, with live prices saved privately on your device.",
      },
      { property: "og:title", content: "Watchlist | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Track NEPSE scrips you do not hold yet, with live prices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
  const snapshot = useQuery(marketSnapshotQuery());
  const watchlist = useWatchlist();
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

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
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Watchlist</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Scrips you are tracking. Stored privately on this device only.
        </p>
      </div>

      <div className="space-y-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Add a scrip by symbol or name…"
          className="h-10 rounded-xl"
        />
        {suggestions.length > 0 ? (
          <ul className="overflow-hidden rounded-xl border border-border/70 bg-card">
            {suggestions.map((s) => (
              <li key={s.symbol}>
                <button
                  type="button"
                  onClick={() => {
                    watchlist.toggle(s.symbol);
                    setTerm("");
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/10"
                >
                  <span>
                    <span className="font-semibold">{s.symbol}</span>{" "}
                    <span className="text-muted-foreground">{s.name}</span>
                  </span>
                  <Star className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {snapshot.isLoading ? (
        <LoadingBlock label="Loading prices" />
      ) : snapshot.isError ? (
        <ErrorBlock error={snapshot.error} retry={() => void snapshot.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          title="Nothing on your watchlist yet"
          description="Search above, or tap the star next to any scrip on the Market page."
          icon={<Star className="size-6" />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ symbol, price }) => (
            <li key={symbol} className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  onClick={() => setPicked(symbol)}
                >
                  <p className="font-display text-base font-semibold">{symbol}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {price?.name ?? "Not in the live feed"}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${symbol}`}
                  onClick={() => watchlist.remove(symbol)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <p className="num font-display text-xl font-semibold">
                  {price ? formatNpr(price.ltp) : "—"}
                </p>
                {price ? (
                  <DeltaPill value={price.percentChange}>
                    {formatPercent(price.percentChange)}
                  </DeltaPill>
                ) : null}
              </div>
              {price ? (
                <p className="num mt-2 text-xs text-muted-foreground">
                  Vol {formatQty(price.volume)} · H {formatNpr(price.high)} · L{" "}
                  {formatNpr(price.low)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />
    </div>
  );
}
