import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DeltaPill } from "@/components/stat-card";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { normalise, type LinePoint } from "@/lib/nepse/indicators";
import { PointBreakdown } from "@/components/portfolio/history-panel";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { OrderTicket } from "@/components/brokers/order-ticket";
import {
  brokerConnectionsQuery,
  brokerOrderBookQuery,
  chartSeriesQuery,
  enrichedPortfolioQuery,
  investmentSummaryQuery,
  marketSnapshotQuery,
  portfolioHistoryQuery,
} from "@/lib/queries";
import { cancelBrokerOrder } from "@/lib/brokers/brokers.functions";
import type { BrokerId } from "@/lib/brokers/types";
import type { ChartBar, ChartRange, PricePoint } from "@/lib/nepse/types";
import { errorMessage, formatNpr, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings, useWatchlist, type TerminalState } from "@/lib/prefs";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/terminal")({
  validateSearch: (search: Record<string, unknown>): { symbol?: string | undefined } => {
    const raw = typeof search["symbol"] === "string" ? search["symbol"].toUpperCase() : "";
    const symbol = raw.replace(/[^A-Z0-9]/g, "").slice(0, 24);
    return symbol ? { symbol } : {};
  },
  head: () => ({
    meta: [
      { title: "Trading Terminal | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Full NEPSE trading terminal: candlesticks back to 2012, moving averages, Bollinger Bands, RSI, MACD, VWAP, volume and a net-worth chart of your own portfolio.",
      },
      { property: "og:title", content: "Trading Terminal | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Candlestick charts, technical indicators and portfolio net-worth tracking for every NEPSE-listed scrip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ogImage(),
    ],
    links: [canonicalLink("/terminal")],
  }),
  component: TerminalPage,
});

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];
const STYLES: { key: ChartStyle; label: string }[] = [
  { key: "candles", label: "Candles" },
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
];
const INDICATOR_LABELS: { key: keyof IndicatorConfig; label: string; hint: string }[] = [
  { key: "sma20", label: "SMA 20", hint: "20-day simple moving average" },
  { key: "sma50", label: "SMA 50", hint: "50-day simple moving average" },
  { key: "ema20", label: "EMA 20", hint: "20-day exponential moving average" },
  { key: "bollinger", label: "Bollinger", hint: "20-day bands, 2σ" },
  { key: "vwap", label: "VWAP", hint: "Volume-weighted average price" },
  { key: "volume", label: "Volume", hint: "Traded quantity pane" },
  { key: "rsi", label: "RSI 14", hint: "Relative strength index pane" },
  { key: "macd", label: "MACD", hint: "12/26/9 momentum pane" },
];

const STORE_KEY = "meroshare.terminal.v1";
const DEFAULT_SYMBOL = "NABIL";

/** Shared stable empty arrays (see note at activeBars/intraday). */
const NO_BARS: ChartBar[] = [];
const NO_POINTS: PricePoint[] = [];

interface Stored {
  symbol: string;
  range: ChartRange;
  style: ChartStyle;
  indicators: IndicatorConfig;
  logScale: boolean;
}

function loadStored(prefs: { terminal: TerminalState }): Stored {
  // Prefs store the loose shape; the page works with the strict one.
  return prefs.terminal as unknown as Stored;
}

function num(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function TerminalPage() {
  const { theme, terminal, setTerminal } = useSettings();
  const [light, setLight] = useState(false);
  useEffect(() => {
    const resolve = () =>
      setLight(
        theme === "light" ||
          (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches),
      );
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<Stored>(() => loadStored({ terminal }));
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const watchlist = useWatchlist();
  // Deep link (e.g. from Market): ?symbol=XYZ overrides the remembered symbol.
  const linkedSymbol = Route.useSearch({ select: (s) => s.symbol });
  useEffect(() => {
    setState({ ...loadStored({ terminal }), ...(linkedSymbol ? { symbol: linkedSymbol } : {}) });
    setHydrated(true);
  }, [linkedSymbol]);
  // Persist local chart state back to prefs. setTerminal identity changes on
  // every prefs render, so without the snapshot guard this effect re-fires
  // forever (Maximum update depth exceeded).
  const savedRef = useRef("");
  useEffect(() => {
    if (!hydrated) return;
    const snap = JSON.stringify({ ...state, indicators: { ...state.indicators } });
    if (savedRef.current === snap) return;
    savedRef.current = snap;
    setTerminal({ ...state, indicators: { ...state.indicators } });
  }, [state, hydrated, setTerminal]);

  const [mode, setMode] = useState<"scrip" | "portfolio">("scrip");
  const [basis, setBasis] = useState<"value" | "profit">("value");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ticketPrice, setTicketPrice] = useState<{ price: number; side?: "BUY" | "SELL"; nonce: number } | null>(null);
  const brokerConns = useQuery(brokerConnectionsQuery());
  const brokerLinked = (brokerConns.data?.length ?? 0) > 0;
  const termBrokerId = (brokerConns.data?.[0]?.brokerId ?? null) as BrokerId | null;
  const [armedOrder, setArmedOrder] = useState<string | null>(null);
  const queryClient = useQueryClient();
  /** Pinned candle in scrip mode (click); hover readout falls back to it. */
  const [pinned, setPinned] = useState<ChartBar | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState("");
  /** Pinned net-worth date (portfolio mode): shows that day's per-scrip prices below. */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    setSelectedDate(null);
    setPinned(null);
  }, [mode, state.range, state.symbol]);

  const watchSymbols = watchlist.symbols;
  const snapshot = useQuery(marketSnapshotQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());
  const investment = useQuery({ ...investmentSummaryQuery(), enabled: mode === "portfolio" });
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = useQuery({
    ...brokerOrderBookQuery(termBrokerId, { fromDate: todayStr, toDate: todayStr }),
    enabled: brokerLinked && mode === "scrip",
  });

  const cancelTodayOrder = useMutation({
    mutationFn: (o: {
      orderId: string;
      tranId: string;
      orderStatus: string;
      buySellType: string;
      deliveryFlag: string;
      orderTerms: string;
      price: string;
      quantity: number;
      symbol: string;
    }) => cancelBrokerOrder({ data: { brokerId: termBrokerId!, ...o, confirmed: true as const } }),
    onSuccess: (r) => {
      setArmedOrder(null);
      if (r.ok) {
        toast.success(r.message);
        void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      } else {
        toast.error(r.message);
      }
    },
    onError: (err) => {
      setArmedOrder(null);
      toast.error(errorMessage(err, "Cancel failed."));
    },
  });

  const prices = useMemo(() => snapshot.data?.prices ?? [], [snapshot.data?.prices]);
  const quote = prices.find((p) => p.symbol === state.symbol);
  const holdings = useMemo(() => portfolio.data?.holdings ?? [], [portfolio.data?.holdings]);
  const position = holdings.find((h) => h.scrip === state.symbol);

  const series = useQuery({
    ...chartSeriesQuery(state.symbol, state.range),
    enabled: mode === "scrip" && Boolean(state.symbol),
  });
  const compare = useQuery({
    ...chartSeriesQuery(compareSymbol, state.range),
    enabled: mode === "scrip" && compareSymbol.length > 0,
  });

  const historyMonths =
    state.range === "MAX"
      ? 120
      : state.range === "5Y"
        ? 60
        : state.range === "3Y"
          ? 36
          : state.range === "1Y"
            ? 13
            : state.range === "6M"
              ? 7
              : state.range === "3M"
                ? 4
                : state.range === "1M"
                  ? 2
                  : 1;
  const netWorth = useQuery(
    portfolioHistoryQuery(
      holdings.map((h) => ({ scrip: h.scrip, units: h.units })),
      historyMonths,
      historyMonths > 24 ? "month" : "day",
      mode === "portfolio",
    ),
  );

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return prices
      .filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [prices, query]);

  const quickSymbols = useMemo(() => {
    const owned = holdings.map((h) => h.scrip);
    return [...new Set([...owned, ...watchSymbols])].slice(0, 12);
  }, [holdings, watchSymbols]);

  // Cost basis for profit mode, mirroring the portfolio investment summary:
  // CDSC-calculated WACC where present, pending rows estimated from qty x
  // rate exactly like the portfolio does. Only scrips with no cost data at
  // all are excluded (never faked with a zero cost).
  const costByScrip = useMemo(() => {
    const map = new Map<string, { rate: number; pending: boolean }>();
    for (const s of investment.data?.scrips ?? []) {
      const symbol = s.scrip.toUpperCase();
      if (s.status === "calculated" && s.waccRate > 0) {
        map.set(symbol, { rate: s.waccRate, pending: false });
      } else if (s.status === "pending" && s.units > 0 && s.cost > 0) {
        map.set(symbol, { rate: s.cost / s.units, pending: true });
      }
    }
    return map;
  }, [investment.data?.scrips]);

  const netWorthBars: ChartBar[] = useMemo(() => {
    const points = netWorth.data?.points ?? [];
    // Slice to the selected range; the fetch above already windows long
    // ranges, this trims short ones (1D shows the last week, no intraday here).
    const windowDays =
      state.range === "1D" || state.range === "1W"
        ? 7
        : state.range === "1M"
          ? 31
          : state.range === "3M"
            ? 93
            : state.range === "6M"
              ? 186
              : state.range === "1Y"
                ? 366
                : null;
    const cutoff = windowDays === null ? 0 : Date.now() / 1000 - windowDays * 86_400;
    let prev = 0;
    const bars: ChartBar[] = [];
    for (const p of points) {
      if (p.time < cutoff) {
        prev = p.value;
        continue;
      }
      const open = prev || p.value;
      prev = p.value;
      bars.push({
        date: new Date(p.time * 1000).toISOString().slice(0, 10),
        open,
        high: Math.max(open, p.value),
        low: Math.min(open, p.value),
        close: p.value,
        volume: 0,
        synthetic: true,
      });
    }
    return bars;
  }, [netWorth.data?.points, state.range]);

  // Profit-only series: value(T) minus est. cost(T), where cost(T) is units
  // held at T times today's WACC rate. Approximation (later buys shift the
  // true average), so the UI labels it est. profit.
  const profitInfo = useMemo(() => {
    const points = netWorth.data?.points ?? [];
    const windowDays =
      state.range === "1D" || state.range === "1W"
        ? 7
        : state.range === "1M"
          ? 31
          : state.range === "3M"
            ? 93
            : state.range === "6M"
              ? 186
              : state.range === "1Y"
                ? 366
                : null;
    const cutoff = windowDays === null ? 0 : Date.now() / 1000 - windowDays * 86_400;
    const excluded = new Set<string>();
    const estimated = new Set<string>();
    let prev = 0;
    let started = false;
    const bars: ChartBar[] = [];
    for (const p of points) {
      let value = 0;
      let cost = 0;
      for (const row of p.breakdown ?? []) {
        if (row.units <= 0) continue;
        const entry = costByScrip.get(row.symbol.toUpperCase());
        if (entry === undefined) {
          excluded.add(row.symbol.toUpperCase());
          continue;
        }
        if (entry.pending) estimated.add(row.symbol.toUpperCase());
        value += row.units * row.close;
        cost += row.units * entry.rate;
      }
      const profit = value - cost;
      if (p.time < cutoff) {
        prev = profit;
        started = true;
        continue;
      }
      const open = started ? prev : profit;
      prev = profit;
      started = true;
      bars.push({
        date: new Date(p.time * 1000).toISOString().slice(0, 10),
        open,
        high: Math.max(open, profit),
        low: Math.min(open, profit),
        close: profit,
        volume: 0,
        synthetic: true,
      });
    }
    return { bars, excluded: [...excluded], estimated: [...estimated] };
  }, [netWorth.data?.points, state.range, costByScrip]);

  const selectedPoint = useMemo(() => {
    if (mode !== "portfolio" || !selectedDate) return null;
    const points = netWorth.data?.points ?? [];
    const exact =
      points.find((p) => new Date(p.time * 1000).toISOString().slice(0, 10) === selectedDate) ??
      null;
    if (exact) return exact;
    // Fall back to the nearest point (within 3 days) so a pinned date
    // can never silently resolve to nothing.
    const target = Date.parse(`${selectedDate}T00:00:00Z`) / 1000;
    if (!Number.isFinite(target)) return null;
    let best: (typeof points)[number] | null = null;
    let bestGap = 3 * 86400;
    for (const p of points) {
      const gap = Math.abs(p.time - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  }, [mode, selectedDate, netWorth.data]);

  const compareLine: LinePoint[] | undefined = useMemo(() => {
    const bars = compare.data?.bars ?? [];
    const compareIntraday = compare.data?.intraday ?? [];
    // Use intraday for 1D range, daily bars for longer ranges
    if (bars.length > 0) {
      const source = bars.map((b) => ({ date: b.date, value: b.close }));
      return source.length >= 2 ? normalise(source) : undefined;
    }
    if (compareIntraday.length > 1) {
      const source = compareIntraday.map((p) => ({ date: p.time, value: p.value }));
      return normalise(source);
    }
    return undefined;
  }, [compare.data?.bars, compare.data?.intraday]);

  // Hover readout prefers the pinned candle; hover is live underneath.
  const spot: (HoverInfo & { pinned?: boolean }) | null = pinned
    ? {
        date: pinned.date,
        open: pinned.open,
        high: pinned.high,
        low: pinned.low,
        close: pinned.close,
        volume: pinned.volume,
        changePercent: pinned.open ? ((pinned.close - pinned.open) / pinned.open) * 100 : 0,
        pinned: true,
      }
    : hover;
  // Stable empty fallbacks: fresh `[]` literals here would also rebuild the
  // chart on every render (they are effect deps of TerminalChart).
  const showProfit = mode === "portfolio" && basis === "profit";
  // No cost data anywhere (blocked feed and nothing pending): profit would
  // be a flat zero line, so fall back to value with an explanation.
  const costMissing = showProfit && !investment.isPending && costByScrip.size === 0;
  const effectiveProfit = showProfit && !costMissing;
  const activeBars = mode === "portfolio" ? (effectiveProfit ? profitInfo.bars : netWorthBars) : (series.data?.bars ?? NO_BARS);
  const intraday = mode === "portfolio" ? NO_POINTS : (series.data?.intraday ?? NO_POINTS);
  const isIntraday = activeBars.length === 0 && intraday.length > 0;
  const loading = mode === "portfolio" ? netWorth.isPending : series.isPending;
  const chartHeight = expanded ? 720 : 480;

  // Memoized: a fresh object identity here would tear down and rebuild
  // the lightweight-charts instance on every render (e.g. each hover),
  // resetting zoom and swallowing clicks.
  const indicators: IndicatorConfig = useMemo(
    () =>
      mode === "portfolio"
        ? { ...state.indicators, volume: false, vwap: false, bollinger: false }
        : state.indicators,
    [mode, state.indicators],
  );

  const first = activeBars[0]?.close ?? 0;
  const last = activeBars[activeBars.length - 1]?.close ?? 0;
  const intradayFirst = intraday[0]?.value ?? 0;
  const intradayLast = intraday[intraday.length - 1]?.value ?? 0;
  // Profit mode: percent is measured on invested cost, not on the first
  // profit point (which can sit near zero and explode the ratio).
  const costNow = investment.data?.totalInvestment ?? 0;
  const rangeReturn = isIntraday
    ? intradayFirst > 0
      ? ((intradayLast - intradayFirst) / intradayFirst) * 100
      : 0
    : effectiveProfit
      ? costNow > 0
        ? (last / costNow) * 100
        : 0
      : first > 0
        ? ((last - first) / first) * 100
        : 0;

  const setIndicator = (key: keyof IndicatorConfig, value: boolean) =>
    setState((prev) => ({ ...prev, indicators: { ...prev.indicators, [key]: value } }));

  const snapshotPng = () => {
    try {
      const canvas = document.querySelector<HTMLCanvasElement>("#terminal-chart canvas");
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `${mode === "portfolio" ? (showProfit ? "portfolio-profit" : "portfolio") : state.symbol}-${state.range}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Chart snapshot saved");
    } catch {
      toast.error("Failed to save chart");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Trading Terminal</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Candles, indicators and your own net worth on one chart. Built on free NEPSE data.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-surface p-1">
          {(["scrip", "portfolio"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {m === "scrip" ? "Scrip" : "My net worth"}
            </button>
          ))}
        </div>
      </div>

      {mode === "scrip" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  setState((prev) => ({ ...prev, symbol: results[0]!.symbol }));
                  setQuery("");
                }
              }}
              placeholder="Search any listed scrip, e.g. NABIL, SHIVM, NRIC…"
              className="h-10 rounded-xl pl-9"
            />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border/60 bg-popover shadow-lg">
                {results.map((p) => (
                  <button
                    key={p.symbol}
                    type="button"
                    onClick={() => {
                      setState((prev) => ({ ...prev, symbol: p.symbol }));
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span>
                      <span className="font-semibold">{p.symbol}</span>{" "}
                      <span className="text-xs text-muted-foreground">{p.name}</span>
                    </span>
                    <DeltaPill value={p.percentChange}>{formatPercent(p.percentChange)}</DeltaPill>
                  </button>
                ))}
              </div>
            )}
          </div>

          {quickSymbols.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickSymbols.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setState((prev) => ({ ...prev, symbol: s }))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    state.symbol === s
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <div>
            <p className="font-display text-lg font-semibold">
              {mode === "portfolio" ? (effectiveProfit ? "Portfolio profit (est.)" : "Portfolio net worth") : state.symbol}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === "portfolio"
                ? effectiveProfit
                  ? "Value minus invested cost at each close · today's WACC rate"
                  : `${holdings.length} holdings valued at each historical close`
                : (quote?.name ?? series.data?.name ?? "NEPSE listed scrip")}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-lg font-semibold">
              {formatNpr(hover?.close ?? (mode === "portfolio" ? last : (quote?.ltp ?? last)))}
            </p>
            <DeltaPill value={hover?.changePercent ?? rangeReturn}>
              {formatPercent(hover?.changePercent ?? rangeReturn)}{" "}
              <span className="opacity-70">{hover ? "day" : state.range}</span>
            </DeltaPill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, range: r }))}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  state.range === r
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <span className="hidden h-4 w-px bg-border sm:block" />

          <div className="flex gap-1">
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, style: s.key }))}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  state.style === s.key
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {mode === "portfolio" ? (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" />
              <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5">
                {(["value", "profit"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBasis(b)}
                    title={
                      b === "profit"
                        ? "Investment excluded: value minus est. cost at each close"
                        : "Full portfolio value at each close"
                    }
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      basis === b
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {b === "value" ? "Value" : "Profit"}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setWatchlistOpen(true)}
              aria-label="Open watchlist"
            >
              <Star
                className={
                  watchlist.symbols.length > 0 ? "size-3.5 fill-warning text-warning" : "size-3.5"
                }
              />
              {watchlist.symbols.length > 0 ? (
                <span className="num">{watchlist.symbols.length}</span>
              ) : null}
              <span className="hidden sm:inline">Watchlist</span>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  <SlidersHorizontal className="size-3.5" /> Indicators
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3">
                {INDICATOR_LABELS.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <Label htmlFor={item.key} className="cursor-pointer">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {item.hint}
                      </span>
                    </Label>
                    <Switch
                      id={item.key}
                      checked={state.indicators[item.key]}
                      onCheckedChange={(v) => setIndicator(item.key, v)}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <Label htmlFor="logscale" className="cursor-pointer text-sm font-medium">
                    Log scale
                  </Label>
                  <Switch
                    id="logscale"
                    checked={state.logScale}
                    onCheckedChange={(v) => setState((prev) => ({ ...prev, logScale: v }))}
                  />
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Shrink chart" : "Expand chart"}
            >
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={snapshotPng}
              aria-label="Download chart snapshot"
            >
              <Camera className="size-3.5" />
            </Button>
          </div>
        </div>

        {costMissing ? (
          <p className="border-b border-border/60 bg-warning/10 px-3 py-2 text-[11px] text-muted-foreground">
            Profit needs your WACC cost basis, which is not available yet. Finish the purchase
            source calculation on the WACC page, then switch back. Showing full value meanwhile.
          </p>
        ) : null}

        {effectiveProfit && (profitInfo.excluded.length > 0 || profitInfo.estimated.length > 0) ? (
          <p className="border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            {profitInfo.estimated.length > 0 ? (
              <>
                Est. cost for pending WACC ({profitInfo.estimated.slice(0, 4).join(", ")}
                {profitInfo.estimated.length > 4 ? ` +${profitInfo.estimated.length - 4} more` : ""})
                {profitInfo.excluded.length > 0 ? " · " : "."}
              </>
            ) : null}
            {profitInfo.excluded.length > 0 ? (
              <>
                Excludes {profitInfo.excluded.length} scrip
                {profitInfo.excluded.length === 1 ? "" : "s"} with no cost data (
                {profitInfo.excluded.slice(0, 4).join(", ")}
                {profitInfo.excluded.length > 4 ? ` +${profitInfo.excluded.length - 4} more` : ""}).
              </>
            ) : null}
          </p>
        ) : null}

        {mode === "scrip" && quickSymbols.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Compare</span>
            <select
              value={compareSymbol}
              onChange={(e) => setCompareSymbol(e.target.value)}
              className="h-7 rounded-lg border border-border/60 bg-background px-2 text-xs"
            >
              <option value="">None</option>
              {quickSymbols
                .filter((s) => s !== state.symbol)
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            {compareSymbol && (
              <span className="text-muted-foreground">
                shown as an indexed % line against {state.symbol}
              </span>
            )}
          </div>
        )}

        <div id="terminal-chart" className="relative px-1 py-2">
          {loading ? (
            <div
              className="flex items-center justify-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading chart…
            </div>
          ) : activeBars.length === 0 && intraday.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              <p>
                {mode === "portfolio"
                  ? "No historical price coverage for your holdings yet."
                  : "No chart data available for this scrip."}
              </p>
              {(() => {
                const err = mode === "portfolio" ? netWorth.error : series.error;
                if (!err) return null;
                return (
                  <p className="max-w-md text-xs">
                    {err instanceof Error ? err.message : "Feed request failed."}
                  </p>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (mode === "portfolio") void netWorth.refetch();
                  else void series.refetch();
                }}
              >
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            </div>
          ) : (
            <TerminalChart
              key={`${mode}-${state.symbol}-${state.range}-${state.style}-${light}-${expanded}`}
              bars={activeBars}
              intraday={intraday}
              style={state.style}
              indicators={indicators}
              compare={compareLine}
              compareLabel={compareSymbol}
              logScale={state.logScale}
              light={light}
              height={chartHeight}
              onHover={setHover}
              onCreateOrder={
                mode === "scrip" && brokerLinked
                  ? ({ price, side }) => {
                      setTicketPrice({ price, side, nonce: Date.now() });
                      requestAnimationFrame(() =>
                        document.getElementById("order-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      );
                    }
                  : undefined
              }
              onSelectBar={
                mode === "portfolio"
                  ? (d) => setSelectedDate((cur) => (cur === d ? null : d))
                  : (d) => {
                      if (!d) {
                        setPinned(null);
                        return;
                      }
                      const bar = (series.data?.bars ?? []).find((b) => b.date === d) ?? null;
                      setPinned((cur) => (cur && bar && cur.date === bar.date ? null : bar));
                    }
              }
            />
          )}
        </div>

        {(hover || pinned) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-xs num text-muted-foreground">
            <span>{spot!.date.slice(0, 10)}</span>
            <span>O {num(spot!.open)}</span>
            <span>H {num(spot!.high)}</span>
            <span>L {num(spot!.low)}</span>
            <span className="font-semibold text-foreground">C {num(spot!.close)}</span>
            {spot!.volume > 0 && <span>Vol {spot!.volume.toLocaleString("en-IN")}</span>}
            {spot!.pinned ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                Pinned · click the candle again to release
              </span>
            ) : null}
            {mode === "scrip" && brokerLinked && spot!.close > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTicketPrice({ price: spot!.close, nonce: Date.now() });
                  requestAnimationFrame(() =>
                    document.getElementById("order-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  );
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 font-semibold text-primary transition-colors hover:bg-primary/25"
              >
                Limit @ {num(spot!.close)}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {mode === "portfolio" && selectedPoint && (
        <PointBreakdown
          point={selectedPoint}
          formatLabel={(t) =>
            new Date(t * 1000).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "Asia/Kathmandu",
            })
          }
          onPickScrip={(s) => {
            setMode("scrip");
            setState((prev) => ({ ...prev, symbol: s }));
          }}
          costOf={(symbol) => costByScrip.get(symbol.toUpperCase())}
        />
      )}

      {mode === "scrip" && position && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-surface p-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Your units</p>
            <p className="num font-semibold">{position.units.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Market value</p>
            <p className="num font-semibold">{formatNpr(position.value)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Day change</p>
            <DeltaPill value={position.dayChange}>{formatNpr(position.dayChange)}</DeltaPill>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sector</p>
            <p className="truncate text-sm font-medium">{position.sector ?? "-"}</p>
          </div>
        </div>
      )}

      {mode === "scrip" && (
        <OrderTicket
          key={state.symbol}
          symbol={state.symbol}
          limitPrice={ticketPrice}
        />
      )}

      {mode === "scrip" && brokerLinked ? (
        <div className="rounded-2xl border border-border/60 bg-surface">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold">
              Today&apos;s orders · {(todayOrders.data ?? []).length}
            </p>
            <Link
              to="/broker"
              className="text-xs font-medium text-primary hover:underline"
            >
              Full order book
            </Link>
          </div>
          {(todayOrders.data ?? []).length === 0 && !todayOrders.isPending ? (
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              Nothing placed today. Orders you place from the ticket land here.
            </p>
          ) : (
            <ul className="space-y-1 px-2 pb-2">
              {(todayOrders.data ?? []).map((o) => {
                const key = o.id || `${o.symbol}-${o.side}-${o.price}-${o.quantity}`;
                const armed = armedOrder === key;
                const cancellable = Boolean(
                  o.orderId && o.tranId && /OPEN|PARTIALLY/.test(o.status.toUpperCase()),
                );
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40"
                  >
                    <button
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, symbol: o.symbol }))}
                      className="min-w-0 flex-1 text-left"
                      title={`Load ${o.symbol} on the chart`}
                    >
                      <span className="text-sm">
                        <span className={cn("font-bold", o.side === "BUY" ? "text-gain" : "text-destructive")}>
                          {o.side}
                        </span>{" "}
                        <span className="num font-semibold">{o.quantity.toLocaleString("en-IN")}</span>{" "}
                        <span className="font-semibold">{o.symbol}</span>{" "}
                        <span className="num text-muted-foreground">
                          @ {o.price !== null ? o.price.toLocaleString("en-IN") : "MKT"}
                        </span>
                      </span>
                      <span className="num mt-0.5 block text-[0.7rem] text-muted-foreground">
                        {o.status} · {o.orderType} · {o.validity}
                      </span>
                    </button>
                    {cancellable ? (
                      <Button
                        variant={armed ? "destructive" : "outline"}
                        size="sm"
                        disabled={cancelTodayOrder.isPending}
                        className="h-7 shrink-0 text-xs"
                        onClick={() => {
                          if (!armed) {
                            setArmedOrder(key);
                            setTimeout(
                              () => setArmedOrder((cur) => (cur === key ? null : cur)),
                              4000,
                            );
                            return;
                          }
                          cancelTodayOrder.mutate({
                            orderId: o.orderId,
                            tranId: o.tranId,
                            orderStatus: o.orderStatus || o.status,
                            buySellType: o.side === "SELL" ? "Sell" : "Buy",
                            deliveryFlag: o.deliveryFlag,
                            orderTerms: o.validity,
                            price: o.price !== null ? String(o.price) : "0",
                            quantity: Math.max(1, Math.floor(o.remainingQty || o.quantity)),
                            symbol: o.symbol,
                          });
                        }}
                      >
                        {armed ? "Tap again" : "Cancel"}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {mode === "portfolio"
          ? "Net worth is your current unit counts valued at each historical close; it does not reflect past buys and sells. Click any point to pin its per-scrip prices below."
          : series.data?.hasSynthetic
            ? "Long ranges use archived daily closes where high/low were never published, so those candle bodies are derived from the previous close."
            : "Daily OHLC from public NEPSE mirrors."}{" "}
        Indicative data only, not for order placement.
      </p>

      <WatchlistPanel
        open={watchlistOpen}
        onOpenChange={setWatchlistOpen}
        onPick={(symbol) => {
          setWatchlistOpen(false);
          setMode("scrip");
          setState((prev) => ({ ...prev, symbol }));
        }}
      />
    </div>
  );
}
