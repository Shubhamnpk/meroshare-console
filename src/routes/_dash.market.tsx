import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Maximize2, RefreshCw, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { ChartModal, chartTimeLabel } from "@/components/market/chart-modal";
import {
  marketMoversQuery,
  marketSectorsQuery,
  marketSnapshotQuery,
  indexGraphQuery,
} from "@/lib/queries";
import { formatDateTime, formatNpr, formatNumber, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/market/sparkline";
import type { MarketIndex, MoverRow, PricePoint } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/market")({
  head: () => ({
    meta: [
      { title: "Market | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Live NEPSE indices, market summary, top gainers and losers, and every listed scrip.",
      },
      { property: "og:title", content: "Market | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Live NEPSE indices, top movers and every listed scrip in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketPage,
});

function MoverList({
  rows,
  kind,
  onPick,
}: {
  rows: MoverRow[];
  kind: MoverRow["label"];
  onPick: (s: string) => void;
}) {
  if (rows.length === 0)
    return (
      <EmptyBlock title="No data" description="The market feed has nothing for this bucket yet." />
    );
  return (
    <ul className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2 sm:gap-2">
      {rows.map((row) => (
        <li key={row.symbol} className="min-w-0">
          <button
            type="button"
            onClick={() => onPick(row.symbol)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface px-2.5 py-2 text-left transition-colors hover:border-primary/40 sm:px-3 sm:py-2.5"
          >
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold leading-tight sm:text-sm">
                {row.symbol}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.name}</p>
            </div>
            {kind === "%" ? (
              <DeltaPill value={row.value}>{formatPercent(row.value)}</DeltaPill>
            ) : kind === "npr" ? (
              <span className="num shrink-0 text-[0.8125rem] font-medium sm:text-sm">
                {formatNpr(row.value, { compact: true })}
              </span>
            ) : (
              <span className="num shrink-0 text-[0.8125rem] font-medium sm:text-sm">
                {formatQty(row.value)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

const INDEX_GRAPH_NAMES: Record<string, string> = {
  "NEPSE Index": "NEPSE",
  "Sensitive Index": "Sensitive",
  "Float Index": "Float",
};

function IndexCard({
  index,
  onExpand,
  className,
}: {
  index: MarketIndex;
  onExpand: () => void;
  className?: string;
}) {
  const graphName = INDEX_GRAPH_NAMES[index.name];
  const graph = useQuery({
    ...(graphName
      ? indexGraphQuery(graphName)
      : {
          queryKey: ["index-graph", index.name] as const,
          queryFn: async () => [] as PricePoint[],
        }),
    enabled: Boolean(graphName),
  });
  return (
    <button
      type="button"
      onClick={onExpand}
      className={cn(
        "group rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/40",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {index.name}
        <Maximize2 className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      {graphName && graph.data && graph.data.length >= 2 ? (
        <div className="mt-3 h-16">
          <Sparkline points={graph.data} showLastDot />
        </div>
      ) : null}
      <p className="num mt-2 text-2xl font-semibold">{formatNumber(index.close)}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <DeltaPill value={index.percentChange}>{formatPercent(index.percentChange)}</DeltaPill>
        {index.fiftyTwoWeekHigh ? (
          <span className="num">
            52w {formatNumber(index.fiftyTwoWeekLow)}–{formatNumber(index.fiftyTwoWeekHigh)}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function MarketPage() {
  const { autoRefresh, refreshMinutes } = useSettings();
  const snapshot = useQuery({
    ...marketSnapshotQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const movers = useQuery({
    ...marketMoversQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const sectors = useQuery(marketSectorsQuery());
  const watchlist = useWatchlist();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [chartIndex, setChartIndex] = useState<MarketIndex | null>(null);

  const chartGraphName = chartIndex ? INDEX_GRAPH_NAMES[chartIndex.name] : null;
  const chartGraph = useQuery({
    ...(chartGraphName
      ? indexGraphQuery(chartGraphName)
      : {
          queryKey: ["index-graph-modal", "none"] as const,
          queryFn: async () => [] as PricePoint[],
        }),
    enabled: Boolean(chartIndex && chartGraphName),
  });

  const prices = snapshot.data?.prices ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? prices.filter(
          (p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
        )
      : prices;
    return [...rows].sort((a, b) => b.turnover - a.turnover).slice(0, 200);
  }, [prices, search]);

  const nepse =
    snapshot.data?.indices.find((i) => /nepse/i.test(i.name)) ?? snapshot.data?.indices[0];

  const indices = useMemo(() => {
    const all = snapshot.data?.indices ?? [];
    if (!nepse) return all;
    return [...all].sort((a, b) => {
      if (a.name === nepse.name) return -1;
      if (b.name === nepse.name) return 1;
      return 0;
    });
  }, [snapshot.data?.indices, nepse]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Market</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Live NEPSE prices, indices and movers.{" "}
            {snapshot.data
              ? snapshot.data.status.isOpen
                ? "Market is open."
                : "Market is closed."
              : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {snapshot.data?.fetchedAt ? (
            <span className="num hidden text-xs text-muted-foreground sm:inline">
              Updated {formatDateTime(snapshot.data.fetchedAt)}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshot.refetch()}
            disabled={snapshot.isFetching}
          >
            <RefreshCw className={snapshot.isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {snapshot.isLoading ? (
        <LoadingBlock label="Loading market data" />
      ) : snapshot.isError ? (
        <ErrorBlock error={snapshot.error} retry={() => void snapshot.refetch()} />
      ) : (
        <>
          {snapshot.data?.stale ? (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Showing the last cached market data; the feed is temporarily unreachable.
            </p>
          ) : null}

          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:snap-none sm:overflow-x-visible sm:pb-0 xl:grid-cols-4">
            {indices.map((index) => (
              <IndexCard
                key={index.name}
                index={index}
                onExpand={() => setChartIndex(index)}
                className="w-[15.5rem] shrink-0 snap-start sm:w-auto"
              />
            ))}
          </div>

          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:snap-none sm:overflow-x-visible sm:pb-0 xl:grid-cols-4">
            {(snapshot.data?.summary ?? []).slice(0, 4).map((row) => (
              <div
                key={row.detail}
                className="w-[12.5rem] shrink-0 snap-start rounded-2xl border border-border/70 bg-card p-4 sm:w-auto"
              >
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {row.detail.replace(/:$/, "").replace(/^Total\s*/, "")}
                </p>
                <p className="num mt-2 text-2xl font-semibold">
                  {/Rs|turnover/i.test(row.detail)
                    ? formatNpr(row.value, { compact: true })
                    : formatQty(row.value)}
                </p>
                {nepse ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">as of latest session</p>
                ) : null}
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
                <TabsList className="flex w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible">
                  <TabsTrigger value="gainers">Gainers</TabsTrigger>
                  <TabsTrigger value="losers">Losers</TabsTrigger>
                  <TabsTrigger value="turnover">Turnover</TabsTrigger>
                  <TabsTrigger value="volume">Volume</TabsTrigger>
                  <TabsTrigger value="transactions">Trades</TabsTrigger>
                </TabsList>
                <TabsContent value="gainers" className="mt-3">
                  <MoverList rows={movers.data?.gainers ?? []} kind="%" onPick={setPicked} />
                </TabsContent>
                <TabsContent value="losers" className="mt-3">
                  <MoverList rows={movers.data?.losers ?? []} kind="%" onPick={setPicked} />
                </TabsContent>
                <TabsContent value="turnover" className="mt-3">
                  <MoverList rows={movers.data?.turnover ?? []} kind="npr" onPick={setPicked} />
                </TabsContent>
                <TabsContent value="volume" className="mt-3">
                  <MoverList rows={movers.data?.volume ?? []} kind="qty" onPick={setPicked} />
                </TabsContent>
                <TabsContent value="transactions" className="mt-3">
                  <MoverList rows={movers.data?.transactions ?? []} kind="qty" onPick={setPicked} />
                </TabsContent>
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
                      <TableRow
                        key={price.symbol}
                        className="cursor-pointer"
                        onClick={() => setPicked(price.symbol)}
                      >
                        <TableCell className="pl-4">
                          <p className="font-semibold">{price.symbol}</p>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">
                            {price.name}
                          </p>
                        </TableCell>
                        <TableCell className="num text-right font-medium">
                          {formatNpr(price.ltp)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeltaPill value={price.percentChange}>
                            {formatPercent(price.percentChange)}
                          </DeltaPill>
                        </TableCell>
                        <TableCell className="num hidden text-right text-muted-foreground sm:table-cell">
                          {formatQty(price.volume)}
                        </TableCell>
                        <TableCell className="num hidden text-right text-muted-foreground md:table-cell">
                          {formatNpr(price.turnover, { compact: true })}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <button
                            type="button"
                            aria-label={
                              watchlist.has(price.symbol)
                                ? `Remove ${price.symbol} from watchlist`
                                : `Add ${price.symbol} to watchlist`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              watchlist.toggle(price.symbol);
                            }}
                            className="text-muted-foreground transition-colors hover:text-warning"
                          >
                            <Star
                              className={
                                watchlist.has(price.symbol)
                                  ? "size-4 fill-warning text-warning"
                                  : "size-4"
                              }
                            />
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
                  <li
                    key={sector.code || sector.name}
                    className="rounded-xl border border-border/60 bg-surface px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">
                        {sector.name.replace(/\s*Index$/i, "")}
                      </p>
                      {sector.percentChange != null ? (
                        <DeltaPill value={sector.percentChange}>
                          {formatPercent(sector.percentChange)}
                        </DeltaPill>
                      ) : null}
                    </div>
                    <p className="num mt-1 text-sm text-muted-foreground">
                      {sector.close != null ? formatNumber(sector.close) : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Market data comes from the live NEPSE mirror (bitnepal.net) plus a community YONEPSE
            feed and is indicative only.
          </p>
        </>
      )}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />

      <ChartModal
        open={Boolean(chartIndex)}
        onOpenChange={(open) => {
          if (!open) setChartIndex(null);
        }}
        title={chartIndex?.name ?? "Index"}
        subtitle={
          chartGraph.data && chartGraph.data.length >= 2
            ? `Today's session, ${chartTimeLabel(chartGraph.data[0]!.time)}–${chartTimeLabel(
                chartGraph.data[chartGraph.data.length - 1]!.time,
              )} NPT`
            : "Today's session (intraday)"
        }
        ranges={[
          {
            key: "today",
            label: "Today",
            points: chartGraph.data ?? [],
          },
        ]}
        formatValue={(v) => formatNumber(v)}
        formatIntradayLabel={chartTimeLabel}
        formatDailyLabel={chartTimeLabel}
      />
    </div>
  );
}
