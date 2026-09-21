"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { breakEvenPrice, buyCost, cgtRate, daysBetween, sellProceeds, DP_CHARGE } from "@/lib/calc/fees";
import { waccSearchQuery } from "@/lib/queries";


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

  // Wallet-style holding period: earliest purchase date for this scrip
  const purchaseQ = useQuery(waccSearchQuery(symbol));
  const holdingDays = useMemo(() => {
    const items = (purchaseQ.data as { waccUpdateResponse?: { transactionDate?: string }[] } | undefined)?.waccUpdateResponse ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dates = (items as any[]).map((r) => (r as { transactionDate?: string }).transactionDate).filter(Boolean) as string[];
    if (dates.length === 0) return 400; // fallback = long-term slab (wallet shows same when history missing)
    const earliest = dates.sort()[0] as string;
    const d = daysBetween(earliest, new Date());
    return d > 0 ? d : 400;
  }, [purchaseQ.data]);

  const data = useMemo(() => {
    if (!(units > 0) || !(avgCost > 0) || !(ltp > 0)) return null;
    // Commission WACC = buy-side all-in per unit (price + broker + SEBON + DP amortized)
    const buy = buyCost(units, avgCost);
    const commissionWacc = buy.perUnit;
    const proceeds = sellProceeds({ units, price: ltp, avgCost: commissionWacc, holdingDays });
    const be = breakEvenPrice(units, commissionWacc, holdingDays);
    const costBasis = buy.total; // real cash out
    const marketValue = units * ltp;
    const rawProfit = marketValue - units * avgCost;
    return { proceeds, be, costBasis, marketValue, rawProfit, commissionWacc, buy };
  }, [units, avgCost, ltp, holdingDays]);

  if (!data) return null;
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
          </div>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-[440px] p-0 gap-0">
          <DialogHeader className="px-3 pt-3 pb-1.5">
            <DialogTitle className="text-sm font-bold leading-none">{symbol} · Sell breakdown</DialogTitle>
          </DialogHeader>

          <div className="px-3 pb-3 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-lg bg-muted/15 px-2.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[0.7rem] text-muted-foreground">Gross</span>
                <span className="num text-xs font-bold">{formatNpr(proceeds.amount)}</span>
              </div>
              <div className="rounded-lg bg-muted/15 px-2.5 py-2 flex items-center justify-between gap-2">
                <span className="text-[0.7rem] text-muted-foreground">All-in cost</span>
                <span className="num text-xs font-bold">{formatNpr(proceeds.costBasis)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="divide-y divide-border/30">
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] text-muted-foreground">Broker commission</span>
                  <span className="num text-[0.7rem] font-medium">− {formatNpr(proceeds.commission)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] text-muted-foreground">SEBON 0.015%</span>
                  <span className="num text-[0.7rem] font-medium">− {formatNpr(proceeds.sebon)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] text-muted-foreground">DP charge</span>
                  <span className="num text-[0.7rem] font-medium">− {formatNpr(proceeds.dp)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/15">
                  <span className="text-[0.7rem] font-semibold">Charges</span>
                  <span className="num text-[0.7rem] font-bold">− {formatNpr(proceeds.charges)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] text-muted-foreground">Net before tax</span>
                  <span className="num text-[0.7rem] font-semibold">{formatNpr(proceeds.netBeforeTax)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] text-muted-foreground">CGT {(proceeds.cgtRate * 100).toFixed(1)}% · {holdingDays}d</span>
                  <span className="num text-[0.7rem] font-medium">− {formatNpr(proceeds.cgt)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 bg-muted/15">
                  <span className="text-xs font-bold">Net receivable</span>
                  <span className="num text-xs font-bold">{formatNpr(proceeds.netReceivable)}</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[0.7rem] font-semibold">Net profit</span>
                  <span className={cn("num text-[0.7rem] font-bold", isNetProfit ? "text-gain" : "text-loss")}>
                    {netProfit >= 0 ? "+" : ""}{formatNpr(netProfit)}{" "}
                    <span className="underline decoration-dotted underline-offset-2">({formatPercent(netPct)})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/10">
                  <span className="text-[0.7rem] text-muted-foreground">Breakeven</span>
                  <span className="num text-[0.7rem] font-bold">{formatNpr(be)}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
