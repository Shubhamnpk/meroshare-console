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
  ChevronDown,
  Coins,
  FileDown,
  Gift,
  LineChart,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaChart } from "@/components/market/area-chart";
import { ScripSheet } from "@/components/market/scrip-sheet";
import {
  enrichedPortfolioQuery,
  dividendsQuery,
  faceValuesQuery,
  portfolioHistoryQuery,
  transactionsQuery,
} from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { parseNptEpoch, unitsHeldAt, type UnitSnapshot } from "@/lib/nepse/timeline";
import { formatDate, formatNpr, formatPercent, formatQty, isoDate, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DividendRow,
  EnrichedHolding,
  PortfolioGranularity,
  PortfolioHistoryPoint,
} from "@/lib/nepse/types";
import type { TransactionItem } from "@/lib/meroshare/types";

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

function exportCsv(holdings: EnrichedHolding[], totals: { value: number; valuePrev: number }) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = holdings.map((h, i) =>
    [
      String(i + 1),
      h.scrip,
      h.description,
      String(h.units),
      String(h.ltp),
      String(h.previousClose),
      String(h.value),
      String(h.previousValue),
      `${h.percentChange.toFixed(2)}%`,
      totals.value > 0 ? `${((h.value / totals.value) * 100).toFixed(2)}%` : "0.00%",
      h.sector ?? "",
    ]
      .map(esc)
      .join(","),
  );
  const csv = [
    [
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
    ]
      .map(esc)
      .join(","),
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

const GRANULARITY_OPTIONS: { label: string; value: PortfolioGranularity }[] = [
  { label: "1 point per day", value: "day" },
  { label: "1 point per month", value: "month" },
  { label: "1 point per year", value: "year" },
];

const RANGE_OPTIONS: { label: string; months: number }[] = [
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
  { label: "3 years", months: 36 },
  { label: "4 years", months: 48 },
  { label: "5 years", months: 60 },
];

function monthLabel(time: number): string {
  return new Date(time * 1000).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  });
}

type HistoryTab = "price" | "dividend";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
      )}
    >
      {children}
    </button>
  );
}

/** On-demand price history for the current holdings, from the YONEPSE LTP archive. */
function PriceHistoryTab({
  holdings,
  onPickScrip,
}: {
  holdings: EnrichedHolding[];
  onPickScrip: (scrip: string) => void;
}) {
  const { compactNumbers } = useSettings();
  const [granularity, setGranularity] = useState<PortfolioGranularity>("day");
  const [rangeMonths, setRangeMonths] = useState<number>(12);
  const [selected, setSelected] = useState<number | null>(null);

  const history = useQuery(
    portfolioHistoryQuery(
      holdings.map((h) => ({ scrip: h.scrip, units: h.units })),
      rangeMonths,
      granularity,
    ),
  );
  const timelinePoints = useMemo(() => history.data?.points ?? [], [history.data?.points]);
  const failedSymbols = history.data?.failed ?? [];

  const formatLabel = (time: number) => {
    if (granularity === "day")
      return new Date(time * 1000).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kathmandu",
      });
    if (granularity === "year")
      return new Date(time * 1000).toLocaleDateString("en-GB", {
        year: "numeric",
        timeZone: "Asia/Kathmandu",
      });
    return monthLabel(time);
  };

  const historyStats = useMemo(() => {
    if (timelinePoints.length < 2) return null;
    const start = timelinePoints[0]!.value;
    const end = timelinePoints[timelinePoints.length - 1]!.value;
    return {
      start,
      end,
      change: end - start,
      pct: start > 0 ? ((end - start) / start) * 100 : 0,
      high: Math.max(...timelinePoints.map((p) => p.value)),
      low: Math.min(...timelinePoints.map((p) => p.value)),
    };
  }, [timelinePoints]);

  const selectedPoint =
    selected != null ? timelinePoints.find((p) => p.time === selected) : undefined;

  if (history.isLoading) return <LoadingBlock label="Building price history" />;
  if (history.isError)
    return <ErrorBlock error={history.error} retry={() => void history.refetch()} />;
  if (timelinePoints.length < 2)
    return (
      <EmptyBlock
        title="No price history"
        description={
          failedSymbols.length > 0
            ? "We couldn't load demat history for some of your scrips, so there is nothing to chart yet. Retry, or pick a shorter range."
            : "The YONEPSE LTP archive has no points for your holdings in this range yet."
        }
      >
        {failedSymbols.length > 0 ? (
          <button
            type="button"
            onClick={() => void history.refetch()}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent/10"
          >
            Try again
          </button>
        ) : null}
      </EmptyBlock>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          Portfolio value over time
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={granularity}
            onValueChange={(v) => {
              setGranularity(v as PortfolioGranularity);
              setSelected(null);
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANULARITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(rangeMonths)}
            onValueChange={(v) => {
              setRangeMonths(Number(v));
              setSelected(null);
            }}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.months} value={String(o.months)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {failedSymbols.length > 0 ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Couldn&apos;t load demat history for {failedSymbols.length} scrip
          {failedSymbols.length === 1 ? "" : "s"}:{" "}
          <span className="font-medium">{failedSymbols.map((f) => f.symbol).join(", ")}</span>.
          They&apos;re missing from this chart —{" "}
          <button
            type="button"
            onClick={() => void history.refetch()}
            className="font-semibold underline underline-offset-2"
          >
            retry
          </button>
        </div>
      ) : null}

      {historyStats ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              Start ({formatLabel(timelinePoints[0]!.time)})
            </p>
            <p className="num text-sm font-medium">
              {formatNpr(historyStats.start, { compact: compactNumbers })}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              End ({formatLabel(timelinePoints[timelinePoints.length - 1]!.time)})
            </p>
            <p className="num text-sm font-medium">
              {formatNpr(historyStats.end, { compact: compactNumbers })}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Change</p>
            <p className="text-sm font-medium">
              <DeltaPill value={historyStats.change}>{formatPercent(historyStats.pct)}</DeltaPill>
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              Best / worst
            </p>
            <p className="num text-sm font-medium">
              {formatNpr(historyStats.high, { compact: compactNumbers })} /{" "}
              {formatNpr(historyStats.low, { compact: compactNumbers })}
            </p>
          </div>
        </div>
      ) : null}

      <AreaChart
        points={timelinePoints.map((p) => ({ time: p.time, value: p.value }))}
        height={240}
        formatValue={(v) => formatNpr(v, { compact: true })}
        formatLabel={formatLabel}
        selectedTime={selected}
        onSelect={(pt) => setSelected((cur) => (cur === pt.time ? null : pt.time))}
        tooltipExtra={(pt) => {
          const point = timelinePoints.find((p) => p.time === pt.time);
          if (!point) return null;
          return (
            <ul className="space-y-0.5">
              {point.breakdown.slice(0, 8).map((b) => (
                <li key={b.symbol}>
                  <button
                    type="button"
                    onClick={() => onPickScrip(b.symbol)}
                    className="flex w-full items-center justify-between gap-3 text-left text-xs transition-colors hover:text-primary"
                  >
                    <span className="font-medium">{b.symbol}</span>
                    <span className="num">{formatNpr(b.value, { compact: true })}</span>
                  </button>
                </li>
              ))}
              {point.breakdown.length > 8 ? (
                <li className="text-[0.6rem] text-muted-foreground">
                  +{point.breakdown.length - 8} more scrips
                </li>
              ) : null}
            </ul>
          );
        }}
      />

      {selectedPoint ? (
        <PointBreakdown point={selectedPoint} formatLabel={formatLabel} onPickScrip={onPickScrip} />
      ) : null}

      <p className="text-[0.68rem] text-muted-foreground">
        {granularity === "day"
          ? "Daily closing values from the YONEPSE LTP archive (older months fall back to month-end closes). Hover for the per-scrip breakdown — click a point to pin it below."
          : granularity === "year"
            ? "Year-end closing values from the YONEPSE LTP archive. Hover for the per-scrip breakdown — click a point to pin it below."
            : "Month-end closing values from the YONEPSE LTP archive. Hover for the per-scrip breakdown — click a point to pin it below."}
      </p>
    </div>
  );
}

/** Pinned point: every scrip's price and the units held at that moment, with a value total. */
function PointBreakdown({
  point,
  formatLabel,
  onPickScrip,
}: {
  point: PortfolioHistoryPoint;
  formatLabel: (time: number) => string;
  onPickScrip: (scrip: string) => void;
}) {
  const rows = [...point.breakdown].sort((a, b) => b.value - a.value);
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h4 className="text-xs font-semibold">Held on {formatLabel(point.time)}</h4>
        <span className="num text-xs text-muted-foreground">
          {formatNpr(point.value)} across {rows.length} scrip{rows.length === 1 ? "" : "s"}
        </span>
      </header>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="pl-3">Symbol</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="pr-3 text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.symbol}>
              <TableCell className="pl-3">
                <button
                  type="button"
                  onClick={() => onPickScrip(b.symbol)}
                  className="font-medium transition-colors hover:text-primary"
                >
                  {b.symbol}
                </button>
              </TableCell>
              <TableCell className="num text-right">{formatNpr(b.close)}</TableCell>
              <TableCell className="num text-right">{formatQty(b.units)}</TableCell>
              <TableCell className="num pr-3 text-right">{formatNpr(b.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="pl-3 font-semibold">Total</TableCell>
            <TableCell />
            <TableCell className="num text-right font-semibold">
              {formatQty(rows.reduce((sum, b) => sum + b.units, 0))}
            </TableCell>
            <TableCell className="num pr-3 text-right font-semibold">
              {formatNpr(point.value)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

const CORPORATE_RE = /CA-|IPO|INITIAL PUBLIC OFFERING|BONUS|MERGER|RIGHT|DIVIDEND/i;
const BONUS_RE = /BONUS|CA-B/i;
const IPO_RE = /IPO|INITIAL PUBLIC OFFERING/i;
const MERGER_RE = /MERGER/i;
const RIGHT_RE = /RIGHT/i;

function yearOf(value: unknown): string {
  const m = /^(\d{4})/.exec(String(value ?? ""));
  return (m && m[1]) || "—";
}

interface DivEntry {
  creditedUnits: number;
  bonusUnits: number;
  mergerUnits: number;
  rightUnits: number;
  estCash: number;
  estBonusUnits: number;
  creditRows: TransactionItem[];
  divRows: (DividendRow & { held: number; cashValue: number; bonusUnits: number })[];
}

function emptyDivEntry(): DivEntry {
  return {
    creditedUnits: 0,
    bonusUnits: 0,
    mergerUnits: 0,
    rightUnits: 0,
    estCash: 0,
    estBonusUnits: 0,
    creditRows: [],
    divRows: [],
  };
}

/** Actual credits from your demat movement history — bonuses, mergers and rights (IPO allotments excluded). */
function DividendHistoryTab({ onPickScrip }: { onPickScrip: (scrip: string) => void }) {
  const q = useQuery(transactionsQuery(null));
  const dividends = useQuery(dividendsQuery());
  const items: TransactionItem[] = q.data?.items ?? [];
  const [year, setYear] = useState<string>("all");

  // Carry-forward snapshots per scrip, from the actual transaction balances.
  const snapshotsBySymbol = useMemo(() => {
    const map = new Map<string, UnitSnapshot[]>();
    for (const t of items) {
      const key = String(t.script ?? "").toUpperCase();
      if (!key) continue;
      const time = parseNptEpoch(t.transactionDate);
      if (time == null) continue;
      const arr = map.get(key) ?? [];
      arr.push({ time, units: Math.max(0, toNumber(t.balanceAfterTransaction)) });
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.time - b.time);
    return map;
  }, [items]);

  // Corporate-action credits, minus IPO allotments — those aren't dividends.
  const creditRows = useMemo(
    () =>
      items.filter(
        (t) =>
          toNumber(t.creditQuantity) > 0 &&
          CORPORATE_RE.test(t.historyDescription ?? "") &&
          !IPO_RE.test(t.historyDescription ?? ""),
      ),
    [items],
  );

  // Face values feed the cash estimate: cash% is applied to par value, not units.
  const divSymbols = useMemo(() => [...snapshotsBySymbol.keys()].sort(), [snapshotsBySymbol]);
  const faceValues = useQuery(faceValuesQuery(divSymbols));

  // Only years where this user actually has dividend activity: corporate credits
  // received, or dividend announcements issued while they held the scrip.
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const r of creditRows) {
      const y = yearOf(r.transactionDate);
      if (y !== "—") set.add(y);
    }
    for (const d of dividends.data ?? []) {
      const y = yearOf(d.announcementDate);
      if (y === "—") continue;
      const key = String(d.symbol ?? "").toUpperCase();
      if (!key) continue;
      const epoch = parseNptEpoch(d.announcementDate) ?? parseNptEpoch(d.bookCloseDate);
      const held = epoch == null ? 0 : unitsHeldAt(snapshotsBySymbol.get(key) ?? [], epoch);
      if (held > 0) set.add(y);
    }
    return [...set].sort().reverse();
  }, [creditRows, dividends.data, snapshotsBySymbol]);

  const grouped = useMemo(() => {
    const map = new Map<string, DivEntry>();

    for (const t of creditRows) {
      const key = String(t.script ?? "—").toUpperCase();
      const y = yearOf(t.transactionDate);
      if (year !== "all" && y !== year) continue;
      const entry = map.get(key) ?? emptyDivEntry();
      const qty = toNumber(t.creditQuantity);
      const desc = t.historyDescription ?? "";
      entry.creditedUnits += qty;
      if (BONUS_RE.test(desc)) entry.bonusUnits += qty;
      else if (MERGER_RE.test(desc)) entry.mergerUnits += qty;
      else if (RIGHT_RE.test(desc)) entry.rightUnits += qty;
      entry.creditRows.push(t);
      map.set(key, entry);
    }

    for (const d of dividends.data ?? []) {
      const y = yearOf(d.announcementDate);
      if (year !== "all" && y !== year) continue;
      const key = String(d.symbol ?? "").toUpperCase();
      if (!key || (map.has(key) === false && year !== "all")) continue;
      const entry = map.get(key) ?? emptyDivEntry();
      const epoch = parseNptEpoch(d.announcementDate) ?? parseNptEpoch(d.bookCloseDate);
      const held = epoch == null ? 0 : unitsHeldAt(snapshotsBySymbol.get(key) ?? [], epoch);
      const cashValue = (d.cashDividend / 100) * (faceValues.data?.[key] ?? 100) * held;
      const bonusUnits = (d.bonusShare / 100) * held;
      entry.estCash += cashValue;
      entry.estBonusUnits += bonusUnits;
      entry.divRows.push({ ...d, held, cashValue, bonusUnits });
      map.set(key, entry);
    }

    return [...map.entries()]
      .map(([scrip, e]) => ({
        scrip,
        ...e,
        creditRows: [...e.creditRows].sort((a, b) =>
          String(b.transactionDate ?? "").localeCompare(String(a.transactionDate ?? "")),
        ),
        divRows: [...e.divRows].sort((a, b) =>
          String(b.announcementDate ?? "").localeCompare(String(a.announcementDate ?? "")),
        ),
      }))
      .sort((a, b) => b.estCash + b.creditedUnits - (a.estCash + a.creditedUnits));
  }, [creditRows, dividends.data, year, snapshotsBySymbol, faceValues.data]);

  const totals = useMemo(() => {
    let cash = 0;
    let bonus = 0;
    let credited = 0;
    for (const g of grouped) {
      cash += g.estCash;
      bonus += g.estBonusUnits;
      credited += g.creditedUnits;
    }
    return { cash, bonus, credited };
  }, [grouped]);

  const yearStats = useMemo(() => {
    const map = new Map<string, { year: string; cash: number; bonus: number; credited: number }>();
    for (const r of creditRows) {
      const y = yearOf(r.transactionDate);
      if (y === "—") continue;
      const e = map.get(y) ?? { year: y, cash: 0, bonus: 0, credited: 0 };
      const qty = toNumber(r.creditQuantity);
      e.credited += qty;
      if (BONUS_RE.test(r.historyDescription ?? "")) e.bonus += qty;
      map.set(y, e);
    }
    for (const d of dividends.data ?? []) {
      const y = yearOf(d.announcementDate);
      if (y === "—") continue;
      const key = String(d.symbol ?? "").toUpperCase();
      if (!key) continue;
      const epoch = parseNptEpoch(d.announcementDate) ?? parseNptEpoch(d.bookCloseDate);
      const held = epoch == null ? 0 : unitsHeldAt(snapshotsBySymbol.get(key) ?? [], epoch);
      if (held <= 0) continue;
      const e = map.get(y) ?? { year: y, cash: 0, bonus: 0, credited: 0 };
      e.cash += (d.cashDividend / 100) * (faceValues.data?.[key] ?? 100) * held;
      e.bonus += (d.bonusShare / 100) * held;
      map.set(y, e);
    }
    return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
  }, [creditRows, dividends.data, snapshotsBySymbol, faceValues.data]);

  if (q.isLoading) return <LoadingBlock label="Loading dividend history" rows={2} />;
  if (q.isError) return <ErrorBlock error={q.error} retry={() => void q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num rounded-full bg-gain/15 px-2 py-0.5 text-xs font-semibold text-gain">
            Est. cash {formatNpr(totals.cash, { compact: true })}
          </span>
          {totals.bonus > 0 ? (
            <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {formatQty(Math.floor(totals.bonus))} bonus units
            </span>
          ) : null}
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {formatQty(totals.credited)} units credited
          </span>
        </div>
        {years.length > 0 ? (
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {yearStats.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {yearStats.map((s) => (
            <button
              key={s.year}
              type="button"
              onClick={() => setYear(s.year)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                year === s.year
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/60 bg-surface hover:border-primary/30",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="num text-sm font-semibold">{s.year}</span>
                <span className="text-[0.65rem] text-muted-foreground">tap to filter</span>
              </span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">
                  Cash{" "}
                  <span className="num font-semibold text-gain">
                    {formatNpr(s.cash, { compact: true })}
                  </span>
                </span>
                {s.bonus > 0 ? (
                  <span className="text-muted-foreground">
                    Bonus{" "}
                    <span className="num font-semibold text-primary">
                      +{formatQty(Math.floor(s.bonus))}
                    </span>
                  </span>
                ) : null}
                {s.credited > 0 ? (
                  <span className="text-muted-foreground">
                    Credited <span className="num font-semibold">+{formatQty(s.credited)}</span>
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {grouped.length === 0 ? (
          year !== "all" ? (
            <EmptyBlock
              title={`No dividends in ${year}`}
              description="Nothing matched this year — pick another year above or tap a stat card to filter."
            />
          ) : (
            <EmptyBlock
              title="No dividends yet"
              description="Bonus shares, mergers and rights are computed from your demat movement history; IPO allotments are excluded."
            />
          )
        ) : (
          grouped.map((entry) => {
            const hasCash = entry.divRows.some((r) => r.cashValue > 0);
            const hasBonus = entry.bonusUnits > 0 || entry.estBonusUnits > 0;
            const hasOther = entry.mergerUnits > 0 || entry.rightUnits > 0;
            if (!hasCash && !hasBonus && !hasOther && entry.creditedUnits === 0) return null;
            return (
              <details
                key={entry.scrip}
                className="group rounded-xl border border-border/60 bg-surface transition-colors open:border-primary/30"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onPickScrip(entry.scrip);
                      }}
                      className="truncate text-sm font-semibold transition-colors hover:text-primary"
                    >
                      {entry.scrip}
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {hasCash ? (
                      <span className="num text-xs font-semibold text-gain">
                        {formatNpr(entry.estCash, { compact: true })}
                      </span>
                    ) : null}
                    {hasBonus ? (
                      <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
                        +{formatQty(entry.bonusUnits + entry.estBonusUnits)} bonus
                      </span>
                    ) : null}
                    {entry.creditedUnits > 0 ? (
                      <span className="num rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                        +{formatQty(entry.creditedUnits)} units
                      </span>
                    ) : null}
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="space-y-3 border-t border-border/60 p-3">
                  {entry.divRows.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="pl-3">Dividend</TableHead>
                            <TableHead className="text-right">Cash</TableHead>
                            <TableHead className="text-right">Bonus</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="hidden text-left sm:table-cell">
                              Announced
                            </TableHead>
                            <TableHead className="text-right">Est. cash (your units)</TableHead>
                            <TableHead className="pr-3 text-right">
                              Est. bonus (your units)
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.divRows.map((r, i) => (
                            <TableRow key={`${entry.scrip}-div-${r.fiscalYear ?? i}`}>
                              <TableCell className="num pl-3 font-medium">
                                {r.fiscalYear ?? "—"}
                              </TableCell>
                              <TableCell className="num text-right text-muted-foreground">
                                {r.cashDividend > 0 ? `${r.cashDividend}%` : "—"}
                              </TableCell>
                              <TableCell className="num text-right text-muted-foreground">
                                {r.bonusShare > 0 ? `${r.bonusShare}%` : "—"}
                              </TableCell>
                              <TableCell className="num text-right font-semibold">
                                {r.totalDividend > 0 ? `${r.totalDividend}%` : "—"}
                              </TableCell>
                              <TableCell className="num hidden text-left text-muted-foreground sm:table-cell">
                                {r.announcementDate ? formatDate(r.announcementDate) : "—"}
                              </TableCell>
                              <TableCell className="num text-right font-medium">
                                {r.cashValue > 0 ? formatNpr(r.cashValue) : "—"}
                              </TableCell>
                              <TableCell className="num pr-3 text-right font-medium text-primary">
                                {r.bonusUnits > 0 ? `+${formatQty(r.bonusUnits)}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}

                  {entry.creditRows.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="pl-3">Credited</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="pr-3 text-right">Units</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.creditRows.map((r, i) => (
                            <TableRow
                              key={`${entry.scrip}-credit-${String(r.transactionDate)}-${i}`}
                            >
                              <TableCell className="num whitespace-nowrap pl-3 text-xs">
                                {formatDate(r.transactionDate)}
                              </TableCell>
                              <TableCell
                                className="max-w-64 truncate text-xs text-muted-foreground"
                                title={r.historyDescription}
                              >
                                {r.historyDescription ?? "—"}
                              </TableCell>
                              <TableCell className="num pr-3 text-right font-semibold text-gain">
                                +{formatQty(r.creditQuantity)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })
        )}
      </div>

      <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
        Units credited (bonus, mergers, rights) come straight from your MeroShare movement history;
        IPO allotments are skipped. Cash dividend estimates apply the announced rate to the units
        you actually held on each announcement date, on the company's face value — indicative,
        actual payouts depend on book-close records and 5% tax is withheld at source.
      </p>
    </div>
  );
}

/** On-demand account history: price trend (YONEPSE LTP) and actual dividends (demat transactions). */
function HistoryPanel({
  holdings,
  onPickScrip,
}: {
  holdings: EnrichedHolding[];
  onPickScrip: (scrip: string) => void;
}) {
  const [tab, setTab] = useState<HistoryTab | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-4 py-3">
        <h2 className="text-sm font-semibold">Account history & insights</h2>
        <span className="ml-auto text-[0.68rem] text-muted-foreground">
          loaded on demand — tap a tab
        </span>
      </header>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <TabButton active={tab === "price"} onClick={() => setTab("price")}>
          <LineChart className="size-3.5" /> Price history
        </TabButton>
        <TabButton active={tab === "dividend"} onClick={() => setTab("dividend")}>
          <Gift className="size-3.5" /> Dividend history
        </TabButton>
      </div>
      <div className="px-4 pb-4">
        {tab === null ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            Choose a tab above to load it on demand — past prices and your dividend record.
          </p>
        ) : tab === "price" ? (
          <PriceHistoryTab holdings={holdings} onPickScrip={onPickScrip} />
        ) : (
          <DividendHistoryTab onPickScrip={onPickScrip} />
        )}
      </div>
    </section>
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
        <Button
          variant="outline"
          size="sm"
          disabled={items.length === 0}
          onClick={() => exportCsv(items, totals)}
        >
          <FileDown /> Export
        </Button>
      </div>

      {q.data?.marketStale ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          The market feed is temporarily unreachable — prices shown are MeroShare's own, which may
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
