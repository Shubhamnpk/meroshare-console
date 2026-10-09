import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  ChartCandlestick,
  ChevronDown,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Repeat,
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
import { ChipRow, StatChip } from "@/components/stat-chip";
import { PositionPnlCard } from "@/components/market/position-pnl-card";
import {
  DEFAULT_INDICATORS,
  TerminalChart,
  type ChartStyle,
  type HoverInfo,
  type IndicatorConfig,
} from "@/components/market/terminal-chart";
import { normalise, type LinePoint } from "@/lib/nepse/indicators";
import { chartDayLabel, chartTimeLabel } from "@/components/market/chart-modal";
import { PointBreakdown } from "@/components/portfolio/history-panel";
import { WatchlistPanel } from "@/components/market/watchlist-panel";
import { OrderTicket } from "@/components/brokers/order-ticket";
import { PriceAlertDialog } from "@/components/brokers/price-alert-dialog";
import {
  brokerAmoListQuery,
  brokerConnectionsQuery,
  brokerOrderBookQuery,
  brokerQuoteQuery,
  brokerWatchlistsQuery,
  chartSeriesQuery,
  enrichedPortfolioQuery,
  indexDailyQuery,
  indexGraphQuery,
  investmentSummaryQuery,
  marketSnapshotQuery,
  mfSchemesQuery,
  portfolioHistoryQuery,
  portfolioIntradayQuery,
  scripDetailQuery,
  scripFinancialsQuery,
  udfHistoryQuery,
} from "@/lib/queries";
import { cancelBrokerAmo, cancelBrokerOrder, modifyBrokerOrder, placeBrokerAmo } from "@/lib/brokers/brokers.functions";
import type { BrokerId, BrokerOrder } from "@/lib/brokers/types";
import { TmsReauthModal } from "@/components/brokers/tms-reauth-modal";
import { useTmsReauth } from "@/hooks/use-tms-reauth";
import { useBrokerMarketWs } from "@/hooks/use-broker-ws";
import type { ChartBar, ChartRange, PortfolioHistoryPoint, PricePoint } from "@/lib/nepse/types";
import { errorMessage, formatNpr, formatNumber, formatPercent } from "@/lib/format";
import {
  ORDER_PAGE_SIZE,
  amoIsActiveRow,
  canActOnOrder,
  isLiveOrder,
  isLiveStatus,
  orderBand,
  orderOutcome,
  orderStampMs,
} from "@/lib/orders";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
          "Candlestick charts, technical indicators and portfolio net-worth tracking for every NEPSE-listed stock.",
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
const INDEX_SYMBOLS = ["NEPSE", "SENSITIVE", "FLOAT", "SENFLOAT"] as const;

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

type BarAgg = "day" | "week" | "month" | "year";

/** Sunday (week-start) key for a "YYYY-MM-DD" trading date. */
function sundayKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Bucket daily candles into weekly/monthly/yearly candles: open = first open,
 * high/low = extremes, close = last close, volume = summed. Buckets keep
 * chronological order; weekly buckets are keyed by their Sunday.
 */
function aggregateBars(bars: ChartBar[], agg: BarAgg): ChartBar[] {
  if (agg === "day" || bars.length === 0) return bars;
  const buckets = new Map<string, ChartBar[]>();
  for (const b of bars) {
    const key = agg === "week" ? sundayKey(b.date) : agg === "month" ? b.date.slice(0, 7) : b.date.slice(0, 4);
    const arr = buckets.get(key);
    if (arr) arr.push(b);
    else buckets.set(key, [b]);
  }
  return [...buckets.values()].map((group) => {
    const firstBar = group[0]!;
    const lastBar = group[group.length - 1]!;
    return {
      date: firstBar.date,
      open: firstBar.open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: lastBar.close,
      volume: group.reduce((sum, g) => sum + g.volume, 0),
      synthetic: false,
    };
  });
}

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

/** Stable empty for the chart-lines memo (no rebuilds from fresh `[]`). */
const NO_ORDER_LINES: { price: number; side: "BUY" | "SELL"; qty: number; amo: boolean }[] = [];

function copyText(text: string, label: string): void {
  try {
    const pending = navigator.clipboard?.writeText(text);
    if (!pending) {
      toast.error("Copy failed on this browser");
      return;
    }
    pending.then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  } catch {
    toast.error("Copy failed");
  }
}

function DetailField({
  label,
  value,
  onCopy,
  wide = false,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-0.5 flex items-center gap-1.5 text-xs font-medium">
        <span className="min-w-0 flex-1 break-all">{value}</span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${label}`}
            title={`Copy ${label}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Copy className="size-3.5" />
          </button>
        ) : null}
      </p>
    </div>
  );
}

function TmsOrderDetails({ o, onReuse }: { o: BrokerOrder; onReuse?: () => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
      <DetailField label="Status" value={o.status} />
      {o.orderStatus && o.orderStatus.toUpperCase() !== o.status.toUpperCase() ? (
        <DetailField label="Broker status" value={o.orderStatus} />
      ) : null}
      <DetailField label="Type" value={`${o.orderType} · ${o.validity}`} />
      <DetailField label="Date" value={o.date || "—"} />
      <DetailField label="Time" value={o.time || "—"} />
      <DetailField
        label="Filled"
        value={`${(o.tradedQty ?? 0).toLocaleString("en-NP")} / ${o.quantity.toLocaleString("en-NP")}`}
      />
      <DetailField label="Exch. order no." value={o.exchangeOrderNo || "—"} />
      {o.orderId ? (
        <DetailField label="Order ID" value={o.orderId} wide onCopy={() => copyText(o.orderId, "Order ID")} />
      ) : null}
      {o.tranId ? (
        <DetailField label="Tran ID" value={o.tranId} wide onCopy={() => copyText(o.tranId, "Tran ID")} />
      ) : null}
      {onReuse ? (
        <div className="col-span-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onReuse}>
            <Repeat className="size-3.5" /> Reuse order
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AmoOrderDetails({
  a,
  onReuse,
}: {
  a: {
    triggerPrice: number | null;
    validTill: string | null;
    status: string | null;
    alertName: string | null;
  };
  onReuse?: () => void;
}) {
  const alert = a.alertName;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
      <DetailField label="Trigger" value={a.triggerPrice != null ? formatNpr(a.triggerPrice) : "—"} />
      <DetailField label="Valid till" value={a.validTill ?? "—"} />
      <DetailField label="Status" value={a.status ?? "Active"} />
      {alert ? <DetailField label="Alert" value={alert} onCopy={() => copyText(alert, "Alert name")} /> : null}
      {onReuse ? (
        <div className="col-span-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={onReuse}>
            <Repeat className="size-3.5" /> Reuse order
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TerminalPage() {
  const { theme, terminal, setTerminal } = useSettings();
  const [light, setLight] = useState(false);
  useEffect(() => {
    const resolve = () =>
      setLight(theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches));
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, [theme]);

  const [hydrated, setHydrated] = useState(false);
  // Charts always open on 1D (the auto-fallback below drops to 1W when no
  // intraday source exists); the saved range is never restored.
  const [state, setState] = useState<Stored>(() => ({
    ...loadStored({ terminal }),
    range: "1D",
  }));
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const watchlist = useWatchlist();
  // Deep link (e.g. from Market): ?symbol=XYZ overrides the remembered symbol.
  const linkedSymbol = Route.useSearch({ select: (s) => s.symbol });
  useEffect(() => {
    setState({
      ...loadStored({ terminal }),
      range: "1D",
      ...(linkedSymbol ? { symbol: linkedSymbol } : {}),
    });
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
  // Per-point resolution for daily candles (1M+ ranges): each candle covers
  // one day, one week, one calendar month or one calendar year.
  const [barAgg, setBarAgg] = useState<BarAgg>("day");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ticketPrice, setTicketPrice] = useState<{
    price: number;
    side?: "BUY" | "SELL";
    nonce: number;
    qty?: number;
  } | null>(null);
  // Reload a dead order into the ticket as a fresh draft (never placed
  // automatically). Symbol switch remounts the ticket, which then consumes
  // the draft by nonce.
  const reuseOrder = (draft: {
    symbol: string;
    side: "BUY" | "SELL" | undefined;
    price: number | null;
    qty: number;
  }) => {
    setState((prev) => ({ ...prev, symbol: draft.symbol }));
    setTicketPrice({
      price: draft.price ?? 0,
      ...(draft.side ? { side: draft.side } : {}),
      qty: draft.qty,
      nonce: Date.now(),
    });
    toast.success("Ticket filled from order — review and place");
    requestAnimationFrame(() =>
      document.getElementById("order-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const [alertAt, setAlertAt] = useState<number | null>(null);
  const brokerConns = useQuery(brokerConnectionsQuery());
  const brokerLinked = (brokerConns.data?.length ?? 0) > 0;
  const termBrokerId = (brokerConns.data?.[0]?.brokerId ?? null) as BrokerId | null;
  const { reauthOpen, setReauthOpen, handleSessionError } = useTmsReauth();
  const [armedOrder, setArmedOrder] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isIndexEarly = (INDEX_SYMBOLS as readonly string[]).includes(state.symbol);
  useBrokerMarketWs(termBrokerId, isIndexEarly ? null : state.symbol);
  /** Pinned candle in scrip mode (click); hover readout falls back to it. */
  const [pinned, setPinned] = useState<ChartBar | null>(null);
  /** Pinned session point in intraday mode (click): shows price + time below. */
  const [pinnedPoint, setPinnedPoint] = useState<PricePoint | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState("");
  /** Pinned net-worth date (portfolio mode): shows that day's per-scrip prices below. */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    setSelectedDate(null);
    setPinned(null);
    setPinnedPoint(null);
  }, [mode, state.range, state.symbol]);

  const watchSymbols = watchlist.symbols;
  const snapshot = useQuery(marketSnapshotQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());
  const investment = useQuery({ ...investmentSummaryQuery(), enabled: mode === "portfolio" });
  // Open-end mutual funds can't be traded on NEPSE — their symbol-scoped
  // trading UI (chart click-to-order, ticket, Limit button) stays hidden even
  // when a broker is connected. Shared ["mf-schemes"] key, usually cached.
  const schemesQ = useQuery(mfSchemesQuery());
  const isOpenEndFund =
    mode === "scrip" &&
    !isIndexEarly &&
    (schemesQ.data ?? []).some(
      (s) => s.symbol.toUpperCase() === state.symbol.toUpperCase() && s.fundType === "open_end",
    );
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = useQuery({
    ...brokerOrderBookQuery(termBrokerId, { fromDate: todayStr, toDate: todayStr }),
    enabled: brokerLinked && mode === "scrip",
    // Orders can change at the broker any moment (external cancels, GTC
    // expiry, TMS tabs) — keep the list honest while it's on screen.
    refetchInterval: 30_000,
  });
  const termAmos = useQuery({
    ...brokerAmoListQuery(termBrokerId),
    enabled: brokerLinked && mode === "scrip",
    refetchInterval: 30_000,
  });

  // Watch for TMS session expiry on broker queries.
  useEffect(() => {
    if (todayOrders.isError) handleSessionError(todayOrders.error);
    if (termAmos.isError) handleSessionError(termAmos.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to error state changes
  }, [todayOrders.isError, termAmos.isError]);

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
      // Resync on every outcome — a rejection ("already cancelled") means
      // our copy was stale, so the dead row must lose its buttons now.
      void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      if (r.ok) {
        toast.success(r.message);
      } else {
        toast.error(`${r.message} — order list refreshed.`);
      }
    },
    onError: (err) => {
      setArmedOrder(null);
      void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      toast.error(errorMessage(err, "Cancel failed."));
    },
  });

  // Quick modify for day orders + full AMO quick-manage (cancel / replace).
  const [modKey, setModKey] = useState<string | null>(null);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [ordersAll, setOrdersAll] = useState(false);
  const [mqty, setMqty] = useState("");
  const [mprice, setMprice] = useState("");
  const [amoArmed, setAmoArmed] = useState<string | null>(null);
  const [amoEditKey, setAmoEditKey] = useState<string | null>(null);
  const [aqty, setAqty] = useState("");
  const [aprice, setAprice] = useState("");

  const modifyDay = useMutation({
    mutationFn: (o: {
      tranId: string;
      orderId: string;
      orderStatus: string;
      remainingQty: number;
      side: "BUY" | "SELL";
      symbol: string;
      quantity: number;
      price: number;
      orderType: "LMT" | "MKT";
      validity: string;
    }) =>
      modifyBrokerOrder({
        data: {
          brokerId: termBrokerId!,
          ...o,
          validity: o.validity as "DAY" | "GTD" | "GTC" | "IOC" | "FOK",
          confirmed: true as const,
        },
      }),
    onSuccess: (r) => {
      // Same resync rule as cancel: any outcome refreshes the book.
      void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      if (r.ok) {
        toast.success(r.message);
        setModKey(null);
      } else {
        toast.error(`${r.message} — order list refreshed.`);
      }
    },
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: ["broker-order-book"] });
      toast.error(errorMessage(err, "Modify failed."));
    },
  });

  const amoRows = termAmos.data ?? [];
  const amoKeyOf = (o: (typeof amoRows)[number], i: number) =>
    o.alertName || `${o.scrip}-${o.side}-${o.price}-${o.quantity}-${i}`;
  const amoIndexed = useMemo(() => (termAmos.data ?? []).map((a, i) => ({ a, i })), [termAmos.data]);
  const amoActiveList = useMemo(() => amoIndexed.filter(({ a }) => amoIsActiveRow(a)), [amoIndexed]);
  const amoDisabledList = useMemo(() => amoIndexed.filter(({ a }) => !amoIsActiveRow(a)), [amoIndexed]);
  const amoBuyCount = amoActiveList.filter(({ a }) => a.side === "BUY").length;
  const amoSellCount = amoActiveList.filter(({ a }) => a.side === "SELL").length;
  // Live orders always on top; everything settled (filled / rejected /
  // cancelled / expired) below, latest first. AMO rows carry no timestamps,
  // so they keep broker order inside their active/disabled groups.
  const sortedTodayOrders = useMemo(() => {
    const rows = todayOrders.data ?? [];
    return rows
      .map((o, i) => ({ o, i }))
      .sort((a, b) => {
        const liveGap = Number(!isLiveOrder(a.o)) - Number(!isLiveOrder(b.o));
        if (liveGap !== 0) return liveGap;
        const timeGap = orderStampMs(b.o) - orderStampMs(a.o);
        if (timeGap !== 0) return timeGap;
        return a.i - b.i;
      })
      .map(({ o }) => o);
  }, [todayOrders.data]);

  // One list for every order: live day orders (latest first), live AMOs,
  // fills (latest first — real money first), other settled rows (latest
  // first), disabled AMOs. The AMO badge is the only visual difference —
  // the broker sends no AMO timestamps, so broker order stands in for time
  // inside the AMO bands.
  const unifiedRows = useMemo(
    () => [
      ...sortedTodayOrders.filter((o) => orderBand(o) === 0).map((o) => ({ kind: "tms" as const, o })),
      ...amoActiveList.map(({ a, i }) => ({ kind: "amo" as const, a, i, active: true })),
      ...sortedTodayOrders.filter((o) => orderBand(o) === 1).map((o) => ({ kind: "tms" as const, o })),
      ...sortedTodayOrders.filter((o) => orderBand(o) === 2).map((o) => ({ kind: "tms" as const, o })),
      ...amoDisabledList.map(({ a, i }) => ({ kind: "amo" as const, a, i, active: false })),
    ],
    [sortedTodayOrders, amoActiveList, amoDisabledList],
  );
  const amoEditing = amoRows.find((r, i) => amoKeyOf(r, i) === amoEditKey) ?? null;
  const amoEditQuote = useQuery({
    ...brokerQuoteQuery(termBrokerId, amoEditing?.scrip ?? ""),
    enabled: brokerLinked && Boolean(amoEditing),
  });

  const cancelAmoQuick = useMutation({
    mutationFn: (o: {
      alertName: string | null;
      scrip: string;
      price: number | null;
      triggerPrice: number | null;
      quantity: number;
      side: "BUY" | "SELL";
      validTill: string | null;
    }) => cancelBrokerAmo({ data: { brokerId: termBrokerId!, ...o, confirmed: true as const } }),
    onSuccess: (r) => {
      setAmoArmed(null);
      void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
      if (r.ok) {
        toast.success(r.message);
      } else {
        toast.error(`${r.message} — AMO list refreshed.`);
      }
    },
    onError: (err) => {
      setAmoArmed(null);
      void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
      toast.error(errorMessage(err, "AMO cancel failed."));
    },
  });

  const replaceAmoQuick = useMutation({
    mutationFn: async () => {
      if (!amoEditing || amoEditing.side === "UNKNOWN") throw new Error("Nothing to replace.");
      const qty = Math.floor(Number(aqty));
      const px = Number(aprice);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("Quantity must be at least 1.");
      if (!Number.isFinite(px) || px <= 0) throw new Error("Price must be positive.");
      if (amoEditing.side === "SELL" && qty < 10) {
        throw new Error("AMO order not available for odd lot.");
      }
      const cancelled = await cancelBrokerAmo({
        data: {
          brokerId: termBrokerId!,
          alertName: amoEditing.alertName,
          scrip: amoEditing.scrip,
          price: amoEditing.price,
          triggerPrice: amoEditing.triggerPrice,
          quantity: amoEditing.quantity,
          side: amoEditing.side,
          validTill: amoEditing.validTill,
          confirmed: true as const,
        },
      });
      if (!cancelled.ok) throw new Error(cancelled.message);
      const ltp = amoEditQuote.data?.ltp ?? amoEditQuote.data?.close ?? px;
      const placed = await placeBrokerAmo({
        data: {
          brokerId: termBrokerId!,
          side: amoEditing.side,
          symbol: amoEditing.scrip,
          quantity: qty,
          price: px,
          ltp: ltp > 0 ? ltp : px,
          confirmed: true as const,
        },
      });
      if (!placed.ok) throw new Error(`Old order cancelled, but replacement failed: ${placed.message}`);
      return placed.message;
    },
    onSuccess: (message) => {
      toast.success(message);
      setAmoEditKey(null);
      void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
    },
    onError: (err) => {
      // Replace is cancel-then-place: a mid-way failure already changed the
      // list, so resync even though the mutation threw.
      void queryClient.invalidateQueries({ queryKey: ["broker-amo-list"] });
      toast.error(errorMessage(err, "Replace failed."));
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
  const [intradayRes, setIntradayRes] = useState<import("@/lib/charts/udf").UdfResolution>("1");
  const udf = useQuery({
    ...udfHistoryQuery(
      state.symbol,
      state.range as import("@/lib/charts/udf").ChartRange,
      state.range === "1D" ? intradayRes : null,
    ),
    enabled: mode === "scrip" && Boolean(state.symbol) && state.range === "1D" && !isIndexEarly,
  });
  const indexHistory = useQuery({
    ...indexGraphQuery(state.symbol),
    enabled: mode === "scrip" && isIndexEarly,
  });
  const scrip1DProbe = useQuery({
    ...chartSeriesQuery(state.symbol, "1D"),
    enabled: mode === "scrip" && Boolean(state.symbol) && !isIndexEarly && state.range !== "1D",
  });
  const udf1DProbe = useQuery({
    ...udfHistoryQuery(state.symbol, "1D", intradayRes),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    enabled: mode === "scrip" && Boolean(state.symbol) && !isIndexEarly && state.range !== "1D",
  });
  // Daily index candles from the YONEPSE archive for 1W+ ranges (the session
  // feed above only covers today). MAX (0) means the whole archive, uncapped.
  const indexRangeDays =
    state.range === "1W"
      ? 10
      : state.range === "1M"
        ? 31
        : state.range === "3M"
          ? 93
          : state.range === "6M"
            ? 186
            : state.range === "1Y"
              ? 366
              : state.range === "5Y"
                ? 1826
                : 0;
  const indexDaily = useQuery({
    ...indexDailyQuery(state.symbol, indexRangeDays),
    enabled: mode === "scrip" && isIndexEarly && state.range !== "1D",
  });
  // Live tick for crazy 1m: when broker linked, poll broker quote every 5s and patch last candle
  const liveTick = useQuery({
    ...brokerQuoteQuery(termBrokerId, state.range === "1D" && !isIndexEarly ? state.symbol : null),
    enabled: brokerLinked && mode === "scrip" && state.range === "1D" && Boolean(state.symbol) && !isIndexEarly,
    refetchInterval: brokerLinked && state.range === "1D" && !isIndexEarly ? 5000 : false,
    refetchIntervalInBackground: true,
    staleTime: 3000,
  } as never);
  const compare = useQuery({
    ...chartSeriesQuery(compareSymbol, state.range),
    enabled: mode === "scrip" && compareSymbol.length > 0,
  });

  const historyMonths =
    state.range === "MAX"
      ? 120
      : state.range === "5Y"
        ? 60
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
  // Live session line for portfolio 1D: today's ticks per holding, summed.
  const worthIntraday = useQuery(
    portfolioIntradayQuery(
      holdings.map((h) => ({ scrip: h.scrip, units: h.units, price: h.ltp })),
      mode === "portfolio" && state.range === "1D",
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
    return [...new Set(["NEPSE", ...owned, ...watchSymbols])].slice(0, 12);
  }, [holdings, watchSymbols]);
  const isIndex = isIndexEarly;
  // Fundamentals strip (same labels as the stock sheet): company facts +
  // latest financial report. Auxiliary only — the section hides when empty
  // so it can never break the terminal.
  const fundDetailQ = useQuery({
    ...scripDetailQuery(mode === "scrip" && !isIndexEarly ? state.symbol : null),
  });
  const fundFinQ = useQuery({
    ...scripFinancialsQuery(mode === "scrip" && !isIndexEarly ? state.symbol : null),
  });
  const fundOv = fundDetailQ.data?.overview ?? null;
  const fundRep = fundFinQ.data?.reports?.[0] ?? null;
  const fundMcap = fundOv?.marketCapitalization ?? 0;
  const fundPe = fundRep?.pe ?? null;
  const fundEps = fundRep?.eps ?? null;
  const fundNwps = fundRep?.netWorthPerShare ?? null;
  const fundFace = fundOv?.faceValue ?? 0;
  const fundSector = fundOv?.sector ?? null;
  const fundPeriod = [
    fundRep?.quarter ?? null,
    fundRep?.fy ? `${fundRep.fy}${fundRep.fyNepali ? ` (${fundRep.fyNepali})` : ""}` : null,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");
  const showFundamentals = mode === "scrip" && !isIndex && Boolean(fundOv || fundRep);
  const watched = mode === "scrip" && !isIndex && watchlist.has(state.symbol);

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
    const exact = points.find((p) => new Date(p.time * 1000).toISOString().slice(0, 10) === selectedDate) ?? null;
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

  // Per-scrip prices at a tapped session point: each holding's last tick at
  // or before that time (else its LTP), reusing the daily-breakdown table.
  const pinnedIntradayPoint = useMemo((): PortfolioHistoryPoint | null => {
    if (mode !== "portfolio" || !pinnedPoint) return null;
    const ticks = worthIntraday.data?.ticks ?? {};
    const t = Number(pinnedPoint.time);
    const breakdown: PortfolioHistoryPoint["breakdown"] = [];
    for (const h of holdings) {
      if (h.units <= 0) continue;
      let close = h.ltp;
      for (const tick of ticks[h.scrip.toUpperCase()] ?? []) {
        if (tick.time <= t) close = tick.value;
        else break;
      }
      if (!(close > 0)) continue;
      breakdown.push({ symbol: h.scrip, units: h.units, close, value: h.units * close });
    }
    if (breakdown.length === 0) return null;
    return { time: t, value: breakdown.reduce((sum, b) => sum + b.value, 0), breakdown };
  }, [mode, pinnedPoint, worthIntraday.data, holdings]);

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

  // Hover readout: pinned candle first, then pinned session point, then live hover.
  // Resolved below (after intradayFirst) so a pinned point can show session change.
  let spot: (HoverInfo & { pinned?: boolean }) | null = null;
  // UDF fallback: when the mirror has no 1D intraday but UDF does, use it.
  // Live 1m patch: broker LTP ticks (5s poll) update the last 1m candle crazy-fast.
  const udfIntradayRaw = useMemo(() => {
    const pts = udf.data?.points ?? [];
    return pts.map((p) => ({
      time: p.time,
      value: p.value,
    }));
  }, [udf.data?.points]);
  const udfBarsRaw = useMemo(() => {
    const bars = udf.data?.bars ?? [];
    return bars.map((b) => ({
      date: new Date(b.time * 1000).toISOString().slice(0, 10),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
  }, [udf.data?.bars]);
  const tickLtp = (liveTick as unknown as { data?: { ltp?: number | null } })?.data?.ltp ?? null;
  const udfIntraday = useMemo(() => {
    if (tickLtp === null || udfIntradayRaw.length === 0) return udfIntradayRaw;
    const last = udfIntradayRaw[udfIntradayRaw.length - 1]!;
    return [...udfIntradayRaw.slice(0, -1), { ...last, value: tickLtp }];
  }, [udfIntradayRaw, tickLtp]);
  const udfBars = useMemo(() => {
    if (tickLtp === null || udfBarsRaw.length === 0) return udfBarsRaw;
    const last = udfBarsRaw[udfBarsRaw.length - 1]!;
    return [
      ...udfBarsRaw.slice(0, -1),
      {
        ...last,
        close: tickLtp,
        high: Math.max(last.high, tickLtp),
        low: Math.min(last.low, tickLtp),
      },
    ];
  }, [udfBarsRaw, tickLtp]);

  const showProfit = mode === "portfolio" && basis === "profit";

  const costMissing = showProfit && !investment.isPending && costByScrip.size === 0;
  const effectiveProfit = showProfit && !costMissing;
  const indexBars: ChartBar[] = useMemo(() => {
    if (!isIndexEarly) return NO_BARS;
    if (state.range === "1D") return NO_BARS;

    // YONEPSE daily candles first: long ranges must render even when the
    // session feed is down (previously an empty session feed blanked every
    // range because of the early return below).
    const daily = (indexDaily.data ?? []) as unknown as Record<string, unknown>[];
    const mapped = daily.map((b) => ({
      date: String(b["date"] ?? ""),
      open: Number(b["open"] ?? 0),
      high: Number(b["high"] ?? 0),
      low: Number(b["low"] ?? 0),
      close: Number(b["close"] ?? 0),
      volume: Number(b["volume"] ?? 0),
      synthetic: Boolean(b["synthetic"]),
    })) as ChartBar[];
    if (mapped.length > 0) {
      // Every range ≥1W draws daily candles; the session line is 1D-only so
      // 1W can't show today's intraday dates under a "1W" label.
      return [...mapped].sort((a, b) => a.date.localeCompare(b.date));
    }
    const pts = (indexHistory.data ?? []) as import("@/lib/nepse/types").PricePoint[];
    if (pts.length === 0) return NO_BARS;
    const windowDays =
      state.range === "1M"
        ? 31
        : state.range === "3M"
          ? 93
          : state.range === "6M"
            ? 186
            : state.range === "1Y"
              ? 366
              : null;
    const cutoff = windowDays === null ? 0 : Date.now() / 1000 - windowDays * 86400;
    const filtered = pts.filter((p) => p.time >= cutoff);
    const byDate = new Map<string, (typeof filtered)[number]>();
    for (const p of filtered) {
      const d = new Date(p.time * 1000).toISOString().slice(0, 10);
      byDate.set(d, p);
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, p]) => ({
        date,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        volume: 0,
        synthetic: true,
      }));
  }, [indexDaily.data, indexHistory.data, isIndexEarly, state.range]);
  // Session-feed points independent of the selected range: drives the 1D
  // availability (button disabled + redirect below) as well as the 1D/1W line.
  const indexSessionPoints: PricePoint[] = useMemo(() => {
    if (!isIndexEarly) return NO_POINTS;
    const pts = ((indexHistory.data ?? []) as PricePoint[]).filter(
      (p) => Number.isFinite(p.value) && p.value > 0 && Number.isFinite(Number(p.time)),
    );
    if (pts.length === 0) return NO_POINTS;
    return [...pts].sort((a, b) => Number(a.time) - Number(b.time));
  }, [indexHistory.data, isIndexEarly]);
  const indexIntraday = useMemo(() => {
    if (!isIndexEarly || state.range !== "1D") return NO_POINTS;
    return indexSessionPoints;
  }, [indexSessionPoints, isIndexEarly, state.range]);
  const portfolioIntraday = useMemo(() => {
    if (mode !== "portfolio" || state.range !== "1D") return NO_POINTS;
    const pts = ((worthIntraday.data?.points ?? []) as PricePoint[]).filter(
      (p) => Number.isFinite(p.value) && p.value > 0 && Number.isFinite(Number(p.time)),
    );
    if (pts.length < 2) return NO_POINTS;
    const sorted = [...pts].sort((a, b) => Number(a.time) - Number(b.time));
    const cost = effectiveProfit ? (investment.data?.totalInvestment ?? 0) : 0;
    return cost > 0 ? sorted.map((p) => ({ ...p, value: p.value - cost })) : sorted;
  }, [worthIntraday.data, mode, state.range, effectiveProfit, investment.data]);
  const mirrorBars = series.data?.bars ?? NO_BARS;
  const mirrorIntraday = series.data?.intraday ?? NO_POINTS;
  const hasMirror = mirrorBars.length > 0 || mirrorIntraday.length > 0;
  const hasMirrorIntraday = mirrorIntraday.length >= 2;
  const useUdf =
    mode === "scrip" &&
    state.range === "1D" &&
    !hasMirrorIntraday &&
    (udfBars.length > 0 || udfIntraday.length > 0) &&
    !isIndexEarly;
  const activeBars =
    mode === "portfolio"
      ? state.range === "1D" && portfolioIntraday.length >= 2
        ? NO_BARS
        : effectiveProfit
          ? profitInfo.bars
          : netWorthBars
      : isIndexEarly
        ? indexBars
        : useUdf
          ? udfIntraday.length >= 2
            ? NO_BARS
            : (udfBars as ChartBar[])
          : mirrorIntraday.length >= 2
            ? NO_BARS
            : mirrorBars;
  const intraday =
    mode === "portfolio"
      ? portfolioIntraday
      : isIndexEarly
        ? indexIntraday
        : useUdf
          ? (udfIntraday as PricePoint[])
          : mirrorIntraday;

  // Per-point resolution for daily candles on 1M+ ranges (day/week/month/year).
  const showAgg = mode === "scrip" && state.range !== "1D" && state.range !== "1W";
  const drawnBars = useMemo(
    () => (showAgg ? aggregateBars(activeBars, barAgg) : activeBars),
    [showAgg, activeBars, barAgg],
  );
  const isIntraday = drawnBars.length === 0 && intraday.length > 0;
  // Executed buy/sell arrows on the candles, like the cost line. Daily axis
  // only (intraday runs on timestamps); a marker lands only on a drawn
  // candle, so odd broker date formats degrade to no marker, never a crash.
  const tradeMarkers = useMemo(() => {
    if (mode !== "scrip" || isIndexEarly || isIntraday || drawnBars.length === 0) return [];
    const barDates = new Set(drawnBars.map((b) => b.date));
    const toBarDate = (raw: unknown): string | null => {
      const s = String(raw ?? "");
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const t = Date.parse(s);
      if (!Number.isNaN(t)) {
        const d = new Date(t);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      return null;
    };
    const out: { time: string; side: "BUY" | "SELL"; qty: number }[] = [];
    for (const o of todayOrders.data ?? []) {
      if (o.symbol !== state.symbol) continue;
      if (o.side !== "BUY" && o.side !== "SELL") continue;
      if (/CANCEL|REJECT|EXPIRE|FAIL/.test(o.status.toUpperCase())) continue;
      const date = toBarDate(o.date);
      if (!date || !barDates.has(date)) continue;
      out.push({ time: date, side: o.side, qty: Math.max(0, Math.floor(o.quantity)) });
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [mode, isIndexEarly, isIntraday, drawnBars, todayOrders.data, state.symbol]);
  // Open-order price lines for this symbol: pending day orders + live AMO
  // queue. Price lines need no candle date (unlike trade arrows), so they
  // also work on intraday. MKT rows carry no price and are skipped.
  const orderLines = useMemo(() => {
    if (mode !== "scrip" || isIndexEarly) return NO_ORDER_LINES;
    const out: { price: number; side: "BUY" | "SELL"; qty: number; amo: boolean }[] = [];
    for (const o of todayOrders.data ?? []) {
      if (o.symbol !== state.symbol) continue;
      if (o.side !== "BUY" && o.side !== "SELL") continue;
      if (!isLiveStatus(o.status)) continue;
      if (o.price === null || !(o.price > 0)) continue;
      out.push({
        price: o.price,
        side: o.side,
        qty: Math.max(0, Math.floor(o.quantity)),
        amo: false,
      });
    }
    for (const { a } of amoActiveList) {
      if (a.scrip !== state.symbol) continue;
      if (a.side !== "BUY" && a.side !== "SELL") continue;
      if (a.price === null || !(a.price > 0)) continue;
      out.push({
        price: a.price,
        side: a.side,
        qty: Math.max(0, Math.floor(a.quantity)),
        amo: true,
      });
    }
    return out.slice(0, 25);
  }, [mode, isIndexEarly, todayOrders.data, amoActiveList, state.symbol]);
  // Session feed resolved with nothing chartable (e.g. mirror 502): 1W must
  // keep waiting for the YONEPSE daily fallback instead of flashing empty,
  // and the 1D button below is disabled.
  const indexSessionEmpty = !indexHistory.isPending && indexSessionPoints.length < 2;
  // 1D availability for a normal symbol: mirror 1D series (intraday ticks or
  // trailing daily bars) or the UDF fallback. Reads the live 1D view queries
  // while parked on 1D, the probes otherwise.
  const oneDProbeBars = state.range === "1D" ? mirrorBars : (scrip1DProbe.data?.bars ?? NO_BARS);
  const oneDProbeIntraday = state.range === "1D" ? mirrorIntraday : (scrip1DProbe.data?.intraday ?? NO_POINTS);
  const oneDProbeUdf = state.range === "1D" ? udf.data : udf1DProbe.data;
  const oneDProbeSettled =
    state.range === "1D" ? !series.isPending && !udf.isPending : !scrip1DProbe.isPending && !udf1DProbe.isPending;
  const scrip1DEmpty =
    mode === "scrip" &&
    !isIndexEarly &&
    oneDProbeSettled &&
    oneDProbeBars.length === 0 &&
    oneDProbeIntraday.length === 0 &&
    (oneDProbeUdf?.bars ?? []).length === 0 &&
    (oneDProbeUdf?.points ?? []).length === 0;
  // Either flavor of "no 1D": dry index session feed, or every 1D source dry
  // for a normal symbol.
  const oneDUnavailable = mode === "scrip" && (isIndexEarly ? indexSessionEmpty : scrip1DEmpty);
  const loading =
    mode === "portfolio"
      ? netWorth.isPending || worthIntraday.isPending
      : isIndexEarly
        ? state.range === "1D"
          ? indexHistory.isPending
          : state.range === "1W"
            ? indexDaily.isPending || ((indexDaily.data ?? []).length === 0 && indexHistory.isPending)
            : indexDaily.isPending
        : series.isPending || (useUdf ? false : udf.isPending && state.range === "1D" && !hasMirrorIntraday);
  // 1D preference on every chart open: picking another symbol (watchlist,
  // search, orders, holdings, deep link) restarts at 1D; the effect below
  // parks it on 1W if that symbol has no intraday source.
  const prevSymbolRef = useRef(state.symbol);
  useEffect(() => {
    if (prevSymbolRef.current === state.symbol) return;
    prevSymbolRef.current = state.symbol;
    setState((prev) => (prev.range === "1D" ? prev : { ...prev, range: "1D" }));
  }, [state.symbol]);
  // 1D needs an intraday source: when it settles dry (index session feed, or
  // every 1D source for a normal symbol), park the chart on 1W instead of
  // the empty state. Never switches back on its own — the 1D button
  // re-enables when a source recovers and the user can switch back manually.
  useEffect(() => {
    if (mode === "scrip" && state.range === "1D" && oneDUnavailable) {
      setState((prev) => (prev.range === "1D" ? { ...prev, range: "1W" } : prev));
    }
  }, [mode, state.range, oneDUnavailable]);
  const udfBadge = useUdf ? " · UDF" : "";
  const isMobile = useIsMobile();
  const chartHeight = expanded ? 640 : isMobile ? 320 : 400;
  const indicators: IndicatorConfig = useMemo(
    () =>
      mode === "portfolio" ? { ...state.indicators, volume: false, vwap: false, bollinger: false } : state.indicators,
    [mode, state.indicators],
  );

  const first = drawnBars[0]?.close ?? 0;
  const last = drawnBars[drawnBars.length - 1]?.close ?? 0;
  const intradayFirst = intraday[0]?.value ?? 0;
  const intradayLast = intraday[intraday.length - 1]?.value ?? 0;
  spot = pinned
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
    : pinnedPoint
      ? {
          date: `${chartDayLabel(Number(pinnedPoint.time))}, ${chartTimeLabel(Number(pinnedPoint.time))}`,
          open: pinnedPoint.value,
          high: pinnedPoint.value,
          low: pinnedPoint.value,
          close: pinnedPoint.value,
          volume: 0,
          changePercent: intradayFirst ? ((pinnedPoint.value - intradayFirst) / intradayFirst) * 100 : 0,
          pinned: true,
        }
      : hover;
  const costNow = investment.data?.totalInvestment ?? 0;
  const rangeReturn = isIntraday
    ? effectiveProfit
      ? costNow > 0
        ? ((intradayLast - intradayFirst) / costNow) * 100
        : 0
      : intradayFirst > 0
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
              {m === "scrip" ? "Stock" : "My net worth"}
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
              placeholder="Search any listed stock, e.g. NABIL, SHIVM, NRIC…"
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
              {quickSymbols.map((s) => {
                const inList = s !== "NEPSE" && watchlist.has(s);
                return (
                  <span key={s} className="group relative inline-flex">
                    <button
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
                    {s !== "NEPSE" ? (
                      <button
                        type="button"
                        onClick={() => {
                          watchlist.toggle(s);
                          toast.success(inList ? "Removed from watchlist" : "Added to watchlist");
                        }}
                        aria-label={inList ? `Remove ${s} from watchlist` : `Add ${s} to watchlist`}
                        title={inList ? `Remove ${s} from watchlist` : `Add ${s} to watchlist`}
                        className={cn(
                          "absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-card shadow-sm transition-all",
                          "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                          inList
                            ? "border-amber-500/50 text-amber-600 dark:text-amber-400"
                            : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary",
                        )}
                      >
                        <Star className={cn("size-3", inList && "fill-warning text-warning")} />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border/60 bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3">
          <div>
            <p className="font-display text-lg font-semibold">
              {mode === "portfolio" ? (
                effectiveProfit ? (
                  "Portfolio profit (est.)"
                ) : (
                  "Portfolio net worth"
                )
              ) : (
                <span className="inline-flex items-center gap-2">
                  {state.symbol}
                  {!isIndex ? (
                    <button
                      type="button"
                      onClick={() => {
                        watchlist.toggle(state.symbol);
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
                      {watched ? (
                        <Star className="size-3.5 fill-warning text-warning" />
                      ) : (
                        <Star className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {mode === "portfolio"
                ? effectiveProfit
                  ? "Value minus invested cost at each close · today's WACC rate"
                  : `${holdings.length} holdings valued at each historical close`
                : (quote?.name ?? series.data?.name ?? "NEPSE listed stock")}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-lg font-semibold">
              {formatNpr(
                hover?.close ??
                  (mode === "portfolio"
                    ? isIntraday
                      ? intradayLast
                      : last
                    : (quote?.ltp ?? (isIntraday ? intradayLast : last))),
              )}
            </p>
            <DeltaPill value={hover?.changePercent ?? rangeReturn}>
              {formatPercent(hover?.changePercent ?? rangeReturn)}{" "}
              <span className="opacity-70">{hover ? "day" : state.range}</span>
            </DeltaPill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {RANGES.map((r) => {
              // 1D needs an intraday source (index session feed, or mirror /
              // UDF for a normal symbol). When it settles dry the button is
              // disabled — the effect below parks the chart on 1W instead.
              const unavailable = r === "1D" && oneDUnavailable;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={unavailable}
                  title={unavailable ? "1D unavailable — showing 1W" : undefined}
                  onClick={() => setState((prev) => ({ ...prev, range: r }))}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                    state.range === r ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60",
                    unavailable && "cursor-not-allowed opacity-40 hover:bg-transparent",
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
          {showAgg ? (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Per point</span>
                <Select value={barAgg} onValueChange={(v) => setBarAgg(v as BarAgg)}>
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          {state.range === "1D" && mode === "scrip" && !isIndex ? (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Interval</span>
                <Select
                  value={intradayRes}
                  onValueChange={(v) => setIntradayRes(v as import("@/lib/charts/udf").UdfResolution)}
                >
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1m</SelectItem>
                    <SelectItem value="5">5m</SelectItem>
                    <SelectItem value="15">15m</SelectItem>
                    <SelectItem value="60">1h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <span className="hidden h-4 w-px bg-border sm:block" />

          <div className="flex gap-1">
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, style: s.key }))}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  state.style === s.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60",
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
              <Star className={watchlist.symbols.length > 0 ? "size-3.5 fill-warning text-warning" : "size-3.5"} />
              {watchlist.symbols.length > 0 ? <span className="num">{watchlist.symbols.length}</span> : null}
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
                      <span className="block text-[11px] font-normal text-muted-foreground">{item.hint}</span>
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
            Profit needs your WACC cost basis, which is not available yet. Finish the purchase source calculation on the
            WACC page, then switch back. Showing full value meanwhile.
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
                Excludes {profitInfo.excluded.length} stock
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
              <span className="text-muted-foreground">shown as an indexed % line against {state.symbol}</span>
            )}
            {udfBadge ? (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                Source: UDF · NEPSE
              </span>
            ) : null}
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
          ) : drawnBars.length === 0 && intraday.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground"
              style={{ height: chartHeight }}
            >
              <p>
                {mode === "portfolio"
                  ? "No historical price coverage for your holdings yet."
                  : isIndex
                    ? state.range === "1D"
                      ? "No session data for this index right now."
                      : "Index history is unavailable right now."
                    : "No chart data available for this stock."}
              </p>
              {(() => {
                const err = mode === "portfolio" ? netWorth.error : series.error;
                if (!err) return null;
                return (
                  <p className="max-w-md text-xs">{err instanceof Error ? err.message : "Feed request failed."}</p>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (mode === "portfolio") {
                    void netWorth.refetch();
                    void worthIntraday.refetch();
                  } else if (isIndex) {
                    void indexHistory.refetch();
                    void indexDaily.refetch();
                  } else void series.refetch();
                }}
              >
                <RefreshCw className="size-3.5" /> Retry
              </Button>
            </div>
          ) : (
            <TerminalChart
              key={`${mode}-${state.symbol}-${state.range}-${state.style}-${light}-${expanded}-${costByScrip.get(state.symbol.toUpperCase())?.rate ?? "na"}`}
              bars={drawnBars}
              intraday={intraday}
              style={state.style}
              indicators={indicators}
              compare={compareLine}
              compareLabel={compareSymbol}
              logScale={state.logScale}
              light={light}
              height={chartHeight}
              wacc={mode === "scrip" && !isIndex ? (costByScrip.get(state.symbol.toUpperCase())?.rate ?? null) : null}
              includeWaccDomain={state.range === "MAX"}
              onHover={setHover}
              tradeMarkers={tradeMarkers}
              orderLines={orderLines}
              onCreateOrder={
                mode === "scrip" && brokerLinked && !isOpenEndFund
                  ? ({ price, side }) => {
                      setTicketPrice({ price, side, nonce: Date.now() });
                      requestAnimationFrame(() =>
                        document.getElementById("order-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      );
                    }
                  : undefined
              }
              onCreateAlert={mode === "scrip" && !isIndex ? (price) => setAlertAt(price) : undefined}
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
              onSelectPoint={(p) => setPinnedPoint((cur) => (cur && p && cur.time === p.time ? null : p))}
            />
          )}
        </div>

        {(hover || pinned || pinnedPoint) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-xs num text-muted-foreground">
            <span>{spot!.date.length > 10 ? spot!.date : spot!.date.slice(0, 10)}</span>
            <span>O {num(spot!.open)}</span>
            <span>H {num(spot!.high)}</span>
            <span>L {num(spot!.low)}</span>
            <span className="font-semibold text-foreground">C {num(spot!.close)}</span>
            {spot!.volume > 0 && <span>Vol {spot!.volume.toLocaleString("en-NP")}</span>}
            {spot!.pinned ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                Pinned · click again to release
              </span>
            ) : null}
            {mode === "scrip" && !isIndex && spot!.close > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1.5">
                {brokerLinked && !isOpenEndFund ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTicketPrice({ price: spot!.close, nonce: Date.now() });
                      requestAnimationFrame(() =>
                        document.getElementById("order-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 font-semibold text-primary transition-colors hover:bg-primary/25"
                  >
                    Limit @ {num(spot!.close)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAlertAt(spot!.close)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 font-semibold text-amber-600 transition-colors hover:bg-amber-500/25 dark:text-amber-400"
                >
                  Alert @ {num(spot!.close)}
                </button>
              </span>
            ) : null}
          </div>
        )}
      </div>

      {showFundamentals ? (
        <section aria-label="Fundamentals">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
            <h2 className="font-display text-sm font-semibold">Fundamentals</h2>
            {fundPeriod ? <p className="text-[0.68rem] text-muted-foreground">{fundPeriod}</p> : null}
          </div>
          <ChipRow>
            {fundSector ? <StatChip label="Sector" value={fundSector} /> : null}
            {fundMcap > 0 ? <StatChip label="Market cap" value={formatNpr(fundMcap, { compact: true })} /> : null}
            {fundPe != null ? <StatChip label="P/E" value={formatNumber(fundPe)} /> : null}
            {fundEps != null ? <StatChip label="EPS" value={formatNpr(fundEps)} /> : null}
            {fundNwps != null ? <StatChip label="Net worth / share" value={formatNpr(fundNwps)} /> : null}
            {fundFace > 0 ? <StatChip label="Face value" value={formatNpr(fundFace)} /> : null}
          </ChipRow>
        </section>
      ) : null}

      {mode === "portfolio" && (selectedPoint ?? pinnedIntradayPoint) && (
        <PointBreakdown
          point={(selectedPoint ?? pinnedIntradayPoint)!}
          formatLabel={(t) =>
            pinnedIntradayPoint && !selectedPoint
              ? `${chartDayLabel(t)}, ${chartTimeLabel(t)}`
              : new Date(t * 1000).toLocaleDateString("en-GB", {
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
            <p className="num font-semibold">{position.units.toLocaleString("en-NP")}</p>
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

      {mode === "scrip" && !isIndex && !isOpenEndFund && (
        <OrderTicket key={state.symbol} symbol={state.symbol} limitPrice={ticketPrice} />
      )}

      {mode === "scrip" && !isIndex && state.symbol ? (
        <PriceAlertDialog
          symbol={state.symbol}
          defaultPrice={alertAt}
          open={alertAt !== null}
          onOpenChange={(o) => {
            if (!o) setAlertAt(null);
          }}
        />
      ) : null}

      {mode === "scrip" && brokerLinked ? (
        <div className="rounded-2xl border border-border/60 bg-surface">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold">
              Orders · {(todayOrders.data ?? []).length + (termAmos.data ?? []).length}
            </p>
            <Link to="/broker" search={{ tab: "orders" }} className="text-xs font-medium text-primary hover:underline">
              Full order book
            </Link>
          </div>
          {(termAmos.data ?? []).length > 0 ? (
            <p className="px-4 pb-2 text-[0.7rem] text-muted-foreground">
              Includes {(termAmos.data ?? []).length} AMO for next session · {amoBuyCount} buy · {amoSellCount} sell
              {amoDisabledList.length > 0 ? ` · ${amoDisabledList.length} disabled` : ""}
            </p>
          ) : null}
          {(todayOrders.data ?? []).length === 0 &&
          (termAmos.data ?? []).length === 0 &&
          !todayOrders.isPending &&
          !termAmos.isPending ? (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              Nothing here yet. Orders you place from the ticket land here — AMOs queue while the market is closed.
            </p>
          ) : unifiedRows.length === 0 && (todayOrders.isPending || termAmos.isPending) ? (
            <p className="px-4 pb-2 text-xs text-muted-foreground">Loading orders…</p>
          ) : (
            <ul
              className="space-y-1 px-2 pb-2"
              // Hide the empty list instead of leaving its padding behind.
              style={unifiedRows.length === 0 ? { display: "none" } : undefined}
            >
              {(ordersAll ? unifiedRows : unifiedRows.slice(0, ORDER_PAGE_SIZE)).map((row) => {
                if (row.kind === "amo") {
                  const { a, i } = row;
                  const key = `amo-${amoKeyOf(a, i)}`;
                  if (!row.active) {
                    const expanded = detailsKey === key;
                    const amoMeta = [a.validTill ? `till ${a.validTill}` : null, a.alertName]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={key} className="rounded-xl px-2 py-2 opacity-60">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                            className="min-w-0 flex-1 text-left"
                            title="Show order details"
                            aria-expanded={expanded}
                          >
                            <span className="text-sm">
                              <span className="font-bold text-muted-foreground">{a.side}</span>{" "}
                              <span className="num font-semibold">{a.quantity.toLocaleString("en-NP")}</span>{" "}
                              <span className="font-semibold">{a.scrip}</span>{" "}
                              <span className="num text-muted-foreground">
                                @ {a.price !== null ? a.price.toLocaleString("en-NP") : "-"}
                              </span>{" "}
                              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">
                                AMO
                              </span>
                            </span>
                            {amoMeta ? (
                              <span className="num mt-0.5 block text-[0.7rem] text-muted-foreground">{amoMeta}</span>
                            ) : null}
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                              aria-expanded={expanded}
                              aria-label={expanded ? "Hide order details" : "Show order details"}
                              title="Order details"
                              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setState((prev) => ({ ...prev, symbol: a.scrip }))}
                              aria-label={`Load ${a.scrip} on chart`}
                              title={`Load ${a.scrip} on chart`}
                              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <ChartCandlestick className="size-4" />
                            </button>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                              {a.status ?? "Disabled"}
                            </span>
                          </div>
                        </div>
                        {expanded ? (
                          <AmoOrderDetails
                            a={a}
                            onReuse={() =>
                              reuseOrder({
                                symbol: a.scrip,
                                side: a.side === "BUY" || a.side === "SELL" ? a.side : undefined,
                                price: a.price,
                                qty: Math.max(1, Math.floor(a.quantity)),
                              })
                            }
                          />
                        ) : null}
                      </li>
                    );
                  }
                  const armed = amoArmed === key;
                  const editingThis = amoEditKey === key;
                  const expanded = detailsKey === key;
                  const amoMeta = [a.validTill ? `till ${a.validTill}` : null, a.alertName].filter(Boolean).join(" · ");
                  return (
                    <li key={key} className="rounded-xl px-2 py-2 hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                          className="min-w-0 flex-1 text-left"
                          title="Show order details"
                          aria-expanded={expanded}
                        >
                          <span className="text-sm">
                            <span className={cn("font-bold", a.side === "BUY" ? "text-gain" : "text-destructive")}>
                              {a.side}
                            </span>{" "}
                            <span className="num font-semibold">{a.quantity.toLocaleString("en-NP")}</span>{" "}
                            <span className="font-semibold">{a.scrip}</span>{" "}
                            <span className="num text-muted-foreground">
                              @ {a.price !== null ? a.price.toLocaleString("en-NP") : "-"}
                            </span>{" "}
                            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">
                              AMO
                            </span>
                          </span>
                          {amoMeta ? (
                            <span className="num mt-0.5 block text-[0.7rem] text-muted-foreground">{amoMeta}</span>
                          ) : null}
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                            aria-expanded={expanded}
                            aria-label={expanded ? "Hide order details" : "Show order details"}
                            title="Order details"
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setState((prev) => ({ ...prev, symbol: a.scrip }))}
                            aria-label={`Load ${a.scrip} on chart`}
                            title={`Load ${a.scrip} on chart`}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChartCandlestick className="size-4" />
                          </button>
                          <div className="flex gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (editingThis) {
                                  setAmoEditKey(null);
                                } else {
                                  setAmoEditKey(key);
                                  setAqty(String(a.quantity));
                                  setAprice(a.price !== null ? String(a.price) : "");
                                  setAmoArmed(null);
                                }
                              }}
                            >
                              {editingThis ? "Close" : "Modify"}
                            </Button>
                            <Button
                              variant={armed ? "destructive" : "outline"}
                              size="sm"
                              disabled={cancelAmoQuick.isPending}
                              className="h-7 text-xs"
                              onClick={() => {
                                if (!armed) {
                                  setAmoArmed(key);
                                  setTimeout(() => setAmoArmed((cur) => (cur === key ? null : cur)), 4000);
                                  return;
                                }
                                cancelAmoQuick.mutate({
                                  alertName: a.alertName,
                                  scrip: a.scrip,
                                  price: a.price,
                                  triggerPrice: a.triggerPrice,
                                  quantity: a.quantity,
                                  side: a.side as "BUY" | "SELL",
                                  validTill: a.validTill,
                                });
                              }}
                            >
                              {armed ? "Tap again" : "Cancel"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      {expanded ? <AmoOrderDetails a={a} /> : null}
                      {editingThis ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                          <div className="space-y-1">
                            <Label htmlFor={`tamo-qty-${key}`} className="text-[0.68rem]">
                              Quantity
                            </Label>
                            <Input
                              id={`tamo-qty-${key}`}
                              inputMode="numeric"
                              value={aqty}
                              onChange={(e) => setAqty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`tamo-price-${key}`} className="text-[0.68rem]">
                              Price
                            </Label>
                            <Input
                              id={`tamo-price-${key}`}
                              inputMode="decimal"
                              value={aprice}
                              onChange={(e) => setAprice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <Button
                              size="sm"
                              disabled={replaceAmoQuick.isPending}
                              className="h-7 text-xs"
                              onClick={() => replaceAmoQuick.mutate()}
                            >
                              {replaceAmoQuick.isPending ? "Replacing…" : "Replace order"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                }
                const o = row.o;
                const key = `tms-${o.id || [o.symbol, o.side, o.price, o.quantity].join("-")}`;
                const armed = armedOrder === key;
                const modifying = modKey === key;
                const canonicalId = o.orderId || o.tranId || o.id;
                const cancellable = canActOnOrder(o);
                const isMktRow = o.orderType === "MKT" || o.orderType === "MARKET";
                // Dead orders look dead: dimmed row + status pill, same
                // language as disabled AMOs. Unknown-but-inactive statuses
                // dim as well (settled at the broker, vocab we don't know)
                // but never get a pill — never mislabeled.
                const terminalKind = orderOutcome(o.status, cancellable);
                const expanded = detailsKey === key;
                // Slim meta line: outcome lives in the pill, full detail behind the chevron.
                const slimMeta =
                  terminalKind === "filled"
                    ? `Filled ${(o.tradedQty ?? o.quantity).toLocaleString("en-NP")}${o.date ? ` · ${o.date}` : ""}`
                    : terminalKind
                      ? o.date
                      : `${o.orderType} · ${o.validity}${
                          o.tradedQty != null && o.tradedQty > 0
                            ? ` · filled ${o.tradedQty.toLocaleString("en-NP")}`
                            : ""
                        }`;
                return (
                  <li
                    key={key}
                    className={cn(
                      "rounded-xl px-2 py-2 transition-colors hover:bg-muted/40",
                      !isLiveStatus(o.status) && "opacity-60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                        className="min-w-0 flex-1 text-left"
                        title="Show order details"
                        aria-expanded={expanded}
                      >
                        <span className="text-sm">
                          <span className={cn("font-bold", o.side === "BUY" ? "text-gain" : "text-destructive")}>
                            {o.side}
                          </span>{" "}
                          <span className="num font-semibold">{o.quantity.toLocaleString("en-NP")}</span>{" "}
                          <span className="font-semibold">{o.symbol}</span>{" "}
                          <span className="num text-muted-foreground">
                            @ {o.price !== null ? o.price.toLocaleString("en-NP") : "MKT"}
                          </span>
                        </span>
                        {slimMeta ? (
                          <span className="num mt-0.5 block text-[0.7rem] text-muted-foreground">{slimMeta}</span>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailsKey((cur) => (cur === key ? null : key))}
                          aria-expanded={expanded}
                          aria-label={expanded ? "Hide order details" : "Show order details"}
                          title="Order details"
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setState((prev) => ({ ...prev, symbol: o.symbol }))}
                          aria-label={`Load ${o.symbol} on chart`}
                          title={`Load ${o.symbol} on chart`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ChartCandlestick className="size-4" />
                        </button>
                        {cancellable ? (
                          <div className="flex gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={cancelTodayOrder.isPending || modifyDay.isPending}
                              className="h-7 text-xs"
                              onClick={() => {
                                if (modifying) {
                                  setModKey(null);
                                } else {
                                  setModKey(key);
                                  setMqty(String(Math.max(1, Math.floor(o.remainingQty || o.quantity))));
                                  setMprice(o.price !== null ? String(o.price) : "");
                                  setArmedOrder(null);
                                }
                              }}
                            >
                              {modifying ? "Close" : "Modify"}
                            </Button>
                            <Button
                              variant={armed ? "destructive" : "outline"}
                              size="sm"
                              disabled={cancelTodayOrder.isPending || modifyDay.isPending}
                              className="h-7 shrink-0 text-xs"
                              onClick={() => {
                                if (!armed) {
                                  setArmedOrder(key);
                                  setTimeout(() => setArmedOrder((cur) => (cur === key ? null : cur)), 4000);
                                  return;
                                }
                                cancelTodayOrder.mutate({
                                  orderId: o.orderId || canonicalId,
                                  tranId: o.tranId || canonicalId,
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
                          </div>
                        ) : terminalKind ? (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
                              terminalKind === "rejected"
                                ? "bg-destructive/15 text-destructive"
                                : terminalKind === "filled"
                                  ? "bg-gain/15 text-gain"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {terminalKind === "rejected"
                              ? "Rejected"
                              : terminalKind === "cancelled"
                                ? "Cancelled"
                                : terminalKind === "filled"
                                  ? "Filled"
                                  : "Expired"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {expanded ? (
                      <TmsOrderDetails
                        o={o}
                        {...(terminalKind
                          ? {
                              onReuse: () =>
                                reuseOrder({
                                  symbol: o.symbol,
                                  side: o.side === "BUY" || o.side === "SELL" ? o.side : undefined,
                                  price: o.price,
                                  qty: Math.max(1, Math.floor(o.remainingQty || o.quantity)),
                                }),
                            }
                          : {})}
                      />
                    ) : null}
                    {modifying && cancellable && (o.side === "BUY" || o.side === "SELL") ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                        <div className="space-y-1">
                          <Label htmlFor={`tmod-qty-${key}`} className="text-[0.68rem]">
                            Qty (max {Math.floor(o.remainingQty || o.quantity)})
                          </Label>
                          <Input
                            id={`tmod-qty-${key}`}
                            inputMode="numeric"
                            value={mqty}
                            onChange={(e) => setMqty(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`tmod-price-${key}`} className="text-[0.68rem]">
                            Price
                          </Label>
                          <Input
                            id={`tmod-price-${key}`}
                            inputMode="decimal"
                            value={mprice}
                            disabled={isMktRow}
                            onChange={(e) => setMprice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <Button
                            size="sm"
                            disabled={modifyDay.isPending}
                            className="h-7 text-xs"
                            onClick={() => {
                              if (o.side !== "BUY" && o.side !== "SELL") return;
                              const qty = Math.floor(Number(mqty));
                              const px = Number(mprice);
                              modifyDay.mutate({
                                tranId: o.tranId || canonicalId,
                                orderId: o.orderId || canonicalId,
                                orderStatus: o.orderStatus || o.status,
                                remainingQty: o.remainingQty || o.quantity,
                                side: o.side,
                                symbol: o.symbol,
                                quantity: qty,
                                price: isMktRow ? 0 : px,
                                orderType: isMktRow ? "MKT" : "LMT",
                                validity: o.validity,
                              });
                            }}
                          >
                            {modifyDay.isPending ? "Modifying…" : "Confirm modify"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {unifiedRows.length > ORDER_PAGE_SIZE ? (
            <button
              type="button"
              onClick={() => setOrdersAll((v) => !v)}
              className="w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {ordersAll ? "Show less" : `Show all ${unifiedRows.length} orders`}
            </button>
          ) : null}
          {termAmos.isPending && unifiedRows.length > 0 ? (
            <p className="px-4 pb-2 text-xs text-muted-foreground">Loading AMO…</p>
          ) : null}
          {termAmos.isError ? (
            <p className="px-4 pb-2 text-xs text-destructive">
              {errorMessage(termAmos.error, "Could not load AMO orders.")}
            </p>
          ) : null}
          {!termAmos.isPending &&
          !termAmos.isError &&
          (termAmos.data ?? []).length === 0 &&
          (todayOrders.data ?? []).length > 0 ? (
            <p className="px-4 pb-2 text-xs text-muted-foreground">
              No AMO queued. Place one from the ticket while the market is closed.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "scrip" && !isIndex && position && costByScrip.get(state.symbol.toUpperCase()) && quote?.ltp ? (
        <PositionPnlCard
          symbol={state.symbol}
          units={position.units}
          avgCost={costByScrip.get(state.symbol.toUpperCase())!.rate}
          ltp={quote.ltp}
          waccStatus={
            investment.data?.scrips.find((s) => s.scrip.toUpperCase() === state.symbol.toUpperCase())?.status ??
            "pending"
          }
        />
      ) : null}

      <p className="text-xs text-muted-foreground">
        {mode === "portfolio"
          ? "Net worth is your current unit counts valued at each historical close; it does not reflect past buys and sells. Click any point to pin its per-stock prices below."
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

      <TmsReauthModal open={reauthOpen} onOpenChange={setReauthOpen} />
    </div>
  );
}
