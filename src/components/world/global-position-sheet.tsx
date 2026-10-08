import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeltaPill } from "@/components/stat-card";
import { Panel } from "@/components/ui/panel";
import { RangeBar } from "@/components/market/range-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart } from "@/components/market/area-chart";
import { worldCompanyQuery, worldHistoryQuery, worldQuoteQuery, worldSearchQuery } from "@/lib/queries";
import { deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import { deriveGlobalLots, sameNativeCurrency } from "@/lib/world/lots";
import type { WorldRange } from "@/lib/world/feed.server";
import { toNpr } from "@/lib/world/fx";
import {
  formatDate,
  formatHoldingTime,
  formatNpr,
  formatPreciseAge,
  formatTimeOfDay,
} from "@/lib/format";
import { formatDistanceToNow } from "date-fns";
import { daysBetween } from "@/lib/calc/fees";

function bigMoney(v: number | null, currency: string): string {
  if (v == null || !(v > 0)) return "—";
  const abs = Math.abs(v);
  const scaled =
    abs >= 1e12
      ? `${(v / 1e12).toFixed(2)}T`
      : abs >= 1e9
        ? `${(v / 1e9).toFixed(2)}B`
        : abs >= 1e6
          ? `${(v / 1e6).toFixed(2)}M`
          : v.toFixed(2);
  const c = currency.toUpperCase();
  if (c === "USD") return `$${scaled}`;
  if (c === "INR") return `₹${scaled}`;
  if (c === "EUR") return `€${scaled}`;
  if (currency === "GBX" || currency === "GBp") return `${scaled}p`;
  return currency ? `${scaled} ${currency}` : scaled;
}

function native(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "-";
  if (currency === "GBX" || currency === "GBp") return `${amount.toFixed(2)}p`;
  if (currency === "USD") return `$${amount.toFixed(2)}`;
  if (currency === "INR") return `₹${amount.toFixed(2)}`;
  if (currency === "EUR") return `€${amount.toFixed(2)}`;
  if (!currency) return String(Number(amount.toFixed(8)));
  return `${String(Number(amount.toFixed(2)))} ${currency}`;
}

/**
 * Detail sheet for one foreign holding, in the same slide-over chrome as
 * the stock sheet: live position, gross P/L and every lot behind it.
 * Foreign-only — never touches NEPSE data.
 */
export function GlobalPositionSheet({
  symbol,
  onOpenChange,
}: {
  symbol: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const txns = useGlobalTxns();
  const holding = useMemo(() => deriveHoldings(txns).find((h) => h.symbol === symbol), [txns, symbol]);
  const holdingCcy = holding?.currency ?? "";
  const quote = useQuery({ ...worldQuoteQuery(symbol, holdingCcy), enabled: Boolean(symbol) });
  const companyQ = useQuery({ ...worldCompanyQuery(symbol), enabled: Boolean(symbol) });
  // Sector comes from symbol search (chart meta doesn't carry it).
  const searchQ = useQuery({ ...worldSearchQuery(symbol ?? ""), enabled: Boolean(symbol) });
  const sectorHit = searchQ.data?.hits.find((h) => h.symbol.toUpperCase() === (symbol ?? "").toUpperCase());
  const sector = sectorHit?.sector ?? quote.data?.sector ?? null;
  const industry = sectorHit?.industry ?? quote.data?.industry ?? null;
  const [range, setRange] = useState<WorldRange>("1M");
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setRange("1M");
    setTab("overview");
  }, [symbol]);
  const history = useQuery({ ...worldHistoryQuery(symbol, range, holdingCcy), enabled: Boolean(symbol) });
  const chartPoints = useMemo(
    () =>
      (history.data?.bars ?? []).map((b) => ({
        time: Math.floor(new Date(`${b.date}T00:00:00Z`).getTime() / 1000),
        value: b.close,
      })),
    [history.data],
  );
  const lots = useMemo(
    () =>
      txns
        .filter((t) => t.symbol === symbol)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [txns, symbol],
  );

  const divTxns = useMemo(() => lots.filter((t) => t.side === "DIV"), [lots]);
  const divCcy = holding?.currency ?? divTxns[0]?.currency ?? "";
  const divTotal = divTxns.reduce((s, t) => s + t.qty * t.price, 0);
  const buyCostNative = lots
    .filter((t) => t.side === "BUY")
    .reduce((s, t) => s + t.qty * t.price, 0);
  const divYield = buyCostNative > 0 ? (divTotal / buyCostNative) * 100 : 0;
  const [npr, setNpr] = useState<{ avg: number | null; ltp: number | null; value: number | null }>({
    avg: null,
    ltp: null,
    value: null,
  });
  useEffect(() => {
    let live = true;
    setNpr({ avg: null, ltp: null, value: null });
    if (!holding || !quote.data || quote.data.ltp <= 0) return;
    const { avgPrice, currency, qty } = holding;
    const liveCcy = quote.data.currency ?? currency;
    void (async () => {
      const [avg, ltp] = await Promise.all([
        toNpr(avgPrice, currency),
        toNpr(quote.data!.ltp, liveCcy),
      ]);
      if (!live) return;
      setNpr({
        avg,
        ltp,
        value: ltp != null ? qty * ltp : null,
      });
    })();
    return () => {
      live = false;
    };
  }, [holding, quote.data]);

  const ltp = quote.data?.ltp ?? 0;
  const currency = quote.data?.currency ?? holding?.currency ?? "";
  const dayPct =
    quote.data && quote.data.previousClose > 0 && ltp > 0
      ? ((ltp - quote.data.previousClose) / quote.data.previousClose) * 100
      : 0;
  const prevNative = quote.data?.previousClose ?? 0;
  const dayNative = holding && ltp > 0 && prevNative > 0 ? holding.qty * (ltp - prevNative) : 0;
  const costNative = holding ? holding.qty * holding.avgPrice : 0;
  const firstBuy = useMemo(
    () =>
      txns
        .filter((t) => t.side === "BUY" && t.symbol === symbol)
        .map((t) => t.date)
        .sort()[0] ?? null,
    [txns, symbol],
  );
  const heldDays = firstBuy ? daysBetween(firstBuy, new Date()) : 0;
  const [lotsOpen, setLotsOpen] = useState(false);
  // FIFO buy lots still held, each with its age and its own gain since that
  // day: bought 2 months ago at X vs repurchased last month at Y read apart.
  const fifoLots = useMemo(() => (symbol ? deriveGlobalLots(txns, symbol) : []), [txns, symbol]);
  const lotRows = useMemo(
    () =>
      fifoLots.map((lot) => {
        const days = daysBetween(lot.date, new Date());
        const live =
          sameNativeCurrency(lot.currency, currency) && ltp > 0 && lot.price > 0;
        const gain = live ? lot.qty * (ltp - lot.price) : 0;
        const base = lot.qty * lot.price;
        return {
          lot,
          days,
          gain,
          pct: base > 0 && live ? (gain / base) * 100 : 0,
          live,
          time: days === 0 ? formatTimeOfDay(lot.date) : null,
        };
      }),
    [fifoLots, currency, ltp],
  );
  const lotsGain = lotRows.reduce((s, r) => s + r.gain, 0);
  const lotsBase = lotRows.reduce((s, r) => s + (r.live ? r.lot.qty * r.lot.price : 0), 0);
  const lotsGainPct = lotsBase > 0 ? (lotsGain / lotsBase) * 100 : 0;
  const lotsUnits = lotRows.reduce((s, r) => s + r.lot.qty, 0);
  const lotsAvgDays =
    lotsUnits > 0 ? Math.round(lotRows.reduce((s, r) => s + r.days * r.lot.qty, 0) / lotsUnits) : 0;
  const oldestDays = lotRows.length > 0 ? Math.max(...lotRows.map((r) => r.days)) : 0;
  // Card shows the unit-weighted average across still-held lots (same
  // convention as the NEPSE cards); the dialog carries the oldest-lot figure.
  const cardAgeDays = lotsUnits > 0 ? lotsAvgDays : heldDays;
  const displayRows = useMemo(() => [...lotRows].reverse(), [lotRows]);
  const gross = holding && ltp > 0 ? holding.qty * (ltp - holding.avgPrice) : 0;
  const grossBase = holding ? holding.qty * holding.avgPrice : 0;
  const grossPct = grossBase > 0 ? (gross / grossBase) * 100 : 0;
  // Session + freshness for the chart header (also shown in Market stats).
  const sessionStart = quote.data?.sessionStart ?? 0;
  const sessionEnd = quote.data?.sessionEnd ?? 0;
  const sessionKnown = sessionStart > 0 && sessionEnd > 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionOpen = sessionKnown ? nowSec >= sessionStart && nowSec <= sessionEnd : null;
  const dataAge = quote.data?.asOf
    ? formatDistanceToNow(new Date(quote.data.asOf * 1000), { addSuffix: true })
    : null;
  const listedYear = quote.data?.listedSince
    ? new Date(quote.data.listedSince * 1000).getUTCFullYear()
    : null;
  const facts = [
    quote.data?.exchange ?? null,
    listedYear ? `Listed ${listedYear}` : null,
    currency || null,
  ].filter((x): x is string => !!x);

  return (
    <Sheet open={Boolean(symbol)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="px-4 pb-0 pt-6 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden
                className="num flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary"
              >
                {(symbol ?? "?").charAt(0)}
              </span>
              <div className="min-w-0 pb-1">
                <span className="flex items-center gap-2">
                  <SheetTitle className="font-display text-xl">{symbol}</SheetTitle>
                  {quote.data?.source ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold normal-case text-muted-foreground">
                      {quote.data.source}
                    </span>
                  ) : null}
                </span>
                {[holding?.name, holding?.currency].filter(Boolean).length > 0 ? (
                  <SheetDescription className="truncate text-left">
                    {[holding?.name, holding?.currency].filter(Boolean).join(" · ")}
                  </SheetDescription>
                ) : null}
              </div>
            </div>
            {ltp > 0 ? (
              <div className="shrink-0 text-right">
                <p className="num font-display text-2xl font-semibold leading-none">
                  {native(ltp, currency)}
                </p>
                <DeltaPill value={dayPct}>
                  {dayPct >= 0 ? "+" : ""}
                  {dayPct.toFixed(2)}%
                </DeltaPill>
              </div>
            ) : null}
          </div>
          {sector || industry ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 pr-8">
              {sector ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                  {sector}
                </span>
              ) : null}
              {industry ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                  {industry}
                </span>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>
        <div className="space-y-4 px-4 py-4">
          {quote.isPending || !holding ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {quote.isPending ? "Loading live price…" : "No lots held for this symbol."}
            </p>
          ) : quote.isError || ltp <= 0 ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-sm font-semibold">Live price unavailable</p>
              <p className="text-xs text-muted-foreground">
                Showing your cost basis below; retry for the live quote.
              </p>
              <button
                type="button"
                onClick={() => void quote.refetch()}
                className="mx-auto flex min-h-11 items-center rounded-lg border border-border/60 bg-surface px-3 text-xs font-medium"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="dividends">
                    Dividends{divTxns.length > 0 ? ` (${divTxns.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="company">Company</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="flex flex-col gap-4">
              <div className="w-full text-left order-3">
                <Panel padding="sm">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold">Your position</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                      Avg cost
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Units</p>
                      <p className="num text-sm font-medium">{native(holding.qty, "")}</p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Avg cost</p>
                      <p className="num text-sm font-medium">{native(holding.avgPrice, currency)}</p>
                      <p className="num text-xs text-muted-foreground">
                        {npr.avg != null ? formatNpr(npr.avg) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Cost</p>
                      <p className="num text-sm font-medium">{native(costNative, currency)}</p>
                      <p className="num text-xs text-muted-foreground">
                        {npr.avg != null ? formatNpr(holding.qty * npr.avg) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Value</p>
                      <p className="num text-sm font-medium">{native(holding.qty * ltp, currency)}</p>
                      <p className="num text-xs text-muted-foreground">
                        {npr.value != null ? formatNpr(npr.value) : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-border/40 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground">Day change</span>
                      {prevNative > 0 ? (
                        <span className={`num text-xs font-semibold ${dayNative >= 0 ? "text-gain" : "text-loss"}`}>
                          {dayNative >= 0 ? "+" : ""}
                          {native(Math.abs(dayNative), currency)} ({dayPct >= 0 ? "+" : ""}
                          {dayPct.toFixed(2)}%)
                        </span>
                      ) : (
                        <span className="num text-xs font-semibold text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border/30 px-3 py-2.5">
                      <span className="text-xs font-medium text-foreground">Return</span>
                      <span className={`num text-sm font-bold ${gross >= 0 ? "text-gain" : "text-loss"}`}>
                        {gross >= 0 ? "+" : ""}
                        {native(Math.abs(gross), currency)} ({grossPct.toFixed(2)}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLotsOpen(true)}
                      className="flex w-full items-center justify-between gap-2 border-t border-border/30 bg-muted/10 px-3 py-2 hover:bg-muted/20"
                    >
                      <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                        Holding
                      </span>
                      <span className="num text-xs font-medium text-foreground hover:underline decoration-primary/30 underline-offset-2 decoration-dotted">
                        {cardAgeDays > 0 ? formatHoldingTime(cardAgeDays) : "—"}
                      </span>
                    </button>
                  </div>
                </Panel>
              </div>
            <Panel padding="sm" className="order-2">
              <h3 className="font-display text-sm font-semibold">Today&apos;s session</h3>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Previous close
                  </dt>
                  <dd className="num truncate text-[0.8rem] font-medium">
                    {prevNative > 0 ? native(prevNative, currency) : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Volume
                  </dt>
                  <dd className="num truncate text-[0.8rem] font-medium">
                    {(quote.data?.volume ?? 0) > 0
                      ? Number(quote.data!.volume).toLocaleString("en-US")
                      : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(quote.data?.dayLow ?? 0) > 0 &&
                (quote.data?.dayHigh ?? 0) > (quote.data?.dayLow ?? 0) &&
                ltp > 0 ? (
                  <div className="rounded-xl border border-border/60 bg-surface p-2.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Day range
                    </p>
                    <RangeBar
                      low={quote.data!.dayLow!}
                      high={quote.data!.dayHigh!}
                      value={Math.min(
                        Math.max(ltp, quote.data!.dayLow!),
                        quote.data!.dayHigh!,
                      )}
                      format={(v) => native(v, currency)}
                      tone={dayPct < 0 ? "loss" : "gain"}
                      colorByPosition
                      valueToneByPosition
                    />
                  </div>
                ) : null}
                {(quote.data?.fiftyTwoWeekHigh ?? 0) > 0 &&
                (quote.data?.fiftyTwoWeekLow ?? 0) > 0 &&
                (quote.data?.fiftyTwoWeekHigh ?? 0) > (quote.data?.fiftyTwoWeekLow ?? 0) ? (
                  <div className="rounded-xl border border-border/60 bg-surface p-2.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      52-week range
                    </p>
                    <RangeBar
                      low={quote.data!.fiftyTwoWeekLow!}
                      high={quote.data!.fiftyTwoWeekHigh!}
                      value={Math.min(
                        Math.max(ltp, quote.data!.fiftyTwoWeekLow!),
                        quote.data!.fiftyTwoWeekHigh!,
                      )}
                      format={(v) => native(v, currency)}
                      tone={dayPct < 0 ? "loss" : "gain"}
                      colorByPosition
                      valueToneByPosition
                    />
                  </div>
                ) : null}
              </div>
            </Panel>
            <div className="rounded-2xl border border-border/60 bg-card p-3 order-1">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold">Price history</h3>
                <div className="flex flex-wrap gap-1">
                  {(["1M", "3M", "6M", "1Y", "MAX"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={range === r}
                      onClick={() => setRange(r)}
                      className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium transition-colors ${
                        range === r
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {sessionOpen != null || dataAge ? (
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {sessionOpen != null ? (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${sessionOpen ? "bg-gain" : "bg-muted-foreground"}`}
                      />
                      <span className={sessionOpen ? "text-gain" : "text-muted-foreground"}>
                        {sessionOpen ? "Market open" : "Market closed"}
                      </span>
                    </span>
                  ) : null}
                  {dataAge ? (
                    <span className="text-muted-foreground">
                      {sessionOpen != null ? "· " : ""}data {dataAge}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {history.isPending ? (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                  Loading price history…
                </p>
              ) : history.isError ? (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                  Couldn&apos;t load price history.{" "}
                  <button
                    type="button"
                    onClick={() => void history.refetch()}
                    className="font-medium text-primary hover:underline"
                  >
                    Try again
                  </button>
                </p>
              ) : chartPoints.length >= 2 ? (
                <AreaChart
                  points={chartPoints}
                  height={200}
                  wacc={holding.avgPrice > 0 ? holding.avgPrice : null}
                  formatValue={(v) => native(v, currency)}
                  formatLabel={(t) =>
                    new Date(t * 1000).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  }
                />
              ) : (
                <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                  No price history for this range.
                </p>
              )}
              <p className="mt-2 text-[0.68rem] text-muted-foreground">
                Daily closes · dashed line marks your average cost. Hover to inspect.
              </p>
            </div>
                </TabsContent>
                <TabsContent value="dividends" className="space-y-3">
                  {divTxns.length === 0 ? (
                    <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                      No dividends received for this stock yet.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                            Received
                          </p>
                          <p className="num text-sm font-semibold">
                            {native(divTotal, divCcy)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                            Yield on cost
                          </p>
                          <p className="num text-sm font-semibold text-gain">
                            {divYield.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-1.5">
                        {divTxns.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
                          >
                            <span className="min-w-0">
                              <span className="font-semibold">DIV</span>{" "}
                              <span className="num">{native(t.qty, "")}</span>{" "}
                              <span className="text-muted-foreground">· {formatDate(t.date)}</span>
                            </span>
                            <span className="num shrink-0 text-gain">
                              +{native(t.qty * t.price, t.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </TabsContent>
                <TabsContent value="history" className="space-y-3">
                  {lots.length > 0 ? (
                    <ul className="space-y-1.5">
                    {lots.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold">{t.side}</span>{" "}
                          <span className="num">{native(t.qty, "")}</span>{" "}
                          <span className="text-muted-foreground">· {formatDate(t.date)}</span>
                        </span>
                        <span className="num shrink-0 text-muted-foreground">
                          {t.price > 0 ? native(t.price, t.currency) : "—"}
                        </span>
                      </li>
                    ))}
                    </ul>
                  ) : (
                    <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                      No transactions for this stock yet.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="company" className="space-y-3">
                  {companyQ.isPending ? (
                    <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
                      Loading company profile…
                    </p>
                  ) : companyQ.isError || !companyQ.data?.company ? (
                    <div className="space-y-2 py-4 text-center">
                      <p className="text-sm font-semibold">No company data for this symbol</p>
                      <p className="text-xs text-muted-foreground">
                        Fundamentals cover only US listings.
                      </p>
                      <button
                        type="button"
                        onClick={() => void companyQ.refetch()}
                        className="mx-auto flex min-h-11 items-center rounded-lg border border-border/60 bg-surface px-3 text-xs font-medium"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    (() => {
                      const co = companyQ.data.company;
                      const ccy = co.currency ?? "";
                      const facts: [string, string][] = [
                        ["Country", co.country ?? "—"],
                        ["Exchange", co.exchange ?? "—"],
                        ["Listed", co.ipo ?? "—"],
                        ["Shares out", co.sharesOut ? Number(co.sharesOut).toLocaleString("en-US") : "—"],
                      ];
                      const statsRows: [string, string][] = [
                        ["Market cap", bigMoney(co.marketCap, ccy)],
                        ["P/E (TTM)", co.peTtm != null ? co.peTtm.toFixed(2) : "—"],
                        ["EPS (TTM)", co.epsTtm != null ? native(co.epsTtm, ccy) : "—"],
                        ["Beta", co.beta != null ? co.beta.toFixed(2) : "—"],
                        ["Div yield", co.divYieldPct != null ? `${co.divYieldPct.toFixed(2)}%` : "—"],
                        ["ROE (TTM)", co.roeTtmPct != null ? `${co.roeTtmPct.toFixed(2)}%` : "—"],
                      ];
                      return (
                        <>
                          <div className="rounded-2xl border border-border/60 bg-card p-3">
                            <h3 className="font-display text-sm font-semibold">{co.name}</h3>
                            {co.website ? (
                              <a
                                href={co.website.startsWith("http") ? co.website : `https://${co.website}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 inline-block text-xs font-medium text-primary hover:underline"
                              >
                                {co.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                              </a>
                            ) : null}
                            <dl className="mt-3 grid grid-cols-2 gap-2">
                              {facts.map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                                    {label}
                                  </dt>
                                  <dd className="num truncate text-[0.8rem] font-medium">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-card p-3">
                            <h3 className="mb-2 font-display text-sm font-semibold">Key statistics</h3>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                              {statsRows.map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                                    {label}
                                  </dt>
                                  <dd className="num truncate text-sm font-medium">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        </>
                      );
                    })()
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
        <Dialog open={lotsOpen} onOpenChange={setLotsOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-[520px] p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle className="text-base font-bold leading-none">
                {symbol} · Lots
              </DialogTitle>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Every buy still held — its age and its own gain since that day.
              </p>
            </DialogHeader>
            <div className="px-5 pb-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Oldest lot</p>
                  <p className="num mt-1 text-base font-bold">
                    {lotRows.length > 0 ? formatHoldingTime(oldestDays) : "—"}
                  </p>
                  <p className="text-[0.68rem] text-muted-foreground">
                    {lotRows.length} lot{lotRows.length === 1 ? "" : "s"} still held
                  </p>
                </div>
                <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Average holding</p>
                  <p className="num mt-1 text-base font-bold">
                    {lotRows.length > 0 ? formatHoldingTime(lotsAvgDays) : "—"}
                  </p>
                  <p className="text-[0.68rem] text-muted-foreground">unit-weighted</p>
                </div>
              </div>
              {lotRows.length > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface px-4 py-2.5">
                  <span className="text-xs font-medium">Combined across lots</span>
                  <span
                    className={`num text-sm font-bold ${lotsGain >= 0 ? "text-gain" : "text-loss"}`}
                  >
                    {lotsGain >= 0 ? "+" : ""}
                    {native(Math.abs(lotsGain), currency)} ({lotsGainPct.toFixed(2)}%)
                  </span>
                </div>
              ) : null}
              {lotRows.length > 0 ? (
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <p className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground">
                    Per-lot age &amp; gain — latest first
                  </p>
                  <div className="divide-y divide-border/30">
                    {displayRows.map((r, i) => (
                      <div
                        key={`${r.lot.date}-${i}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="num text-sm font-medium">
                            {native(r.lot.qty, "")} × {formatDate(r.lot.date)}
                            {r.time ? ` · ${r.time}` : ""}
                          </p>
                          <p className="num text-[0.68rem] text-muted-foreground">
                            in {native(r.lot.qty * r.lot.price, r.lot.currency)} @{" "}
                            {native(r.lot.price, r.lot.currency)} → {native(ltp, currency)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                            title={`${r.days} day${r.days === 1 ? "" : "s"} held`}
                          >
                            {formatPreciseAge(r.days)}
                          </span>
                          {r.live ? (
                            <p
                              className={`num mt-1 text-xs font-bold ${r.gain >= 0 ? "text-gain" : "text-loss"}`}
                            >
                              {r.gain >= 0 ? "+" : ""}
                              {native(Math.abs(r.gain), currency)} ({r.pct.toFixed(2)}%)
                            </p>
                          ) : (
                            <p className="num mt-1 text-xs font-semibold text-muted-foreground">
                              —
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No dated buy lots for this symbol — the average above still applies.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
