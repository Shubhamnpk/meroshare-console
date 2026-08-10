import { useQuery } from "@tanstack/react-query";
import { Star, StarOff } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DeltaPill } from "@/components/stat-card";
import { enrichedPortfolioQuery, marketSnapshotQuery } from "@/lib/queries";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";

export function ScripSheet({
  symbol,
  onOpenChange,
}: {
  symbol: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const snapshot = useQuery(marketSnapshotQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());
  const watchlist = useWatchlist();

  const upper = symbol?.toUpperCase() ?? "";
  const price = snapshot.data?.prices.find((p) => p.symbol === upper) ?? null;
  const holding = portfolio.data?.holdings.find((h) => h.scrip === upper) ?? null;
  const watched = upper ? watchlist.has(upper) : false;

  const rows: { label: string; value: string }[] = price
    ? [
        { label: "Previous close", value: formatNpr(price.previousClose) },
        { label: "Day high", value: price.high ? formatNpr(price.high) : "—" },
        { label: "Day low", value: price.low ? formatNpr(price.low) : "—" },
        { label: "Volume", value: formatQty(price.volume) },
        { label: "Turnover", value: formatNpr(price.turnover, { compact: true }) },
        { label: "Trades", value: formatQty(price.trades) },
        { label: "Sector", value: price.sector ?? "—" },
      ]
    : [];

  return (
    <Sheet open={Boolean(symbol)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{upper || "Scrip"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          {price ? (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{price.name}</p>
                <div className="mt-2 flex items-end gap-3">
                  <p className="num font-display text-3xl font-semibold">{formatNpr(price.ltp)}</p>
                  <DeltaPill value={price.percentChange}>
                    {formatPercent(price.percentChange)}
                  </DeltaPill>
                </div>
              </div>

              <Button
                variant={watched ? "secondary" : "outline"}
                className="w-full"
                onClick={() => watchlist.toggle(upper)}
              >
                {watched ? <StarOff className="size-4" /> : <Star className="size-4" />}
                {watched ? "Remove from watchlist" : "Add to watchlist"}
              </Button>

              <dl className="grid grid-cols-2 gap-3">
                {rows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </dt>
                    <dd className="num text-sm font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No live market data for this scrip right now.
            </p>
          )}

          {holding ? (
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <h3 className="font-display text-sm font-semibold">Your holding</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Units</dt>
                  <dd className="num font-medium">{formatQty(holding.units)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Market value</dt>
                  <dd className="num font-medium">{formatNpr(holding.value)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Day change</dt>
                  <dd className="num font-medium">
                    <DeltaPill value={holding.dayChange}>{formatNpr(holding.dayChange)}</DeltaPill>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Prev close value</dt>
                  <dd className="num font-medium">{formatNpr(holding.previousValue)}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Market prices come from a public community NEPSE feed and are indicative only. MeroShare
            remains the source of truth for your holdings.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
