import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, FileText, Info, Maximize2, Star, StarOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { DeltaPill } from "@/components/stat-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AreaChart } from "@/components/market/area-chart";
import {
  ChartModal,
  buildScripRanges,
  chartDayLabel,
  chartTimeLabel,
} from "@/components/market/chart-modal";
import {
  dividendsQuery,
  enrichedPortfolioQuery,
  exchangeMessagesQuery,
  marketSnapshotQuery,
  scripDetailQuery,
  scripFinancialsQuery,
  transactionsQuery,
} from "@/lib/queries";
import { formatDate, formatNpr, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";
import type { FinancialReport, PricePoint } from "@/lib/nepse/types";

function TermInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Learn more"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 whitespace-normal text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function Delta({
  current,
  previous,
  compact = false,
}: {
  current: number | null;
  previous: number | null;
  compact?: boolean;
}) {
  if (current == null || previous == null || previous === 0) return null;
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  return (
    <span
      className={cn(
        "num ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold",
        diff > 0 ? "text-gain" : diff < 0 ? "text-loss" : "text-muted-foreground",
      )}
      title={`Full: ${formatNpr(current)}  ·  Previous: ${formatNpr(previous)}`}
    >
      {diff > 0 ? "▲" : diff < 0 ? "▼" : "◆"} {formatNpr(Math.abs(diff), { compact })}
      <span className="whitespace-nowrap">({formatPercent(pct)})</span>
    </span>
  );
}

function MetricDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || previous === 0) return null;
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "ml-1 inline-flex cursor-help font-semibold",
            diff > 0 ? "text-gain" : diff < 0 ? "text-loss" : "text-muted-foreground",
          )}
          aria-label={`${formatPercent(pct)} vs previous report`}
        >
          {diff > 0 ? "▲" : diff < 0 ? "▼" : "◆"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <span className="num">{formatPercent(pct)} vs previous report</span>
      </TooltipContent>
    </Tooltip>
  );
}

function FinancialSummary({
  report,
  previous,
  holdings,
}: {
  report: FinancialReport;
  previous: FinancialReport | null;
  holdings: number | null;
}) {
  const estProfit = report.eps != null && holdings != null ? report.eps * holdings : null;
  return (
    <TooltipProvider delayDuration={150}>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Period</dt>
          <dd className="num font-medium">
            {report.quarter ? `${report.quarter} · ` : ""}
            {report.fy ?? "—"}
            {report.fyNepali ? (
              <span className="ml-1 font-normal text-muted-foreground">({report.fyNepali})</span>
            ) : null}
            {previous ? (
              <span className="ml-2 font-normal text-muted-foreground">
                vs {previous.quarter ? `${previous.quarter} · ` : ""}
                {previous.fy ?? "—"}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Report type</dt>
          <dd className="font-medium">{report.type}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Earnings per share
            <TermInfo text="Earnings per share (EPS) = net profit ÷ total outstanding shares. It shows how much profit the company earned for each share in the reporting period." />
          </dt>
          <dd className="num font-medium">
            {report.eps != null ? formatNpr(report.eps) : "—"}
            <Delta current={report.eps} previous={previous?.eps ?? null} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            P/E ratio
            <TermInfo text="Price-to-earnings ratio = market price ÷ earnings per share. A lower P/E often means the stock is cheaper relative to its earnings, but compare it with industry peers." />
          </dt>
          <dd className="num font-medium">
            {report.pe != null ? formatNpr(report.pe) : "—"}
            <Delta current={report.pe} previous={previous?.pe ?? null} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Net profit
            <TermInfo text="Net profit is the company's total earnings after all expenses, interest and taxes for the reporting period." />
          </dt>
          <dd
            className="num font-medium"
            title={report.profit != null ? formatNpr(report.profit) : undefined}
          >
            {report.profit != null ? formatNpr(report.profit, { compact: true }) : "—"}
            {report.profit != null && previous?.profit != null ? (
              <Delta current={report.profit} previous={previous.profit} compact />
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Net worth / share
            <TermInfo text="Net worth per share = total shareholder equity ÷ total outstanding shares. It is also called book value and indicates the company's net asset value per share." />
          </dt>
          <dd className="num font-medium">
            {report.netWorthPerShare != null ? formatNpr(report.netWorthPerShare) : "—"}
            <Delta
              current={report.netWorthPerShare}
              previous={previous?.netWorthPerShare ?? null}
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Paid-up capital
            <TermInfo text="Paid-up capital is the portion of issued share capital that shareholders have actually paid for. It reflects the company's base equity from shares." />
          </dt>
          <dd
            className="num font-medium"
            title={report.paidUpCapital != null ? formatNpr(report.paidUpCapital) : undefined}
          >
            {report.paidUpCapital != null
              ? formatNpr(report.paidUpCapital, { compact: true })
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Submitted</dt>
          <dd className="num font-medium">
            {report.submittedDate ? formatDate(report.submittedDate) : "—"}
          </dd>
        </div>
        {estProfit != null ? (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Earnings implied for your holding</dt>
            <dd className="num font-medium text-gain">
              ≈ {formatNpr(estProfit)} across {formatQty(holdings)} units
              <span className="font-normal text-muted-foreground"> (EPS × units)</span>
            </dd>
          </div>
        ) : null}
      </dl>
    </TooltipProvider>
  );
}

function ReportGroups({ reports }: { reports: FinancialReport[] }) {
  const groups = useMemo(() => {
    const byFy = new Map<string, FinancialReport[]>();
    for (const r of reports) {
      const fy = r.fy ?? "Unknown";
      const list = byFy.get(fy);
      if (list) list.push(r);
      else byFy.set(fy, [r]);
    }
    return Array.from(byFy.entries()).sort((a, b) => (a[0] > b[0] ? -1 : 1));
  }, [reports]);

  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Reports</dt>
          <dd className="num font-medium">{reports.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fiscal years</dt>
          <dd className="num font-medium">{groups.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latest EPS</dt>
          <dd className="num font-medium">
            {reports[0]?.eps != null ? formatNpr(reports[0].eps) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Latest P/E</dt>
          <dd className="num font-medium">
            {reports[0]?.pe != null ? formatNpr(reports[0].pe) : "—"}
          </dd>
        </div>
      </dl>

      <Accordion type="multiple" className="mt-4 w-full">
        {groups.map(([fy, list], i) => {
          const latest = list[0];
          const prevEps = groups[i + 1]?.[1]?.[0]?.eps ?? null;
          const diff = latest?.eps != null && prevEps != null ? latest.eps - prevEps : null;
          const diffPct = diff != null && prevEps != null ? (diff / Math.abs(prevEps)) * 100 : null;
          const prevProfit = groups[i + 1]?.[1]?.[0]?.profit ?? null;
          const profitDiff =
            latest?.profit != null && prevProfit != null ? latest.profit - prevProfit : null;
          const profitDiffPct =
            profitDiff != null && prevProfit != null
              ? (profitDiff / Math.abs(prevProfit)) * 100
              : null;
          return (
            <AccordionItem key={fy} value={fy} className="rounded-xl border-border/60">
              <AccordionTrigger className="rounded-xl px-3 py-2.5 text-xs hover:no-underline [&[data-state=open]]:rounded-b-none">
                <span className="flex w-full items-center justify-between gap-3 pr-1">
                  <span className="font-display text-sm font-semibold">{fy}</span>
                  <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                    {latest?.eps != null ? (
                      <span className="num">
                        EPS {formatNpr(latest.eps)}
                        {diff != null ? (
                          <span
                            className={cn(
                              "ml-1 font-semibold",
                              diff > 0 ? "text-gain" : diff < 0 ? "text-loss" : "",
                            )}
                          >
                            ({diff > 0 ? "▲" : diff < 0 ? "▼" : "◆"}
                            {formatPercent(diffPct ?? 0)})
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {latest?.profit != null ? (
                      <span className="num">
                        Profit {formatNpr(latest.profit, { compact: true })}
                        {profitDiff != null ? (
                          <span
                            className={cn(
                              "ml-1 font-semibold",
                              profitDiff > 0 ? "text-gain" : profitDiff < 0 ? "text-loss" : "",
                            )}
                          >
                            ({profitDiff > 0 ? "▲" : profitDiff < 0 ? "▼" : "◆"}
                            {formatPercent(profitDiffPct ?? 0)})
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-surface px-2 py-0.5 font-medium">
                      {list.length} {list.length === 1 ? "report" : "reports"}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-xs">
                <TooltipProvider delayDuration={150}>
                  <ul className="space-y-1.5 px-1 pb-2">
                    {list.map((r, ri) => {
                      const prev = list[ri + 1] ?? groups[i + 1]?.[1]?.[0] ?? null;
                      return (
                        <li
                          key={`${r.type}-${r.quarter ?? r.fy ?? ri}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {r.type}
                              {r.quarter ? (
                                <span className="num ml-1.5 font-normal text-muted-foreground">
                                  {r.quarter}
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                              <span className="num">
                                EPS {r.eps != null ? formatNpr(r.eps) : "—"}
                                <MetricDelta current={r.eps} previous={prev?.eps ?? null} />
                              </span>
                              <span className="num">
                                P/E {r.pe != null ? formatNpr(r.pe) : "—"}
                                <MetricDelta current={r.pe} previous={prev?.pe ?? null} />
                              </span>
                              <span className="num">
                                NWPS{" "}
                                {r.netWorthPerShare != null ? formatNpr(r.netWorthPerShare) : "—"}
                                <MetricDelta
                                  current={r.netWorthPerShare}
                                  previous={prev?.netWorthPerShare ?? null}
                                />
                              </span>
                              <span className="num">
                                Profit{" "}
                                {r.profit != null ? formatNpr(r.profit, { compact: true }) : "—"}
                                <MetricDelta current={r.profit} previous={prev?.profit ?? null} />
                              </span>
                            </div>
                          </div>
                          {r.documentUrl ? (
                            <a
                              href={r.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-lg border border-border/70 px-2 py-1 font-medium text-primary transition-colors hover:bg-primary/10"
                            >
                              Report
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </TooltipProvider>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export function ScripSheet({
  symbol,
  onOpenChange,
}: {
  symbol: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const snapshot = useQuery(marketSnapshotQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());
  const detail = useQuery(scripDetailQuery(symbol));
  const financials = useQuery(scripFinancialsQuery(symbol));
  const dividends = useQuery({ ...dividendsQuery(), enabled: Boolean(symbol) });
  const news = useQuery(exchangeMessagesQuery(Boolean(symbol)));
  const watchlist = useWatchlist();
  const [tab, setTab] = useState("overview");
  const [rangeKey, setRangeKey] = useState<string>("1D");
  const [chartOpen, setChartOpen] = useState(false);

  useEffect(() => {
    setRangeKey("1D");
  }, [symbol]);

  const upper = symbol?.toUpperCase() ?? "";
  const price = snapshot.data?.prices.find((p) => p.symbol === upper) ?? null;
  const holding = portfolio.data?.holdings.find((h) => h.scrip === upper) ?? null;
  const watched = upper ? watchlist.has(upper) : false;
  const myHistory = useQuery({
    ...transactionsQuery(upper),
    enabled: Boolean(symbol) && Boolean(holding),
  });

  const overview = detail.data?.overview ?? null;
  const dividend = detail.data?.dividend ?? null;

  const yearlyDividends = useMemo(
    () =>
      (dividends.data ?? [])
        .filter((d) => d.symbol === upper)
        .sort((a, b) => (b.announcementDate ?? "").localeCompare(a.announcementDate ?? "")),
    [dividends.data, upper],
  );

  const newsItems = useMemo(
    () =>
      (news.data ?? [])
        .filter(
          (m) => (m.symbol ?? "").toUpperCase() === upper || m.title.toUpperCase().includes(upper),
        )
        .slice(0, 12),
    [news.data, upper],
  );

  const historyPoints: PricePoint[] = useMemo(
    () =>
      (detail.data?.history ?? [])
        .map((b) => ({
          time: new Date(b.date).getTime() / 1000,
          value: b.close,
        }))
        .sort((a, b) => a.time - b.time),
    [detail.data],
  );
  const intradayPoints: PricePoint[] = useMemo(() => detail.data?.intraday ?? [], [detail.data]);

  const ranges = useMemo(
    () => buildScripRanges(intradayPoints, historyPoints),
    [intradayPoints, historyPoints],
  );
  const activeRange = ranges.find((r) => r.key === rangeKey) ?? ranges[0];

  const stats: { label: string; value: string }[] = price
    ? [
        { label: "Previous close", value: formatNpr(price.previousClose) },
        { label: "Day high", value: price.high ? formatNpr(price.high) : "—" },
        { label: "Day low", value: price.low ? formatNpr(price.low) : "—" },
        { label: "Volume", value: formatQty(price.volume) },
        { label: "Turnover", value: formatNpr(price.turnover, { compact: true }) },
        { label: "Trades", value: formatQty(price.trades) },
        ...(price.fiftyTwoWeekHigh
          ? [
              { label: "52-week high", value: formatNpr(price.fiftyTwoWeekHigh) },
              {
                label: "52-week low",
                value: price.fiftyTwoWeekLow ? formatNpr(price.fiftyTwoWeekLow) : "—",
              },
            ]
          : []),
      ]
    : [];

  const companyRows: { label: string; value: string }[] = overview
    ? [
        { label: "Sector", value: overview.sector ?? "—" },
        { label: "Instrument", value: overview.instrumentType ?? "—" },
        { label: "ISIN", value: overview.isin ?? "—" },
        {
          label: "Face value",
          value: overview.faceValue != null ? formatNpr(overview.faceValue) : "—",
        },
        {
          label: "Listed since",
          value: overview.listingDate ? formatDate(overview.listingDate) : "—",
        },
        {
          label: "Paid-up capital",
          value:
            overview.paidUpCapital != null
              ? formatNpr(overview.paidUpCapital, { compact: true })
              : "—",
        },
        {
          label: "Market cap",
          value:
            overview.marketCapitalization != null
              ? formatNpr(overview.marketCapitalization, { compact: true })
              : "—",
        },
        {
          label: "Public",
          value:
            overview.publicPercentage != null ? `${overview.publicPercentage.toFixed(2)}%` : "—",
        },
        {
          label: "Promoter",
          value:
            overview.promoterPercentage != null
              ? `${overview.promoterPercentage.toFixed(2)}%`
              : "—",
        },
        {
          label: "Listed shares",
          value: overview.totalShares != null ? formatQty(overview.totalShares) : "—",
        },
        { label: "Contact", value: overview.contactPerson ?? "—" },
      ]
    : [];

  return (
    <Sheet open={Boolean(symbol)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="items-start px-4 pb-0 pt-6 text-left">
          <SheetTitle className="font-display text-xl">{upper || "Scrip"}</SheetTitle>
          {price || overview ? (
            <SheetDescription className="text-left">
              {overview?.name ?? price?.name}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          {price ? (
            <>
              <div>
                <div className="mt-2 flex items-end gap-3">
                  <p className="num font-display text-3xl font-semibold">{formatNpr(price.ltp)}</p>
                  <DeltaPill value={price.percentChange}>
                    {formatPercent(price.percentChange)}
                  </DeltaPill>
                </div>
                {overview?.sector ? (
                  <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                    {overview.sector}
                  </span>
                ) : null}
              </div>

              <Button
                variant={watched ? "secondary" : "outline"}
                className="w-full"
                onClick={() => watchlist.toggle(upper)}
              >
                {watched ? <StarOff className="size-4" /> : <Star className="size-4" />}
                {watched ? "Remove from watchlist" : "Add to watchlist"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No live market data for this scrip right now.
            </p>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {financials.data ? <TabsTrigger value="financials">Financials</TabsTrigger> : null}
              {dividend || yearlyDividends.length > 0 ? (
                <TabsTrigger value="dividend">Dividend</TabsTrigger>
              ) : null}
              {holding ? <TabsTrigger value="history">History</TabsTrigger> : null}
              {newsItems.length > 0 ? <TabsTrigger value="news">News</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-semibold">Price history</h3>
                  {ranges.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setChartOpen(true)}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Maximize2 className="size-3.5" /> Enlarge
                    </button>
                  ) : null}
                </div>

                {ranges.length > 0 ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {ranges.map((range) => (
                        <button
                          key={range.key}
                          type="button"
                          onClick={() => setRangeKey(range.key)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            activeRange?.key === range.key
                              ? "border-primary/50 bg-primary/15 text-primary"
                              : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                          )}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <AreaChart
                        points={activeRange?.points ?? []}
                        height={200}
                        formatValue={(v) => formatNpr(v)}
                        formatLabel={(t) =>
                          activeRange?.key === "1D" ? chartTimeLabel(t) : chartDayLabel(t)
                        }
                      />
                    </div>
                    <p className="mt-2 text-[0.68rem] text-muted-foreground">
                      {activeRange?.key === "1D"
                        ? `Today's intraday session (${intradayPoints.length} ticks). `
                        : `Daily closes from the YONEPSE LTP archive, ${activeRange?.label ?? ""}. `}
                      Hover over the chart to inspect each point.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                    No price history in the feed for this scrip yet.
                  </p>
                )}
              </div>

              {stats.length > 0 ? (
                <dl className="grid grid-cols-3 gap-3">
                  {stats.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl border border-border/60 bg-surface px-3 py-2"
                    >
                      <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd className="num text-sm font-medium">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {companyRows.length > 0 ? (
                <section className="rounded-2xl border border-border/70 bg-card p-4">
                  <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
                    <Building2 className="size-4 text-primary" /> Company overview
                  </h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {companyRows.map((row) => (
                      <div key={row.label}>
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className="num font-medium">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {overview?.website || overview?.email ? (
                    <div className="mt-3 space-y-1 border-t border-border/60 pt-2.5 text-xs">
                      {overview.website ? (
                        <p>
                          <a
                            href={`https://${overview.website.replace(/^https?:\/\//, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                          >
                            {overview.website}
                          </a>
                        </p>
                      ) : null}
                      {overview.email ? (
                        <p className="num text-muted-foreground">{overview.email}</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

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
                        <DeltaPill value={holding.dayChange}>
                          {formatNpr(holding.dayChange)}
                        </DeltaPill>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Prev close value</dt>
                      <dd className="num font-medium">{formatNpr(holding.previousValue)}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="financials" className="space-y-4">
              <section className="rounded-2xl border border-border/70 bg-card p-4">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
                  <FileText className="size-4 text-primary" /> Latest financials
                </h3>
                {financials.data && financials.data.reports.length > 0 ? (
                  <FinancialSummary
                    report={financials.data.reports[0]!}
                    previous={financials.data.reports[1] ?? null}
                    holdings={holding ? holding.units : null}
                  />
                ) : (
                  <p className="mt-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                    No financial data in the feed for this scrip yet.
                  </p>
                )}
              </section>

              {financials.data && financials.data.reports.length > 1 ? (
                <section className="rounded-2xl border border-border/70 bg-card p-4">
                  <h3 className="font-display text-sm font-semibold">Report history</h3>
                  <ReportGroups reports={financials.data.reports} />
                  <p className="mt-3 text-[0.68rem] text-muted-foreground">
                    Figures are indicative from the YONEPSE community feed and follow NEPSE-reported
                    annual / quarterly results.
                  </p>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="dividend" className="space-y-3">
              {yearlyDividends.length > 0 ? (
                <section className="rounded-2xl border border-border/70 bg-card p-4">
                  <h3 className="font-display text-sm font-semibold">All announced dividends</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Announcements</dt>
                      <dd className="num font-medium">{yearlyDividends.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Fiscal years</dt>
                      <dd className="num font-medium">
                        {new Set(yearlyDividends.map((d) => d.fiscalYear ?? "")).size}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Latest</dt>
                      <dd className="num font-medium">
                        {dividend && dividend.totalDividend > 0
                          ? `${dividend.totalDividend}%`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Latest FY</dt>
                      <dd className="num font-medium">{dividend?.fiscalYear ?? "—"}</dd>
                    </div>
                  </dl>
                  <ul className="mt-3 space-y-1.5">
                    {yearlyDividends.slice(0, 12).map((d, i) => (
                      <li
                        key={`${d.fiscalYear ?? "fy"}-${d.announcementDate ?? i}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {d.fiscalYear ?? "—"}
                            {d.announcementDate ? (
                              <span className="num ml-1.5 font-normal text-muted-foreground">
                                · {formatDate(d.announcementDate)}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground">
                            {d.cashDividend > 0 ? `${d.cashDividend}% cash` : "cash —"}
                            {d.cashDividend > 0 && d.bonusShare > 0 ? " + " : " · "}
                            {d.bonusShare > 0 ? `${d.bonusShare}% bonus` : "bonus —"}
                          </p>
                        </div>
                        {holding ? (
                          <span className="num shrink-0 text-right font-medium">
                            {d.cashDividend > 0 ? (
                              <>
                                est.{" "}
                                {formatNpr(
                                  (d.cashDividend / 100) *
                                    (overview?.faceValue ?? 100) *
                                    holding.units,
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                            {d.bonusShare > 0 ? (
                              <span className="block text-[0.65rem] font-normal text-muted-foreground">
                                +{formatQty((d.bonusShare / 100) * holding.units)} bonus
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="num shrink-0 text-right font-semibold">
                            {d.totalDividend > 0 ? `${d.totalDividend}%` : "—"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {holding ? (
                    <p className="mt-3 rounded-xl bg-gain/10 px-3 py-2 text-xs text-muted-foreground">
                      On your {formatQty(holding.units)} units, the years shown total an estimated
                      cash{" "}
                      <span className="num font-semibold text-gain">
                        {formatNpr(
                          yearlyDividends.reduce(
                            (s, d) =>
                              s +
                              (d.cashDividend / 100) * (overview?.faceValue ?? 100) * holding.units,
                            0,
                          ),
                        )}
                      </span>
                      {yearlyDividends.some((d) => d.bonusShare > 0) ? (
                        <>
                          {" "}
                          and bonus{" "}
                          <span className="num font-semibold">
                            {formatQty(
                              Math.floor(
                                yearlyDividends.reduce(
                                  (s, d) => s + (d.bonusShare / 100) * holding.units,
                                  0,
                                ),
                              ),
                            )}
                          </span>{" "}
                          units
                        </>
                      ) : null}
                      .
                    </p>
                  ) : null}
                </section>
              ) : (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                  No dividend announcements in the feed for this scrip.
                </p>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-3">
              {myHistory.isLoading ? (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading your transactions…
                </p>
              ) : (myHistory.data?.items.length ?? 0) > 0 ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-surface">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="pl-3">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="pr-3 text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(myHistory.data?.items ?? []).map((t, i) => (
                          <TableRow key={`${String(t.transactionDate)}-${i}`}>
                            <TableCell className="num whitespace-nowrap pl-3 text-xs">
                              {formatDate(t.transactionDate)}
                            </TableCell>
                            <TableCell
                              className="max-w-44 truncate text-xs text-muted-foreground"
                              title={t.historyDescription}
                            >
                              {t.historyDescription ?? "—"}
                            </TableCell>
                            <TableCell className="num text-right text-xs text-gain">
                              {t.creditQuantity ? `+${formatQty(t.creditQuantity)}` : "—"}
                            </TableCell>
                            <TableCell className="num text-right text-xs text-loss">
                              {t.debitQuantity ? `-${formatQty(t.debitQuantity)}` : "—"}
                            </TableCell>
                            <TableCell className="num pr-3 text-right text-xs">
                              {formatQty(t.balanceAfterTransaction)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-[0.68rem] text-muted-foreground">
                    Your demat movement history for {upper}, straight from MeroShare (newest first).
                  </p>
                </>
              ) : (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
                  No transaction records for {upper} in your demat history.
                </p>
              )}
            </TabsContent>

            <TabsContent value="news" className="space-y-3">
              <ul className="space-y-2">
                {newsItems.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-border/60 bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold leading-snug">{item.title}</p>
                      {item.fileUrl ? (
                        <a
                          href={item.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                          aria-label="Open the NEPSE notice"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                    </div>
                    {item.body ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    {item.publishedAt ? (
                      <p className="num mt-2 text-[0.65rem] text-muted-foreground">
                        {formatDate(item.publishedAt)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-[0.68rem] text-muted-foreground">
                Exchange messages from NEPSE via the public YONEPSE feed.
              </p>
            </TabsContent>
          </Tabs>

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Market prices and company data come from a public NEPSE mirror and a community feed and
            are indicative only. MeroShare remains the source of truth for your holdings.
          </p>
        </div>
      </SheetContent>

      <ChartModal
        open={chartOpen}
        onOpenChange={setChartOpen}
        title={`${upper} · Price history`}
        subtitle={
          activeRange
            ? activeRange.key === "1D"
              ? "Today's intraday session"
              : `Daily closing prices, last ${activeRange.label}`
            : "Price history"
        }
        ranges={ranges}
        formatValue={(v) => formatNpr(v)}
        formatIntradayLabel={chartTimeLabel}
        formatDailyLabel={chartDayLabel}
      />
    </Sheet>
  );
}
