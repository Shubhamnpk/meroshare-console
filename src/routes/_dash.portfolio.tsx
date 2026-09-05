import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/panel";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  PiggyBank,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
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
import { enrichedPortfolioQuery, investmentSummaryQuery } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { formatNpr, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
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
      ogImage(),
    ],
    links: [canonicalLink("/portfolio")],
  }),
  component: PortfolioPage,
});

function portfolioCsv(
  holdings: EnrichedHolding[],
  totals: { value: number; valuePrev: number },
  costOf: (scrip: string) => { cost: number; waccRate: number } | undefined,
) {
  const rows = holdings.map((h, i) => {
    const c = costOf(h.scrip);
    const cost = c?.cost ?? 0;
    const pl = cost > 0 ? h.value - cost : 0;
    return csvRow([
      i + 1,
      h.scrip,
      h.description,
      h.units,
      h.ltp,
      h.previousClose,
      h.value,
      h.previousValue,
      cost > 0 ? (c?.waccRate ?? 0) : "",
      cost > 0 ? cost : "",
      cost > 0 ? pl : "",
      cost > 0 ? `${((pl / cost) * 100).toFixed(2)}%` : "",
      `${h.percentChange.toFixed(2)}%`,
      totals.value > 0 ? `${((h.value / totals.value) * 100).toFixed(2)}%` : "0.00%",
      h.sector ?? "",
    ]);
  });
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
      "Avg buy",
      "Cost",
      "Unrealized P/L",
      "P/L %",
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

type SortKey =
  | "scrip"
  | "units"
  | "ltp"
  | "previousClose"
  | "value"
  | "avgBuy"
  | "unrealized"
  | "percentChange"
  | "weight";

function PortfolioPage() {
  const { compactNumbers, autoRefresh, refreshMinutes } = useSettings();
  const q = useQuery({
    ...enrichedPortfolioQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const investment = useQuery(investmentSummaryQuery());
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const { sort, toggle } = useSort<SortKey>(
    { key: "value", dir: "desc" },
    {
      scrip: "text",
      units: "number",
      ltp: "number",
      previousClose: "number",
      value: "number",
      avgBuy: "number",
      unrealized: "number",
      percentChange: "number",
      weight: "number",
    },
  );

  const holdings = q.data?.holdings ?? [];
  const totals = {
    units: q.data?.totalUnits ?? 0,
    value: q.data?.totalValue ?? 0,
    valuePrev: q.data?.totalPreviousValue ?? 0,
    dayChange: q.data?.dayChange ?? 0,
    dayPct: q.data?.dayChangePercent ?? 0,
  };

  const totalInvestment = investment.data?.totalInvestment ?? 0;
  const pendingCount = investment.data?.pendingCount ?? 0;
  const unrealizedPL = totals.value - totalInvestment;

  const costMap = useMemo(
    () => new Map((investment.data?.scrips ?? []).map((s) => [s.scrip, s] as const)),
    [investment.data],
  );
  const costOf = (scrip: string) => costMap.get(scrip);
  const plOf = (h: EnrichedHolding) => {
    const c = costMap.get(h.scrip);
    return c && c.cost > 0 ? h.value - c.cost : 0;
  };

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? holdings.filter((h) =>
          [h.scrip, h.description, h.name].some((s) => s.toLowerCase().includes(term)),
        )
      : holdings;
    const weightOf = (h: EnrichedHolding) => (totals.value > 0 ? h.value / totals.value : 0);
    const getter = (h: EnrichedHolding): string | number => {
      switch (sort.key) {
        case "scrip":
          return h.scrip;
        case "units":
          return h.units;
        case "ltp":
          return h.ltp;
        case "previousClose":
          return h.previousClose;
        case "value":
          return h.value;
        case "avgBuy":
          return costMap.get(h.scrip)?.waccRate ?? 0;
        case "unrealized":
          return plOf(h);
        case "percentChange":
          return h.percentChange;
        case "weight":
          return weightOf(h);
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [holdings, search, sort, totals.value, costMap]);

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
              build: () => portfolioCsv(items, totals, costOf),
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
                head: [
                  "SN",
                  "Scrip",
                  "Description",
                  "Units",
                  "LTP",
                  "Value",
                  "Avg buy",
                  "P/L",
                  "Day %",
                ],
                body: items.map((h, i) => {
                  const c = costOf(h.scrip);
                  const pl = c && c.cost > 0 ? h.value - c.cost : null;
                  return [
                    i + 1,
                    h.scrip,
                    h.description,
                    formatQty(h.units),
                    h.ltp.toFixed(2),
                    h.value.toFixed(2),
                    c && c.waccRate > 0 ? c.waccRate.toFixed(2) : "-",
                    pl == null ? "-" : `${pl >= 0 ? "+" : ""}${pl.toFixed(2)}`,
                    `${h.percentChange >= 0 ? "+" : ""}${h.percentChange.toFixed(2)}%`,
                  ];
                }),
                foot: [
                  "",
                  "Total",
                  `${holdings.length} scrips · ${liveCount} at live prices`,
                  formatQty(totals.units),
                  "",
                  totals.value.toFixed(2),
                  investment.data && investment.data.avgWacc > 0
                    ? investment.data.avgWacc.toFixed(2)
                    : "-",
                  totalInvestment > 0
                    ? `${unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}`
                    : "-",
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
          label={pendingCount > 0 ? `Investment (${pendingCount} pending)` : "Total investment"}
          value={
            investment.isLoading ? "…" : formatNpr(totalInvestment, { compact: compactNumbers })
          }
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
        <Panel padding="none" className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <SortableTh
                  label="Scrip"
                  active={sort.key === "scrip"}
                  dir={sort.dir}
                  onClick={() => toggle("scrip")}
                  align="left"
                  kind="text"
                />
                <SortableTh
                  label="Units"
                  active={sort.key === "units"}
                  dir={sort.dir}
                  onClick={() => toggle("units")}
                  align="right"
                />
                <SortableTh
                  label="LTP"
                  active={sort.key === "ltp"}
                  dir={sort.dir}
                  onClick={() => toggle("ltp")}
                  align="right"
                />
                <SortableTh
                  label="Prev close"
                  active={sort.key === "previousClose"}
                  dir={sort.dir}
                  onClick={() => toggle("previousClose")}
                  align="right"
                />
                <SortableTh
                  label="Value"
                  active={sort.key === "value"}
                  dir={sort.dir}
                  onClick={() => toggle("value")}
                  align="right"
                />
                <SortableTh
                  label="Avg buy"
                  active={sort.key === "avgBuy"}
                  dir={sort.dir}
                  onClick={() => toggle("avgBuy")}
                  align="right"
                />
                <SortableTh
                  label="P/L"
                  active={sort.key === "unrealized"}
                  dir={sort.dir}
                  onClick={() => toggle("unrealized")}
                  align="right"
                />
                <SortableTh
                  label="Day"
                  active={sort.key === "percentChange"}
                  dir={sort.dir}
                  onClick={() => toggle("percentChange")}
                  align="right"
                />
                <SortableTh
                  label="Weight"
                  active={sort.key === "weight"}
                  dir={sort.dir}
                  onClick={() => toggle("weight")}
                  align="right"
                  className="pr-4"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((h, idx) => {
                const weight = totals.value > 0 ? (h.value / totals.value) * 100 : 0;
                const basis = costOf(h.scrip);
                const hasBasis = Boolean(basis && basis.cost > 0);
                const pl = hasBasis ? h.value - (basis?.cost ?? 0) : 0;
                const plPct =
                  hasBasis && (basis?.cost ?? 0) > 0 ? (pl / (basis?.cost ?? 1)) * 100 : 0;
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
                      {h.previousClose > 0 ? formatNpr(h.previousClose) : "-"}
                    </TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatNpr(h.value)}
                    </TableCell>
                    <TableCell
                      className="num text-right text-muted-foreground"
                      title={
                        hasBasis
                          ? basis?.status === "pending"
                            ? "Estimated from purchase price (WACC not confirmed yet)"
                            : "CDSC-calculated WACC"
                          : "No cost data (blocked or not available)"
                      }
                    >
                      {hasBasis && (basis?.waccRate ?? 0) > 0 ? (
                        <>
                          {basis?.status === "pending" ? "~" : ""}
                          {formatNpr(basis?.waccRate ?? 0)}
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      title={
                        hasBasis && basis?.status === "pending"
                          ? "Estimated P/L (WACC not confirmed yet)"
                          : undefined
                      }
                    >
                      {hasBasis ? (
                        <DeltaPill value={pl}>
                          {`${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} (${plPct.toFixed(1)}%)`}
                        </DeltaPill>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
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
                  <TableCell className="num text-right font-semibold text-muted-foreground">
                    {investment.data && investment.data.avgWacc > 0
                      ? formatNpr(investment.data.avgWacc)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalInvestment > 0 ? (
                      <DeltaPill value={unrealizedPL}>
                        {`${unrealizedPL >= 0 ? "+" : "-"}${formatNpr(Math.abs(unrealizedPL))}`}
                      </DeltaPill>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
        </Panel>
      )}

      {q.data && q.data.sectors.length > 0 ? (
        <Panel as="section">
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
        </Panel>
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
