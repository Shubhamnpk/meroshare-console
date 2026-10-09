import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh, type SortKind, type SortState } from "@/components/sortable-table";
import { DeltaPill } from "@/components/stat-card";
import { formatNpr, formatQty } from "@/lib/format";
import { netPosition } from "@/lib/calc/position";

export type HoldingsSortKey =
  "scrip" | "units" | "ltp" | "previousClose" | "value" | "avgBuy" | "unrealized" | "percentChange" | "weight";

export interface HoldingTableRow {
  key: string;
  scrip: string;
  description: string;
  units: number;
  ltp: number;
  previousClose: number;
  value: number;
  dayChange: number;
  dayPct: number;
  /** Portfolio weight in percent. */
  weight: number;
  /** Raw display overrides (e.g. foreign-currency symbols); NPR fallback. */
  ltpDisplay?: string | undefined;
  prevDisplay?: string | undefined;
  valueDisplay?: string | undefined;
  /** Fractional-share display override (formatQty rounds to whole kitta). */
  unitsDisplay?: string | undefined;
  /** Full signed amount segment of the Day pill, e.g. "+£3.20". */
  dayDisplay?: string | undefined;
  /** Average buy; null renders "-" (cellTitle still shows as tooltip). */
  avg: {
    value: number | null;
    /** Raw display override (e.g. native purchase price); falls back to NPR. */
    display?: string | undefined;
    prefix?: string | undefined;
    title?: string | undefined;
    cellTitle?: string | undefined;
  } | null;
  /** Net P/L; null renders "-". Label is always the percent, amount goes in title. */
  pl: { value: number; pct: number; title: string } | null;
}

export function WeightBar({ pct, barClass }: { pct: number; barClass: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="num text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

/**
 * Shared holdings table for the portfolio views (actual / Yo Broker / broker).
 * Same 9 columns everywhere; per-view differences are props: the avg column
 * label, LTP trend arrows, and the weight-bar accent.
 */
export function HoldingsTable({
  rows,
  sort,
  onToggle,
  onPick,
  avgLabel,
  trendArrows = false,
  weightBarClass,
  footer,
  footnote,
}: {
  rows: HoldingTableRow[];
  sort: SortState<HoldingsSortKey>;
  onToggle: (key: HoldingsSortKey) => void;
  onPick: (scrip: string) => void;
  avgLabel: string;
  trendArrows?: boolean;
  weightBarClass: string;
  footer?: ReactNode;
  footnote?: ReactNode;
}) {
  const columns: {
    key: HoldingsSortKey;
    label: string;
    align: "left" | "right";
    kind: SortKind;
    className?: string;
  }[] = [
    { key: "scrip", label: "Stock", align: "left", kind: "text" },
    { key: "units", label: "Units", align: "right", kind: "number" },
    { key: "ltp", label: "LTP", align: "right", kind: "number" },
    { key: "previousClose", label: "Prev close", align: "right", kind: "number" },
    { key: "value", label: "Value", align: "right", kind: "number" },
    { key: "avgBuy", label: avgLabel, align: "right", kind: "number" },
    { key: "unrealized", label: "Net P/L", align: "right", kind: "number" },
    { key: "percentChange", label: "Day", align: "right", kind: "number" },
    { key: "weight", label: "Weight", align: "right", kind: "number", className: "pr-4" },
  ];
  // Tap toggles the P/L pill between percent and amount (touch/keyboard path
  // to the hover-only amount).
  const [expandedPl, setExpandedPl] = useState<string | null>(null);
  return (
    <Panel padding="none" className="overflow-clip">
      <Table className="min-w-[760px]">
        <TableCaption className="sr-only">Stock holdings</TableCaption>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10 pl-4" scope="col">
              SN
            </TableHead>
            {columns.map((c) => (
              <SortableTh
                key={c.key}
                label={c.label}
                active={sort.key === c.key}
                dir={sort.dir}
                onClick={() => onToggle(c.key)}
                align={c.align}
                kind={c.kind}
                className={c.className ?? ""}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={row.key}
              className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              tabIndex={0}
              aria-label={`View ${row.scrip} details`}
              onClick={() => onPick(row.scrip)}
              onKeyDown={(e) => {
                // The P/L toggle button handles its own keys.
                if ((e.target as HTMLElement).closest("button")) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(row.scrip);
                }
              }}
            >
              <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
              <TableCell>
                <p className="font-semibold transition-colors hover:text-primary">{row.scrip}</p>
                <p className="max-w-52 truncate text-xs text-muted-foreground">{row.description}</p>
              </TableCell>
              <TableCell className="num text-right">{row.unitsDisplay ?? formatQty(row.units)}</TableCell>
              <TableCell className="text-right">
                {trendArrows ? (
                  <span className="inline-flex items-center justify-end gap-1">
                    <span className="num font-medium">{row.ltpDisplay ?? formatNpr(row.ltp)}</span>
                    {row.previousClose > 0 &&
                      row.ltp > 0 &&
                      row.ltp !== row.previousClose &&
                      (row.dayPct > 0 ? (
                        <ArrowUpRight className="size-3.5 text-gain" aria-hidden />
                      ) : (
                        <ArrowDownRight className="size-3.5 text-loss" aria-hidden />
                      ))}
                  </span>
                ) : (
                  <span className="num font-medium">{row.ltpDisplay ?? formatNpr(row.ltp)}</span>
                )}
              </TableCell>
              <TableCell className="num text-right text-muted-foreground">
                {row.previousClose > 0 ? (row.prevDisplay ?? formatNpr(row.previousClose)) : "-"}
              </TableCell>
              <TableCell className="num text-right font-medium">{row.valueDisplay ?? formatNpr(row.value)}</TableCell>
              <TableCell className="num text-right text-muted-foreground" title={row.avg?.cellTitle}>
                {row.avg && row.avg.value != null ? (
                  <span title={row.avg.title}>
                    {row.avg.prefix}
                    {row.avg.display ?? formatNpr(row.avg.value)}
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-right">
                {row.pl ? (
                  expandedPl === row.key ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPl(null);
                      }}
                      aria-expanded
                      aria-label={`Show P/L percent for ${row.scrip}`}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <DeltaPill
                        value={row.pl.value}
                        title={row.pl.title}
                      >{`${row.pl.value >= 0 ? "+" : ""}${formatNpr(Math.abs(row.pl.value))}`}</DeltaPill>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPl(row.key);
                      }}
                      aria-expanded={false}
                      aria-label={`Show P/L amount for ${row.scrip}`}
                      title={row.pl.title}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <DeltaPill value={row.pl.value}>
                        {`${row.pl.value >= 0 ? "+" : ""}${row.pl.pct.toFixed(2)}%`}
                      </DeltaPill>
                    </button>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DeltaPill value={row.dayPct}>
                  {`${row.dayDisplay ?? `${row.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(row.dayChange))}`} (${row.dayPct.toFixed(2)}%)`}
                </DeltaPill>
              </TableCell>
              <TableCell className="pr-4 text-right">
                <WeightBar pct={row.weight} barClass={weightBarClass} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {footer}
      </Table>
      {footnote}
    </Panel>
  );
}

/**
 * Minimal row shape shared by the Yo Broker (paper) and real broker views —
 * one table, one P/L math, broker infra for both.
 */
export interface PaperHolding {
  scrip: string;
  description: string;
  units: number;
  ltp: number;
  previousClose: number;
  value: number;
  dayChange: number;
  percentChange: number;
  /** Average buy/cost; <= 0 renders "-" with the no-basis tooltip. */
  avgBuy: number;
}

/** Shared mapper for both paper-trading views. */
export function toPaperRows(
  items: PaperHolding[],
  totalValue: number,
  labels: { avgTitle: string; noBasisTitle: string },
  opts?: { net?: boolean; isOpenEnd?: (scrip: string) => boolean },
): HoldingTableRow[] {
  return items.map((h, idx) => {
    const hasBasis = h.avgBuy > 0;
    const open = opts?.isOpenEnd?.(h.scrip) ?? false;
    // Real broker holdings deserve the same net-of-charges math as the
    // actual view; Yo paper money stays gross (no real fees exist there).
    let pl = 0;
    let plPct = 0;
    if (hasBasis) {
      if (opts?.net) {
        const pos = netPosition(h.units, h.avgBuy, h.ltp, { isOpenEnd: open });
        pl = pos.profit;
        plPct = pos.profitPct;
      } else {
        pl = h.value - h.units * h.avgBuy;
        plPct = h.units * h.avgBuy > 0 ? (pl / (h.units * h.avgBuy)) * 100 : 0;
      }
    }
    return {
      key: `${h.scrip}-${idx}`,
      scrip: h.scrip,
      description: h.description,
      units: h.units,
      ltp: h.ltp,
      previousClose: h.previousClose,
      value: h.value,
      dayChange: h.dayChange,
      dayPct: h.percentChange,
      weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      avg: hasBasis ? { value: h.avgBuy, cellTitle: labels.avgTitle } : { value: null, cellTitle: labels.noBasisTitle },
      pl: hasBasis
        ? {
            value: pl,
            pct: plPct,
            title: `${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} net P/L`,
          }
        : null,
    };
  });
}
