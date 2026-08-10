import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useMemo, useState } from "react";
import { Coins, FileDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mySharesQuery } from "@/lib/queries";
import { formatNpr, formatQty, isoDate, toNumber } from "@/lib/format";
import type { MyShareItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/shares")({
  head: () => ({
    meta: [
      { title: "My Shares — MeroShare Investor Console" },
      { name: "description", content: "Current balance and value for every scrip in your demat account." },
      { property: "og:title", content: "My Shares — MeroShare Investor Console" },
      { property: "og:description", content: "Current balance and value for every scrip in your demat account." },
    ],
  }),
  component: SharesPage,
});

function exportCsv(items: MyShareItem[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = items.map((item, i) =>
    [
      String(i + 1),
      item.script ?? "",
      item.scriptDesc ?? "",
      String(toNumber(item.currentBalance)),
      String(toNumber(item.lastTransactionPrice)),
      String(toNumber(item.previousClosingPrice)),
      String(toNumber(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice)),
      String(toNumber(item.valueOfPrevClosingPrice ?? item.valueAsOfPreviousClosingPrice)),
    ]
      .map(esc)
      .join(","),
  );
  const csv = [["SN", "Script", "Description", "Balance", "Last price", "Prev close", "Value (last)", "Value (prev close)"].map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-shares-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatChip({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`num font-semibold ${valueClass ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}

function ChangePct({ item }: { item: MyShareItem }) {
  const last = toNumber(item.lastTransactionPrice);
  const prev = toNumber(item.previousClosingPrice);
  if (!(prev > 0)) return null;
  const pct = ((last - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`num rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${up ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
      {up ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function SharesPage() {
  const q = useQuery(mySharesQuery());
  const items = q.data ?? [];

  const stats = useMemo(() => {
    let balance = 0;
    let value = 0;
    for (const item of items) {
      balance += Math.max(0, toNumber(item.currentBalance));
      value += toNumber(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice);
    }
    return { balance, value };
  }, [items]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">My Shares</h1>
          <p className="mt-1 text-sm text-muted-foreground">Holdings, prices and value for every scrip in your demat account.</p>
        </div>
        <Button variant="outline" size="sm" disabled={items.length === 0} onClick={() => exportCsv(items)}>
          <FileDown /> Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip icon={<Coins className="size-4" />} label="Scrips held" value={String(items.length)} />
        <StatChip icon={<Wallet className="size-4" />} label="Total balance" value={formatQty(stats.balance)} />
        <StatChip icon={<TrendingUp className="size-4 text-gain" />} label="Portfolio value" value={formatNpr(stats.value, { compact: true })} valueClass="text-gain" />
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading shares" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No shares" description="Nothing is held in this demat account yet." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, idx) => (
            <li key={`${item.script}-${idx}`} className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold">{item.script}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.scriptDesc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-xl font-bold">{formatQty(item.currentBalance)}</p>
                  <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Balance</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Last price</dt>
                  <dd className="num flex items-center gap-2 font-medium">{formatNpr(item.lastTransactionPrice)} <ChangePct item={item} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Prev close</dt>
                  <dd className="num font-medium">{formatNpr(item.previousClosingPrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Value (last)</dt>
                  <dd className="num font-medium">{formatNpr(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Value (prev close)</dt>
                  <dd className="num font-medium">{formatNpr(item.valueOfPrevClosingPrice ?? item.valueAsOfPreviousClosingPrice)}</dd>
                </div>
                {item.freeBalance != null || item.pledgedBalance != null || item.lockInBalance != null ? (
                  <div className="col-span-2 flex flex-wrap gap-x-4 border-t border-border/60 pt-2 text-xs">
                    {item.freeBalance != null ? <span>Free <span className="num font-semibold">{formatQty(item.freeBalance)}</span></span> : null}
                    {item.pledgedBalance != null ? <span>Pledged <span className="num font-semibold">{formatQty(item.pledgedBalance)}</span></span> : null}
                    {item.lockInBalance != null ? <span>Locked in <span className="num font-semibold">{formatQty(item.lockInBalance)}</span></span> : null}
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
