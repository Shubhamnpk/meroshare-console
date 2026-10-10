import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ChipRow, StatChip } from "@/components/stat-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeltaPill } from "@/components/stat-card";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/states";
import { GlobalImportDialog } from "@/components/world/global-import-dialog";
import { native } from "@/components/world/global-position-sheet";
import { deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import { globalValuationQuery } from "@/lib/queries";
import { formatNpr } from "@/lib/format";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/global")({
  head: () => ({
    meta: [
      { title: "Global Stocks | MeroShare Investor Console" },
      {
        name: "description",
        content: "US stocks, crypto and gold: live prices, your imported lots and per-lot gains in one place.",
      },
      { property: "og:title", content: "Global Stocks | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "US stocks, crypto and gold: live prices, your imported lots and per-lot gains in one place.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/global")],
  }),
  component: GlobalPage,
});

function GlobalPage() {
  const navigate = useNavigate();
  const txns = useGlobalTxns();
  const [importOpen, setImportOpen] = useState(false);
  const holdings = useMemo(() => deriveHoldings(txns), [txns]);
  const valuation = useQuery({
    ...globalValuationQuery(
      holdings.map((h) => ({ symbol: h.symbol, qty: h.qty, avgPrice: h.avgPrice, currency: h.currency })),
    ),
  });
  const rows = useMemo(
    () => [...(valuation.data?.rows ?? [])].sort((a, b) => b.valueNpr - a.valueNpr),
    [valuation.data],
  );
  const bySymbol = useMemo(() => new Map(holdings.map((h) => [h.symbol, h])), [holdings]);
  const totalValue = rows.reduce((s, r) => s + r.valueNpr, 0);
  const totalDay = rows.reduce((s, r) => s + r.dayChangeNpr, 0);
  const totalDayPct = totalValue - totalDay > 0 ? (totalDay / (totalValue - totalDay)) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Global Stocks</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            US stocks, crypto and gold at live prices. Tap any stock for its chart.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
          <Upload className="size-3.5" /> Import
        </Button>
      </div>

      {txns.length === 0 ? (
        <EmptyBlock
          title="No global transactions yet"
          description="Import a broker CSV (Trading 212 and standard formats) or try the demo data to see this page come alive."
        />
      ) : (
        <>
          <ChipRow>
            <StatChip label="Stocks held" value={String(holdings.length)} />
            <StatChip label="Market value" value={formatNpr(totalValue)} />
            <StatChip
              label="Day change"
              value={`${totalDay >= 0 ? "+" : ""}${formatNpr(Math.abs(totalDay))} (${totalDayPct.toFixed(2)}%)`}
              valueClass={totalDay >= 0 ? "text-gain" : "text-loss"}
            />
          </ChipRow>

          {holdings.length === 0 ? (
            <EmptyBlock
              title="No open positions"
              description="Everything is sold — your past transactions stay in history."
            />
          ) : valuation.isPending ? (
            <LoadingBlock label="Valuing holdings" />
          ) : valuation.isError || rows.length === 0 ? (
            <ErrorBlock error={valuation.error} retry={() => void valuation.refetch()} />
          ) : (
            <Panel padding="none" className="overflow-clip">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="pl-4">Stock</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Avg buy</TableHead>
                    <TableHead className="text-right">LTP</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="pr-4 text-right">Day</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const h = bySymbol.get(r.symbol);
                    return (
                      <TableRow
                        key={r.symbol}
                        className="cursor-pointer"
                        onClick={() => navigate({ to: "/terminal", search: { symbol: r.symbol } })}
                      >
                        <TableCell className="pl-4">
                          <p className="font-semibold">{r.symbol}</p>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">{r.name || h?.name || ""}</p>
                        </TableCell>
                        <TableCell className="num text-right">{native(r.qty, "")}</TableCell>
                        <TableCell className="num text-right text-muted-foreground">
                          {h ? native(h.avgPrice, h.currency) : "—"}
                        </TableCell>
                        <TableCell className="num text-right font-medium">
                          {r.ok && r.ltpNative > 0 ? native(r.ltpNative, r.liveCcy) : "—"}
                        </TableCell>
                        <TableCell className="num text-right font-medium">
                          {r.ok ? formatNpr(r.valueNpr) : "—"}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          {r.ok ? (
                            <DeltaPill value={r.dayChangeNpr}>
                              {`${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`}
                            </DeltaPill>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Panel>
          )}
        </>
      )}

      <GlobalImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
