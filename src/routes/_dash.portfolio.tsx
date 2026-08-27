import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Coins,
  PiggyBank,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ExportButton, csvRow } from "@/components/export-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { HistoryPanel } from "@/components/portfolio/history-panel";
import { enrichedPortfolioQuery, waccReportQuery } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { formatNpr, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EnrichedHolding } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Every scrip in your demat account valued at live NEPSE prices, its price history and dividend record.",
      },
      { property: "og:title", content: "Portfolio | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Every scrip in your demat account valued at live NEPSE prices, its price history and dividend record.",
      },
    ],
  }),
  component: PortfolioPage,
});

function portfolioCsv(holdings: EnrichedHolding[], totals: { value: number; valuePrev: number }) {
  const rows = holdings.map((h, i) =>
    csvRow([
      i + 1,
      h.scrip,
      h.description,
      h.units,
      h.ltp,
      h.previousClose,
      h.value,
      h.previousValue,
      `${h.percentChange.toFixed(2)}%`,
      totals.value > 0 ? `${((h.value / totals.value) * 100).toFixed(2)}%` : "0.00%",
      h.sector ?? "",
    ]),
  );
  return [
    csvRow([
      "SN",
      "Scrip",
      "Description",
      "Units",
      "LTP",
      "Prev close",
      "Value (LTP)",
      "Value (prev close)",
      "Day change",
      "Weight",
      "Sector",
    ]),
    ...rows,
  ].join("\n");
}

function StatChip({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
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

type SortKey = "scrip" | "units" | "ltp" | "previousClose" | "value" | "percentChange" | "weight";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors",
          align === "right" ? "w-full justify-end" : "justify-start",
          active ? "text-foreground" : "hover:text-foreground",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3 text-primary" aria-hidden />
          ) : (
            <ArrowDown className="size-3 text-primary" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
        )}
      </button>
    </TableHead>
  );
}

function PortfolioPage() {
  const { compactNumbers, autoRefresh, refreshMinutes } = useSettings();
  const q = useQuery({
    ...enrichedPortfolioQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const waccReport = useQuery(waccReportQuery());
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "value", dir: "desc" });

  const holdings = q.data?.holdings ?? [];
  const totals = {
    units: q.data?.totalUnits ?? 0,
    value: q.data?.totalValue ?? 0,
    valuePrev: q.data?.totalPreviousValue ?? 0,
    dayChange: q.data?.dayChange ?? 0,
    dayPct: q.data?.dayChangePercent ?? 0,
  };

  const totalInvestment = (waccReport.data?.waccReportResponse ?? []).reduce(
    (sum, h) => sum + Math.max(0, h.totalCost ?? 0),
    0,
  );
  const unrealizedPL = totals.value - totalInvestment;

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? holdings.filter((h) =>
          [h.scrip, h.description, h.name].some((s) => s.toLowerCase().includes(term)),
        )
      : holdings;
    const mul = sort.dir === "asc" ? 1 : -1;
    const weightOf = (h: EnrichedHolding) => (totals.value > 0 ? h.value / totals.value : 0);
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "scrip":
          return a.scrip.localeCompare(b.scrip) * mul;
        case "units":
          return (a.units - b.units) * mul;
        case "ltp":
          return (a.ltp - b.ltp) * mul;
        case "previousClose":
          return (a.previousClose - b.previousClose) * mul;
        case "value":
          return (a.value - b.value) * mul;
        case "percentChange":
          return (a.percentChange - b.percentChange) * mul;
        case "weight":
          return (weightOf(a) - weightOf(b)) * mul;
      }
    });
  }, [holdings, search, sort, totals.value]);

  const onSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const liveCount = q.data?.liveCount ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Portfolio</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            {holdings.length} scrip{holdings.length === 1 ? "" : "s"} · {liveCount} valued at live
            NEPSE prices. Click any scrip for its full detail.
          </p>
        </div>
        <ExportButton
          disabled={items.length === 0}
          formats={[
            {
              title: "CSV",
              description: "Spreadsheet-friendly rows of every holding",
              filename: "portfolio",
              extension: "csv",
              build: () => portfolioCsv(items, totals),
            },
            {
              title: "JSON",
              description: "Raw holdings with live prices and sector data",
              filename: "portfolio",
              extension: "json",
              build: () => JSON.stringify({ holdings: items, totals }, null, 2),
            },
            {
              title: "PDF",
              description: "Formatted holdings table for printing or sharing",
              filename: "portfolio",
              extension: "pdf",
              build: () => "",
              pdf: () => ({
                title: "Portfolio holdings at live prices",
                head: ["SN", "Scrip", "Description", "Units", "LTP", "Value", "Day %"],
                body: items.map((h, i) => [
                  i + 1,
                  h.scrip,
                  h.description,
                  formatQty(h.units),
                  h.ltp.toFixed(2),
                  h.value.toFixed(2),
                  `${h.percentChange >= 0 ? "+" : ""}${h.percentChange.toFixed(2)}%`,
                ]),
                foot: [
                  "",
                  "Total",
                  `${holdings.length} scrips · ${liveCount} at live prices`,
                  formatQty(totals.units),
                  "",
                  totals.value.toFixed(2),
                  `${totals.dayPct >= 0 ? "+" : ""}${totals.dayPct.toFixed(2)}%`,
                ],
              }),
            },
          ]}
        />
      </div>

      {q.data?.marketStale ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          The market feed is temporarily unreachable. Prices shown are MeroShare's own, which may
          lag the market.
        </p>
      ) : null}

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
        <StatChip
          icon={<Coins className="size-4" />}
          label="Scrips held"
          value={String(holdings.length)}
        />
        <StatChip
          icon={<Wallet className="size-4" />}
          label="Total units"
          value={formatQty(totals.units)}
        />
        <StatChip
          icon={
            totals.dayChange > 0 ? (
              <TrendingUp className="size-4 text-gain" />
            ) : totals.dayChange < 0 ? (
              <TrendingDown className="size-4 text-loss" />
            ) : (
              <TrendingUp className="size-4" />
            )
          }
          label="Market value"
          value={formatNpr(totals.value, { compact: compactNumbers })}
          valueClass={totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""}
        />
        <StatChip
          icon={<TrendingUp className="size-4" />}
          label="Value (prev close)"
          value={formatNpr(totals.valuePrev, { compact: compactNumbers })}
        />
        <StatChip
          icon={
            totals.dayChange > 0 ? (
              <TrendingUp className="size-4 text-gain" />
            ) : totals.dayChange < 0 ? (
              <TrendingDown className="size-4 text-loss" />
            ) : (
              <TrendingUp className="size-4" />
            )
          }
          label="Day change"
          value={`${totals.dayChange > 0 ? "+" : totals.dayChange < 0 ? "-" : ""}${formatNpr(Math.abs(totals.dayChange))} (${totals.dayPct.toFixed(2)}%)`}
          valueClass={totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""}
        />
        <StatChip
          icon={<PiggyBank className="size-4" />}
          label="Total investment"
          value={formatNpr(totalInvestment, { compact: compactNumbers })}
        />
        {totalInvestment > 0 ? (
          <StatChip
            icon={
              unrealizedPL >= 0 ? (
                <TrendingUp className="size-4 text-gain" />
              ) : (
                <TrendingDown className="size-4 text-loss" />
              )
            }
            label="Unrealized P/L"
            value={`${unrealizedPL >= 0 ? "+" : ""}${formatNpr(unrealizedPL, { compact: compactNumbers })}`}
            valueClass={unrealizedPL >= 0 ? "text-gain" : "text-loss"}
          />
        ) : null}
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : holdings.length === 0 ? (
        <EmptyBlock
          title="No holdings"
          description="Your demat account currently holds no scrips."
        />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No matches"
          description="Nothing matches your search. Try a different scrip or company."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <SortableHead
                  label="Scrip"
                  sortKey="scrip"
                  sort={sort}
                  onSort={onSort}
                  align="left"
                />
                <SortableHead label="Units" sortKey="units" sort={sort} onSort={onSort} />
                <SortableHead label="LTP" sortKey="ltp" sort={sort} onSort={onSort} />
                <SortableHead
                  label="Prev close"
                  sortKey="previousClose"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableHead label="Value" sortKey="value" sort={sort} onSort={onSort} />
                <SortableHead label="Day" sortKey="percentChange" sort={sort} onSort={onSort} />
                <SortableHead
                  label="Weight"
                  sortKey="weight"
                  sort={sort}
                  onSort={onSort}
                  className="pr-4"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((h, idx) => {
                const weight = totals.value > 0 ? (h.value / totals.value) * 100 : 0;
                return (
                  <TableRow
                    key={`${h.scrip}-${idx}`}
                    className="cursor-pointer"
                    onClick={() => setPicked(h.scrip)}
                  >
                    <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <p className="font-semibold transition-colors hover:text-primary">
                        {h.scrip}
                      </p>
                      <p className="max-w-52 truncate text-xs text-muted-foreground">
                        {h.description}
                      </p>
                    </TableCell>
                    <TableCell className="num text-right">{formatQty(h.units)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <span className="num font-medium">{formatNpr(h.ltp)}</span>
                        {h.previousClose > 0 &&
                          h.ltp > 0 &&
                          h.ltp !== h.previousClose &&
                          (h.percentChange > 0 ? (
                            <ArrowUpRight className="size-3.5 text-gain" aria-hidden />
                          ) : (
                            <ArrowDownRight className="size-3.5 text-loss" aria-hidden />
                          ))}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right text-muted-foreground">
                      {h.previousClose > 0 ? formatNpr(h.previousClose) : "—"}
                    </TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatNpr(h.value)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaPill value={h.percentChange}>
                        {`${h.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(h.dayChange))}`}
                      </DeltaPill>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="num text-xs text-muted-foreground">
                          {weight.toFixed(1)}%
                        </span>
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{ width: `${Math.min(100, weight)}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {items.length === holdings.length ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4 font-semibold" colSpan={2}>
                    Total
                  </TableCell>
                  <TableCell className="num text-right font-semibold">
                    {formatQty(totals.units)}
                  </TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className="num text-right font-semibold">
                    {formatNpr(totals.value, { compact: compactNumbers })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeltaPill value={totals.dayChange}>
                      {`${totals.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(totals.dayChange))} (${totals.dayPct.toFixed(2)}%)`}
                    </DeltaPill>
                  </TableCell>
                  <TableCell className="num pr-4 text-right font-semibold">100%</TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
          {items.length !== holdings.length ? (
            <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
              Showing {items.length} of {holdings.length} scrips · filtered value{" "}
              {formatNpr(items.reduce((s, h) => s + h.value, 0))}
            </p>
          ) : null}
        </div>
      )}

      {q.data && q.data.sectors.length > 0 ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <h2 className="mb-3 font-display text-base font-semibold">Sector allocation</h2>
          <ul className="flex flex-wrap gap-2">
            {q.data.sectors.slice(0, 8).map((s) => (
              <li
                key={s.sector}
                className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm"
              >
                <span className="font-medium">{s.sector}</span>
                <span className="num text-muted-foreground">{s.weight.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {holdings.length > 0 ? <HistoryPanel holdings={holdings} onPickScrip={setPicked} /> : null}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />
    </div>
  );
}
