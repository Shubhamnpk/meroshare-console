import { useEffect, useMemo, useState } from "react";
import { Calculator, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatNpr,
  formatNumber,
  formatPercent,
  formatQty,
  toNumber,
} from "@/lib/format";
import type { DailyBar, DividendRow } from "@/lib/nepse/types";
import type { TransactionItem } from "@/lib/meroshare/types";
import { cn } from "@/lib/utils";

export interface SimStep {
  key: string;
  fy: string;
  date: string;
  cashPct: number;
  bonusPct: number;
  unitsBefore: number;
  cashGot: number;
  bonusGot: number;
  unitsAfter: number;
}

export interface SimResult {
  steps: SimStep[];
  totalCash: number;
  totalBonus: number;
  endUnits: number;
  startUnits: number;
}

/** Parse CDSC/feed date strings leniently; NaN when unparseable. */
function toMs(value: unknown): number {
  if (value === null || value === undefined) return NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  return Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
}

/**
 * Walk dividend announcements oldest-first, compounding bonus shares forward:
 * cash is paid on the units held at each announcement, bonus units join the
 * holding for every later announcement.
 */
export function simulateDividends(args: {
  rows: DividendRow[];
  startUnits: number;
  face: number;
}): SimResult {
  let units = Math.max(0, args.startUnits);
  const steps: SimStep[] = [];
  let totalCash = 0;
  let totalBonus = 0;
  for (const row of args.rows) {
    const cashPct = Math.max(0, row.cashDividend || 0);
    const bonusPct = Math.max(0, row.bonusShare || 0);
    const cashGot = (units * args.face * cashPct) / 100;
    const bonusGot = (units * bonusPct) / 100;
    totalCash += cashGot;
    totalBonus += bonusGot;
    units += bonusGot;
    steps.push({
      key: `${row.fiscalYear ?? ""}-${row.announcementDate ?? steps.length}`,
      fy: row.fiscalYear ?? "-",
      date: row.announcementDate ?? row.bookCloseDate ?? "",
      cashPct,
      bonusPct,
      unitsBefore: units - bonusGot,
      cashGot,
      bonusGot,
      unitsAfter: units,
    });
  }
  return {
    steps,
    totalCash,
    totalBonus,
    endUnits: units,
    startUnits: Math.max(0, args.startUnits),
  };
}

/** Net credited units strictly after a timestamp (unparseable dates are skipped). */
function netCreditedAfter(transactions: TransactionItem[], afterMs: number): number {
  let net = 0;
  for (const t of transactions) {
    const ms = toMs(t.transactionDate);
    if (!Number.isFinite(ms) || ms <= afterMs) continue;
    net += toNumber(t.creditQuantity) - toNumber(t.debitQuantity);
  }
  return net;
}

function oldestFirst(rows: DividendRow[]): DividendRow[] {
  return [...rows].sort((a, b) =>
    String(a.announcementDate ?? a.fiscalYear ?? "").localeCompare(
      String(b.announcementDate ?? b.fiscalYear ?? ""),
    ),
  );
}

/**
 * Totally factual variant: works back from the current holding through real
 * demat movements to the units held at the first announcement, then simulates
 * forward. Returns matched:false when the data can't support it.
 */
export function actualMatchedTotals(args: {
  rows: DividendRow[];
  holdingUnits: number;
  transactions: TransactionItem[];
  face: number;
}): { matched: boolean; totalCash: number; totalBonus: number } {
  const none = { matched: false, totalCash: 0, totalBonus: 0 };
  if (args.holdingUnits <= 0 || args.transactions.length === 0) return none;
  const ordered = oldestFirst(args.rows);
  if (ordered.length === 0) return none;
  const firstMs = toMs(ordered[0]!.announcementDate ?? ordered[0]!.fiscalYear ?? "");
  if (!Number.isFinite(firstMs)) return none;
  const startUnits = Math.max(
    0,
    Math.floor(args.holdingUnits - netCreditedAfter(args.transactions, firstMs)),
  );
  const r = simulateDividends({ rows: ordered, startUnits, face: args.face });
  return { matched: true, totalCash: r.totalCash, totalBonus: r.totalBonus };
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-sm font-bold", accent && "text-gain")}>{value}</p>
    </div>
  );
}

const PERIOD_OPTIONS = ["1yr", "2yr", "3yr", "4yr", "5yr", "All", "Custom"] as const;
type PeriodOption = (typeof PERIOD_OPTIONS)[number];

export function DividendSimulator({
  symbol,
  dividends,
  holdingUnits,
  faceValue,
  history,
  currentLtp,
  transactions,
  actualCost,
  onOpenChange,
  controlledOpen,
}: {
  symbol: string;
  dividends: DividendRow[];
  holdingUnits: number | null;
  faceValue: number;
  history: DailyBar[];
  currentLtp: number | null;
  transactions: TransactionItem[];
  actualCost: number | null;
  onOpenChange?: (open: boolean) => void;
  controlledOpen?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [unitsInput, setUnitsInput] = useState(
    holdingUnits && holdingUnits > 0 ? String(Math.floor(holdingUnits)) : "100",
  );
  const [useActual, setUseActual] = useState(false);
  const [period, setPeriod] = useState<PeriodOption>("3yr");

  // FY range only when Custom
  const fiscalYears = useMemo(() => {
    const set = new Set<string>();
    for (const d of dividends) if (d.fiscalYear) set.add(d.fiscalYear);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dividends]);
  const [fromFy, setFromFy] = useState<string | null>(null);
  const [toFy, setToFy] = useState<string | null>(null);

  useEffect(() => {
    const def = holdingUnits && holdingUnits > 0 ? String(Math.floor(holdingUnits)) : unitsInput;
    // keep input in sync when holding changes and not in actual mode
    if (!useActual) setUnitsInput(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingUnits]);

  const ordered = useMemo(() => {
    let rows = [...dividends];
    if (period === "Custom") {
      rows = rows.filter(
        (d) =>
          (!fromFy || (d.fiscalYear ?? "") >= fromFy) && (!toFy || (d.fiscalYear ?? "") <= toFy),
      );
    } else if (period !== "All") {
      const years = parseInt(period, 10);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - years);
      rows = rows.filter((d) => {
        if (!d.announcementDate) return false;
        const ms = toMs(d.announcementDate);
        return Number.isFinite(ms) && ms >= cutoff.getTime();
      });
    }
    return rows.sort((a, b) =>
      String(a.announcementDate ?? a.fiscalYear ?? "").localeCompare(
        String(b.announcementDate ?? b.fiscalYear ?? ""),
      ),
    );
  }, [dividends, fromFy, toFy, period]);

  const canUseActual =
    useActual && holdingUnits !== null && holdingUnits > 0 && transactions.length > 0;

  const startUnits = useMemo(() => {
    if (canUseActual && ordered.length > 0) {
      const firstMs = toMs(ordered[0]!.announcementDate ?? ordered[0]!.fiscalYear ?? "");
      const base = Number.isFinite(firstMs)
        ? holdingUnits! - netCreditedAfter(transactions, firstMs)
        : holdingUnits!;
      return Math.max(0, Math.floor(base));
    }
    return Math.max(0, Math.floor(toNumber(unitsInput)));
  }, [canUseActual, ordered, holdingUnits, transactions, unitsInput]);

  const result = useMemo(
    () => simulateDividends({ rows: ordered, startUnits, face: faceValue }),
    [ordered, startUnits, faceValue],
  );

  const startPrice = useMemo(() => {
    if (ordered.length === 0) return null;
    const anchor = String(ordered[0]!.announcementDate ?? ordered[0]!.fiscalYear ?? "");
    let best: number | null = null;
    for (const b of history) {
      if (b.date <= anchor && b.close > 0) best = b.close;
    }
    return best;
  }, [ordered, history]);

  const startCost = startPrice !== null ? startUnits * startPrice : null;
  const endValue = currentLtp !== null && currentLtp > 0 ? result.endUnits * currentLtp : null;
  const totalReturn =
    startCost !== null && startCost > 0 && endValue !== null
      ? endValue + result.totalCash - startCost
      : null;
  const totalReturnPct =
    totalReturn !== null && startCost !== null && startCost > 0
      ? (totalReturn / startCost) * 100
      : null;

  // Summary text like stock-details dividend tab
  const summaryText =
    result.steps.length > 0 ? (
      <p className="rounded-xl bg-gain/10 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        On your{" "}
        <span className="num font-semibold text-foreground">
          {formatQty(result.startUnits)} units
        </span>
        , the years shown total an estimated cash{" "}
        <span className="num font-semibold text-gain">{formatNpr(result.totalCash)}</span> and bonus{" "}
        <span className="num font-semibold text-foreground">
          {formatQty(Math.floor(result.totalBonus))} units
        </span>
        .
      </p>
    ) : null;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2.5 rounded-xl border-border/70 font-medium"
      >
        <Calculator className="size-4 text-primary" />
        <span className="text-left">What-if dividend simulator</span>
      </Button>
    );
  }

  // Display latest-first per user request; calculation stays oldest-first
  // When matching actual transactions, only show FYs where you held units then
  const displaySteps = (
    canUseActual ? result.steps.filter((s) => s.unitsBefore > 0) : result.steps
  )
    .slice()
    .reverse();

  return (
    <div className="space-y-3 rounded-2xl border border-primary/25 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-sm font-semibold">
          <Calculator className="size-4 text-primary" /> What-if simulator — {symbol}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close simulator"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`sim-units-${symbol}`}>Units held</Label>
          <Input
            id={`sim-units-${symbol}`}
            inputMode="numeric"
            value={unitsInput}
            disabled={canUseActual}
            onChange={(e) => setUnitsInput(e.target.value.replace(/[^0-9,]/g, ""))}
            className="num h-10"
          />
          {holdingUnits ? (
            <p className="text-[0.68rem] text-muted-foreground">
              You hold {formatQty(holdingUnits)} units
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1yr">1 year</SelectItem>
              <SelectItem value="2yr">2 years</SelectItem>
              <SelectItem value="3yr">3 years</SelectItem>
              <SelectItem value="4yr">4 years</SelectItem>
              <SelectItem value="5yr">5 years</SelectItem>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {period === "Custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>From FY</Label>
            <Select
              value={fromFy ?? "all"}
              onValueChange={(v) => setFromFy(v === "all" ? null : v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {fiscalYears.map((fy) => (
                  <SelectItem key={fy} value={fy}>
                    {fy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To FY</Label>
            <Select value={toFy ?? "all"} onValueChange={(v) => setToFy(v === "all" ? null : v)}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {fiscalYears.map((fy) => (
                  <SelectItem key={fy} value={fy}>
                    {fy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {holdingUnits !== null && holdingUnits > 0 && transactions.length > 0 ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/60 bg-surface px-3 py-2.5">
          <Switch
            checked={useActual}
            onCheckedChange={setUseActual}
            aria-label="Use my actual transactions"
            className="mt-0.5"
          />
          <span>
            <span className="block text-xs font-semibold">Match my actual transactions</span>
            <span className="block text-[0.68rem] leading-snug text-muted-foreground">
              Works back from your current {formatQty(holdingUnits)} units through your demat
              movements, so each announcement pays on what you truly held.
            </span>
          </span>
        </label>
      ) : null}

      {summaryText}

      {result.steps.length === 0 ? (
        <p className="rounded-xl border border-border/60 bg-surface px-3 py-4 text-center text-xs text-muted-foreground">
          {startUnits <= 0
            ? "Enter units above to run the simulation."
            : "No announcements in this range."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cash received" value={formatNpr(result.totalCash)} accent />
            <Stat
              label="Bonus earned"
              value={`${formatQty(Math.floor(result.totalBonus))} units`}
            />
            <Stat label="Final units" value={formatQty(Math.floor(result.endUnits))} />
            <Stat
              label="Total gain"
              value={
                totalReturn !== null
                  ? `${totalReturn >= 0 ? "+" : "-"}${formatNpr(Math.abs(totalReturn))}${totalReturnPct !== null ? ` (${formatPercent(totalReturnPct)})` : ""}`
                  : endValue !== null
                    ? formatNpr(endValue)
                    : "-"
              }
              accent={(totalReturn ?? 0) >= 0}
            />
          </div>

          {displaySteps.length === 0 ? (
            <p className="rounded-xl border border-border/60 bg-surface px-3 py-4 text-center text-xs text-muted-foreground">
              {canUseActual
                ? "No dividend in this range was payable on your holdings. you held 0 units at those book-closes."
                : "No rows to display."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="pl-3">FY</TableHead>
                    <TableHead className="text-right">Units held</TableHead>
                    <TableHead className="text-right">Cash %</TableHead>
                    <TableHead className="text-right">Bonus %</TableHead>
                    <TableHead className="text-right">Cash got</TableHead>
                    <TableHead className="pr-3 text-right">Bonus got</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displaySteps.map((s) => (
                    <TableRow key={s.key}>
                      <TableCell className="pl-3">
                        <p className="text-xs font-semibold">{s.fy}</p>
                        <p className="num text-[0.65rem] text-muted-foreground">
                          {s.date ? formatDate(s.date) : ""}
                        </p>
                      </TableCell>
                      <TableCell className="num text-right text-xs">
                        {formatQty(Math.floor(s.unitsBefore))}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-muted-foreground">
                        {s.cashPct > 0 ? `${s.cashPct}%` : "-"}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-muted-foreground">
                        {s.bonusPct > 0 ? `${s.bonusPct}%` : "-"}
                      </TableCell>
                      <TableCell className="num text-right text-xs font-medium text-gain">
                        {s.cashGot > 0 ? formatNpr(s.cashGot) : "-"}
                      </TableCell>
                      <TableCell className="num pr-3 text-right text-xs">
                        {s.bonusGot > 0 ? `+${formatQty(Math.floor(s.bonusGot))}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
            Pre-tax estimates on face value Rs {formatNumber(faceValue)}: cash pays on the units
            held at each announcement and bonus units compound forward.
            {startCost !== null
              ? ` Started ${formatQty(startUnits)} units at ~${formatNpr(startPrice ?? 0)} (${formatNpr(startCost)}).`
              : " Start price unavailable, so no total-return figure."}
            {actualCost !== null && actualCost > 0
              ? ` Your recorded cost basis is ${formatNpr(actualCost)}.`
              : null}
            {canUseActual
              ? " Matched against your demat movements; gaps in early history understate old payouts."
              : null}
          </p>
        </>
      )}
    </div>
  );
}
