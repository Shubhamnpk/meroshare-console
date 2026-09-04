import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Loader2,
  Maximize2,
  Minimize2,
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
import {
  chartSeriesQuery,
  enrichedPortfolioQuery,
  marketSnapshotQuery,
  portfolioHistoryQuery,
} from "@/lib/queries";
import type { ChartBar, ChartRange, PricePoint } from "@/lib/nepse/types";
import { formatNpr, formatPercent } from "@/lib/format";
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
    links: [
      canonicalLink("/terminal"),
    ],
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
  useEffect(() => {
    if (!hydrated) return;
    setTerminal({ ...state, indicators: { ...state.indicators } });
  }, [state, hydrated, setTerminal]);

  const [mode, setMode] = useState<"scrip" | "portfolio">("scrip");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState("");
  /** Pinned net-worth date (portfolio mode): shows that day's per-scrip prices below. */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    setSelectedDate(null);
  }, [mode, state.range]);

  const watchSymbols = watchlist.symbols;
  const snapshot = useQuery(marketSnapshotQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());

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
    state.range === "MAX" ? 120 : state.range === "5Y" ? 60 : state.range === "3Y" ? 36 : 12;
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

  const netWorthBars: ChartBar[] = useMemo(() => {
    const points = netWorth.data?.points ?? [];
    let prev = points[0]?.value ?? 0;
    return points.map((p) => {
      const open = prev || p.value;
      prev = p.value;
      return {
        date: new Date(p.time * 1000).toISOString().slice(0, 10),
        open,
        high: Math.max(open, p.value),
        low: Math.min(open, p.value),
        close: p.value,
        volume: 0,
        synthetic: true,
      };
    });
  }, [netWorth.data?.points]);

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

  // Stable empty fallbacks: fresh `[]` literals here would also rebuild the
  // chart on every render (they are effect deps of TerminalChart).
  const activeBars = mode === "portfolio" ? netWorthBars : (series.data?.bars ?? NO_BARS);
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
  const rangeReturn = isIntraday
    ? intradayFirst > 0
      ? ((intradayLast - intradayFirst) / intradayFirst) * 100
      : 0
    : first > 0
      ? ((last - first) / first) * 100
      : 0;

  const setIndicator = (key: keyof IndicatorConfig, value: boolean) =>
    setState((prev) => ({ ...prev, indicators: { ...prev.indicators, [key]: value } }));

  const snapshotPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#terminal-chart canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${mode === "portfolio" ? "portfolio" : state.symbol}-${state.range}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
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
              {mode === "portfolio" ? "Portfolio net worth" : state.symbol}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === "portfolio"
                ? `${holdings.length} holdings valued at each historical close`
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
              className="flex items-center justify-center px-4 text-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              {mode === "portfolio"
                ? "No historical price coverage for your holdings yet."
                : "No chart data available for this scrip."}
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
              onSelectBar={
                mode === "portfolio"
                  ? (d) => setSelectedDate((cur) => (cur === d ? null : d))
                  : undefined
              }
            />
          )}
        </div>

        {hover && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-xs num text-muted-foreground">
            <span>{hover.date.slice(0, 10)}</span>
            <span>O {num(hover.open)}</span>
            <span>H {num(hover.high)}</span>
            <span>L {num(hover.low)}</span>
            <span className="font-semibold text-foreground">C {num(hover.close)}</span>
            {hover.volume > 0 && <span>Vol {hover.volume.toLocaleString("en-IN")}</span>}
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
