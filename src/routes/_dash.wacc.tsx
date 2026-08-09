import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { holdingSymbolsQuery } from "@/lib/queries";
import { getWaccPending } from "@/lib/meroshare/portfolio.functions";
import { formatDate, formatNpr, formatQty } from "@/lib/format";

export const Route = createFileRoute("/_dash/wacc")({
  head: () => ({
    meta: [
      { title: "Purchase Source — MeroShare Investor Console" },
      { name: "description", content: "Review pending purchase source entries used for WACC calculation." },
      { property: "og:title", content: "Purchase Source — MeroShare Investor Console" },
      { property: "og:description", content: "Review pending purchase source entries used for WACC calculation." },
    ],
  }),
  component: WaccPage,
});

function WaccPage() {
  const symbols = useQuery(holdingSymbolsQuery());
  const [scrip, setScrip] = useState("");
  const pending = useMutation({ mutationFn: getWaccPending });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Purchase Source</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entries awaiting weighted average cost calculation.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row">
        <Select
          value={scrip}
          onValueChange={(value) => { setScrip(value); pending.mutate({ data: { scrip: value } }); }}
        >
          <SelectTrigger className="sm:w-72"><SelectValue placeholder="Select a scrip" /></SelectTrigger>
          <SelectContent>
            {(symbols.data ?? []).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={!scrip || pending.isPending} onClick={() => pending.mutate({ data: { scrip } })}>
          Refresh
        </Button>
      </div>
      {pending.isPending ? (
        <LoadingBlock label="Loading entries" />
      ) : pending.isError ? (
        <ErrorBlock error={pending.error} />
      ) : pending.data ? (
        pending.data.length === 0 ? (
          <EmptyBlock title="Nothing pending" description={`No pending purchase source entries for ${scrip}.`} />
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
            {pending.data.map((row, idx) => (
              <li key={idx} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold">{row.scrip ?? scrip}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(row.transactionDate)} · {row.source ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="num font-medium">{formatQty(row.quantity)} units</p>
                  <p className="num text-xs text-muted-foreground">{formatNpr(row.rate)} / unit</p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <EmptyBlock title="Select a scrip" description="Pick a scrip above to load its pending purchase source entries." />
      )}
    </div>
  );
}
