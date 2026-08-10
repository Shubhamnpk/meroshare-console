import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Coins, FileDown, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { portfolioQuery } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { formatNpr, formatPercent, formatQty, isoDate, toNumber } from "@/lib/format";
import type { PortfolioItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — MeroShare Investor Console" },
      { name: "description", content: "Every scrip in your demat account with LTP valuation and day change." },
      { property: "og:title", content: "Portfolio — MeroShare Investor Console" },
      { property: "og:description", content: "Every scrip in your demat account with LTP valuation and day change." },
    ],
  }),
  component: PortfolioPage,
});

function exportCsv(items: PortfolioItem[], totals: { value: number; valuePrev: number }) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = items.map((item, i) => {
    const value = toNumber(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice);
    const valuePrev = toNumber(item.valueOfPrevClosingPrice ?? item.valueAsOfPreviousClosingPrice);
    const ltp = toNumber(item.lastTransactionPrice);
    const prev = toNumber(item.previousClosingPrice);
    const pct = prev > 0 ? ((ltp - prev) / prev) * 100 : 0;
    return [
      String(i + 1),
      String(item.scrip ?? item.script ?? ""),
      String(item.scriptDesc ?? ""),
      String(toNumber(item.currentBalance)),
      String(ltp),
      String(prev),
      String(value),
      String(valuePrev),
      `${pct.toFixed(2)}%`,
      totals.value > 0 ? `${((value / totals.value) * 100).toFixed(2)}%` : "0.00%",
    ]
      .map(esc)
      .join(",");
  });
  const csv = [
    ["SN", "Scrip", "Description", "Units", "LTP", "Prev close", "Value (LTP)", "Value (prev close)", "Day change", "Weight"].map(esc).join(","),
    ...rows,
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio-${isoDate(new Date())}.csv`;
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

function PortfolioPage() {
  const { compactNumbers, autoRefresh, refreshMinutes } = useSettings();
  const q = useQuery({
    ...portfolioQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const [search, setSearch] = useState("");
  const all = q.data?.meroShareMyPortfolio ?? [];

  const totals = useMemo(() => {
    let units = 0;
    let value = 0;
    for (const item of all) {
      units += Math.max(0, toNumber(item.currentBalance));
      value += toNumber(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice);
    }
    const valuePrev = toNumber(
      q.data?.totalValueAsOfPreviousClosingPrice ?? all.reduce((s, i) => s + toNumber(i.valueOfPrevClosingPrice ?? i.valueAsOfPreviousClosingPrice), 0),
    );
    const dayChange = value - valuePrev;
    const dayPct = valuePrev > 0 ? (dayChange / valuePrev) * 100 : 0;
    return { units, value, valuePrev, dayChange, dayPct };
  }, [all, q.data]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((item) =>
      [String(item.scrip ?? item.script ?? ""), String(item.scriptDesc ?? "")]
        .some((s) => s.toLowerCase().includes(term)),
    );
  }, [all, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Portfolio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length} scrip{all.length === 1 ? "" : "s"} valued at last traded price.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={items.length === 0} onClick={() => exportCsv(items, totals)}>
          <FileDown /> Export
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by scrip or company name…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip icon={<Coins className="size-4" />} label="Scrips held" value={String(all.length)} />
        <StatChip icon={<Wallet className="size-4" />} label="Total units" value={formatQty(totals.units)} />
        <StatChip
          icon={totals.dayChange > 0 ? <TrendingUp className="size-4 text-gain" /> : totals.dayChange < 0 ? <TrendingDown className="size-4 text-loss" /> : <TrendingUp className="size-4" />}
          label="Value (LTP)"
          value={formatNpr(totals.value, { compact: compactNumbers })}
          valueClass={totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""}
        />
        <StatChip icon={<TrendingUp className="size-4" />} label="Value (prev close)" value={formatNpr(totals.valuePrev, { compact: compactNumbers })} />
        <StatChip
          icon={totals.dayChange > 0 ? <TrendingUp className="size-4 text-gain" /> : totals.dayChange < 0 ? <TrendingDown className="size-4 text-loss" /> : <TrendingUp className="size-4" />}
          label="Day change"
          value={`${totals.dayChange > 0 ? "+" : totals.dayChange < 0 ? "-" : ""}${formatNpr(Math.abs(totals.dayChange))} (${totals.dayPct.toFixed(2)}%)`}
          valueClass={totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""}
        />
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyBlock title="No holdings" description="Your demat account currently holds no scrips." />
      ) : items.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search. Try a different scrip or company." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <TableHead>Scrip</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">LTP</TableHead>
                <TableHead className="text-right">Prev close</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Day</TableHead>
                <TableHead className="pr-4 text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => {
                const ltp = toNumber(item.lastTransactionPrice);
                const prev = toNumber(item.previousClosingPrice);
                const pct = prev ? ((ltp - prev) / prev) * 100 : 0;
                const value = toNumber(item.valueOfLastTransPrice ?? item.valueAsOfLastTransactionPrice);
                const valuePrev = toNumber(item.valueOfPrevClosingPrice ?? item.valueAsOfPreviousClosingPrice);
                const weight = totals.value > 0 ? (value / totals.value) * 100 : 0;
                const scrip = String(item.scrip ?? item.script ?? "—");
                const scriptDesc = String(item.scriptDesc ?? "");
                return (
                  <TableRow key={`${scrip}-${idx}`}>
                    <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <HoverCard openDelay={150}>
                        <HoverCardTrigger asChild>
                          <button type="button" className="max-w-44 cursor-pointer truncate text-left font-semibold transition-colors hover:text-primary">
                            {scrip}
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72">
                          <p className="font-display text-base font-semibold">{scrip}</p>
                          {scriptDesc ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{scriptDesc}</p> : null}
                          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div><dt className="text-xs text-muted-foreground">Units</dt><dd className="num font-medium">{formatQty(item.currentBalance)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Weight</dt><dd className="num font-medium">{weight.toFixed(1)}%</dd></div>
                            <div><dt className="text-xs text-muted-foreground">LTP</dt><dd className="num font-medium">{formatNpr(ltp)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Prev close</dt><dd className="num font-medium">{formatNpr(prev)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Value (LTP)</dt><dd className="num font-medium">{formatNpr(value)}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Value (prev close)</dt><dd className="num font-medium">{formatNpr(valuePrev)}</dd></div>
                          </dl>
                          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                            <span className="text-xs text-muted-foreground">Day change</span>
                            <DeltaPill value={pct}>{formatPercent(pct)}</DeltaPill>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell className="num text-right">{formatQty(item.currentBalance)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <span className="num font-medium">{formatNpr(ltp)}</span>
                        {prev > 0 && ltp > 0 && ltp !== prev && (
                          pct > 0 ? (
                            <ArrowUpRight className="size-3.5 text-gain" aria-hidden />
                          ) : (
                            <ArrowDownRight className="size-3.5 text-loss" aria-hidden />
                          )
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right text-muted-foreground">{prev > 0 ? formatNpr(prev) : "—"}</TableCell>
                    <TableCell className="num text-right font-medium">{formatNpr(value)}</TableCell>
                    <TableCell className="text-right"><DeltaPill value={pct}>{formatPercent(pct)}</DeltaPill></TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="num text-xs text-muted-foreground">{weight.toFixed(1)}%</span>
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(100, weight)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {items.length === all.length ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-semibold" colSpan={2}>Total</TableCell>
                  <TableCell className="num text-right font-semibold">{formatQty(totals.units)}</TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="num text-right font-semibold">{formatNpr(totals.value, { compact: compactNumbers })}</TableCell>
                  <TableCell className="text-right">
                    <DeltaPill value={totals.dayChange}>{`${totals.dayChange > 0 ? "+" : totals.dayChange < 0 ? "-" : ""}${formatNpr(Math.abs(totals.dayChange))} (${totals.dayPct.toFixed(2)}%)`}</DeltaPill>
                  </TableCell>
                  <TableCell className="num pr-4 text-right font-semibold">100%</TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
          {items.length !== all.length ? (
            <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
              Showing {items.length} of {all.length} scrips · filtered value {formatNpr(items.reduce((s, i) => s + toNumber(i.valueOfLastTransPrice ?? i.valueAsOfLastTransactionPrice), 0))}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
