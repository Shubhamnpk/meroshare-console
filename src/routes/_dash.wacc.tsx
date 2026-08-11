import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { holdingSymbolsQuery } from "@/lib/queries";
import { getWaccPending } from "@/lib/meroshare/portfolio.functions";
import { formatDate, formatNpr, formatQty, isoDate, toNumber } from "@/lib/format";
import type { PurchaseSourceItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/wacc")({
  head: () => ({
    meta: [
      { title: "Purchase Source | MeroShare Investor Console" },
      {
        name: "description",
        content: "Review pending purchase source entries and your completed WACC calculation.",
      },
      { property: "og:title", content: "Purchase Source | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Review pending purchase source entries and your completed WACC calculation.",
      },
    ],
  }),
  component: WaccPage,
});

function exportSummaryCsv(scrip: string, rows: PurchaseSourceItem[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = [
    "SN",
    "Scrip",
    "Post date",
    "Quantity",
    "Source",
    "User price",
    "User cost",
    "Remarks",
    "Updated",
  ]
    .map(esc)
    .join(",");
  const lines = rows.map((r, idx) =>
    [
      String(idx + 1),
      String(r.scrip ?? scrip),
      String(r.postDate ?? r.transactionDate ?? ""),
      String(r.quantity ?? r.transactionQuantity ?? ""),
      String(r.purchaseSource ?? r.source ?? ""),
      String(r.userPrice ?? ""),
      String(r.userCost ?? ""),
      String(r.remarks ?? ""),
      String(r.updatedDate ?? ""),
    ]
      .map(esc)
      .join(","),
  );
  const blob = new Blob([`\uFEFF${[header, ...lines].join("\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wacc-${scrip}-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function SummaryTable({ scrip, rows }: { scrip: string; rows: PurchaseSourceItem[] }) {
  if (rows.length === 0) {
    return (
      <EmptyBlock
        title="No summary entries"
        description={`No calculated WACC entries for ${scrip}.`}
      />
    );
  }
  const totalUnits = rows.reduce(
    (s, r) => s + Math.max(0, toNumber(r.quantity ?? r.transactionQuantity)),
    0,
  );
  const totalCost = rows.reduce((s, r) => s + Math.max(0, toNumber(r.userCost)), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600">
          <ShieldCheck className="size-3.5" /> WACC calculated
        </span>
        <span className="num rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground">
          {formatQty(totalUnits)} units · {formatNpr(totalCost)} total cost
        </span>
        <Button variant="outline" size="sm" onClick={() => exportSummaryCsv(scrip, rows)}>
          <FileDown /> Export
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">SN</th>
              <th className="px-4 py-2.5 text-left font-medium">Scrip</th>
              <th className="px-4 py-2.5 text-left font-medium">Post date</th>
              <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
              <th className="px-4 py-2.5 text-left font-medium">Source</th>
              <th className="px-4 py-2.5 text-right font-medium">User price</th>
              <th className="px-4 py-2.5 text-right font-medium">User cost</th>
              <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">Remarks</th>
              <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r, idx) => (
              <tr key={`${r.postDate}-${idx}`} className="hover:bg-accent/30">
                <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-2.5 font-semibold">{r.scrip ?? scrip}</td>
                <td className="px-4 py-2.5">{formatDate(r.postDate ?? r.transactionDate)}</td>
                <td className="num px-4 py-2.5 text-right">
                  {formatQty(toNumber(r.quantity ?? r.transactionQuantity))}
                </td>
                <td className="px-4 py-2.5">{r.purchaseSource ?? r.source ?? "—"}</td>
                <td className="num px-4 py-2.5 text-right">{formatNpr(toNumber(r.userPrice))}</td>
                <td className="num px-4 py-2.5 text-right font-medium">
                  {formatNpr(toNumber(r.userCost))}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                  {r.remarks ?? "—"}
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                  {formatDate(r.updatedDate)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/70 bg-muted/40 font-semibold">
              <td className="px-4 py-2.5" colSpan={3}>
                Total
              </td>
              <td className="num px-4 py-2.5 text-right">{formatQty(totalUnits)}</td>
              <td className="px-4 py-2.5" colSpan={2} />
              <td className="num px-4 py-2.5 text-right">{formatNpr(totalCost)}</td>
              <td className="px-4 py-2.5" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function WaccPage() {
  const symbols = useQuery(holdingSymbolsQuery());
  const [scrip, setScrip] = useState("");
  const pending = useMutation({ mutationFn: getWaccPending });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Purchase Source</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Pending purchase source entries and your completed WACC calculation.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row">
        <Select
          value={scrip}
          onValueChange={(value) => {
            setScrip(value);
            pending.mutate({ data: { scrip: value } });
          }}
        >
          <SelectTrigger className="sm:w-72">
            <SelectValue placeholder="Select a scrip" />
          </SelectTrigger>
          <SelectContent>
            {(symbols.data ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!scrip || pending.isPending}
          onClick={() => pending.mutate({ data: { scrip } })}
        >
          Refresh
        </Button>
      </div>
      {pending.isPending ? (
        <LoadingBlock label="Loading entries" />
      ) : pending.isError ? (
        <ErrorBlock error={pending.error} />
      ) : pending.data ? (
        pending.data.viewSummary ? (
          <SummaryTable scrip={scrip} rows={pending.data.waccSummaryResponse ?? []} />
        ) : (pending.data.waccUpdateResponse ?? []).length === 0 ? (
          <EmptyBlock
            title="Nothing pending"
            description={`No pending purchase source entries for ${scrip}.`}
          />
        ) : (
          <div className="space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
              <ListChecks className="size-3.5" /> Awaiting WACC calculation
            </span>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {(pending.data.waccUpdateResponse ?? []).map((row, idx) => (
                <li
                  key={`${row.transactionDate}-${idx}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">{row.scrip ?? scrip}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.transactionDate)} · {row.purchaseSource ?? row.source ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num font-medium">
                      {formatQty(toNumber(row.transactionQuantity ?? row.quantity))} units
                    </p>
                    <p className="num text-xs text-muted-foreground">
                      {formatNpr(toNumber(row.rate))} / unit
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <EmptyBlock
          title="Select a scrip"
          description="Pick a scrip above to load its purchase source entries."
        />
      )}
    </div>
  );
}
