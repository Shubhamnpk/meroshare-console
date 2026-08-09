import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { holdingSymbolsQuery, transactionsQuery } from "@/lib/queries";
import { formatDate, formatQty, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_dash/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — MeroShare Investor Console" },
      { name: "description", content: "Credit and debit history for every scrip in your demat account." },
      { property: "og:title", content: "Transactions — MeroShare Investor Console" },
      { property: "og:description", content: "Credit and debit history for every scrip in your demat account." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const [symbol, setSymbol] = useState<string>("all");
  const symbols = useQuery(holdingSymbolsQuery());
  const q = useQuery(transactionsQuery(symbol === "all" ? null : symbol));
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">{q.data?.total ?? 0} records</p>
        </div>
        <Select value={symbol} onValueChange={setSymbol}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All scrips" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scrips</SelectItem>
            {(symbols.data ?? []).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Loading transactions" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No transactions" description="No movement recorded for this selection." />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {items.map((t, idx) => (
            <li key={idx} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.script}</p>
                <p className="truncate text-xs text-muted-foreground">{t.historyDescription}</p>
                <p className="text-xs text-muted-foreground">{formatDate(t.transactionDate)}</p>
              </div>
              <div className="shrink-0 text-right">
                {toNumber(t.creditQuantity) > 0 ? (
                  <p className="num text-sm font-semibold text-gain">+{formatQty(t.creditQuantity)}</p>
                ) : null}
                {toNumber(t.debitQuantity) > 0 ? (
                  <p className="num text-sm font-semibold text-loss">-{formatQty(t.debitQuantity)}</p>
                ) : null}
                <p className="num text-xs text-muted-foreground">Bal {formatQty(t.balanceAfterTransaction)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
