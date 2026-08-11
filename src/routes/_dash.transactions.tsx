import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, FileDown, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { holdingSymbolsQuery, transactionsQuery } from "@/lib/queries";
import { formatDate, formatQty, isoDate, toNumber } from "@/lib/format";
import type { TransactionItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions | MeroShare Investor Console" },
      { name: "description", content: "Credit and debit history for every scrip in your demat account." },
      { property: "og:title", content: "Transactions | MeroShare Investor Console" },
      { property: "og:description", content: "Credit and debit history for every scrip in your demat account." },
    ],
  }),
  component: TransactionsPage,
});

function exportCsv(items: TransactionItem[], symbol: string | null) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = items.map((t, i) =>
    [
      String(i + 1),
      formatDate(t.transactionDate),
      t.script ?? "",
      t.historyDescription ?? "",
      toNumber(t.creditQuantity) > 0 ? String(toNumber(t.creditQuantity)) : "",
      toNumber(t.debitQuantity) > 0 ? String(toNumber(t.debitQuantity)) : "",
      String(toNumber(t.balanceAfterTransaction)),
    ]
      .map(esc)
      .join(","),
  );
  const csv = [["SN", "Date", "Script", "Description", "Credit", "Debit", "Balance"].map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${symbol ?? "all"}-${isoDate(new Date())}.csv`;
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

function TransactionsPage() {
  const [symbol, setSymbol] = useState<string>("all");
  const [search, setSearch] = useState("");
  const symbols = useQuery(holdingSymbolsQuery());
  const q = useQuery(transactionsQuery(symbol === "all" ? null : symbol));
  const items = q.data?.items ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((t) =>
      [t.script, t.historyDescription, String(t.transactionDate ?? "")]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(term)),
    );
  }, [items, search]);

  const totalCredit = filtered.reduce((sum, t) => sum + Math.max(0, toNumber(t.creditQuantity)), 0);
  const totalDebit = filtered.reduce((sum, t) => sum + Math.max(0, toNumber(t.debitQuantity)), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Credit and debit history for every scrip in your demat account.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All scrips" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scrips</SelectItem>
              {(symbols.data ?? []).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={() => exportCsv(filtered, symbol === "all" ? null : symbol)}>
            <FileDown /> Export
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by scrip or description…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip icon={<ArrowDownRight className="size-4 text-gain" />} label="Records" value={formatQty(q.data?.total ?? 0)} />
        <StatChip icon={<ArrowDownRight className="size-4 text-gain" />} label="Total credited" value={formatQty(totalCredit)} valueClass="text-gain" />
        <StatChip icon={<ArrowUpRight className="size-4 text-loss" />} label="Total debited" value={formatQty(totalDebit)} valueClass="text-loss" />
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading transactions" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No transactions" description="No movement recorded for this selection." />
      ) : filtered.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search. Try a different scrip or description." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Script</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="pr-4 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, idx) => (
                <TableRow key={`${t.script}-${String(t.transactionDate)}-${idx}`}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(t.transactionDate)}</TableCell>
                  <TableCell className="font-semibold">{t.script}</TableCell>
                  <TableCell className="hidden max-w-72 truncate text-xs text-muted-foreground md:table-cell" title={t.historyDescription}>
                    {t.historyDescription ?? "—"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-gain">
                    {toNumber(t.creditQuantity) > 0 ? `+${formatQty(t.creditQuantity)}` : "—"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-loss">
                    {toNumber(t.debitQuantity) > 0 ? `−${formatQty(t.debitQuantity)}` : "—"}
                  </TableCell>
                  <TableCell className="num pr-4 text-right text-muted-foreground">{formatQty(t.balanceAfterTransaction)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
