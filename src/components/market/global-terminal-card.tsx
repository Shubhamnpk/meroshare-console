"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import {
  BarAggSelect,
  ChartExpandButton,
  ChartIndicatorsPopover,
  ChartStyleSwitch,
} from "@/components/market/chart-controls";
import {
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { DeltaPill } from "@/components/stat-card";
import { RangeBar } from "@/components/market/range-bar";
import { Button } from "@/components/ui/button";
import { native, bigMoney, useGlobalLotRows, GlobalLotsDialog } from "@/components/world/global-position-sheet";
import { worldHistoryQuery, worldIntradayQuery, worldQuoteQuery, worldCompanyQuery } from "@/lib/queries";
import { sameNativeCurrency } from "@/lib/world/lots";
import { formatHoldingTime } from "@/lib/format";
import { deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import { aggregateBars, type BarAgg } from "@/lib/charts/aggregate";
import { useWatchlist } from "@/lib/watchlist";
import { useSettings } from "@/lib/settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { WorldRange } from "@/lib/world/feed.server";
import type { ChartBar, PricePoint } from "@/lib/nepse/types";

/** Stable empties: fresh [] literals here rebuild the whole chart every render. */
const NO_BARS: ChartBar[] = [];
const NO_POINTS: PricePoint[] = [];

const clampInto = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const RANGES = ["1D", "1M", "3M", "6M", "1Y", "5Y", "MAX"] as const;
type RangeKey = (typeof RANGES)[number];

const WORLD_RANGE: Record<RangeKey, WorldRange> = {
  "1D": "1D",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  "5Y": "5Y",
  MAX: "MAX",
};

/**
 * Full terminal card for non-NEPSE symbols (US stocks, crypto, gold…):
 * quote header with watchlist star, ranges, per-point aggregation, style
 * switch, indicators + log scale, expandable chart with hover readout, and
 * the own-position strip. Same TerminalChart engine as NEPSE, fed by world
 * quotes/history. No broker, WACC or NEPSE-only sections. Intraday
 * granularity is the feed's 15m session ticks — no finer/coarser intraday
 * selector until the feed serves more.
 */
export function GlobalTerminalCard({
  symbol,
  light,
  onOpenWatchlist,
}: {
  symbol: string;
  light: boolean;
  onOpenWatchlist: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("1D");
  const [intraRes, setIntraRes] = useState<"5m" | "15m">("5m");
  // Shared chart look — same store as the NEPSE terminal.
  const { chart, setChart } = useSettings();
  const style = chart.style;
  const setStyle = (s: ChartStyle) => setChart({ style: s });
  const indicators = chart.indicators;
  const setIndicators = (v: IndicatorConfig) => setChart({ indicators: v });
  const logScale = chart.logScale;
  const setLogScale = (v: boolean) => setChart({ logScale: v });
  const barAgg = chart.barAgg;
  const setBarAgg = (v: BarAgg) => setChart({ barAgg: v });
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => {
    setPinned(null);
    setHover(null);
  }, [symbol, range, intraRes]);
  const watchlist = useWatchlist();
  const watched = watchlist.has(symbol);
  const txns = useGlobalTxns();
  const holding = useMemo(
    () => deriveHoldings(txns).find((h) => h.symbol === symbol.trim().toUpperCase()) ?? null,
    [txns, symbol],
  );

  const quote = useQuery({ ...worldQuoteQuery(symbol, holding?.currency) });
  const companyQ = useQuery({ ...worldCompanyQuery(symbol), enabled: Boolean(symbol) });
  const history = useQuery({ ...worldHistoryQuery(symbol, WORLD_RANGE[range], holding?.currency) });
  const intraday = useQuery({
    ...worldIntradayQuery(range === "1D" ? symbol : null, holding?.currency, intraRes),
  });

  const dailyBars: ChartBar[] = useMemo(
    () =>
      (history.data?.bars ?? []).map((b) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        synthetic: false,
      })),
    [history.data],
  );
  const drawnBars = useMemo(
    () => (range === "1D" ? dailyBars : aggregateBars(dailyBars, barAgg)),
    [dailyBars, barAgg, range],
  );
  const sessionPoints: PricePoint[] = useMemo(
    () =>
      (intraday.data?.ticks ?? []).map((t) => ({
        time: t.t,
        value: t.close,
        volume: t.volume ?? 0,
        open: t.open,
        high: t.high,
        low: t.low,
      })),
    [intraday.data],
  );
  // Click a candle to anchor it (click again to release), like the terminal.
  // Hover/pinned readout carries the point's change vs previous close.
  const readoutBar = useMemo(() => {
    if (range === "1D") return null;
    const date = pinned ?? hover?.date;
    if (!date) return null;
    const idx = drawnBars.findIndex((b) => b.date === date);
    if (idx < 0) return null;
    const bar = drawnBars[idx]!;
    const prev = idx > 0 ? drawnBars[idx - 1]!.close : bar.open;
    return { bar, pct: prev > 0 ? ((bar.close - prev) / prev) * 100 : 0, isPinned: pinned != null };
  }, [pinned, hover, drawnBars, range]);
  // 1D hover spot: moves the day + 52-week markers to the hovered tick.
  const daySpot = useMemo(() => {
    if (range !== "1D" || !hover || !(hover.close > 0)) return null;
    const prev = quote.data?.previousClose ?? 0;
    return { value: hover.close, pct: prev > 0 ? ((hover.close - prev) / prev) * 100 : 0 };
  }, [range, hover, quote.data]);
  // Marker target priority: intraday hover, inspected candle, live price.
  const markerAt = (fallback: number) => {
    const at = daySpot ? daySpot.value : readoutBar ? readoutBar.bar.close : fallback;
    return at;
  };

  const ltp = quote.data?.ltp ?? 0;
  const currency = quote.data?.currency ?? "";
  const dayPct = quote.data?.percentChange ?? 0;
  // Market open/closed from the quote's regular-session window.
  const sessionStart = quote.data?.sessionStart ?? 0;
  const sessionEnd = quote.data?.sessionEnd ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionOpen = sessionStart > 0 && sessionEnd > 0 ? nowSec >= sessionStart && nowSec <= sessionEnd : null;
  // Countdown to the next open — durations need no timezone math. Past
  // today's window it rolls to the next daily session, skipping Sat/Sun
  // (UTC approx — every covered market rests weekends; holidays still show
  // the session-day estimate).
  const opensIn =
    sessionOpen || sessionStart <= 0 || sessionEnd <= 0
      ? null
      : (() => {
          let target = sessionStart;
          if (target <= nowSec) {
            target += 86400;
            let guard = 0;
            while ([0, 6].includes(new Date(target * 1000).getUTCDay()) && guard++ < 4) {
              target += 86400;
            }
          }
          const mins = Math.max(1, Math.round((target - nowSec) / 60));
          if (mins >= 2880) return `${Math.round(mins / 1440)} days`;
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        })();
  // Header follows the range like the NEPSE terminal: first print → live,
  // and hovering any point takes the header over (price + its range change).
  const firstRef = range === "1D" ? (sessionPoints[0]?.value ?? 0) : (drawnBars[0]?.close ?? 0);
  const edgeRef =
    ltp > 0
      ? ltp
      : range === "1D"
        ? (sessionPoints[sessionPoints.length - 1]?.value ?? 0)
        : (drawnBars[drawnBars.length - 1]?.close ?? 0);
  const rangeReturn = firstRef > 0 && edgeRef > 0 ? ((edgeRef - firstRef) / firstRef) * 100 : dayPct;
  const shownPrice = hover && hover.close > 0 ? hover.close : ltp;
  const shownPct = hover && hover.close > 0 && firstRef > 0 ? ((hover.close - firstRef) / firstRef) * 100 : rangeReturn;

  const holdingCcy = holding?.currency ?? "";
  const priceLive = sameNativeCurrency(holdingCcy || currency, currency) && ltp > 0;
  const heldValue = holding && priceLive ? holding.qty * ltp : 0;
  const heldCost = holding ? holding.qty * holding.avgPrice : 0;
  const heldGain = holding && priceLive ? heldValue - heldCost : 0;
  const heldPct = heldCost > 0 && priceLive ? (heldGain / heldCost) * 100 : 0;
  // Same lots model as the position sheet: unit-weighted average age plus
  // the shared lots dialog (per-lot age + gain).
  const [lotsOpen, setLotsOpen] = useState(false);
  const { cardAgeDays, displayRows } = useGlobalLotRows(symbol, currency, ltp);

  const isMobile = useIsMobile();
  const chartHeight = expanded ? 640 : isMobile ? 320 : 400;
  const loading = range === "1D" ? intraday.isPending : history.isPending;
  const loadError = range === "1D" ? intraday.isError : history.isError;
  const empty = range === "1D" ? sessionPoints.length === 0 : drawnBars.length === 0;
  const retry = () => {
    if (range === "1D") void intraday.refetch();
    else void history.refetch();
  };

  const company = companyQ.data?.company ?? null;
  const companyCcy = company?.currency ?? "";

  return (
    <>
      <div className="rounded-2xl border border-border/60 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <div>
            <p className="font-display text-lg font-semibold">
              <span className="inline-flex items-center gap-2">
                {symbol}
                <button
                  type="button"
                  onClick={() => {
                    watchlist.toggle(symbol);
                    toast.success(watched ? "Removed from watchlist" : "Added to watchlist");
                  }}
                  aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
                  title={watched ? "Remove from watchlist" : "Add to watchlist"}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    watched
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {watched ? <Star className="size-3.5 fill-warning text-warning" /> : <Star className="size-3.5" />}
                </button>
              </span>
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {[quote.data?.name, quote.data?.exchange, currency].filter(Boolean).join(" · ") || "Global symbol"}
              </span>
              {sessionOpen != null ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <span aria-hidden className={`size-1.5 rounded-full ${sessionOpen ? "bg-gain" : "bg-loss"}`} />
                  <span className={sessionOpen ? "text-gain" : "text-loss"}>
                    {sessionOpen ? "open" : opensIn ? `closed · opens in ${opensIn}` : "closed"}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-lg font-semibold">{shownPrice > 0 ? native(shownPrice, currency) : "—"}</p>
            <DeltaPill value={shownPct}>
              {shownPct >= 0 ? "+" : ""}
              {shownPct.toFixed(2)}% <span className="opacity-70">{hover && hover.close > 0 ? "at point" : range}</span>
            </DeltaPill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  range === r ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {range !== "1D" ? (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" />
              <BarAggSelect value={barAgg} onChange={setBarAgg} />
            </>
          ) : (
            <span className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
              Today ·
              <span
                role="group"
                aria-label="Intraday resolution"
                className="flex overflow-hidden rounded-full border border-border/60"
              >
                {(["5m", "15m"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={intraRes === r}
                    onClick={() => setIntraRes(r)}
                    className={`px-2 py-0.5 font-medium transition-colors ${
                      intraRes === r ? "bg-primary/15 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </span>
              {intraday.data && intraRes === "5m" && intraday.data.interval === "15m" ? (
                <span title="5-minute bars only cover US listings">(15m served)</span>
              ) : null}
            </span>
          )}

          <ChartStyleSwitch
            value={style}
            onChange={setStyle}
            disabledKeys={
              range === "1D" && !sessionPoints.some((p) => p.open != null && p.high != null && p.low != null)
                ? ["candles"]
                : undefined
            }
          />

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={onOpenWatchlist}
              aria-label="Open watchlist"
            >
              <Star className="size-3.5" />
              <span className="hidden sm:inline">Watchlist</span>
            </Button>
            <ChartIndicatorsPopover
              value={indicators}
              onToggle={(key, v) => setIndicators({ ...indicators, [key]: v })}
              logScale={logScale}
              onLogScale={setLogScale}
            />
            <ChartExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          </div>
        </div>

        <div className="relative px-1 py-2">
          {loading ? (
            <div
              className="flex items-center justify-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              Loading chart…
            </div>
          ) : loadError || empty ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              <p>{loadError ? "Couldn't load chart data." : "No chart data for this range."}</p>
              <button type="button" onClick={retry} className="font-medium text-primary hover:underline">
                Try again
              </button>
            </div>
          ) : range === "1D" ? (
            <TerminalChart
              key={`${symbol}-1D-${light}`}
              bars={NO_BARS}
              intraday={sessionPoints}
              style={style}
              indicators={indicators}
              logScale={logScale}
              light={light}
              height={chartHeight}
              onHover={setHover}
            />
          ) : (
            <TerminalChart
              key={`${symbol}-${range}-${light}`}
              bars={drawnBars}
              intraday={NO_POINTS}
              style={style}
              indicators={indicators}
              logScale={logScale}
              light={light}
              height={chartHeight}
              onHover={setHover}
              onSelectBar={(d) => setPinned((cur) => (cur === d ? null : d))}
            />
          )}
        </div>

        {quote.data && ltp > 0 ? (
          <div className="border-t border-border/60 px-3 py-2.5">
            {readoutBar ? (
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{readoutBar.bar.date.slice(0, 10)}</span>
                <DeltaPill value={readoutBar.pct}>
                  {readoutBar.pct >= 0 ? "+" : ""}
                  {readoutBar.pct.toFixed(2)}%
                </DeltaPill>
                {readoutBar.isPinned ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                    Pinned · click again to release
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                  {readoutBar ? "Open" : "Prev close"}
                </p>
                <p className="num text-sm font-medium">
                  {readoutBar
                    ? native(readoutBar.bar.open, currency)
                    : quote.data.previousClose > 0
                      ? native(quote.data.previousClose, currency)
                      : "—"}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Volume</p>
                <p className="num text-sm font-medium">
                  {readoutBar
                    ? readoutBar.bar.volume > 0
                      ? readoutBar.bar.volume.toLocaleString("en-US")
                      : "—"
                    : (quote.data.volume ?? 0) > 0
                      ? quote.data.volume!.toLocaleString("en-US")
                      : "—"}
                </p>
              </div>
              {readoutBar ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Candle range
                  </p>
                  <RangeBar
                    low={readoutBar.bar.low}
                    high={readoutBar.bar.high}
                    value={readoutBar.bar.close}
                    format={(v) => native(v, currency)}
                    tone={readoutBar.pct < 0 ? "loss" : "gain"}
                    colorByPosition
                    valueToneByPosition
                  />
                </div>
              ) : (quote.data.dayHigh ?? 0) > 0 && (quote.data.dayHigh ?? 0) > (quote.data.dayLow ?? 0) ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Day range
                  </p>
                  <RangeBar
                    low={quote.data.dayLow!}
                    high={quote.data.dayHigh!}
                    value={clampInto(daySpot ? daySpot.value : ltp, quote.data.dayLow!, quote.data.dayHigh!)}
                    format={(v) => native(v, currency)}
                    tone={(daySpot ? daySpot.pct : dayPct) < 0 ? "loss" : "gain"}
                    colorByPosition
                    valueToneByPosition
                  />
                </div>
              ) : null}
              {(quote.data.fiftyTwoWeekHigh ?? 0) > 0 &&
              (quote.data.fiftyTwoWeekHigh ?? 0) > (quote.data.fiftyTwoWeekLow ?? 0) ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    52-week range
                  </p>
                  <RangeBar
                    low={quote.data.fiftyTwoWeekLow!}
                    high={quote.data.fiftyTwoWeekHigh!}
                    value={clampInto(markerAt(ltp), quote.data.fiftyTwoWeekLow!, quote.data.fiftyTwoWeekHigh!)}
                    format={(v) => native(v, currency)}
                    tone={(daySpot ? daySpot.pct : readoutBar ? readoutBar.pct : dayPct) < 0 ? "loss" : "gain"}
                    colorByPosition
                    valueToneByPosition
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {holding ? (
        <div className="space-y-1">
          <p className="px-1 text-xs font-bold tracking-tight">Your investment</p>
          <div className="w-full rounded-xl border border-border/40 bg-card px-3 py-2.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  Value
                </span>
                <span className="num text-xs font-bold text-foreground">
                  {priceLive ? native(heldValue, currency) : "—"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLotsOpen(true)}
                title="Open lots"
                className="flex w-full items-center justify-between gap-2 text-left transition-colors hover:bg-muted/20"
              >
                <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  Return
                </span>
                <span
                  className={cn(
                    "num text-xs font-bold underline decoration-primary/30 decoration-dotted underline-offset-2",
                    heldGain >= 0 ? "text-gain" : "text-loss",
                  )}
                >
                  {priceLive ? `${heldGain >= 0 ? "+" : "−"}${native(Math.abs(heldGain), currency)} ` : "—"}
                  {priceLive ? <span>({heldPct.toFixed(2)}%)</span> : null}
                </span>
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  Shares
                </span>
                <span className="num text-xs font-medium text-foreground">
                  {String(Math.round(holding.qty * 1e8) / 1e8)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  Average price
                </span>
                <span className="num text-xs font-medium text-foreground">{native(holding.avgPrice, holdingCcy)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.64rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  Holding
                </span>
                <button
                  type="button"
                  onClick={() => setLotsOpen(true)}
                  className="num cursor-pointer text-xs font-medium text-foreground hover:underline decoration-primary/30 underline-offset-2 decoration-dotted"
                >
                  {displayRows.length > 0 ? `${formatHoldingTime(cardAgeDays)} avg` : "—"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {company ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-surface p-4">
            <h3 className="font-display text-sm font-semibold">About {company.name || symbol}</h3>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Country", company.country ?? "—"],
                ["Exchange", company.exchange ?? "—"],
                ["Listed", company.ipo ?? "—"],
                ["Industry", company.industry ?? quote.data?.sector ?? quote.data?.industry ?? "—"],
                ["Shares out", company.sharesOut ? Number(company.sharesOut).toLocaleString("en-US") : "—"],
                ["Website", company.website ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="num truncate text-[0.8rem] font-medium">
                    {label === "Website" && company.website ? (
                      <a
                        href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {company.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(`${company.name || symbol} stock research`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
            >
              Research {symbol} online →
            </a>
          </div>
          <div className="rounded-2xl border border-border/60 bg-surface p-4">
            <h3 className="font-display text-sm font-semibold">Key statistics</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                ["Market cap", bigMoney(company.marketCap, companyCcy)],
                ["P/E (TTM)", company.peTtm != null ? company.peTtm.toFixed(2) : "—"],
                ["EPS (TTM)", company.epsTtm != null ? native(company.epsTtm, companyCcy) : "—"],
                ["Beta", company.beta != null ? company.beta.toFixed(2) : "—"],
                ["Div yield", company.divYieldPct != null ? `${company.divYieldPct.toFixed(2)}%` : "—"],
                ["ROE (TTM)", company.roeTtmPct != null ? `${company.roeTtmPct.toFixed(2)}%` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="truncate text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="num truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[0.65rem] text-muted-foreground">Fundamentals cover US listings.</p>
          </div>
        </div>
      ) : null}
      <GlobalLotsDialog open={lotsOpen} onOpenChange={setLotsOpen} symbol={symbol} currency={currency} ltp={ltp} />
    </>
  );
}
