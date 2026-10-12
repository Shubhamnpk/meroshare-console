import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { native } from "@/components/world/global-position-sheet";
import { deriveAccountFlow, deriveGlobalBookStats } from "@/lib/world/lots";
import { currencySymbol } from "@/lib/format";
import type { GlobalTxn } from "@/lib/world/import";

function Row({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`num font-bold ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Group({ label }: { label: string }) {
  return (
    <p className="pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</p>
  );
}

/**
 * Tap-through for the earned chips: one section per original currency with
 * three small groups (earned, cash flow, working now). Buy funding nests
 * under Paid in, so lifetime cost, its sources, and what is still held read
 * as one story with nothing repeated.
 */
export function EarnedBreakdownDialog({
  open,
  onOpenChange,
  txns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  txns: GlobalTxn[];
}) {
  const book = useMemo(() => deriveGlobalBookStats(txns), [txns]);
  const flow = useMemo(() => deriveAccountFlow(txns), [txns]);
  const signed = (v: number, ccy: string) => `${v >= 0 ? "+" : "−"}${native(Math.abs(v), ccy)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-[520px] p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-bold leading-none">Earnings breakdown</DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-5 space-y-3">
          {[...new Set([...book.currencies, ...flow.currencies])].map((ccy) => {
            const b = book.byCurrency[ccy];
            const f = flow.byCurrency[ccy];
            if (!b && !f) return null;
            const banked = b?.banked ?? 0;
            const divs = b?.dividends ?? f?.dividends ?? 0;
            const intr = f?.interest ?? 0;
            const earned = banked + divs + intr;
            const depNet = (f?.deposits ?? 0) - (f?.withdrawals ?? 0);
            const principal = b?.principalReturned ?? 0;
            const gains = banked + divs + intr;
            const buys = f?.buys ?? 0;
            const cashLeft = buys - depNet - principal - gains;
            const net = (f?.deposits ?? 0) - (f?.withdrawals ?? 0) + ((f?.sells ?? 0) + divs + intr) - (f?.buys ?? 0);
            return (
              <div key={`ccy-${ccy}`} className="rounded-xl border border-border/60 bg-surface px-4 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  Original amounts · {currencySymbol(ccy) || "?"}
                </p>
                <div className="mt-1 space-y-1">
                  <Group label="Earned" />
                  <Row label="Return (banked sells)" value={signed(banked, ccy)} tone={banked >= 0 ? "gain" : "loss"} />
                  {divs > 0 ? <Row label="Dividends" value={`+${native(divs, ccy)}`} tone="gain" /> : null}
                  {intr > 0 ? <Row label="Interest on cash" value={`+${native(intr, ccy)}`} tone="gain" /> : null}
                  <Row label="Total earned" value={signed(earned, ccy)} tone={earned >= 0 ? "gain" : "loss"} />
                  {f ? (
                    <>
                      <Group label="Cash flow" />
                      <Row label="Deposited" value={`+${native(f.deposits, ccy)}`} tone="gain" />
                      {f.withdrawals > 0 ? (
                        <Row label="Withdrawn" value={`−${native(f.withdrawals, ccy)}`} tone="loss" />
                      ) : null}
                      <Row label="Paid in (buys)" value={native(buys, ccy)} />
                      <div className="ml-2 space-y-1 border-l-2 border-border/40 pl-2">
                        <Row label="from deposits" value={native(depNet, ccy)} />
                        <Row label="from returned principal" value={native(principal, ccy)} />
                        <Row label="from gains" value={signed(gains, ccy)} tone={gains >= 0 ? "gain" : "loss"} />
                        <Row label="left as cash" value={signed(cashLeft, ccy)} />
                      </div>
                      <Row label="Received (sells + dividends)" value={native(f.sells + divs, ccy)} />
                      <Row label="Reinvested (lifetime)" value={native(f.reinvested, ccy)} />
                      <Row label="Net cash (est.)" value={signed(net, ccy)} tone={net >= 0 ? undefined : "loss"} />
                      <Group label="Working now" />
                      <Row label="Invested (at cost)" value={native(f.investedNow, ccy)} />
                      <Row label="Reinvested (of that)" value={native(f.reinvestedNow, ccy)} />
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Broker file totals first; the rest is computed from prices. Only earnings (gains, dividends, interest) count
            as reinvested: recycled principal and deposits never do. Buy funding always adds up: deposits plus returned
            principal plus gains minus cash left.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
