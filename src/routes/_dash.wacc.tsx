import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, RotateCcw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBlock, EmptyBlock, SkeletonCards } from "@/components/states";
import { ExportButton, csvRow } from "@/components/export-dialog";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import {
  holdingSymbolsQuery,
  investmentSummaryQuery,
  waccReportQuery,
  waccScripsQuery,
  waccSearchQuery,
} from "@/lib/queries";
import { calculateWacc } from "@/lib/meroshare/portfolio.functions";
import { errorMessage, formatDate, formatNpr, formatQty, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { PurchaseSourceItem, WaccReportItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/wacc")({
  validateSearch: (search: Record<string, unknown>) => ({
    scrip:
      typeof search["scrip"] === "string" && (search["scrip"] as string).trim()
        ? (search["scrip"] as string).trim().toUpperCase()
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Purchase Source | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Set purchase prices for your transactions and submit them so CDSC calculates your WACC.",
      },
      { property: "og:title", content: "Purchase Source | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Review pending purchase source entries and your completed WACC calculation.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/wacc")],
  }),
  component: WaccPage,
});

const DECLARATION =
  "I hereby declare that the prices I have set here for WACC calculation purposes are provided to the best of my knowledge and I am aware that I will be held liable for legal consequences if the provided data is found to be incorrect.";

function rowQty(r: PurchaseSourceItem): number {
  return Math.max(0, toNumber(r.quantity ?? r.transactionQuantity));
}

/** Price used for the WACC: the user-set value, falling back to the row's rate. */
function rowPrice(r: PurchaseSourceItem): number {
  return toNumber(r.userPrice ?? r.rate ?? r.purchasePrice);
}

function waccCsv(scrip: string, rows: PurchaseSourceItem[]) {
  const lines = rows.map((r, idx) =>
    csvRow([
      idx + 1,
      String(r.scrip ?? scrip),
      String(r.postDate ?? r.transactionDate ?? ""),
      String(r.quantity ?? r.transactionQuantity ?? ""),
      String(rowPrice(r)),
      String(toNumber(r.userCost)),
      String(r.remarks ?? ""),
    ]),
  );
  return [
    csvRow(["SN", "Scrip", "Post date", "Quantity", "Price", "User cost", "Remarks"]),
    ...lines,
  ].join("\n");
}

type RowSortKey = "date" | "qty" | "price" | "cost";

function rowDate(r: PurchaseSourceItem): number {
  const t = new Date(String(r.postDate ?? r.transactionDate ?? "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

function SummaryTable({ scrip, rows }: { scrip: string; rows: PurchaseSourceItem[] }) {
  const { sort, toggle } = useSort<RowSortKey>(
    { key: "date", dir: "asc" },
    { date: "number", qty: "number", price: "number", cost: "number" },
  );
  const sorted = useMemo(() => {
    switch (sort.key) {
      case "qty":
        return sortBy(rows, rowQty, sort.dir);
      case "price":
        return sortBy(rows, rowPrice, sort.dir);
      case "cost":
        return sortBy(rows, (r) => rowQty(r) * toNumber(r.userCost), sort.dir);
      default:
        return sortBy(rows, rowDate, sort.dir);
    }
  }, [rows, sort]);
  const totalUnits = rows.reduce((s, r) => s + rowQty(r), 0);
  const totalCost = rows.reduce((s, r) => s + Math.max(0, toNumber(r.userCost)), 0);
  const waccRate = totalUnits ? totalCost / totalUnits : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600">
          <ShieldCheck className="size-3.5" /> WACC calculated
        </span>
        <span className="num rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {formatQty(totalUnits)} units · {formatNpr(totalCost)} total cost · WACC{" "}
          {formatNpr(Math.round(waccRate * 100) / 100)}
        </span>
        <ExportButton
          formats={[
            {
              title: "CSV",
              description: "Every purchase source row used in the WACC",
              filename: `wacc-${scrip}`,
              extension: "csv",
              build: () => waccCsv(scrip, rows),
            },
            {
              title: "JSON",
              description: "Raw purchase source records",
              filename: `wacc-${scrip}`,
              extension: "json",
              build: () => JSON.stringify(rows, null, 2),
            },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                SN
              </th>
              <SortableTh
                label="Post date"
                active={sort.key === "date"}
                dir={sort.dir}
                onClick={() => toggle("date")}
              />
              <SortableTh
                label="Quantity"
                align="right"
                active={sort.key === "qty"}
                dir={sort.dir}
                onClick={() => toggle("qty")}
              />
              <SortableTh
                label="Price"
                align="right"
                active={sort.key === "price"}
                dir={sort.dir}
                onClick={() => toggle("price")}
              />
              <SortableTh
                label="User cost"
                align="right"
                active={sort.key === "cost"}
                dir={sort.dir}
                onClick={() => toggle("cost")}
              />
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sorted.map((r, idx) => (
              <tr key={`${r.postDate}-${idx}`} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5">{formatDate(r.postDate ?? r.transactionDate)}</td>
                <td className="num px-4 py-2.5 text-right">{formatQty(rowQty(r))}</td>
                <td className="num px-4 py-2.5 text-right">{formatNpr(rowPrice(r))}</td>
                <td className="num px-4 py-2.5 text-right font-medium">
                  {formatNpr(toNumber(r.userCost))}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                  {r.remarks || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DraftRow extends PurchaseSourceItem {
  checked: boolean;
  priceText: string;
  remarksText: string;
}

function PendingTable({ scrip, rows }: { scrip: string; rows: PurchaseSourceItem[] }) {
  const queryClient = useQueryClient();
  const toDraft = (r: PurchaseSourceItem): DraftRow => ({
    ...r,
    checked: true,
    priceText: String(toNumber(r.userPrice ?? r.rate ?? r.purchasePrice) || ""),
    remarksText: String(r.remarks ?? ""),
  });
  const [drafts, setDrafts] = useState<DraftRow[]>(() => rows.map(toDraft));
  const [declared, setDeclared] = useState(false);

  // Re-seed drafts when a different scrip's rows arrive.
  const [seededFor, setSeededFor] = useState(scrip);
  if (seededFor !== scrip) {
    setSeededFor(scrip);
    setDrafts(rows.map(toDraft));
    setDeclared(false);
  }

  const updateDraft = (idx: number, patch: Partial<DraftRow>) =>
    setDrafts((prev) => prev.map((d, i) => (i === idx ? ({ ...d, ...patch } as DraftRow) : d)));

  const selected = drafts.filter((d) => d.checked && toNumber(d.priceText) > 0);
  const allChecked = drafts.length > 0 && drafts.every((d) => d.checked);

  // Draft rows with the edited prices, for export before submitting.
  const draftRows: PurchaseSourceItem[] = useMemo(
    () =>
      drafts.map((d) => ({
        ...d,
        userPrice: toNumber(d.priceText),
        userCost: rowQty(d) * toNumber(d.priceText),
        remarks: d.remarksText.trim(),
      })),
    [drafts],
  );

  const preview = useMemo(() => {
    let units = 0;
    let cost = 0;
    for (const d of selected) {
      const q = rowQty(d);
      units += q;
      cost += q * toNumber(d.priceText);
    }
    return { units, cost, wacc: units ? cost / units : 0 };
  }, [selected]);

  const { sort, toggle } = useSort<RowSortKey>(
    { key: "date", dir: "asc" },
    { date: "number", qty: "number", price: "number", cost: "number" },
  );
  // Sorted view keeps each draft's original index so edits map back correctly.
  const sortedView = useMemo(() => {
    const view = drafts.map((d, idx) => ({ d, idx }));
    switch (sort.key) {
      case "qty":
        return sortBy(view, (v) => rowQty(v.d), sort.dir);
      case "price":
        return sortBy(view, (v) => toNumber(v.d.priceText), sort.dir);
      case "cost":
        return sortBy(view, (v) => rowQty(v.d) * toNumber(v.d.priceText), sort.dir);
      default:
        return sortBy(view, (v) => rowDate(v.d), sort.dir);
    }
  }, [drafts, sort]);

  const submit = useMutation({
    mutationFn: () =>
      calculateWacc({
        data: {
          scrip,
          rows: selected.map((d) => ({
            ...d,
            userPrice: toNumber(d.priceText),
            remarks: d.remarksText.trim(),
            isEdit: true,
          })),
        },
      }),
    onSuccess: () => {
      toast.success(`WACC submitted for ${scrip}.`);
      void queryClient.invalidateQueries({ queryKey: ["wacc-search"] });
      void queryClient.invalidateQueries({ queryKey: ["wacc-scrips"] });
      void queryClient.invalidateQueries({ queryKey: ["wacc-report"] });
      void queryClient.invalidateQueries({ queryKey: ["investment-summary"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not submit the purchase source.")),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
          <ListChecks className="size-3.5" /> Awaiting WACC calculation
        </span>
        {selected.length ? (
          <span className="num rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
            {selected.length} rows · {formatQty(preview.units)} units · WACC ≈{" "}
            {formatNpr(Math.round(preview.wacc * 100) / 100)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDrafts((prev) => prev.map((d) => ({ ...d, checked: !allChecked })))}
          >
            {allChecked ? "Select none" : "Select all"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setDrafts((prev) =>
                prev.map((d) => ({
                  ...d,
                  priceText: String(toNumber(d.rate ?? d.purchasePrice) || ""),
                })),
              )
            }
          >
            <RotateCcw className="size-3.5" /> Reset prices
          </Button>
          <ExportButton
            formats={[
              {
                title: "CSV",
                description: "Your rows with the prices set here",
                filename: `purchase-source-${scrip}`,
                extension: "csv",
                build: () => waccCsv(scrip, draftRows),
              },
              {
                title: "JSON",
                description: "Raw purchase source records",
                filename: `purchase-source-${scrip}`,
                extension: "json",
                build: () => JSON.stringify(draftRows, null, 2),
              },
            ]}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allChecked}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d) => ({ ...d, checked: e.target.checked })))
                  }
                />
              </th>
              <SortableTh
                label="Post date"
                active={sort.key === "date"}
                dir={sort.dir}
                onClick={() => toggle("date")}
              />
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:table-cell">
                Type
              </th>
              <SortableTh
                label="Quantity"
                align="right"
                active={sort.key === "qty"}
                dir={sort.dir}
                onClick={() => toggle("qty")}
              />
              <SortableTh
                label="Purchase price"
                active={sort.key === "price"}
                dir={sort.dir}
                onClick={() => toggle("price")}
              />
              <SortableTh
                label="Cost"
                align="right"
                active={sort.key === "cost"}
                dir={sort.dir}
                onClick={() => toggle("cost")}
              />
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sortedView.map(({ d, idx }) => {
              const price = toNumber(d.priceText);
              const invalid = d.checked && price <= 0;
              return (
                <tr
                  key={d.id ?? `${d.transactionDate}-${idx}`}
                  className={cn("hover:bg-accent/30", !d.checked && "opacity-50")}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select row ${idx + 1}`}
                      checked={d.checked}
                      onChange={(e) => updateDraft(idx, { checked: e.target.checked })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {formatDate(d.postDate ?? d.transactionDate)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                    {String(d["transactionType"] ?? d.source ?? "")}
                  </td>
                  <td className="num px-4 py-2.5 text-right">{formatQty(rowQty(d))}</td>
                  <td className="px-4 py-2.5">
                    <Input
                      inputMode="decimal"
                      className={cn("h-8 w-28", invalid && "border-destructive")}
                      aria-label={`Purchase price for row ${idx + 1}`}
                      placeholder="Price"
                      value={d.priceText}
                      onChange={(e) => updateDraft(idx, { priceText: e.target.value })}
                    />
                  </td>
                  <td className="num px-4 py-2.5 text-right text-muted-foreground">
                    {price > 0 ? formatNpr(rowQty(d) * price) : ""}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <Input
                      className="h-8 w-full min-w-40"
                      placeholder="e.g. contract no."
                      aria-label={`Remarks for row ${idx + 1}`}
                      value={d.remarksText}
                      onChange={(e) => updateDraft(idx, { remarksText: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-4">
        {submit.isError ? <ErrorBlock error={submit.error} /> : null}
        <div className="flex items-start gap-3">
          <input
            id="wacc-declare"
            type="checkbox"
            className="mt-0.5"
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
          />
          <Label htmlFor="wacc-declare" className="text-xs leading-relaxed text-muted-foreground">
            {DECLARATION}
          </Label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="num text-xs text-muted-foreground">
            {selected.length
              ? `${formatQty(preview.units)} units · ${formatNpr(preview.cost)} total · WACC ≈ ${formatNpr(
                  Math.round(preview.wacc * 100) / 100,
                )}`
              : "Tick rows and set a price above 0 to proceed."}
          </p>
          <Button
            disabled={!declared || !selected.length || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Submitting…" : `Proceed (${selected.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function reportCsv(holdings: WaccReportItem[]) {
  const lines = holdings.map((h) =>
    csvRow([
      String(h.scrip ?? ""),
      String(toNumber(h.totalQuantity)),
      String(toNumber(h.averageBuyRate)),
      String(toNumber(h.totalCost)),
      String(h.lastModifiedDate ?? ""),
    ]),
  );
  return [csvRow(["Scrip", "Quantity", "WACC rate", "Total cost", "Last modified"]), ...lines].join(
    "\n",
  );
}

function WaccReportPanel({
  highlightScrip,
  autoScroll,
  onPickScrip,
}: {
  highlightScrip: string | undefined;
  autoScroll: boolean;
  onPickScrip: (scrip: string) => void;
}) {
  const report = useQuery(waccReportQuery());
  const holdings = report.data?.waccReportResponse ?? [];
  const { sort, toggle } = useSort<"scrip" | "qty" | "rate" | "cost">(
    { key: "scrip", dir: "asc" },
    { scrip: "text", qty: "number", rate: "number", cost: "number" },
  );
  const sorted = useMemo(() => {
    switch (sort.key) {
      case "qty":
        return sortBy(holdings, (h) => toNumber(h.totalQuantity), sort.dir);
      case "rate":
        return sortBy(holdings, (h) => toNumber(h.averageBuyRate), sort.dir);
      case "cost":
        return sortBy(holdings, (h) => toNumber(h.totalCost), sort.dir);
      default:
        return sortBy(holdings, (h) => String(h.scrip ?? ""), sort.dir);
    }
  }, [holdings, sort]);
  const highlight = highlightScrip?.toUpperCase() ?? "";
  // Deep-link landing (?scrip=): jump once to the scrip's row in the
  // all-calculated table. Manual picks only highlight, never yank scroll.
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoScroll || !highlight || scrolledFor.current === highlight) return;
    const el = rowRefs.current.get(highlight);
    if (el) {
      scrolledFor.current = highlight;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  if (!report.data || holdings.length === 0) return null;
  const totalCost = holdings.reduce((s, h) => s + Math.max(0, toNumber(h.totalCost)), 0);
  const totalUnits = holdings.reduce((s, h) => s + Math.max(0, toNumber(h.totalQuantity)), 0);
  const avgWacc = totalUnits ? totalCost / totalUnits : 0;
  return (
    <section className="space-y-3 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-semibold">Calculated WACC</h2>
        <span className="text-xs text-muted-foreground">all scrips</span>
        <span className="num ml-auto rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {holdings.length} scrips · {formatQty(totalUnits)} units · {formatNpr(totalCost)} invested
        </span>
        <ExportButton
          formats={[
            {
              title: "CSV",
              description: "Calculated WACC for every scrip",
              filename: "wacc-report",
              extension: "csv",
              build: () => reportCsv(holdings),
            },
            {
              title: "JSON",
              description: "Raw WACC report records",
              filename: "wacc-report",
              extension: "json",
              build: () => JSON.stringify(report.data, null, 2),
            },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
              <SortableTh
                label="Scrip"
                active={sort.key === "scrip"}
                dir={sort.dir}
                onClick={() => toggle("scrip")}
                kind="text"
              />
              <SortableTh
                label="Quantity"
                align="right"
                active={sort.key === "qty"}
                dir={sort.dir}
                onClick={() => toggle("qty")}
              />
              <SortableTh
                label="WACC rate"
                align="right"
                active={sort.key === "rate"}
                dir={sort.dir}
                onClick={() => toggle("rate")}
              />
              <SortableTh
                label="Total cost"
                align="right"
                active={sort.key === "cost"}
                dir={sort.dir}
                onClick={() => toggle("cost")}
              />
              <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sorted.map((h) => {
              const key = String(h.scrip ?? "").toUpperCase();
              const isHi = highlight !== "" && key === highlight;
              return (
              <tr
                key={String(h.scrip)}
                ref={(el) => {
                  if (el) rowRefs.current.set(key, el);
                  else rowRefs.current.delete(key);
                }}
                onClick={() => onPickScrip(String(h.scrip ?? ""))}
                title={`View WACC detail for ${String(h.scrip ?? "")}`}
                className={cn("cursor-pointer hover:bg-accent/30", isHi && "bg-primary/10")}
              >
                <td className="px-4 py-2.5 font-semibold">{h.scrip}</td>
                <td className="num px-4 py-2.5 text-right">
                  {formatQty(toNumber(h.totalQuantity))}
                </td>
                <td className="num px-4 py-2.5 text-right">
                  {formatNpr(toNumber(h.averageBuyRate))}
                </td>
                <td className="num px-4 py-2.5 text-right">{formatNpr(toNumber(h.totalCost))}</td>
                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                  {h.lastModifiedDate ?? ""}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/70 bg-muted/40 font-semibold">
              <td className="px-4 py-2.5">
                Total · {holdings.length} scrip{holdings.length > 1 ? "s" : ""}
              </td>
              <td className="num px-4 py-2.5 text-right">{formatQty(totalUnits)}</td>
              <td
                className="num px-4 py-2.5 text-right"
                title="Average WACC across all scrips (total cost / total units)"
              >
                {formatNpr(Math.round(avgWacc * 100) / 100)}
              </td>
              <td className="num px-4 py-2.5 text-right">{formatNpr(totalCost)}</td>
              <td className="hidden md:table-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[0.68rem] text-muted-foreground">
        This cost basis is what determines your capital gains tax when you sell.
      </p>
    </section>
  );
}

function WaccPage() {
  const symbols = useQuery(holdingSymbolsQuery());
  const pendingScrips = useQuery(waccScripsQuery());
  const { scrip: scripParam } = Route.useSearch();
  const [scrip, setScrip] = useState(scripParam ?? "");
  // Follow ?scrip= links (e.g. from a stock's detail sheet) even when the
  // page is already open — without this the selection would go stale.
  useEffect(() => {
    if (scripParam) setScrip(scripParam);
  }, [scripParam]);
  const search = useQuery(waccSearchQuery(scrip || null));
  const investment = useQuery(investmentSummaryQuery());
  // Same cache as the Calculated WACC panel below — if the totals show there,
  // this entry exists here too. No separate fetch, no separate failure mode.
  const report = useQuery(waccReportQuery());

  // Already-known basis for the selected scrip. The account-wide report is
  // authoritative and read directly (it visibly works); the investment
  // summary backs it up for view-/purchase-source-only scrips.
  const upperScrip = scrip.toUpperCase();
  const reportRow = (report.data?.waccReportResponse ?? []).find(
    (h) => String(h.scrip ?? "").toUpperCase() === upperScrip && toNumber(h.totalCost) > 0,
  );
  const reportUnits = Math.max(0, toNumber(reportRow?.totalQuantity));
  const reportCost = Math.max(0, toNumber(reportRow?.totalCost));
  const reportRate = toNumber(reportRow?.averageBuyRate);
  const basisEntry = reportRow
    ? {
        scrip: upperScrip,
        units: reportUnits,
        cost: reportCost,
        waccRate: reportRate > 0 ? reportRate : reportUnits > 0 ? reportCost / reportUnits : 0,
        status: "calculated" as const,
      }
    : ((investment.data?.scrips ?? []).find(
        (s) => s.scrip === upperScrip && s.cost > 0 && s.units > 0,
      ) ?? null);
  const searchHasSummary = (search.data?.waccSummaryResponse ?? []).length > 0;
  // Calculated WACC renders its SummaryTable by default from the known basis
  // when the per-scrip search can't supply its own rows (blocked or empty).
  // A single aggregate row stands in for the transaction detail, labeled as
  // such in Remarks.
  const fallbackSummaryRows: PurchaseSourceItem[] =
    basisEntry?.status === "calculated" && !searchHasSummary && !search.isPending
      ? [
          {
            scrip,
            quantity: basisEntry.units,
            transactionQuantity: basisEntry.units,
            rate: Math.round(basisEntry.waccRate * 100) / 100,
            purchasePrice: Math.round(basisEntry.waccRate * 100) / 100,
            userPrice: Math.round(basisEntry.waccRate * 100) / 100,
            userCost: basisEntry.cost,
            remarks: "Aggregated total — transaction rows unavailable",
          },
        ]
      : [];
  // Pending estimates keep the compact banner (no table to fill).
  const showBasisBanner = Boolean(
    scrip && basisEntry && basisEntry.status === "pending" && !search.isPending,
  );

  const pendingList = pendingScrips.data?.scrips ?? [];
  const pendingFailed = pendingScrips.data?.failed === true;
  const manualSymbols = useMemo(
    () => (symbols.data ?? []).filter((s) => !pendingList.includes(s)),
    [symbols.data, pendingList],
  );

  // Default overview (no scrip selected): completed WACC straight from the
  // aggregated investment summary, plus a guided list of pending scrips that
  // jump straight into their calculation when tapped.
  const doneScrips = useMemo(
    () =>
      (investment.data?.scrips ?? [])
        .filter((s) => s.status === "calculated" && s.cost > 0)
        .sort((a, b) => a.scrip.localeCompare(b.scrip)),
    [investment.data],
  );
  const todoScrips = useMemo(() => {
    const fromPending = pendingList.filter(
      (s) => !doneScrips.some((d) => d.scrip === s),
    );
    if (fromPending.length > 0) return fromPending;
    return (investment.data?.scrips ?? [])
      .filter((s) => s.status !== "calculated")
      .map((s) => s.scrip)
      .sort();
  }, [pendingList, investment.data, doneScrips]);
  const doneTotals = useMemo(
    () => ({
      units: doneScrips.reduce((s, r) => s + r.units, 0),
      cost: doneScrips.reduce((s, r) => s + r.cost, 0),
    }),
    [doneScrips],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Purchase Source</h1>
        {pendingScrips.data ? (
          pendingList.length ? (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
              {pendingList.length} pending
            </span>
          ) : pendingFailed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Pending check blocked: pick from holdings below
              <button
                type="button"
                onClick={() => void pendingScrips.refetch()}
                className="font-semibold text-primary hover:underline"
              >
                Retry
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
              <ShieldCheck className="size-3" /> all calculated
            </span>
          )
        ) : null}
      </div>
      <p className="-mt-3 hidden text-sm text-muted-foreground sm:block">
        Set the price you paid for each transaction and submit it so CDSC calculates your WACC.
      </p>

      {symbols.isError ? (
        <ErrorBlock error={symbols.error} retry={() => void symbols.refetch()} />
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={scrip} onValueChange={setScrip}>
            <SelectTrigger className="sm:w-72">
              <SelectValue placeholder="Select a scrip" />
            </SelectTrigger>
            <SelectContent>
              {pendingList.length ? (
                <>
                  <div className="px-2 py-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Pending WACC
                  </div>
                  {pendingList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </>
              ) : null}
              {manualSymbols.length ? (
                <>
                  <div className="px-2 pb-1 pt-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    Holdings
                  </div>
                  {manualSymbols.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </>
              ) : null}
            </SelectContent>
          </Select>
          {pendingScrips.isLoading || symbols.isLoading ? (
            <span className="animate-pulse text-xs text-muted-foreground">
              Checking pending scrips…
            </span>
          ) : null}
          {scrip ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScrip("")}
              className="sm:ml-auto"
              title="Clear selection and return to the overview"
            >
              <X className="size-3.5" /> Overview
            </Button>
          ) : null}
        </div>
        {pendingList.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {pendingList.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScrip(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  scrip === s
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {showBasisBanner && basisEntry ? (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-4">
          {basisEntry.status === "calculated" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600">
              <ShieldCheck className="size-3.5" /> WACC calculated for {scrip}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
              <ListChecks className="size-3.5" /> WACC estimate for {scrip} · pending
            </span>
          )}
          <span className="num text-sm text-muted-foreground">
            {formatQty(basisEntry.units)} units · {formatNpr(basisEntry.cost)} total · WACC{" "}
            {formatNpr(Math.round(basisEntry.waccRate * 100) / 100)}
          </span>
        </section>
      ) : null}

      {!scrip ? (
        investment.isPending || pendingScrips.isPending || symbols.isPending ? (
          <SkeletonCards count={2} />
        ) : doneScrips.length > 0 || todoScrips.length > 0 ? (
          <div className="space-y-8">
            {doneScrips.length > 0 ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold">Calculated WACC</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                    <ShieldCheck className="size-3" /> {doneScrips.length} done
                  </span>
                  <span className="num ml-auto rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
                    {formatQty(doneTotals.units)} units · {formatNpr(doneTotals.cost)} invested
                  </span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/70 bg-muted/40 text-muted-foreground">
                        <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider">
                          Scrip
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">
                          WACC rate
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider">
                          Total cost
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {doneScrips.map((s) => (
                        <tr
                          key={s.scrip}
                          onClick={() => setScrip(s.scrip)}
                          title={`View WACC detail for ${s.scrip}`}
                          className="cursor-pointer hover:bg-accent/30"
                        >
                          <td className="px-4 py-2.5 font-semibold">{s.scrip}</td>
                          <td className="num px-4 py-2.5 text-right">{formatQty(s.units)}</td>
                          <td className="num px-4 py-2.5 text-right">{formatNpr(s.waccRate)}</td>
                          <td className="num px-4 py-2.5 text-right">{formatNpr(s.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/70 bg-muted/40 font-semibold">
                        <td className="px-4 py-2.5">
                          Total · {doneScrips.length} scrip{doneScrips.length > 1 ? "s" : ""}
                        </td>
                        <td className="num px-4 py-2.5 text-right">{formatQty(doneTotals.units)}</td>
                        <td
                          className="num px-4 py-2.5 text-right"
                          title="Average WACC across calculated scrips (total cost / total units)"
                        >
                          {formatNpr(
                            Math.round((doneTotals.cost / Math.max(1, doneTotals.units)) * 100) /
                              100,
                          )}
                        </td>
                        <td className="num px-4 py-2.5 text-right">
                          {formatNpr(doneTotals.cost)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            ) : null}
            {todoScrips.length > 0 ? (
              <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold">Pending completion</h2>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                    {todoScrips.length} to do
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  These still need their purchase prices confirmed. Tap one to jump straight
                  into its calculation.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {todoScrips.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScrip(s)}
                      className="rounded-full border border-border/60 bg-surface px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyBlock
            title="Select a scrip"
            description="Pick a scrip above to load its purchase source entries."
          />
        )
      ) : search.isPending ? (
        <SkeletonCards count={2} />
      ) : search.isError ? (
        <ErrorBlock error={search.error} retry={() => void search.refetch()} />
      ) : (search.data?.waccUpdateResponse ?? []).length > 0 ||
        (search.data?.waccSummaryResponse ?? []).length > 0 ? (
        <div className="space-y-8">
          {(search.data?.waccUpdateResponse ?? []).length > 0 ? (
            <PendingTable key={scrip} scrip={scrip} rows={search.data!.waccUpdateResponse!} />
          ) : null}
          {(search.data?.waccSummaryResponse ?? []).length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-display text-base font-semibold">Calculated for {scrip}</h2>
              <SummaryTable scrip={scrip} rows={search.data!.waccSummaryResponse!} />
            </section>
          ) : null}
        </div>
      ) : fallbackSummaryRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-base font-semibold">Calculated for {scrip}</h2>
          <SummaryTable scrip={scrip} rows={fallbackSummaryRows} />
        </section>
      ) : (
        <EmptyBlock
          title="Nothing to do"
          description={`No purchase source entries found for ${scrip}.`}
        />
      )}

      <WaccReportPanel
        highlightScrip={scrip || undefined}
        autoScroll={Boolean(scripParam && scripParam === scrip)}
        onPickScrip={(s) => {
          setScrip(s);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    </div>
  );
}
