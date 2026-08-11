import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Maximize2, Star, StarOff } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  transactionsQuery,
} from "@/lib/queries";
import { formatDate, formatNpr, formatPercent, formatQty } from "@/lib/format";
import { useWatchlist } from "@/lib/watchlist";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/lib/nepse/types";

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
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{upper || "Scrip"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          {price ? (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{overview?.name ?? price.name}</p>
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
              <TabsTrigger value="chart">Price chart</TabsTrigger>
              <TabsTrigger value="dividend" disabled={!dividend && yearlyDividends.length === 0}>
                Dividend
              </TabsTrigger>
              <TabsTrigger value="history" disabled={!holding}>
                History
              </TabsTrigger>
              <TabsTrigger value="news" disabled={newsItems.length === 0}>
                News
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {stats.length > 0 ? (
                <dl className="grid grid-cols-2 gap-3">
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

            <TabsContent value="chart" className="space-y-4">
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
