"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatHoldingTime, formatNpr, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { breakEvenPrice, buyCost, cgtRate, daysBetween, sellProceeds, DP_CHARGE } from "@/lib/calc/fees";
import { mfSchemesQuery, waccSearchQuery } from "@/lib/queries";


export function PositionPnlCard({
  symbol,
  units,
  avgCost,
  ltp,
  waccStatus,
}: {
  symbol: string;
  units: number;
  avgCost: number;
  ltp: number;
  waccStatus: "calculated" | "pending" | "missing";
}) {
  const [open, setOpen] = useState(false);
  const [avgOpen, setAvgOpen] = useState(false);

  // Wallet-style holding period: earliest purchase date for this scrip
  const purchaseQ = useQuery(waccSearchQuery(symbol));
  const schemesQ = useQuery(mfSchemesQuery());
  const isOpenEnd = useMemo(
    () => schemesQ.data?.some((s) => s.symbol.toUpperCase() === symbol.toUpperCase() && s.fundType === "open_end") ?? false,
    [schemesQ.data, symbol],
  );
  const holdingDays = useMemo(() => {
    const raw = purchaseQ.data as unknown as { waccUpdateResponse?: { transactionDate?: string; postDate?: string }[]; waccSummaryResponse?: { transactionDate?: string; postDate?: string }[] } | undefined;
    const all = [...(raw?.waccUpdateResponse ?? []), ...(raw?.waccSummaryResponse ?? [])];
    const dates = all
      .map((r) => r.transactionDate || r.postDate)
      .filter(Boolean) as string[];
    if (dates.length === 0) return 400;
    const earliest = dates.sort()[0] as string;
    const d = daysBetween(earliest, new Date());
    return d > 0 ? d : 400;
  }, [purchaseQ.data]);

  const { avgHoldingDays, lots } = useMemo(() => {
    const raw = purchaseQ.data as unknown as {
      waccUpdateResponse?: { transactionDate?: string; postDate?: string; quantity?: number; transactionQuantity?: number }[];
      waccSummaryResponse?: { transactionDate?: string; postDate?: string; quantity?: number; transactionQuantity?: number }[];
    } | undefined;
    const all = [...(raw?.waccUpdateResponse ?? []), ...(raw?.waccSummaryResponse ?? [])];
    if (all.length === 0) return { avgHoldingDays: holdingDays, lots: [] as { date: string; qty: number; days: number }[] };
    let totalUnits = 0;
    let weighted = 0;
    const arr: { date: string; qty: number; days: number }[] = [];
    for (const r of all) {
      const dateStr = (r.transactionDate || r.postDate) as string | undefined;
      if (!dateStr) continue;
      const qty = Number((r as Record<string, unknown>)["quantity"] ?? (r as Record<string, unknown>)["transactionQuantity"] ?? 0);
      if (!(qty > 0)) continue;
      const d = daysBetween(dateStr, new Date());
      if (!(d > 0)) continue;
      arr.push({ date: dateStr, qty, days: d });
      weighted += d * qty;
      totalUnits += qty;
    }
    arr.sort((a, b) => b.days - a.days);
    const avg = totalUnits > 0 ? Math.round(weighted / totalUnits) : holdingDays;
    return { avgHoldingDays: avg, lots: arr };
  }, [purchaseQ.data, holdingDays]);

  const data = useMemo(() => {
    const safeLtp = Number.isFinite(ltp) ? ltp : 0;
    // Commission WACC = buy-side all-in per unit (price + broker + SEBON + DP amortized) — open-end MF has no charges
    const buy = buyCost(units, avgCost, { isOpenEnd });
    const commissionWacc = buy.perUnit;
    const proceeds = sellProceeds({ units, price: ltp, avgCost: commissionWacc, holdingDays, isOpenEnd });
    const be = breakEvenPrice(units, commissionWacc, holdingDays, { isOpenEnd });
    const costBasis = buy.total; // real cash out
    const marketValue = units * ltp;
    const rawProfit = marketValue - units * avgCost;
    return { proceeds, be, costBasis, marketValue, rawProfit, commissionWacc, buy };
  }, [units, avgCost, ltp, holdingDays, isOpenEnd]);

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-3 text-xs">
        <p className="font-semibold">Position hidden — debug</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          symbol={symbol} ltp={String(ltp)} units={units} avgCost={avgCost} holdingDays={holdingDays} isOpenEnd={String(isOpenEnd)}
        </p>
      </div>
    );
  }
  const { proceeds, be, costBasis, marketValue, rawProfit, commissionWacc, buy } = data;
  const netProfit = proceeds.profit;
  const netPct = proceeds.profitPercent;
  const isNetProfit = netProfit >= 0;

  return (
    <>
      <div className="space-y-1">
        <p className="px-1 text-xs font-bold tracking-tight">Your investment</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group w-full rounded-xl border border-border/40 bg-card px-3 py-2.5 text-left hover:border-border/60 transition-colors"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">Value</span>
              <span className="num text-xs font-bold text-foreground">{formatNpr(marketValue)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">Return</span>
              <span className={cn("num text-xs font-bold", isNetProfit ? "text-gain" : "text-loss")}>
                {netProfit >= 0 ? "+" : ""}{formatNpr(netProfit)}{" "}
                <span className="underline decoration-dotted underline-offset-2">({formatPercent(netPct)})</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">Shares</span>
              <span className="num text-xs font-medium text-foreground">{formatQty(units)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">Average price</span>
              <span className="num text-xs font-medium text-foreground">{formatNpr(commissionWacc)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">Holding</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setAvgOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setAvgOpen(true);
                  }
                }}
                className="num cursor-pointer text-xs font-medium text-foreground hover:underline decoration-primary/30 underline-offset-2 decoration-dotted"
              >
                {formatHoldingTime(avgHoldingDays)} avg
              </span>
            </div>
          </div>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-[520px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base font-bold leading-none">{symbol} · Sell breakdown</DialogTitle>
            <p className="mt-1.5 text-xs text-muted-foreground">What you actually pocket if you sell all {units.toLocaleString("en-NP")} units at {formatNpr(ltp)}</p>
          </DialogHeader>

          <div className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Gross sale</p>
                <p className="num mt-1 text-base font-bold">{formatNpr(proceeds.amount)}</p>
                <p className="text-[0.68rem] text-muted-foreground">{units} × {formatNpr(ltp)}</p>
              </div>
              <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Total cost</p>
                <p className="num mt-1 text-base font-bold">{formatNpr(proceeds.costBasis)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <p className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground">Sell charges</p>
              <div className="divide-y divide-border/30">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Broker commission</span>
                  <span className="num text-sm font-medium">− {formatNpr(proceeds.commission)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">SEBON 0.015%</span>
                  <span className="num text-sm font-medium">− {formatNpr(proceeds.sebon)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">DP charge</span>
                  <span className="num text-sm font-medium">− {formatNpr(proceeds.dp)}</span>
                </div>
                <div className="flex items-center justify-between bg-muted/10 px-4 py-3">
                  <span className="text-sm font-semibold">Total charges</span>
                  <span className="num text-sm font-bold">− {formatNpr(proceeds.charges)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <p className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground">After charges & tax</p>
              <div className="divide-y divide-border/30">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Net before tax</span>
                  <span className="num text-sm font-semibold">{formatNpr(proceeds.netBeforeTax)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Capital gains tax</p>
                    <p className="text-xs text-muted-foreground">{(proceeds.cgtRate * 100).toFixed(1)}% · {formatHoldingTime(holdingDays)} {holdingDays >= 365 ? "long term" : "short term"}</p>
                  </div>
                  <span className="num text-sm font-medium">− {formatNpr(proceeds.cgt)}</span>
                </div>
                <div className="flex items-center justify-between bg-primary/5 px-4 py-3">
                  <span className="text-sm font-bold">Net receivable</span>
                  <span className="num text-base font-bold">{formatNpr(proceeds.netReceivable)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-card border border-gain/20 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Unrealized before charges</span>
                <span className={cn("num text-sm font-semibold", rawProfit >= 0 ? "text-gain" : "text-loss")}>
                  {rawProfit >= 0 ? "+" : ""}{formatNpr(rawProfit)} ({formatPercent((rawProfit / costBasis) * 100)})
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border/40 pt-2">
                <span className="text-sm font-bold">Net profit</span>
                <span className={cn("num text-base font-bold", isNetProfit ? "text-gain" : "text-loss")}>
                  {netProfit >= 0 ? "+" : ""}{formatNpr(netProfit)}{" "}
                  <span className="underline decoration-dotted underline-offset-2">({formatPercent(netPct)})</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Breakeven price</span>
                <span className="num font-semibold">{formatNpr(be)}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={avgOpen} onOpenChange={setAvgOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-[520px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base font-bold leading-none">{symbol} · Holding age</DialogTitle>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Avg {formatHoldingTime(avgHoldingDays)} (weighted) · Oldest {formatHoldingTime(holdingDays)} for tax · {lots.length} lot{lots.length === 1 ? "" : "s"} still held
            </p>
          </DialogHeader>
          <div className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Average holding</p>
                <p className="num mt-1 text-base font-bold">{formatHoldingTime(avgHoldingDays)}</p>
                <p className="text-[0.68rem] text-muted-foreground">display only — tax uses oldest</p>
              </div>
              <div className="rounded-xl bg-muted/10 border border-border/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Oldest lot (tax)</p>
                <p className="num mt-1 text-base font-bold">{formatHoldingTime(holdingDays)}</p>
                <p className="text-[0.68rem] text-muted-foreground">{holdingDays >= 365 ? "long term" : "short term"}</p>
              </div>
            </div>
            {lots.length > 0 ? (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <p className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground">Per-lot age — which lot needs how long</p>
                <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                  {lots.map((lot, i) => (
                    <div key={`${lot.date}-${i}`} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="num text-sm font-medium">{formatQty(lot.qty)} × {lot.date.slice(0, 10)}</p>
                        <p className="text-[0.68rem] text-muted-foreground">{lot.date}</p>
                      </div>
                      <span className={`num rounded-full px-2 py-0.5 text-xs font-semibold ${lot.days >= 365 ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"}`}>
                        {formatHoldingTime(lot.days)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No per-lot dates available — showing tax holding only.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
