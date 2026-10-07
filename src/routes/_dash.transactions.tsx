import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, FileUp, Pencil, Search, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton, buildCsv } from "@/components/export-dialog";
import { Button } from "@/components/ui/button";
import { GlobalImportDialog } from "@/components/world/global-import-dialog";
import { GlobalPositionSheet } from "@/components/world/global-position-sheet";
import { GlobalTxnEditDialog } from "@/components/world/global-txn-edit-dialog";
import { deleteGlobalTxn, deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import type { GlobalTxn } from "@/lib/world/import";
import { StatChip, ChipRow } from "@/components/stat-chip";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { holdingSymbolsQuery, transactionsQuery } from "@/lib/queries";
import { formatDate, formatQty, toNumber } from "@/lib/format";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { TransactionItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions | MeroShare Investor Console" },
      {
        name: "description",
        content: "Credit and debit history for every stock in your demat account.",
      },
      { property: "og:title", content: "Transactions | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Credit and debit history for every stock in your demat account.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/transactions")],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search["tab"] === "global" ? ("global" as const) : ("meroshare" as const),
  }),
  component: TransactionsPage,
});

function transactionsCsv(items: TransactionItem[]) {  const rows = items.map((t, i) => [
    i + 1,
    formatDate(t.transactionDate),
    t.script ?? "",
    t.historyDescription ?? "",
    toNumber(t.creditQuantity) > 0 ? String(toNumber(t.creditQuantity)) : "",
    toNumber(t.debitQuantity) > 0 ? String(toNumber(t.debitQuantity)) : "",
    String(toNumber(t.balanceAfterTransaction)),
  ]);
  return buildCsv(["SN", "Date", "Script", "Description", "Credit", "Debit", "Balance"], rows);
}

function formatGbp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(v);
}

function formatShares(qty: number): string {
  return String(Number(qty.toFixed(8)));
}

const GLOBAL_SIDE_TONE: Record<GlobalTxn["side"], string> = {
  BUY: "bg-gain/15 text-gain",
  SELL: "bg-loss/15 text-loss",
  DIV: "bg-primary/15 text-primary",
  CASH: "bg-muted text-muted-foreground",
};

function globalTxnsCsv(items: GlobalTxn[]) {
  const rows = items.map((t) => [
    formatDate(t.date),
    t.side,
    t.symbol || "-",
    t.name,
    t.qty > 0 ? formatShares(t.qty) : "",
    t.price > 0 ? `${t.price} ${t.currency}` : "",
    t.currency,
    t.costGbp != null ? t.costGbp.toFixed(2) : "",
    t.notes,
  ]);
  return buildCsv(
    ["Date", "Type", "Symbol", "Name", "Qty", "Price", "Currency", "Total GBP", "Notes"],
    rows,
  );
}

function TransactionsPage() {
  const { tab: tabParam } = Route.useSearch();
  const [txTab, setTxTab] = useState<"meroshare" | "global">(tabParam);
  const [symbol, setSymbol] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [gSearch, setGSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<GlobalTxn | null>(null);
  const [positionSymbol, setPositionSymbol] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const globalTxns = useGlobalTxns();
  const { sort, toggle } = useSort<
    "date" | "script" | "description" | "credit" | "debit" | "balance"
  >(
    { key: "date", dir: "desc" },
    {
      date: "number",
      script: "text",
      description: "text",
      credit: "number",
      debit: "number",
      balance: "number",
    },
  );
  const symbols = useQuery(holdingSymbolsQuery());
  const q = useQuery(transactionsQuery(symbol === "all" ? null : symbol));
  const items = q.data?.items ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? items.filter((t) =>
          [t.script, t.historyDescription, String(t.transactionDate ?? "")]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(term)),
        )
      : items;
    const getter = (t: (typeof rows)[number]): string | number => {
      switch (sort.key) {
        case "script":
          return t.script ?? "";
        case "description":
          return t.historyDescription ?? "";
        case "credit":
          return toNumber(t.creditQuantity);
        case "debit":
          return toNumber(t.debitQuantity);
        case "balance":
          return toNumber(t.balanceAfterTransaction);
        default:
          return String(t.transactionDate ?? "");
      }
    };
    return sortBy(rows, getter, sort.dir);
  }, [items, search, sort]);

  const totalCredit = filtered.reduce((sum, t) => sum + Math.max(0, toNumber(t.creditQuantity)), 0);
  const totalDebit = filtered.reduce((sum, t) => sum + Math.max(0, toNumber(t.debitQuantity)), 0);

  const globalHoldings = useMemo(() => deriveHoldings(globalTxns), [globalTxns]);
  const gFiltered = useMemo(() => {
    const term = gSearch.trim().toLowerCase();
    const rows = term
      ? globalTxns.filter((t) =>
          [t.symbol, t.name, t.notes, t.side].some((s) => s.toLowerCase().includes(term)),
        )
      : globalTxns;
    return [...rows].sort((a, b) => b.date.localeCompare(a.date));
  }, [globalTxns, gSearch]);

  const visibleIds = useMemo(() => gFiltered.map((t) => t.id), [gFiltered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selected.includes(id));
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAllVisible = () =>
    setSelected((prev) =>
      allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : [...new Set([...prev, ...visibleIds])],
    );
  const selectedRows = useMemo(
    () => gFiltered.filter((t) => selected.includes(t.id)),
    [gFiltered, selected],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Transactions</h1>
        </div>
        <div className="flex items-center gap-2">
          {txTab === "meroshare" ? (
            <>
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All stocks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stocks</SelectItem>
              {(symbols.data ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButton
            disabled={filtered.length === 0}
            formats={[
              {
                title: "CSV",
                description: "Every credit, debit and running balance",
                filename: `transactions-${symbol === "all" ? "all" : symbol}`,
                extension: "csv",
                build: () => transactionsCsv(filtered),
              },
              {
                title: "JSON",
                description: "Raw demat movement records",
                filename: `transactions-${symbol === "all" ? "all" : symbol}`,
                extension: "json",
                build: () => JSON.stringify(filtered, null, 2),
              },
              {
                title: "PDF",
                description: "Formatted statement for printing or sharing",
                filename: `transactions-${symbol === "all" ? "all" : symbol}`,
                extension: "pdf",
                build: () => "",
                pdf: () => ({
                  title: "Demat transaction history",
                  head: ["SN", "Date", "Script", "Description", "Credit", "Debit", "Balance"],
                  body: filtered.map((t, i) => [
                    i + 1,
                    formatDate(t.transactionDate),
                    t.script ?? "",
                    t.historyDescription ?? "",
                    toNumber(t.creditQuantity) > 0 ? `+${formatQty(t.creditQuantity)}` : "",
                    toNumber(t.debitQuantity) > 0 ? `−${formatQty(t.debitQuantity)}` : "",
                    formatQty(toNumber(t.balanceAfterTransaction)),
                  ]),
                }),
              },
            ]}
          />
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="gap-1.5"
              >
                <FileUp className="size-3.5" /> Import
              </Button>
              <ExportButton
                disabled={gFiltered.length === 0}
                formats={[
                  {
                    title: "CSV",
                    description: "Global transactions only (never demat)",
                    filename: "global-transactions",
                    extension: "csv",
                    build: () => globalTxnsCsv(gFiltered),
                  },
                  {
                    title: "JSON",
                    description: "Raw global records",
                    filename: "global-transactions",
                    extension: "json",
                    build: () => JSON.stringify(gFiltered, null, 2),
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      <Tabs
        value={txTab}
        onValueChange={(v) => setTxTab(v as "meroshare" | "global")}
        className="self-start"
      >
        <TabsList>
          <TabsTrigger value="meroshare">MeroShare</TabsTrigger>
          <TabsTrigger value="global">
            Global{globalHoldings.length > 0 ? ` (${globalHoldings.length})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {txTab === "meroshare" ? (
        <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by stock or description…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      <ChipRow wrap>
        <StatChip
          icon={<ArrowDownRight className="size-4 text-gain" />}
          label="Records"
          value={formatQty(q.data?.total ?? 0)}
        />
        <StatChip
          icon={<ArrowDownRight className="size-4 text-gain" />}
          label="Total credited"
          value={formatQty(totalCredit)}
          valueClass="text-gain"
        />
        <StatChip
          icon={<ArrowUpRight className="size-4 text-loss" />}
          label="Total debited"
          value={formatQty(totalDebit)}
          valueClass="text-loss"
        />
      </ChipRow>

      {q.isLoading ? (
        <LoadingBlock label="Loading transactions" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No transactions"
          description="No movement recorded for this selection."
        />
      ) : filtered.length === 0 ? (
        <EmptyBlock
          title="No matches"
          description="Nothing matches your search. Try a different stock or description."
        />
      ) : (
        <div className="overflow-clip rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <SortableTh
                  label="Date"
                  active={sort.key === "date"}
                  dir={sort.dir}
                  onClick={() => toggle("date")}
                  align="left"
                />
                <SortableTh
                  label="Script"
                  active={sort.key === "script"}
                  dir={sort.dir}
                  onClick={() => toggle("script")}
                  align="left"
                  kind="text"
                />
                <SortableTh
                  label="Description"
                  active={sort.key === "description"}
                  dir={sort.dir}
                  onClick={() => toggle("description")}
                  align="left"
                  className="hidden md:table-cell"
                  kind="text"
                />
                <SortableTh
                  label="Credit"
                  active={sort.key === "credit"}
                  dir={sort.dir}
                  onClick={() => toggle("credit")}
                  align="right"
                />
                <SortableTh
                  label="Debit"
                  active={sort.key === "debit"}
                  dir={sort.dir}
                  onClick={() => toggle("debit")}
                  align="right"
                />
                <SortableTh
                  label="Balance"
                  active={sort.key === "balance"}
                  dir={sort.dir}
                  onClick={() => toggle("balance")}
                  align="right"
                  className="pr-4"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, idx) => (
                <TableRow key={`${t.script}-${String(t.transactionDate)}-${idx}`}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(t.transactionDate)}
                  </TableCell>
                  <TableCell className="font-semibold">{t.script}</TableCell>
                  <TableCell
                    className="hidden max-w-72 truncate text-xs text-muted-foreground md:table-cell"
                    title={t.historyDescription}
                  >
                    {t.historyDescription ?? "-"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-gain">
                    {toNumber(t.creditQuantity) > 0 ? `+${formatQty(t.creditQuantity)}` : "-"}
                  </TableCell>
                  <TableCell className="num text-right font-semibold text-loss">
                    {toNumber(t.debitQuantity) > 0 ? `−${formatQty(t.debitQuantity)}` : "-"}
                  </TableCell>
                  <TableCell className="num pr-4 text-right text-muted-foreground">
                    {formatQty(t.balanceAfterTransaction)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
        </>
      ) : (
        <>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={gSearch}
              onChange={(e) => setGSearch(e.target.value)}
              placeholder="Search global transactions…"
              aria-label="Search global transactions"
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <ChipRow wrap>
            <StatChip label="Records" value={String(globalTxns.length)} />
            <StatChip label="Symbols held" value={String(globalHoldings.length)} />
          </ChipRow>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
              <span className="text-xs font-semibold">
                {selected.length} selected
              </span>
              {confirmBulk ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    for (const id of selected) deleteGlobalTxn(id);
                    toast.success(`Deleted ${selected.length} transactions.`);
                    setSelected([]);
                    setConfirmBulk(false);
                  }}
                >
                  Tap again to delete {selected.length}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmBulk(true)}>
                  Delete ({selected.length})
                </Button>
              )}
              <ExportButton
                disabled={selectedRows.length === 0}
                formats={[
                  {
                    title: "CSV",
                    description: "Selected global rows only",
                    filename: "global-transactions-selected",
                    extension: "csv",
                    build: () => globalTxnsCsv(selectedRows),
                  },
                  {
                    title: "JSON",
                    description: "Selected raw records",
                    filename: "global-transactions-selected",
                    extension: "json",
                    build: () => JSON.stringify(selectedRows, null, 2),
                  },
                ]}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected([]);
                  setConfirmBulk(false);
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {globalTxns.length === 0 ? (
            <EmptyBlock
              title="No global transactions"
              description="Foreign holdings live here, never mixed with NEPSE demat. Import a Trading 212 statement or standard CSV — or try the demo data."
            >
              <Button size="sm" onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            </EmptyBlock>
          ) : gFiltered.length === 0 ? (
            <EmptyBlock title="No matches" description="Nothing matches your search.">
              <button
                type="button"
                onClick={() => setGSearch("")}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear search
              </button>
            </EmptyBlock>
          ) : (
            <div className="overflow-clip rounded-2xl border border-border/70 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 pl-4">
                      <input
                        type="checkbox"
                        aria-label={allVisibleSelected ? "Deselect all rows" : "Select all rows"}
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={() => toggleAllVisible()}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 accent-primary"
                      />
                    </TableHead>
                    <TableHead className="w-10">SN</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-20 pr-4">
                      <span className="sr-only">Row actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gFiltered.map((t, idx) => (
                    <TableRow
                      key={t.id}
                      className={t.symbol ? "cursor-pointer" : undefined}
                      onClick={() => {
                        if (t.symbol) setPositionSymbol(t.symbol);
                      }}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.symbol || "cash"} transaction`}
                          checked={selected.includes(t.id)}
                          onChange={() => toggleOne(t.id)}
                          className="size-4 accent-primary"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(t.date)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`num inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${GLOBAL_SIDE_TONE[t.side]}`}
                        >
                          {t.side}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold">{t.symbol || "—"}</p>
                        {t.name ? (
                          <p className="max-w-52 truncate text-xs text-muted-foreground">
                            {t.name}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="num text-right">
                        {t.qty > 0 ? formatShares(t.qty) : "-"}
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">
                        {t.price > 0 ? `${t.price} ${t.currency}` : "-"}
                      </TableCell>
                      <TableCell className="num text-right font-medium">
                        {formatGbp(t.costGbp)}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${t.symbol || "cash"} transaction`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(null);
                              setEditingTxn(t);
                            }}
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="size-4" />
                          </button>
                          {confirmDelete === t.id ? (
                            <button
                              type="button"
                              aria-label="Tap again to confirm delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (deleteGlobalTxn(t.id)) toast.success("Transaction deleted.");
                                setSelected((prev) => prev.filter((id) => id !== t.id));
                                setConfirmDelete(null);
                              }}
                              className="flex h-9 items-center rounded-lg bg-destructive/15 px-2 text-xs font-semibold text-destructive"
                            >
                              Sure?
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Delete ${t.symbol || "cash"} transaction`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(t.id);
                              }}
                              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <GlobalImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <GlobalTxnEditDialog txn={editingTxn} onOpenChange={() => setEditingTxn(null)} />
          <GlobalPositionSheet
            symbol={positionSymbol}
            onOpenChange={(open) => {
              if (!open) setPositionSymbol(null);
            }}
          />
        </>
      )}
    </div>
  );
}
