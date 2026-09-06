import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, ChartCandlestick, Maximize2, RefreshCw, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
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
import { SwipeStrip } from "@/components/swipeable-cards";
import { Heatmap, type HeatTile } from "@/components/market/heatmap";
import { CategoryDropdown, ModeSwitch } from "@/components/market/heatmap-controls";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { DeltaPill } from "@/components/stat-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { ChartModal, chartTimeLabel } from "@/components/market/chart-modal";
import {
  marketMoversQuery,
  marketSectorsQuery,
  marketSnapshotQuery,
  indexGraphQuery,
} from "@/lib/queries";
import { formatDateTime, formatNpr, formatNumber, formatPercent, formatQty } from "@/lib/format";
import { sectorOf } from "@/lib/nepse/sectors";
import { useWatchlist } from "@/lib/watchlist";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
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
      ogImage(),
    ],
    links: [canonicalLink("/market")],
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
  const navigate = useNavigate();
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
  const [watchlistOpen, setWatchlistOpen] = useState(false);

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
  const { sort, toggle } = useSort<"symbol" | "ltp" | "percentChange" | "volume" | "turnover">(
    {
      key: "turnover",
      dir: "desc",
    },
    {
      symbol: "text",
      ltp: "number",
      percentChange: "number",
      volume: "number",
      turnover: "number",
    },
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? prices.filter(
          (p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
        )
      : prices;
    const getter = (p: (typeof rows)[number]): string | number => {
      switch (sort.key) {
        case "symbol":
          return p.symbol;
        case "ltp":
          return p.ltp;
        case "percentChange":
          return p.percentChange;
        case "volume":
          return p.volume;
        default:
          return p.turnover;
      }
    };
    return sortBy(rows, getter, sort.dir).slice(0, 200);
  }, [prices, search, sort]);

  // Whole-market heatmap: top 60 scrips by turnover. Grouped splits sectors
  // into labeled regions on one scale; mixed throws all into a single pool
  // (same Layout switch as the mutual fund heat map).
  const [heatGrouped, setHeatGrouped] = useState(true);
  const [heatSize, setHeatSize] = useState<"turnover" | "volume">("turnover");
  const [heatSector, setHeatSector] = useState<string | null>(null);
  const heatSizeLabel = heatSize === "turnover" ? "turnover" : "volume";
  // Every sector in the session, biggest turnover first — chips isolate even
  // sectors too small to earn a labeled region on the shared map.
  const heatSectors = useMemo(() => {
    const totals = new Map<string, { turnover: number; count: number }>();
    for (const p of prices) {
      const sector = p.sector ?? sectorOf(p.symbol) ?? "Unclassified";
      const entry = totals.get(sector) ?? { turnover: 0, count: 0 };
      entry.turnover += p.turnover;
      entry.count += 1;
      totals.set(sector, entry);
    }
    return [...totals.entries()]
      .map(([sector, stats]) => ({ sector, ...stats }))
      .sort((a, b) => b.turnover - a.turnover);
  }, [prices]);
  const heatTiles: HeatTile[] = useMemo(
    () =>
      [...prices]
        .filter((p) =>
          heatSector
            ? (p.sector ?? sectorOf(p.symbol) ?? "Unclassified") === heatSector
            : true,
        )
        .sort((a, b) =>
          heatSize === "turnover" ? b.turnover - a.turnover : b.volume - a.volume,
        )
        .slice(0, 60)
        .map((p) => {
          const sizeValue = heatSize === "turnover" ? p.turnover : p.volume;
          const tile: HeatTile = {
            key: p.symbol,
            label: p.symbol,
            detail: formatPercent(p.percentChange),
            value: sizeValue,
            change: p.percentChange,
            title: `${p.symbol} · ${p.name} · LTP ${formatNpr(p.ltp)} · ${heatSize === "turnover" ? `Turnover ${formatNpr(p.turnover, { compact: true })}` : `Volume ${formatQty(p.volume)}`} · ${formatPercent(p.percentChange)} today`,
          };
          if (heatGrouped) tile.group = p.sector ?? sectorOf(p.symbol) ?? "Unclassified";
          return tile;
        }),
    [prices, heatGrouped, heatSize, heatSector],
  );
  const priceBySymbol = useMemo(() => new Map(prices.map((p) => [p.symbol, p])), [prices]);
  const renderMarketTooltip = (tile: HeatTile) => {
    const p = priceBySymbol.get(tile.key);
    if (!p) return null;
    return (
      <>
        <div className="flex flex-col gap-0.5 border-b border-border/50 pb-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-wider">{p.symbol}</span>
            <span className="rounded bg-primary/10 px-1 text-[9px] font-bold uppercase tracking-wider text-primary">
              {p.sector ?? sectorOf(p.symbol) ?? "Market"}
            </span>
          </div>
          <span className="truncate text-[9px] font-medium text-muted-foreground">{p.name}</span>
        </div>
        <div className="space-y-1.5 text-[11px] font-semibold text-muted-foreground">
          <div className="flex justify-between gap-6">
            <span>LTP:</span>
            <span className="font-bold text-foreground">{formatNpr(p.ltp)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Day change:</span>
            <span className={cn("font-bold", p.percentChange >= 0 ? "text-gain" : "text-loss")}>
              {formatPercent(p.percentChange)}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Turnover:</span>
            <span className="font-bold text-foreground">
              {formatNpr(p.turnover, { compact: true })}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Volume:</span>
            <span className="font-bold text-foreground">{formatQty(p.volume)}</span>
          </div>
        </div>
      </>
    );
  };

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
          <Button variant="outline" size="sm" onClick={() => setWatchlistOpen(true)}>
            <Star className={watchlist.symbols.length > 0 ? "fill-warning text-warning" : ""} />
            Watchlist
            {watchlist.symbols.length > 0 ? (
              <span className="num rounded-full bg-muted px-1.5 text-[0.68rem]">
                {watchlist.symbols.length}
              </span>
            ) : null}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/terminal" })}>
            <ChartCandlestick /> Terminal
          </Button>
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

          <SwipeStrip>
            {indices.map((index) => (
              <IndexCard
                key={index.name}
                index={index}
                onExpand={() => setChartIndex(index)}
                className="w-[15.5rem] shrink-0 snap-start sm:w-auto"
              />
            ))}
          </SwipeStrip>

          <SwipeStrip>
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
          </SwipeStrip>

          <Panel as="section">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold">Market heatmap</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Top 60 by {heatSizeLabel}
                  {heatSector ? ` in ${heatSector}` : ""}
                  {heatGrouped && !heatSector ? ", grouped by sector" : ""}
                  {!heatGrouped && !heatSector ? ", all mixed" : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ModeSwitch
                  label="Size"
                  options={
                    [
                      { key: "turnover", label: "Turnover" },
                      { key: "volume", label: "Volume" },
                    ] as const
                  }
                  value={heatSize}
                  onChange={setHeatSize}
                />
                <ModeSwitch
                  label="Layout"
                  options={
                    [
                      { key: "grouped", label: "Grouped" },
                      { key: "mixed", label: "Mixed" },
                    ] as const
                  }
                  value={heatGrouped ? "grouped" : "mixed"}
                  onChange={(v) => setHeatGrouped(v === "grouped")}
                />
              </div>
            </div>
            <CategoryDropdown
              value={heatSector ?? "all"}
              options={[
                { value: "all", label: `All sectors · ${prices.length}` },
                ...heatSectors.map((s) => ({
                  value: s.sector,
                  label: `${s.sector} · ${s.count}`,
                })),
              ]}
              onChange={(v) => setHeatSector(v === "all" ? null : v)}
              placeholder="Filter by sector"
              className="mb-2.5"
            />
            {heatTiles.length === 0 ? (
              <EmptyBlock
                title="No heatmap data"
                description="Turnover data is unavailable for this session."
              />
            ) : (
              <Heatmap
                tiles={heatTiles}
                onPick={setPicked}
                sizeLabel={heatSizeLabel}
                heightClass="h-[52vh] sm:h-[60vh]"
                renderTooltip={renderMarketTooltip}
              />
            )}
          </Panel>

          <Panel as="section">
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
          </Panel>

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
              <Panel padding="none" className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <SortableTh
                        label="Scrip"
                        active={sort.key === "symbol"}
                        dir={sort.dir}
                        onClick={() => toggle("symbol")}
                        align="left"
                        className="pl-4"
                        kind="text"
                      />
                      <SortableTh
                        label="LTP"
                        active={sort.key === "ltp"}
                        dir={sort.dir}
                        onClick={() => toggle("ltp")}
                        align="right"
                      />
                      <SortableTh
                        label="Change"
                        active={sort.key === "percentChange"}
                        dir={sort.dir}
                        onClick={() => toggle("percentChange")}
                        align="right"
                      />
                      <SortableTh
                        label="Volume"
                        active={sort.key === "volume"}
                        dir={sort.dir}
                        onClick={() => toggle("volume")}
                        align="right"
                        className="hidden sm:table-cell"
                      />
                      <SortableTh
                        label="Turnover"
                        active={sort.key === "turnover"}
                        dir={sort.dir}
                        onClick={() => toggle("turnover")}
                        align="right"
                        className="hidden md:table-cell"
                      />
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
                              const wasIn = watchlist.has(price.symbol);
                              watchlist.toggle(price.symbol);
                              toast.success(
                                wasIn ? "Removed from watchlist" : "Added to watchlist",
                              );
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
              </Panel>
            )}
          </section>

          <Panel as="section">
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
                      {sector.close != null ? formatNumber(sector.close) : "-"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-xs text-muted-foreground">
            Market data comes from the live NEPSE mirror plus a community YONEPSE feed and is
            indicative only.
          </p>
        </>
      )}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />

      <WatchlistPanel
        open={watchlistOpen}
        onOpenChange={setWatchlistOpen}
        onPick={(symbol) => {
          setWatchlistOpen(false);
          setPicked(symbol);
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
