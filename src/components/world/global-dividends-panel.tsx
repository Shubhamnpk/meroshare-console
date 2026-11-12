import { useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { native } from "@/components/world/global-position-sheet";
import { formatDisplay, useDisplayCurrency, useDisplayRates } from "@/lib/world/display";
import { formatDate, formatQty } from "@/lib/format";
import type { GlobalTxn } from "@/lib/world/import";

interface Payout {
  id: string;
  /** YYYY-MM-DD (file date, no timezone math). */
  date: string;
  year: string;
  quarter: 1 | 2 | 3 | 4;
  symbol: string;
  name: string;
  /** Shares that earned the dividend, when the file states them. */
  shares: number;
  /** Dividend per share, in the payout currency (pence already converted). */
  perShare: number;
  /** Currency for the per-share figure. */
  perShareCurrency: string;
  currency: string;
  amount: number;
}

/** LSE rows quoted in pence: cash reads 61.26p → £0.61, not a bare "p". */
function isPence(currency: string): boolean {
  return currency === "GBX" || currency === "GBp";
}

/** Toggle one id inside an immutable Set. */
function toggleIn(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Shares held on a date, from the BUY/SELL ledger (fractional shares kept). */
function sharesOn(lots: { date: string; side: string; qty: number }[], date: string): number {
  let n = 0;
  for (const l of lots) {
    if (l.date > date) continue;
    if (l.side === "BUY") n += l.qty;
    else if (l.side === "SELL") n -= l.qty;
  }
  return Math.max(0, Math.round(n * 1e6) / 1e6);
}

/**
 * Cash actually received per dividend row: broker-stated GBP total when the
 * file gives one (Trading 212 always does), else the native pool amount.
 * Same rule the earnings chips use, so the totals never disagree.
 */
function dividendPayouts(txns: GlobalTxn[]): Payout[] {
  // Dividend rows often carry no quantity, so walk the trade ledger instead.
  const ledger = new Map<string, { date: string; side: string; qty: number }[]>();
  for (const t of txns) {
    if (t.side !== "BUY" && t.side !== "SELL") continue;
    const key = (t.symbol || "").toUpperCase();
    if (!key) continue;
    const arr = ledger.get(key) ?? [];
    arr.push({ date: t.date.slice(0, 10), side: t.side, qty: t.qty });
    ledger.set(key, arr);
  }

  return txns
    .filter((t) => t.side === "DIV")
    .map((t) => {
      const stated = t.costGbp != null && Number.isFinite(t.costGbp);
      const penny = isPence(t.currency);
      const raw = stated ? (t.costGbp as number) : t.costNative > 0 ? t.costNative : t.qty * t.price;
      // Pence rows become pounds so the table never reads "0.03p".
      const amount = penny && !stated ? raw / 100 : raw;
      const month = Number(t.date.slice(5, 7)) || 1;
      const date = t.date.slice(0, 10);
      const shares = t.qty > 0 ? t.qty : sharesOn(ledger.get((t.symbol || "").toUpperCase()) ?? [], date);
      return {
        id: t.id,
        date,
        year: t.date.slice(0, 4),
        quarter: Math.min(4, Math.max(1, Math.ceil(month / 3))) as Payout["quarter"],
        symbol: t.symbol || "—",
        name: t.name,
        shares,
        perShare: penny ? t.price / 100 : t.price,
        perShareCurrency: penny ? "GBP" : t.currency || "GBP",
        currency: stated ? "GBP" : penny ? "GBP" : t.currency || "GBP",
        amount,
      };
    })
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

type DivKey = "date" | "symbol" | "quarter" | "shares" | "perShare" | "amount";

/**
 * Global dividends received: lifetime and yearly totals you can tap through,
 * the quarterly split for the picked year, and every payout as a sortable
 * table. Device-local foreign data only — NEPSE dividends live in the
 * Portfolio history panel.
 */
export function GlobalDividendsPanel({
  txns,
  onPickSymbol,
}: {
  txns: GlobalTxn[];
  /** Opens the global position sheet for the tapped payout's stock. */
  onPickSymbol?: (symbol: string) => void;
}) {
  const rows = useMemo(() => dividendPayouts(txns), [txns]);
  const currencies = useMemo(() => [...new Set(rows.map((r) => r.currency))].sort(), [rows]);
  const rates = useDisplayRates(currencies);
  const display = useDisplayCurrency();
  const ready = rates != null && currencies.every((c) => rates[c] != null);
  const [picked, setPicked] = useState<string>("all");
  /** 0 = every quarter in the picked year. */
  const [quarter, setQuarter] = useState<0 | Payout["quarter"]>(0);
  /** Amount cells default to the display currency; per-share too (4dp). */
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [perShareNative, setPerShareNative] = useState<Set<string>>(new Set());
  const { sort, toggle } = useSort<DivKey>(
    { key: "date", dir: "desc" },
    { date: "text", symbol: "text", quarter: "number", shares: "number", perShare: "number", amount: "number" },
  );

  const money = (v: number, maxDp = 2) =>
    Math.abs(v) >= 100_000
      ? formatDisplay(v, display, { compact: true })
      : display === "NPR"
        ? `रु ${String(Number(v.toFixed(maxDp)))}`
        : native(v, display, maxDp);
  /** Dynamic currency unless FX is missing (then the file's own figures). */
  const showNative = !ready;

  /** One amount in the active currency — never a mix of £ and $ in one column. */
  const amountLabel = (amount: number, ccy: string): string =>
    showNative ? native(amount, ccy) : money(amount * (rates?.[ccy] ?? 0));

  /** Converted figure when FX is ready, else per-currency native joins. */
  const figure = (byCcy: Map<string, number>, converted: number): string => {
    if (!showNative) return money(converted);
    const parts = [...byCcy.entries()].filter(([, v]) => Math.abs(v) > 1e-9).map(([c, v]) => native(v, c));
    return parts.join(" · ");
  };

  const years = useMemo(() => {
    const map = new Map<
      string,
      { year: string; count: number; symbols: Set<string>; byCcy: Map<string, number>; converted: number }
    >();
    for (const r of rows) {
      const e = map.get(r.year) ?? {
        year: r.year,
        count: 0,
        symbols: new Set<string>(),
        byCcy: new Map<string, number>(),
        converted: 0,
      };
      e.count += 1;
      e.symbols.add(r.symbol);
      e.byCcy.set(r.currency, (e.byCcy.get(r.currency) ?? 0) + r.amount);
      e.converted += r.amount * (rates?.[r.currency] ?? 0);
      map.set(r.year, e);
    }
    return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
  }, [rows, rates]);

  const active = picked !== "all" && years.some((y) => y.year === picked) ? picked : "all";

  const scoped = useMemo(() => (active === "all" ? rows : rows.filter((r) => r.year === active)), [rows, active]);

  /** Table rows after the quarter card filter; the year chips ignore it. */
  const activeQuarter = quarter !== 0 && scoped.some((r) => r.quarter === quarter) ? quarter : 0;

  const visible = useMemo(
    () => (activeQuarter === 0 ? scoped : scoped.filter((r) => r.quarter === activeQuarter)),
    [scoped, activeQuarter],
  );

  const scopeLabel = active === "all" ? "Lifetime" : activeQuarter > 0 ? `${active} · Q${activeQuarter}` : active;

  const totals = useMemo(() => {
    const byCcy = new Map<string, number>();
    let converted = 0;
    for (const r of visible) {
      byCcy.set(r.currency, (byCcy.get(r.currency) ?? 0) + r.amount);
      converted += r.amount * (rates?.[r.currency] ?? 0);
    }
    return { byCcy, converted };
  }, [visible, rates]);

  const quarters = useMemo(() => {
    const base = [1, 2, 3, 4].map((q) => ({
      q: q as Payout["quarter"],
      count: 0,
      byCcy: new Map<string, number>(),
      converted: 0,
    }));
    if (active === "all") return base;
    for (const r of scoped) {
      const slot = base[r.quarter - 1]!;
      slot.count += 1;
      slot.byCcy.set(r.currency, (slot.byCcy.get(r.currency) ?? 0) + r.amount);
      slot.converted += r.amount * (rates?.[r.currency] ?? 0);
    }
    return base;
  }, [scoped, active, rates]);

  const list = useMemo(() => {
    const getter = (p: Payout): string | number => {
      switch (sort.key) {
        case "symbol":
          return p.symbol;
        case "quarter":
          return p.quarter;
        case "shares":
          return p.shares;
        case "perShare":
          return p.perShare * (ready ? (rates?.[p.perShareCurrency] ?? 0) : 1);
        case "amount":
          return p.amount * (ready ? (rates?.[p.currency] ?? 0) : 1);
        default:
          return p.date;
      }
    };
    return sortBy([...visible], getter, sort.dir);
  }, [visible, sort, ready, rates]);

  return (
    <Panel as="section" padding="none" className="overflow-clip">
      <div className="flex flex-wrap items-end justify-between gap-2 p-4 pb-0 sm:px-5 sm:pt-5">
        <div>
          <h2 className="font-display text-base font-semibold">Dividends</h2>
          <p className="text-xs text-muted-foreground">
            Cash received from your foreign holdings: yearly, quarterly, every payout
          </p>
        </div>
        {rows.length > 0 ? (
          <span className="num inline-flex items-center gap-1.5 rounded-full bg-gain/15 px-2.5 py-1 text-xs font-semibold text-gain">
            <Gift className="size-3.5" aria-hidden />
            {figure(totals.byCcy, totals.converted)}
            {active === "all" ? " lifetime" : activeQuarter > 0 ? ` in ${active} · Q${activeQuarter}` : ` in ${active}`}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="p-4 sm:p-5">
          <div className="rounded-xl border border-dashed border-border/70 bg-surface px-3 py-4 text-xs text-muted-foreground">
            Dividend rows from your broker file land here as yearly and quarterly totals. Import a statement that
            includes them and this fills in.
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 p-4 sm:px-5 sm:pb-3">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {(() => {
                const lifetimeCcy = new Map<string, number>();
                let lifetimeConverted = 0;
                for (const r of rows) {
                  lifetimeCcy.set(r.currency, (lifetimeCcy.get(r.currency) ?? 0) + r.amount);
                  lifetimeConverted += r.amount * (rates?.[r.currency] ?? 0);
                }
                const chips: Array<{ key: string; label: string; value: string; hint: string }> = [
                  {
                    key: "all",
                    label: "All",
                    value: figure(lifetimeCcy, lifetimeConverted),
                    hint: `${rows.length} payout${rows.length === 1 ? "" : "s"}`,
                  },
                  ...years.map((y) => ({
                    key: y.year,
                    label: y.year,
                    value: figure(y.byCcy, y.converted),
                    hint: `${y.count} payout${y.count === 1 ? "" : "s"}`,
                  })),
                ];
                return chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active === c.key}
                    onClick={() => {
                      setPicked(c.key);
                      setQuarter(0);
                    }}
                    className={cn(
                      "shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                      active === c.key
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/60 bg-surface hover:border-primary/30",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="num text-xs font-semibold">{c.label}</span>
                      <span className="text-[0.6rem] text-muted-foreground">{c.hint}</span>
                    </span>
                    <span className="num mt-0.5 block text-xs font-semibold text-gain">{c.value}</span>
                  </button>
                ));
              })()}
            </div>

            {active !== "all" ? (
              <div className="grid grid-cols-4 divide-x divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-surface">
                {quarters.map((q) => {
                  const on = activeQuarter === q.q;
                  const empty = q.count === 0;
                  return (
                    <button
                      key={q.q}
                      type="button"
                      disabled={empty}
                      aria-pressed={on}
                      aria-label={`Filter payouts to Q${q.q}${empty ? " (no payouts)" : ""}`}
                      onClick={() => setQuarter((prev) => (prev === q.q ? 0 : q.q))}
                      className={cn(
                        "px-2 py-2 text-center transition-colors",
                        empty ? "cursor-default opacity-45" : "hover:bg-muted/60",
                        on && "bg-primary/10",
                      )}
                    >
                      <p className={cn("text-[0.65rem] font-semibold", on ? "text-primary" : "text-muted-foreground")}>
                        Q{q.q}
                      </p>
                      <p className="num mt-0.5 text-xs font-semibold">{empty ? "—" : figure(q.byCcy, q.converted)}</p>
                      <p className="text-[0.6rem] text-muted-foreground">
                        {empty ? "none" : `${q.count} payout${q.count === 1 ? "" : "s"}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableTh
                    label="Date"
                    active={sort.key === "date"}
                    dir={sort.dir}
                    onClick={() => toggle("date")}
                    align="left"
                    kind="text"
                    className="pl-3 sm:pl-5"
                  />
                  <SortableTh
                    label="Stock"
                    active={sort.key === "symbol"}
                    dir={sort.dir}
                    onClick={() => toggle("symbol")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Quarter"
                    active={sort.key === "quarter"}
                    dir={sort.dir}
                    onClick={() => toggle("quarter")}
                    align="left"
                    kind="number"
                    className="hidden sm:table-cell"
                  />
                  <SortableTh
                    label="Shares"
                    active={sort.key === "shares"}
                    dir={sort.dir}
                    onClick={() => toggle("shares")}
                    align="right"
                    kind="number"
                    className="hidden md:table-cell"
                  />
                  <SortableTh
                    label="Per share"
                    active={sort.key === "perShare"}
                    dir={sort.dir}
                    onClick={() => toggle("perShare")}
                    align="right"
                    kind="number"
                    className="hidden md:table-cell"
                  />
                  <SortableTh
                    label="Amount"
                    active={sort.key === "amount"}
                    dir={sort.dir}
                    onClick={() => toggle("amount")}
                    align="right"
                    kind="number"
                    className="pr-3 sm:pr-5"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow
                    key={p.id}
                    tabIndex={onPickSymbol ? 0 : undefined}
                    aria-label={onPickSymbol ? `Open ${p.symbol} position` : undefined}
                    onClick={onPickSymbol && p.symbol !== "—" ? () => onPickSymbol(p.symbol) : undefined}
                    onKeyDown={
                      onPickSymbol && p.symbol !== "—"
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onPickSymbol(p.symbol);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "group",
                      onPickSymbol &&
                        p.symbol !== "—" &&
                        "cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 focus-visible:outline-none",
                    )}
                  >
                    <TableCell className="whitespace-nowrap pl-3 text-xs text-muted-foreground sm:pl-5">
                      {formatDate(p.date)}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-semibold transition-colors group-hover:text-primary">{p.symbol}</p>
                      <p className="max-w-40 truncate text-[0.65rem] text-muted-foreground">
                        {p.name || `Q${p.quarter} payout`}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="num inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                        Q{p.quarter}
                      </span>
                    </TableCell>
                    <TableCell className="num hidden text-right text-xs text-muted-foreground md:table-cell">
                      {p.shares > 0 ? formatQty(p.shares) : "—"}
                    </TableCell>
                    <TableCell className="num hidden text-right text-xs text-muted-foreground md:table-cell">
                      {p.perShare > 0 ? (
                        !ready || p.perShareCurrency === display ? (
                          <span className="inline-block px-1">{native(p.perShare, p.perShareCurrency)}</span>
                        ) : (
                          <button
                            type="button"
                            aria-pressed={perShareNative.has(p.id)}
                            title={
                              perShareNative.has(p.id)
                                ? `Show in ${display}`
                                : `Show in ${p.perShareCurrency || "the file's currency"}`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setPerShareNative((prev) => toggleIn(prev, p.id));
                            }}
                            className={cn(
                              "rounded-md px-1 py-0.5 transition-colors hover:bg-muted/70 underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground",
                              perShareNative.has(p.id) && "text-foreground",
                            )}
                          >
                            {perShareNative.has(p.id)
                              ? native(p.perShare, p.perShareCurrency)
                              : amountLabel(p.perShare, p.perShareCurrency)}
                          </button>
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="num pr-3 text-right text-xs font-semibold sm:pr-5">
                      {!ready || p.currency === display ? (
                        <span className="inline-block px-1 text-gain">{native(p.amount, p.currency)}</span>
                      ) : (
                        <button
                          type="button"
                          aria-pressed={revealed.has(p.id)}
                          title={
                            revealed.has(p.id) ? `Show in ${display}` : `Show in ${p.currency || "the file's currency"}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setRevealed((prev) => toggleIn(prev, p.id));
                          }}
                          className={cn(
                            "rounded-md px-1 py-0.5 transition-colors hover:bg-muted/70 underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground",
                            revealed.has(p.id) ? "text-foreground" : "text-gain",
                          )}
                        >
                          {revealed.has(p.id) ? native(p.amount, p.currency) : amountLabel(p.amount, p.currency)}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-3 text-xs text-muted-foreground sm:pl-5">
                    {list.length} payout{list.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="text-xs font-semibold">{scopeLabel}</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="hidden md:table-cell" />
                  <TableCell className="num pr-3 text-right text-xs font-semibold text-gain sm:pr-5">
                    {figure(totals.byCcy, totals.converted)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <p className="px-4 py-3 text-[0.68rem] text-muted-foreground sm:px-5">
            Amounts are what the broker file states you received, in {display} at current FX
            {currencies.length > 1 ? ` (${currencies.join(", ")} rows)` : ""}. Tap an amount or a per-share figure to
            see the file's own currency.
            {activeQuarter > 0 ? ` Showing Q${activeQuarter} of ${active} only. Tap the card again to clear.` : ""}
          </p>
        </>
      )}
    </Panel>
  );
}
