import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { DeltaPill } from "@/components/stat-card";
import { AreaChart } from "@/components/market/area-chart";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WeightBar } from "@/components/portfolio/holdings-table";
import { globalDaySeriesQuery, globalHistoryQuery, type GlobalHistoryLot } from "@/lib/queries";
import { formatDisplay, useDisplayCurrency, useDisplayRates } from "@/lib/world/display";
import type { GlobalTxn } from "@/lib/world/import";
import type { GlobalHistoryPoint } from "@/lib/world/feed.server";
import { deriveHoldings } from "@/lib/world/store";
import { formatNpr, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_RANGES, type ChartRangeKey } from "@/lib/charts/ranges";

/**
 * What the Global book was actually worth over time: positions walk forward
 * through dated buys and sells, so the line starts at the first buy — never
 * renders value before any holding existed.
 */
export function GlobalHistoryPanel({ txns }: { txns: GlobalTxn[] }) {
  const [range, setRange] = useState<ChartRangeKey>("1D");
  const [mode, setMode] = useState<"profit" | "total">("profit");
  const [selectedTime, setSelectedTime] = useState<number | null>(null);

  const holdings = useMemo<GlobalHistoryLot[]>(() => {
    const lots = new Map<string, { date: string; side: string; qty: number; price: number }[]>();
    const ccy = new Map<string, string>();
    for (const t of txns) {
      if (!t.symbol) continue;
      const arr = lots.get(t.symbol) ?? [];
      arr.push({ date: t.date, side: t.side, qty: t.qty, price: t.price ?? 0 });
      lots.set(t.symbol, arr);
      if (!ccy.has(t.symbol) && t.currency) ccy.set(t.symbol, t.currency);
    }
    return [...lots.entries()].map(([symbol, symbolLots]) => ({
      symbol,
      currency: ccy.get(symbol) ?? "",
      lots: symbolLots,
    }));
  }, [txns]);

  const history = useQuery({
    ...globalHistoryQuery(holdings, range === "1D" ? "1M" : range),
    enabled: range !== "1D",
  });

  const dayLots = useMemo(
    () =>
      deriveHoldings(txns).map((h) => ({
        symbol: h.symbol,
        qty: h.qty,
        avgPrice: h.avgPrice,
        currency: h.currency,
      })),
    [txns],
  );

  const daySeries = useQuery({ ...globalDaySeriesQuery(dayLots, range === "1D") });

  const rawPoints = useMemo<GlobalHistoryPoint[]>(() => {
    if (range === "1D") return daySeries.data?.points ?? [];
    return history.data?.points ?? [];
  }, [range, daySeries.data?.points, history.data?.points]);

  const failed = range === "1D" ? (daySeries.data?.failed ?? []) : (history.data?.failed ?? []);

  const points = useMemo(() => {
    return mode === "profit"
      ? rawPoints.map((p) => ({ time: p.time, value: p.value - p.cost }))
      : rawPoints.map((p) => ({ time: p.time, value: p.value }));
  }, [rawPoints, mode]);

  const activeQuery = range === "1D" ? daySeries : history;
  // NPR points convert into the Settings display currency; pcts are unitless.
  const displayCurrency = useDisplayCurrency();
  const toDisplay = useDisplayRates(["NPR"])?.["NPR"] ?? null;

  const drawn = useMemo(
    () => (toDisplay == null ? points : points.map((p) => ({ time: p.time, value: p.value * toDisplay }))),
    [points, toDisplay],
  );

  const costSeries = useMemo(
    () => rawPoints.map((p) => ({ time: p.time, value: toDisplay == null ? p.cost : p.cost * toDisplay })),
    [rawPoints, toDisplay],
  );

  const fmt = (npr: number) =>
    toDisplay == null
      ? formatNpr(npr, { compact: true })
      : formatDisplay(npr * toDisplay, displayCurrency, { compact: true });

  const start = points.length > 0 ? points[0]!.value : 0;
  const end = points.length > 0 ? points[points.length - 1]!.value : 0;
  const change = end - start;
  const pct = start !== 0 ? (change / Math.abs(start)) * 100 : 0;

  const waccLine = mode === "profit" ? 0 : null;
  const waccSeries = mode === "total" ? costSeries : undefined;

  const selectedPoint = useMemo(
    () => (selectedTime != null ? rawPoints.find((p) => p.time === selectedTime) ?? null : null),
    [selectedTime, rawPoints],
  );

  const formatLabel = (t: number) =>
    range === "1D"
      ? new Date(t * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : new Date(t * 1000).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

  return (
    <Panel as="section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold">Global history</h2>
          {points.length >= 2 ? (
            <DeltaPill value={change}>
              {`${change >= 0 ? "+" : "-"}${fmt(Math.abs(change))} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`}
            </DeltaPill>
          ) : null}
          {activeQuery.isFetching && !activeQuery.isPending ? (
            <span className="animate-pulse text-[0.68rem] text-muted-foreground">Updating…</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <div
            role="group"
            aria-label="History measure"
            className="mr-1 flex overflow-hidden rounded-full border border-border/60"
          >
            {(["profit", "total"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                }}
                className={`px-2.5 py-0.5 text-[0.68rem] font-medium capitalize transition-colors ${
                  mode === m ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {CHART_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => {
                setRange(r);
                setSelectedTime(null);
              }}
              className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium transition-colors ${
                range === r
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {activeQuery.isPending ? (
        <LoadingBlock label="Building global history" rows={1} />
      ) : activeQuery.isError ? (
        <ErrorBlock error={activeQuery.error} retry={() => void activeQuery.refetch()} />
      ) : points.length < 2 ? (
        <p className="rounded-xl border border-border/60 bg-surface px-3 py-8 text-center text-sm text-muted-foreground">
          Not enough price history for these holdings yet.
        </p>
      ) : (
        <>
          <AreaChart
            points={drawn}
            height={240}
            wacc={waccLine}
            waccSeries={waccSeries}
            includeWaccDomain
            anchor={waccLine}
            selectedTime={selectedTime}
            onSelect={(pt) => setSelectedTime((curr) => (curr === pt.time ? null : pt.time))}
            tooltipExtra={(pt) => {
              const p = rawPoints.find((x) => x.time === pt.time);
              if (!p) return null;
              const pl = p.value - p.cost;
              const plPct = p.cost > 0 ? (pl / p.cost) * 100 : 0;
              const count = p.breakdown?.length ?? 0;
              return (
                <div className="space-y-1 text-[0.68rem] text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>Investment:</span>
                    <span className="font-mono font-medium text-foreground">{fmt(p.cost)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Net P/L:</span>
                    <span className={cn("font-mono font-medium", pl >= 0 ? "text-gain" : "text-loss")}>
                      {pl >= 0 ? "+" : "-"}{fmt(Math.abs(pl))} ({plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%)
                    </span>
                  </div>
                  {count > 0 ? (
                    <div className="border-t border-border/40 pt-1 text-center text-[0.62rem] text-muted-foreground">
                      {count} {count === 1 ? "holding" : "holdings"} · Click point to inspect
                    </div>
                  ) : null}
                </div>
              );
            }}
            formatValue={(v) => {
              const absFormatted =
                toDisplay == null
                  ? formatNpr(Math.abs(v), { compact: true })
                  : formatDisplay(Math.abs(v), displayCurrency, { compact: true });
              if (mode === "profit") {
                if (Math.abs(v) < 0.01) return absFormatted;
                return `${v >= 0 ? "+" : "-"}${absFormatted}`;
              }
              return absFormatted;
            }}
            formatLabel={formatLabel}
          />
          {selectedPoint ? (
            <GlobalPointBreakdown
              point={selectedPoint}
              formatLabel={formatLabel}
              onClose={() => setSelectedTime(null)}
              toDisplay={toDisplay}
              displayCurrency={displayCurrency}
            />
          ) : null}
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {mode === "profit"
              ? "Profit = value minus what you paid (average cost); Total = value plus cost. "
              : "Total = portfolio value over time vs your actual total investment line (dashed). "}
            {range === "1D"
              ? "Today's sessions · 15-min bars. "
              : "Follows your actual buys and sells — starts at your first buy, not a backcast. "}
            Converted at current FX rates. Click any point on the chart to inspect holdings and allocation on that date.
            {failed.length > 0 ? ` Excludes ${failed.join(", ")} (no history).` : ""}
          </p>
        </>
      )}
    </Panel>
  );
}

/** Pinned point: every scrip's price and the units held at that moment, with allocation and profit */
function GlobalPointBreakdown({
  point,
  formatLabel,
  onClose,
  toDisplay,
  displayCurrency,
}: {
  point: GlobalHistoryPoint;
  formatLabel: (time: number) => string;
  onClose: () => void;
  toDisplay: number | null;
  displayCurrency: string;
}) {
  type Key = "symbol" | "close" | "units" | "cost" | "value" | "profit" | "allocation";
  const { sort, toggle } = useSort<Key>(
    { key: "value", dir: "desc" },
    {
      symbol: "text",
      close: "number",
      units: "number",
      cost: "number",
      value: "number",
      profit: "number",
      allocation: "number",
    },
  );

  const fmt = (npr: number) =>
    toDisplay == null
      ? formatNpr(npr, { compact: true })
      : formatDisplay(npr * toDisplay, displayCurrency, { compact: true });

  const breakdown = point.breakdown ?? [];
  const totalValue = point.value;
  const totalCost = point.cost;
  const totalProfit = totalValue - totalCost;
  const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const enriched = useMemo(() => {
    return breakdown.map((item) => {
      const profit = item.value - item.cost;
      const profitPct = item.cost > 0 ? (profit / item.cost) * 100 : 0;
      const allocation = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
      return {
        ...item,
        profit,
        profitPct,
        allocation,
      };
    });
  }, [breakdown, totalValue]);

  const rows = useMemo(() => {
    const getter = (b: (typeof enriched)[number]): string | number => {
      switch (sort.key) {
        case "symbol":
          return b.symbol;
        case "close":
          return b.close;
        case "units":
          return b.units;
        case "cost":
          return b.cost;
        case "profit":
          return b.profit;
        case "allocation":
          return b.allocation;
        default:
          return b.value;
      }
    };
    return sortBy([...enriched], getter, sort.dir);
  }, [enriched, sort]);

  const tone = (v: number) => (v > 0 ? "text-gain" : v < 0 ? "text-loss" : "text-muted-foreground");
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "");

  return (
    <Panel padding="none" className="mt-4 overflow-clip">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold">Held on {formatLabel(point.time)}</h4>
          <span className="text-[0.68rem] text-muted-foreground">
            ({rows.length} {rows.length === 1 ? "stock" : "stocks"})
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs num">
            <span className="text-muted-foreground mr-1">Cost:</span>
            <span className="font-medium mr-2">{fmt(totalCost)}</span>
            <span className="text-muted-foreground mr-1">Value:</span>
            <span className="font-medium mr-2">{fmt(totalValue)}</span>
            <span className={cn("font-semibold", tone(totalProfit))}>
              {sign(totalProfit)}{fmt(Math.abs(totalProfit))} ({sign(totalProfitPct)}{Math.abs(totalProfitPct).toFixed(2)}%)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close breakdown"
            aria-label="Close breakdown"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <Table className="min-w-[760px]">
        <TableHeader className="static shadow-none">
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10 pl-4" scope="col">
              SN
            </TableHead>
            <SortableTh
              label="Stock"
              active={sort.key === "symbol"}
              dir={sort.dir}
              onClick={() => toggle("symbol")}
              align="left"
              kind="text"
            />
            <SortableTh
              label="Price"
              active={sort.key === "close"}
              dir={sort.dir}
              onClick={() => toggle("close")}
              align="right"
              kind="number"
            />
            <SortableTh
              label="Units"
              active={sort.key === "units"}
              dir={sort.dir}
              onClick={() => toggle("units")}
              align="right"
              kind="number"
            />
            <SortableTh
              label="Value"
              active={sort.key === "value"}
              dir={sort.dir}
              onClick={() => toggle("value")}
              align="right"
              kind="number"
            />
            <SortableTh
              label="Cost"
              active={sort.key === "cost"}
              dir={sort.dir}
              onClick={() => toggle("cost")}
              align="right"
              kind="number"
            />
            <SortableTh
              label="Net P/L"
              active={sort.key === "profit"}
              dir={sort.dir}
              onClick={() => toggle("profit")}
              align="right"
              kind="number"
            />
            <SortableTh
              label="Weight"
              active={sort.key === "allocation"}
              dir={sort.dir}
              onClick={() => toggle("allocation")}
              align="right"
              kind="number"
              className="pr-4"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b, idx) => (
            <TableRow key={b.symbol}>
              <TableCell className="w-10 pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
              <TableCell>
                <p className="font-semibold transition-colors hover:text-primary">{b.symbol}</p>
              </TableCell>
              <TableCell className="num text-right font-medium">
                {b.currency && b.currency !== "NPR" ? `${b.currency} ` : ""}
                {b.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="num text-right text-muted-foreground">{formatQty(b.units)}</TableCell>
              <TableCell className="num text-right font-medium">{fmt(b.value)}</TableCell>
              <TableCell className="num text-right text-muted-foreground">{fmt(b.cost)}</TableCell>
              <TableCell className="text-right">
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold num",
                    b.profit > 0
                      ? "bg-gain/10 text-gain"
                      : b.profit < 0
                        ? "bg-loss/10 text-loss"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {sign(b.profit)}
                  {fmt(Math.abs(b.profit))}
                  <span className="ml-1 text-[0.65rem] opacity-80">
                    ({sign(b.profitPct)}
                    {Math.abs(b.profitPct).toFixed(1)}%)
                  </span>
                </span>
              </TableCell>
              <TableCell className="pr-4">
                <WeightBar pct={b.allocation} barClass="bg-primary/70" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="w-10 pl-4 text-xs font-semibold text-muted-foreground" />
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell />
            <TableCell className="num text-right font-semibold">
              {formatQty(rows.reduce((sum, b) => sum + b.units, 0))}
            </TableCell>
            <TableCell className="num text-right font-semibold">{fmt(totalValue)}</TableCell>
            <TableCell className="num text-right font-semibold">{fmt(totalCost)}</TableCell>
            <TableCell className="text-right">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold num",
                  totalProfit > 0
                    ? "bg-gain/10 text-gain"
                    : totalProfit < 0
                      ? "bg-loss/10 text-loss"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {sign(totalProfit)}
                {fmt(Math.abs(totalProfit))}
                <span className="ml-1 text-[0.65rem] opacity-80">
                  ({sign(totalProfitPct)}
                  {Math.abs(totalProfitPct).toFixed(1)}%)
                </span>
              </span>
            </TableCell>
            <TableCell className="pr-4">
              <WeightBar pct={100} barClass="bg-primary/70" />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Panel>
  );
}
