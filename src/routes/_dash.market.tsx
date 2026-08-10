import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { marketMoversQuery, marketSectorsQuery, marketSnapshotQuery } from "@/lib/queries";
import { formatNpr, formatNumber, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import type { MoverRow } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/market")({
  head: () => ({
    meta: [
      { title: "Market — MeroShare Investor Console" },
      { name: "description", content: "Live NEPSE indices, market summary, top gainers and losers, and every listed scrip." },
      { property: "og:title", content: "Market — MeroShare Investor Console" },
      { property: "og:description", content: "Live NEPSE indices, top movers and every listed scrip in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketPage,
});

function MoverList({ rows, kind, onPick }: { rows: MoverRow[]; kind: MoverRow["label"]; onPick: (s: string) => void }) {
  if (rows.length === 0) return <EmptyBlock title="No data" description="The market feed has nothing for this bucket yet." />;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.symbol}>
          <button
            type="button"
            onClick={() => onPick(row.symbol)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{row.symbol}</p>
              <p className="truncate text-xs text-muted-foreground">{row.name}</p>
            </div>
            {kind === "%" ? (
              <DeltaPill value={row.value}>{formatPercent(row.value)}</DeltaPill>
            ) : kind === "npr" ? (
              <span className="num text-sm font-medium">{formatNpr(row.value, { compact: true })}</span>
            ) : (
              <span className="num text-sm font-medium">{formatQty(row.value)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function MarketPage() {
  const snapshot = useQuery(marketSnapshotQuery());
  const movers = useQuery(marketMoversQuery());
  const sectors = useQuery(marketSectorsQuery());
  const watchlist = useWatchlist();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const prices = snapshot.data?.prices ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? prices.filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      : prices;
    return [...rows].sort((a, b) => b.turnover - a.turnover).slice(0, 200);
  }, [prices, search]);

  const nepse = snapshot.data?.indices.find((i) => /nepse/i.test(i.name)) ?? snapshot.data?.indices[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Market</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live NEPSE prices, indices and movers.{" "}
            {snapshot.data ? (snapshot.data.status.isOpen ? "Market is open." : "Market is closed.") : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void snapshot.refetch()} disabled={snapshot.isFetching}>
          <RefreshCw className={snapshot.isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {snapshot.isLoading ? (
        <LoadingBlock label="Loading market data" />
      ) : snapshot.isError ? (
        <ErrorBlock error={snapshot.error} retry={() => void snapshot.refetch()} />
      ) : (
        <>
          {snapshot.data?.stale ? (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Showing the last cached market data — the feed is temporarily unreachable.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(snapshot.data?.indices ?? []).slice(0, 2).map((index) => (
              <div key={index.name} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{index.name}</p>
                <p className="num mt-2 text-2xl font-semibold">{formatNumber(index.close)}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <DeltaPill value={index.percentChange}>{formatPercent(index.percentChange)}</DeltaPill>
                  {index.fiftyTwoWeekHigh ? <span className="num">52w {formatNumber(index.fiftyTwoWeekLow)}–{formatNumber(index.fiftyTwoWeekHigh)}</span> : null}
                </div>
              </div>
            ))}
            {(snapshot.data?.summary ?? []).slice(0, 2).map((row) => (
              <div key={row.detail} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{row.detail.replace(/:$/, "")}</p>
                <p className="num mt-2 text-2xl font-semibold">
                  {/turnover/i.test(row.detail) ? formatNpr(row.value, { compact: true }) : formatQty(row.value)}
                </p>
                {nepse ? <p className="mt-1.5 text-xs text-muted-foreground">as of latest session</p> : null}
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <h2 className="mb-3 font-display text-base font-semibold">Movers &amp; activity</h2>
            {movers.isLoading ? (
              <LoadingBlock label="Loading movers" rows={2} />
            ) : movers.isError ? (
              <ErrorBlock error={movers.error} retry={() => void movers.refetch()} />
            ) : (
              <Tabs defaultValue="gainers">
                <TabsList className="flex w-full flex-wrap justify-start">
                  <TabsTrigger value="gainers">Gainers</TabsTrigger>
                  <TabsTrigger value="losers">Losers</TabsTrigger>
                  <TabsTrigger value="turnover">Turnover</TabsTrigger>
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                  <TabsTrigger value="transactions">Trades</TabsTrigger>
                </TabsList>
                <TabsContent value="gainers" className="mt-3"><MoverList rows={movers.data?.gainers ?? []} kind="%" onPick={setPicked} /></TabsContent>
                <TabsContent value="losers" className="mt-3"><MoverList rows={movers.data?.losers ?? []} kind="%" onPick={setPicked} /></TabsContent>
                <TabsContent value="turnover" className="mt-3"><MoverList rows={movers.data?.turnover ?? []} kind="npr" onPick={setPicked} /></TabsContent>
                <TabsContent value="volume" className="mt-3"><MoverList rows={movers.data?.volume ?? []} kind="qty" onPick={setPicked} /></TabsContent>
                <TabsContent value="transactions" className="mt-3"><MoverList rows={movers.data?.transactions ?? []} kind="qty" onPick={setPicked} /></TabsContent>
              </Tabs>
            )}
          </section>

          <section className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all listed scrips…"
                className="h-10 rounded-xl pl-9"
              />
            </div>

            {filtered.length === 0 ? (
              <EmptyBlock title="No matches" description="No listed scrip matches that search." />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4">Scrip</TableHead>
                      <TableHead className="text-right">LTP</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Volume</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Turnover</TableHead>
                      <TableHead className="w-12 pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((price) => (
                      <TableRow key={price.symbol} className="cursor-pointer" onClick={() => setPicked(price.symbol)}>
                        <TableCell className="pl-4">
                          <p className="font-semibold">{price.symbol}</p>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">{price.name}</p>
                        </TableCell>
                        <TableCell className="num text-right font-medium">{formatNpr(price.ltp)}</TableCell>
                        <TableCell className="text-right">
                          <DeltaPill value={price.percentChange}>{formatPercent(price.percentChange)}</DeltaPill>
                        </TableCell>
                        <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">{formatQty(price.volume)}</TableCell>
                        <TableCell className="num hidden text-right text-muted-foreground md:table-cell">{formatNpr(price.turnover, { compact: true })}</TableCell>
                        <TableCell className="pr-4 text-right">
                          <button
                            type="button"
                            aria-label={watchlist.has(price.symbol) ? `Remove ${price.symbol} from watchlist` : `Add ${price.symbol} to watchlist`}
                            onClick={(e) => { e.stopPropagation(); watchlist.toggle(price.symbol); }}
                            className="text-muted-foreground transition-colors hover:text-warning"
                          >
                            <Star className={watchlist.has(price.symbol) ? "size-4 fill-warning text-warning" : "size-4"} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
              <Activity className="size-4 text-primary" /> Sector indices
            </h2>
            {sectors.isLoading ? (
              <LoadingBlock label="Loading sectors" rows={2} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(sectors.data ?? []).map((sector) => (
                  <li key={sector.code || sector.name} className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <p className="truncate text-sm font-medium">{sector.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{sector.sector ?? "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Market data is sourced from a public community NEPSE feed and is indicative only.
          </p>
        </>
      )}

      <ScripSheet symbol={picked} onOpenChange={(open) => { if (!open) setPicked(null); }} />
    </div>
  );
}
