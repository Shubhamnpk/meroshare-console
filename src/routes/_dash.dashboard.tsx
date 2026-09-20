import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  ChartLine,
  CheckCircle2,
  RefreshCw,
  Rocket,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { StatCard, DeltaPill } from "@/components/stat-card";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { useWatchlist } from "@/lib/watchlist";
import { SwipeableCards } from "@/components/swipeable-cards";
import { ErrorBlock, LoadingBlock, EmptyBlock, SkeletonCards } from "@/components/states";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { ChartModal, chartTimeLabel } from "@/components/market/chart-modal";
import { Sparkline } from "@/components/market/sparkline";
import { RangeBar } from "@/components/market/range-bar";
import {
  applicableIssuesQuery,
  applicationReportsQuery,
  currentIssuesQuery,
  dividendsQuery,
  enrichedPortfolioQuery,
  holdingSymbolsQuery,
  indexGraphQuery,
  investmentSummaryQuery,
  ipoArchiveQuery,
  marketSnapshotQuery,
} from "@/lib/queries";
import {
  daysUntil,
  formatDate,
  formatNpr,
  formatNumber,
  formatPercent,
  formatQty,
} from "@/lib/format";
import { parseFeedDate } from "@/lib/nepali-dates";
import { upcomingMerged } from "@/lib/ipo/status";
import { ogImage, canonicalLink } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { canonicalSymbol } from "@/lib/nepse/aliases";
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
  const now = new Date();
  const portfolio = useQuery(enrichedPortfolioQuery());
  const issues = useQuery(applicableIssuesQuery());
  const calendar = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const market = useQuery(marketSnapshotQuery());
  const nepseGraph = useQuery(indexGraphQuery("NEPSE"));
  const investment = useQuery(investmentSummaryQuery());
  const dividends = useQuery(dividendsQuery());
  const reports = useQuery(applicationReportsQuery());
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedTab, setPickedTab] = useState<string | null>(null);
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

  const holdingSymbols = useQuery(holdingSymbolsQuery());
  // Dividend shortcut: mirrors calendar's canonical-symbol match. Window is
  // -3 days .. +7 days around today (your ask); book-closes and announces both
  // count. Keeps the strip calm and timely instead of surfacing far-future FYs.
  const upcomingClosures = (() => {
    const fromPortfolio = holdings.map((h) => canonicalSymbol(h.scrip));
    const fromSymbols = (holdingSymbols.data ?? []).map((s) => canonicalSymbol(s));
    const held = new Set([...fromPortfolio, ...fromSymbols].filter(Boolean));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 86_400_000;
    const from = today - 3 * DAY;
    const to = today + 7 * DAY;
    if (held.size === 0) return [];
    type Clos = {
      symbol: string;
      canon: string;
      date: Date;
      bonus: number;
      cash: number;
      fy: string | null;
      kind: "bookclose" | "announce";
    };
    const all: Clos[] = [];
    for (const d of dividends.data ?? []) {
      const symbol = String(d.symbol ?? "")
        .trim()
        .toUpperCase();
      if (!symbol) continue;
      const canon = canonicalSymbol(symbol);
      if (!held.has(canon)) continue;
      const bonus = Number(d.bonusShare ?? 0) || 0;
      const cash = Number(d.cashDividend ?? 0) || 0;
      const fy = String(d.fiscalYear ?? "").trim() || null;
      const book = parseFeedDate(d.bookCloseDate);
      const ann = parseFeedDate(d.announcementDate);
      if (book) all.push({ symbol, canon, date: book, bonus, cash, fy, kind: "bookclose" });
      if (ann) all.push({ symbol, canon, date: ann, bonus, cash, fy, kind: "announce" });
    }
    const seen = new Set<string>();
    const deduped = all.filter((r) => {
      const k = `${r.symbol}-${r.kind}-${r.date.getTime()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const inWindow = deduped
      .filter((r) => {
        const t = r.date.getTime();
        return t >= from && t <= to;
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (inWindow.length === 0) return [];
    // Prefer book-close over announce for same symbol on same window.
    const bySym = new Map<string, Clos>();
    for (const r of inWindow) {
      const cur = bySym.get(r.symbol);
      if (!cur || (cur.kind === "announce" && r.kind === "bookclose")) bySym.set(r.symbol, r);
    }
    return [...bySym.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3);
  })();

  // Upcoming below open: same grouping as /ipo calendar so closed never shows as upcoming.
  const upcomingIssues = (() => {
    const { cdscUpcoming, archUpcoming } = upcomingMerged(
      openIssues,
      calendar.data ?? [],
      archive.data?.upcoming ?? [],
    );
    return [
      ...cdscUpcoming.map((i) => ({
        key: `cdsc-${i.companyShareId}`,
        title: i.companyName || i.scrip || "",
        sub: `${i.scrip ?? ""} · opens ${formatDate(i.issueOpenDate)}`.trim(),
      })),
      ...archUpcoming.map((row, n) => ({
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
    holdingSymbols.isFetching ||
    issues.isFetching ||
    market.isFetching ||
    nepseGraph.isFetching ||
    investment.isFetching ||
    dividends.isFetching ||
    reports.isFetching;

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
    void holdingSymbols.refetch();
    void issues.refetch();
    void market.refetch();
    void nepseGraph.refetch();
    void investment.refetch();
    void dividends.refetch();
    void reports.refetch();
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
            className="group relative hidden w-full overflow-hidden text-left transition-colors sm:block"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                  <ChartLine className="size-3.5 text-primary" /> NEPSE Index
                  <span
                    title={
                      market.data?.status.isOpen
                        ? "Live trading — NEPSE is open today"
                        : (() => {
                            const raw = nepse?.generatedTime;
                            if (!raw) return "Market is closed — no session data";
                            const d = new Date(String(raw).replace(" ", "T"));
                            const dateStr = formatDate(raw);
                            if (Number.isNaN(d.getTime())) return `Last session: ${dateStr} — market is closed`;
                            const today0 = new Date();
                            today0.setHours(0, 0, 0, 0);
                            const gen0 = new Date(d);
                            gen0.setHours(0, 0, 0, 0);
                            const diff = Math.round((today0.getTime() - gen0.getTime()) / 86_400_000);
                            const rel = diff <= 0 ? "today" : diff === 1 ? "1 day ago" : `${diff} days ago`;
                            return `Last session: ${dateStr} · ${rel} — market is closed`;
                          })()
                    }
                  >
                    ·{" "}
                    {(() => {
                      if (!market.data) return "—";
                      if (market.data.status.isOpen) return "today";
                      const raw = nepse?.generatedTime;
                      if (!raw) return "closed";
                      const d = new Date(String(raw).replace(" ", "T"));
                      const dateStr = formatDate(raw);
                      if (Number.isNaN(d.getTime())) return `${dateStr} · closed`;
                      const today0 = new Date();
                      today0.setHours(0, 0, 0, 0);
                      const gen0 = new Date(d);
                      gen0.setHours(0, 0, 0, 0);
                      const diff = Math.round((today0.getTime() - gen0.getTime()) / 86_400_000);
                      if (diff <= 0) return `${dateStr} · closed`;
                      if (diff === 1) return `1 day ago · ${dateStr}`;
                      return `${diff} days ago · ${dateStr}`;
                    })()}
                  </span>
                </p>
                {nepse ? (
                  <p className="num mt-2 flex flex-wrap items-center gap-2 text-3xl font-semibold">
                    {nepse.close != null ? nepse.close.toLocaleString("en-IN") : "-"}
                    <DeltaPill value={nepse.percentChange}>
                      {formatPercent(nepse.percentChange)}
                    </DeltaPill>
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                )}
                {nepse &&
                nepse.close != null &&
                (nepse.fiftyTwoWeekLow ?? 0) > 0 &&
                (nepse.fiftyTwoWeekHigh ?? 0) > (nepse.fiftyTwoWeekLow ?? 0) ? (
                  <div className="mt-2 max-w-72">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        52-week range
                      </p>
                      <p className="flex items-center gap-1 text-[0.68rem] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Click for the full chart <ArrowUpRight className="size-3" />
                      </p>
                    </div>
                    <RangeBar
                      low={nepse.fiftyTwoWeekLow ?? 0}
                      high={nepse.fiftyTwoWeekHigh ?? 0}
                      value={Math.min(
                        Math.max(nepse.close, nepse.fiftyTwoWeekLow ?? 0),
                        nepse.fiftyTwoWeekHigh ?? 0,
                      )}
                      format={(v) => formatNpr(v)}
                      tone={nepse.percentChange < 0 ? "loss" : "gain"}
                      showValueLabel={false}
                      colorByPosition
                    />
                  </div>
                ) : null}
              </div>
              {nepsePoints.length >= 2 ? (
                <div className="h-16 w-40 sm:w-64">
                  <Sparkline points={nepsePoints} showLastDot />
                </div>
              ) : null}
            </div>
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
                      onClick={() => {
                        setPicked(symbol);
                        setPickedTab(null);
                      }}
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
                  onOpen={() => {
                    setPicked(topGainer?.scrip ?? null);
                    setPickedTab(null);
                  }}
                />
                <MoverCard
                  label="Top loser"
                  holding={topLoser}
                  tone="loss"
                  onOpen={() => {
                    setPicked(topLoser?.scrip ?? null);
                    setPickedTab(null);
                  }}
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <CalendarDays className="size-4 text-primary" /> Dividend calendar
          </h2>
          <Link
            to="/calendar"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Open calendar <ArrowUpRight className="size-3" />
          </Link>
        </div>
        {dividends.isLoading ? (
          <SkeletonCards count={1} />
        ) : upcomingClosures.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming book closures for your holdings. Announced dividends land here: flip to{" "}
            <span className="font-medium text-foreground">All scrips</span> in the calendar to
            browse the feed.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-3">
            {upcomingClosures.map((c) => {
              const dLeft = daysUntil(c.date);
              const isAnnounce = c.kind === "announce";
              const urgent = !isAnnounce && dLeft !== null && dLeft >= 0 && dLeft <= 3;
              const chip = (() => {
                if (dLeft === null) return isAnnounce ? "Announced" : null;
                if (isAnnounce) {
                  if (dLeft < 0) return `Announced ${Math.abs(dLeft)}d ago`;
                  if (dLeft === 0) return "Announced today";
                  if (dLeft === 1) return "Announces tomorrow";
                  return `Announces in ${dLeft}d`;
                }
                if (dLeft < 0) return `${Math.abs(dLeft)}d ago`;
                if (dLeft === 0) return "Closes today";
                if (dLeft === 1) return "1 day left";
                return `${dLeft} days left`;
              })();
              return (
                <li key={`${c.symbol}-${c.kind}-${(c.date as Date).getTime()}`} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(c.symbol);
                      setPickedTab("dividend");
                    }}
                    title={`${c.symbol} dividends: tap to see estimate`}
                    className="flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-surface p-3 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="flex items-center gap-2">
                      <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {c.symbol.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {c.symbol}
                      </span>
                      {chip ? (
                        <span
                          className={
                            isAnnounce
                              ? "num shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-600 dark:text-amber-400"
                              : urgent
                                ? "num shrink-0 rounded-full bg-loss/15 px-2 py-0.5 text-[0.68rem] font-semibold text-loss"
                                : dLeft !== null && dLeft < 0
                                  ? "num shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground"
                                  : "num shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary"
                          }
                        >
                          {chip}
                        </span>
                      ) : null}
                    </span>
                    <span className="num truncate text-xs text-muted-foreground">
                      {[
                        c.bonus > 0 ? `${c.bonus}% bonus` : null,
                        c.cash > 0 ? `${c.cash}% cash` : null,
                      ]
                        .filter(Boolean)
                        .join(" + ") || "Dividend"}
                      {c.fy ? ` · FY ${c.fy}` : ""} · {isAnnounce ? "announced" : "closes"}{" "}
                      {formatDate(c.date)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel as="section" className="min-w-0 overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Issues</h2>
          <Link
            to="/ipo"
            search={{ tab: "apply" }}
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
          <div className="space-y-4">
            {openIssues.length > 0 ? (
              <ul className="grid min-w-0 gap-2 overflow-hidden md:grid-cols-2">
                {openIssues.map((issue) => {
                  const applied = (reports.data ?? []).some(
                    (r) => r.companyShareId === issue.companyShareId,
                  );
                  const dLeft = daysUntil(issue.issueCloseDate);
                  const urgent = dLeft !== null && dLeft >= 0 && dLeft <= 3;
                  const chip =
                    dLeft === null
                      ? (issue.statusName ?? "Open")
                      : dLeft < 0
                        ? `Closed ${formatDate(issue.issueCloseDate)}`
                        : dLeft === 0
                          ? "Closes today"
                          : dLeft === 1
                            ? "1 day left"
                            : `${dLeft} days left`;
                  const typeLabel = (() => {
                    const hay = `${issue.shareTypeName ?? ""} ${issue.shareGroupName ?? ""}`;
                    if (/right/i.test(hay)) return "Right";
                    if (/fpo/i.test(hay)) return "FPO";
                    if (/\bipo\b/i.test(hay)) return "IPO";
                    if (/mutual|fund/i.test(hay)) return "Fund";
                    if (/debenture|bond/i.test(hay)) return "Bond";
                    if (/auction/i.test(hay)) return "Auction";
                    return null;
                  })();
                  return (
                    <li
                      key={issue.companyShareId}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate({ to: "/ipo", search: { tab: "apply" } })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate({ to: "/ipo", search: { tab: "apply" } });
                        }
                      }}
                      className="flex min-w-0 w-full cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-surface p-3 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-3"
                    >
                      <div className="flex min-w-0 w-full flex-1 items-center gap-3 overflow-hidden">
                        <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {String(issue.companyName ?? issue.scrip ?? "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase() || "?"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="min-w-0 flex-1 truncate text-sm font-semibold"
                              title={issue.companyName ?? ""}
                            >
                              {issue.companyName}
                            </span>
                            {typeLabel ? (
                              <span className="num shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
                                {typeLabel}
                              </span>
                            ) : null}
                            <span
                              className={
                                dLeft !== null && dLeft < 0
                                  ? "num shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground"
                                  : urgent
                                    ? "num shrink-0 rounded-full bg-loss/15 px-2 py-0.5 text-[0.62rem] font-semibold text-loss"
                                    : "num shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.62rem] font-semibold text-primary"
                              }
                            >
                              {chip}
                            </span>
                            {applied ? (
                              <span className="num inline-flex shrink-0 items-center gap-1 rounded-full bg-gain/15 px-2 py-0.5 text-[0.62rem] font-semibold text-gain">
                                <CheckCircle2 className="size-3" /> Applied
                              </span>
                            ) : null}
                          </span>
                          <span className="num mt-1 block truncate text-[0.70rem] leading-none text-muted-foreground">
                            {issue.scrip}
                            {issue.shareTypeName || issue.shareGroupName
                              ? ` · ${[issue.shareTypeName, issue.shareGroupName].filter(Boolean).join(" ")}`
                              : ""}{" "}
                            · {formatDate(issue.issueOpenDate)} → {formatDate(issue.issueCloseDate)}
                          </span>
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant={applied ? "outline" : "default"}
                        className="h-7 w-full shrink-0 px-3 text-xs sm:ml-2 sm:w-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/ipo", search: { tab: "apply" } });
                        }}
                      >
                        {applied ? "Manage" : "Apply"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {upcomingIssues.length > 0 ? (
              <div className="min-w-0 space-y-2 overflow-hidden">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Upcoming
                </h3>
                <ul className="grid min-w-0 gap-2 overflow-hidden md:grid-cols-2">
                  {upcomingIssues.map((item) => (
                    <li
                      key={item.key}
                      role="button"
                      tabIndex={0}
                      title={`${item.title} - view in IPO calendar`}
                      onClick={() => navigate({ to: "/ipo", search: { tab: "calendar" } })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate({ to: "/ipo", search: { tab: "calendar" } });
                        }
                      }}
                      className="block cursor-pointer rounded-xl border border-dashed border-border/60 bg-surface/60 p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <ScripSheet
        symbol={picked}
        initialTab={pickedTab}
        onOpenChange={(open) => {
          if (!open) {
            setPicked(null);
            setPickedTab(null);
          }
        }}
      />

      <WatchlistPanel
        open={watchlistOpen}
        onOpenChange={setWatchlistOpen}
        onPick={(symbol) => {
          setWatchlistOpen(false);
          setPicked(symbol);
          setPickedTab(null);
        }}
      />

      <ChartModal
        open={chartOpen}
        onOpenChange={setChartOpen}
        title="NEPSE Index"
        subtitle={
          nepsePoints.length >= 2
            ? `Today's session, ${chartTimeLabel(nepsePoints[0]!.time)}-${chartTimeLabel(
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
