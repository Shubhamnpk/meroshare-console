import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Gift, LineChart } from "lucide-react";
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
import {
  dividendsQuery,
  faceValuesQuery,
  portfolioHistoryQuery,
  transactionsQuery,
} from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { parseNptEpoch, unitsHeldAt, type UnitSnapshot } from "@/lib/nepse/timeline";
import { formatDate, formatNpr, formatPercent, formatQty, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DividendRow,
  EnrichedHolding,
  PortfolioGranularity,
  PortfolioHistoryPoint,
} from "@/lib/nepse/types";
import type { TransactionItem } from "@/lib/meroshare/types";

export type HistoryTab = "price" | "dividend";

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

/** Button-style tab card with icon, title and description; replaces the old pill tabs. */
export function HistoryTabButton({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
        active
          ? "border-primary/50 bg-primary/10 shadow-[0_1px_8px_-2px] shadow-primary/25"
          : "border-border/60 bg-surface hover:border-primary/30 hover:bg-accent/5",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground group-hover:text-primary",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-semibold", active && "text-primary")}>{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
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
          They&apos;re missing from this chart:{" "}
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
          const count = point.breakdown.length;
          return (
            <p className="text-[0.65rem] text-muted-foreground">
              {count} {count === 1 ? "scrip" : "scrips"}
            </p>
          );
        }}
      />

      {selectedPoint ? (
        <PointBreakdown point={selectedPoint} formatLabel={formatLabel} onPickScrip={onPickScrip} />
      ) : null}

      <p className="text-[0.68rem] text-muted-foreground">
        {granularity === "day"
          ? "Daily closing values from the YONEPSE LTP archive. Hover for the per-scrip breakdown. Click a point to pin it below."
          : granularity === "year"
            ? "Year-end closing values from the YONEPSE LTP archive. Hover for the per-scrip breakdown. Click a point to pin it below."
            : "Month-end closing values from the YONEPSE LTP archive. Hover for the per-scrip breakdown. Click a point to pin it below."}
      </p>
    </div>
  );
}

/** Pinned point: every scrip's price and the units held at that moment, with a value total. */
export function PointBreakdown({
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
  return (m && m[1]) || "-";
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

/** Actual credits from your demat movement history: bonuses, mergers and rights (IPO allotments excluded). */
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

  // Corporate-action credits, minus IPO allotments; those aren't dividends.
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
      if (y !== "-") set.add(y);
    }
    for (const d of dividends.data ?? []) {
      const y = yearOf(d.announcementDate);
      if (y === "-") continue;
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
      const key = String(t.script ?? "-").toUpperCase();
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
      if (y === "-") continue;
      const e = map.get(y) ?? { year: y, cash: 0, bonus: 0, credited: 0 };
      const qty = toNumber(r.creditQuantity);
      e.credited += qty;
      if (BONUS_RE.test(r.historyDescription ?? "")) e.bonus += qty;
      map.set(y, e);
    }
    for (const d of dividends.data ?? []) {
      const y = yearOf(d.announcementDate);
      if (y === "-") continue;
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
              description="Nothing matched this year. Pick another year above or tap a stat card to filter."
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
                                {r.fiscalYear ?? "-"}
                              </TableCell>
                              <TableCell className="num text-right text-muted-foreground">
                                {r.cashDividend > 0 ? `${r.cashDividend}%` : "-"}
                              </TableCell>
                              <TableCell className="num text-right text-muted-foreground">
                                {r.bonusShare > 0 ? `${r.bonusShare}%` : "-"}
                              </TableCell>
                              <TableCell className="num text-right font-semibold">
                                {r.totalDividend > 0 ? `${r.totalDividend}%` : "-"}
                              </TableCell>
                              <TableCell className="num hidden text-left text-muted-foreground sm:table-cell">
                                {r.announcementDate ? formatDate(r.announcementDate) : "-"}
                              </TableCell>
                              <TableCell className="num text-right font-medium">
                                {r.cashValue > 0 ? formatNpr(r.cashValue) : "-"}
                              </TableCell>
                              <TableCell className="num pr-3 text-right font-medium text-primary">
                                {r.bonusUnits > 0 ? `+${formatQty(r.bonusUnits)}` : "-"}
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
                                {r.historyDescription ?? "-"}
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
        you actually held on each announcement date, on the company&apos;s face value (indicative,
        actual payouts depend on book-close records and 5% tax is withheld at source.
      </p>
    </div>
  );
}

/** On-demand account history: price trend (YONEPSE LTP) and actual dividends (demat transactions). */
export function HistoryPanel({
  holdings,
  onPickScrip,
  defaultTab = null,
}: {
  holdings: EnrichedHolding[];
  onPickScrip: (scrip: string) => void;
  defaultTab?: HistoryTab | null;
}) {
  const [tab, setTab] = useState<HistoryTab | null>(defaultTab);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-4 py-3">
        <h2 className="text-sm font-semibold">Account history &amp; insights</h2>
      </header>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
        <HistoryTabButton
          active={tab === "price"}
          onClick={() => setTab("price")}
          icon={<LineChart className="size-5" />}
          title="Price history"
          description="Your portfolio's value over time"
        />
        <HistoryTabButton
          active={tab === "dividend"}
          onClick={() => setTab("dividend")}
          icon={<Gift className="size-5" />}
          title="Dividend history"
          description="Cash, bonus, merger & right credits"
        />
      </div>
      <div className="px-4 pb-4">
        {tab === null ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            Choose an insight above to load it on demand: past prices and your dividend record.
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
