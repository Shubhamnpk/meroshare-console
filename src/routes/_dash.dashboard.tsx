import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Briefcase,
  ChartLine,
  RefreshCw,
  Rocket,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { StatCard, DeltaPill } from "@/components/stat-card";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { useWatchlist } from "@/lib/watchlist";
import { SwipeableCards } from "@/components/swipeable-cards";
import { ErrorBlock, LoadingBlock, EmptyBlock, SkeletonCards } from "@/components/states";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { ChartModal, chartTimeLabel } from "@/components/market/chart-modal";
import { Sparkline } from "@/components/market/sparkline";
import {
  applicableIssuesQuery,
  currentIssuesQuery,
  enrichedPortfolioQuery,
  indexGraphQuery,
  investmentSummaryQuery,
  ipoArchiveQuery,
  marketSnapshotQuery,
} from "@/lib/queries";
import { sameCompany } from "@/lib/notifications";
import { formatDate, formatNpr, formatPercent, formatQty } from "@/lib/format";
import { ogImage, canonicalLink } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { EnrichedHolding } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Live snapshot of your portfolio value at NEPSE prices, day movers and open IPO issues.",
      },
      { property: "og:title", content: "Dashboard | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Live snapshot of your portfolio value, day movers and open issues.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/dashboard")],
  }),
  component: DashboardPage,
});

function MoverCard({
  label,
  holding,
  tone,
  onOpen,
}: {
  label: string;
  holding: EnrichedHolding | null;
  tone: "gain" | "loss";
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        tone === "gain" ? "border-gain/30 bg-gain/5" : "border-loss/30 bg-loss/5",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {tone === "gain" ? (
          <TrendingUp className="size-3.5 text-gain" aria-hidden />
        ) : (
          <TrendingDown className="size-3.5 text-loss" aria-hidden />
        )}
      </div>
      {holding ? (
        <button
          type="button"
          onClick={onOpen}
          className="mt-1 block w-full rounded-md p-0.5 text-left transition-colors hover:bg-background/50"
        >
          <p className="truncate text-sm font-semibold">{holding.scrip}</p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="num text-base font-semibold">{formatNpr(holding.ltp)}</span>
            <DeltaPill value={holding.percentChange}>
              {formatPercent(holding.percentChange)}
            </DeltaPill>
          </div>
          <p className="num mt-0.5 text-xs text-muted-foreground">
            {formatQty(holding.units)} units · {formatNpr(holding.value)}
          </p>
        </button>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">-</p>
      )}
    </div>
  );
}

function DashboardPage() {
  const portfolio = useQuery(enrichedPortfolioQuery());
  const issues = useQuery(applicableIssuesQuery());
  const calendar = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const market = useQuery(marketSnapshotQuery());
  const nepseGraph = useQuery(indexGraphQuery("NEPSE"));
  const investment = useQuery(investmentSummaryQuery());
  const [picked, setPicked] = useState<string | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const watchlist = useWatchlist();
  const [chartOpen, setChartOpen] = useState(false);

  const data = portfolio.data;
  const holdings = data?.holdings ?? [];
  const change = data?.dayChange ?? 0;
  const changePct = data?.dayChangePercent ?? 0;

  const totalInvestment = investment.data?.totalInvestment ?? 0;
  const pendingCount = investment.data?.pendingCount ?? 0;

  const sortedByChange = [...holdings].sort((a, b) => b.percentChange - a.percentChange);
  const topGainer = sortedByChange[0] ?? null;
  const topLoser = sortedByChange[sortedByChange.length - 1] ?? null;

  const openIssues = (issues.data ?? []).slice(0, 4);

  // Upcoming below open: CDSC-announced plus archive announcements, deduped.
  const upcomingIssues = (() => {
    const openNames = openIssues.map((i) => i.companyName || i.scrip || "");
    const cdscUpcoming = (calendar.data ?? []).filter((i) =>
      /upcoming|announced|coming/i.test(String(i.statusName ?? "")),
    );
    const names = [...openNames, ...cdscUpcoming.map((i) => i.companyName || i.scrip || "")];
    const archived = (archive.data?.upcoming ?? []).filter(
      (row) => !names.some((name) => sameCompany(name, row.company)),
    );
    return [
      ...cdscUpcoming.map((i) => ({
        key: `cdsc-${i.companyShareId}`,
        title: i.companyName || i.scrip || "",
        sub: `${i.scrip ?? ""} · opens ${formatDate(i.issueOpenDate)}`.trim(),
      })),
      ...archived.map((row, n) => ({
        key: `arch-${row.company}-${n}`,
        title: row.company,
        sub: [row.units ? `${row.units} units` : null, row.dateRange ?? null]
          .filter(Boolean)
          .join(" · "),
      })),
    ].slice(0, 3);
  })();

  const nepse = market.data?.indices.find((i) => /nepse/i.test(i.name)) ?? market.data?.indices[0];
  const nepsePoints = nepseGraph.data ?? [];

  const isRefreshing =
    portfolio.isFetching ||
    issues.isFetching ||
    market.isFetching ||
    nepseGraph.isFetching ||
    investment.isFetching;

  const statCards = [
    <StatCard
      key="live"
      label="Portfolio value (live)"
      value={formatNpr(data?.totalValue ?? 0)}
      tone="brand"
      icon={<Briefcase className="size-4" />}
      sub={
        <span className="flex items-center gap-2">
          <DeltaPill value={change}>
            {change > 0 ? (
              <TrendingUp className="size-3" />
            ) : change < 0 ? (
              <TrendingDown className="size-3" />
            ) : null}
            {formatPercent(changePct)}
          </DeltaPill>
          vs previous close
        </span>
      }
    />,
    <StatCard
      key="prev"
      label="Value at previous close"
      value={formatNpr(data?.totalPreviousValue ?? 0)}
      sub="Yesterday's closing valuation"
    />,
    <StatCard
      key="change"
      label="Day change"
      value={`${change > 0 ? "+" : change < 0 ? "-" : ""}${formatNpr(Math.abs(change))}`}
      tone={change > 0 ? "gain" : change < 0 ? "loss" : "neutral"}
      sub={
        change > 0
          ? "Unrealised gain today"
          : change < 0
            ? "Unrealised loss today"
            : "No change today"
      }
    />,
    <StatCard
      key="scrips"
      label="Scrips held"
      value={holdings.length}
      sub={`${formatQty(data?.totalUnits ?? 0)} total units`}
    />,
    <StatCard
      key="investment"
      label="Total investment"
      value={formatNpr(totalInvestment)}
      icon={<Wallet className="size-4" />}
      sub={
        investment.isLoading
          ? "Loading purchase source…"
          : totalInvestment > 0
            ? pendingCount > 0
              ? `Purchase source · ${pendingCount} pending WACC`
              : "Purchase source · all calculated"
            : "No purchase source data yet"
      }
    />,
  ];

  const refreshAll = () => {
    void portfolio.refetch();
    void issues.refetch();
    void market.refetch();
    void nepseGraph.refetch();
    void investment.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Dashboard</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Your holdings valued at live NEPSE prices
            {data && data.marketStale
              ? ", showing MeroShare prices (feed temporarily unreachable)"
              : ""}
            .
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </button>
      </div>

      {portfolio.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : portfolio.isError ? (
        <ErrorBlock error={portfolio.error} retry={() => void portfolio.refetch()} />
      ) : (
        <>
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-5">{statCards}</div>
          <div className="sm:hidden">
            <SwipeableCards cards={statCards} />
          </div>

          <Panel
            as="button"
            type="button"
            onClick={() => setChartOpen(true)}
            interactive
            className="group relative w-full overflow-hidden text-left transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <ChartLine className="size-3.5 text-primary" /> NEPSE Index
                  <span className="hidden sm:inline">· today</span>
                </p>
                {nepse ? (
                  <p className="num mt-2 text-3xl font-semibold">
                    {nepse.close != null ? nepse.close.toLocaleString("en-IN") : "-"}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                )}
                {nepse ? (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <DeltaPill value={nepse.percentChange}>
                      {formatPercent(nepse.percentChange)}
                    </DeltaPill>
                    {nepse.fiftyTwoWeekHigh ? (
                      <span className="num">
                        52w {formatNpr(nepse.fiftyTwoWeekLow)}–{formatNpr(nepse.fiftyTwoWeekHigh)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {nepsePoints.length >= 2 ? (
                <div className="h-16 w-40 sm:w-64">
                  <Sparkline points={nepsePoints} showLastDot />
                </div>
              ) : null}
            </div>
            <p className="mt-3 flex items-center gap-1 text-[0.68rem] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Click for the full chart <ArrowUpRight className="size-3" />
            </p>
          </Panel>

          <Panel as="section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <Star className="size-4 fill-warning text-warning" /> Watchlist
              </h2>
              {watchlist.symbols.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setWatchlistOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View all ({watchlist.symbols.length}) <ArrowUpRight className="size-3" />
                </button>
              ) : null}
            </div>
            {watchlist.symbols.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Star any scrip on the Market page and it will wait for you here.
              </p>
            ) : (
              <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {watchlist.symbols.map((symbol) => {
                  const price = market.data?.prices.find((p) => p.symbol === symbol);
                  return (
                    <button
                      key={symbol}
                      type="button"
                      onClick={() => setPicked(symbol)}
                      className="w-36 shrink-0 snap-start rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40"
                    >
                      <p className="truncate text-[13px] font-semibold">{symbol}</p>
                      <p className="num mt-0.5 text-sm font-semibold">
                        {price ? formatNpr(price.ltp) : "-"}
                      </p>
                      {price ? (
                        <DeltaPill value={price.percentChange}>
                          {formatPercent(price.percentChange)}
                        </DeltaPill>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel as="section">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold">Today's movers</h2>
              <Link to="/portfolio" className="text-xs font-medium text-primary hover:underline">
                View portfolio
              </Link>
            </div>
            {holdings.length === 0 ? (
              <EmptyBlock
                title="No holdings yet"
                description="Scrips in your demat account will appear here."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <MoverCard
                  label="Top gainer"
                  holding={topGainer}
                  tone="gain"
                  onOpen={() => setPicked(topGainer?.scrip ?? null)}
                />
                <MoverCard
                  label="Top loser"
                  holding={topLoser}
                  tone="loss"
                  onOpen={() => setPicked(topLoser?.scrip ?? null)}
                />
              </div>
            )}
          </Panel>

          {data && data.sectors.length > 0 ? (
            <Panel as="section">
              <h2 className="mb-3 font-display text-base font-semibold">Sector allocation</h2>
              <ul className="space-y-2">
                {data.sectors.slice(0, 6).map((s) => (
                  <li key={s.sector} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate font-medium">{s.sector}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.min(100, s.weight)}%` }}
                      />
                    </div>
                    <span className="num w-14 text-right text-muted-foreground">
                      {s.weight.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}

      <Panel as="section">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Issues</h2>
          <Link
            to="/ipo"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Apply <ArrowUpRight className="size-3" />
          </Link>
        </div>
        {issues.isLoading ? (
          <SkeletonCards count={2} />
        ) : issues.isError ? (
          <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
        ) : openIssues.length === 0 && upcomingIssues.length === 0 ? (
          <EmptyBlock
            title="No open issues"
            description="New IPO, FPO and right share offerings you can apply for will show up here."
            icon={<Rocket className="size-6" />}
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {openIssues.map((issue) => (
              <li
                key={issue.companyShareId}
                className="min-w-0 rounded-xl border border-border/60 bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={issue.companyName ?? ""}>
                      {issue.companyName}
                    </p>
                    <p
                      className="num truncate text-xs text-muted-foreground"
                      title={`${issue.scrip ?? ""} · ${issue.shareTypeName ?? ""} ${issue.shareGroupName ?? ""}`}
                    >
                      {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                    {issue.statusName ?? "Open"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Closes {formatDate(issue.issueCloseDate)}
                </p>
              </li>
            ))}
            {upcomingIssues.map((item) => (
              <li key={item.key} className="min-w-0">
                <Link
                  to="/ipo"
                  search={{ tab: "calendar" }}
                  title={`${item.title} - view in IPO calendar`}
                  className="block rounded-xl border border-dashed border-border/60 bg-surface/60 p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={item.title}>
                        {item.title}
                      </p>
                      <p
                        className="num mt-0.5 truncate text-xs text-muted-foreground"
                        title={item.sub}
                      >
                        {item.sub}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                      Upcoming
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
        open={chartOpen}
        onOpenChange={setChartOpen}
        title="NEPSE Index"
        subtitle={
          nepsePoints.length >= 2
            ? `Today's session, ${chartTimeLabel(nepsePoints[0]!.time)}–${chartTimeLabel(
                nepsePoints[nepsePoints.length - 1]!.time,
              )} NPT`
            : "Today's session (intraday)"
        }
        ranges={[{ key: "today", label: "Today", points: nepsePoints }]}
        formatValue={(v) => formatNpr(v, { compact: true })}
        formatIntradayLabel={chartTimeLabel}
        formatDailyLabel={chartTimeLabel}
      />
    </div>
  );
}
