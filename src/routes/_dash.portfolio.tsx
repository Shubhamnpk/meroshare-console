import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YoBrokerModal } from "@/components/brokers/yobroker-modal";
import { loadYoWallet } from "@/lib/yobroker/store";
import { marketSnapshotQuery } from "@/lib/queries";
import { Panel } from "@/components/ui/panel";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { CompactNpr, CompactQty } from "@/components/market/compact-value";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  PiggyBank,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { ExportButton, csvRow } from "@/components/export-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { HistoryPanel } from "@/components/portfolio/history-panel";
import { brokerConnectionsQuery, brokerHoldingsQuery, enrichedPortfolioQuery, investmentSummaryQuery, mfSchemesQuery, waccSearchQuery } from "@/lib/queries";
import type { BrokerId } from "@/lib/brokers/types";
import { useSettings } from "@/lib/settings";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { buyCost, sellProceeds, breakEvenPrice, daysBetween } from "@/lib/calc/fees";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { EnrichedHolding } from "@/lib/nepse/types";

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
      ogImage(),
    ],
    links: [canonicalLink("/portfolio")],
  }),
  component: PortfolioPage,
});

function portfolioCsv(
  holdings: EnrichedHolding[],
  totals: { value: number; valuePrev: number },
  costOf: (scrip: string) => { cost: number; waccRate: number } | undefined,
) {
  const rows = holdings.map((h, i) => {
    const c = costOf(h.scrip);
    const wacc = c?.waccRate ?? 0;
    const cost = c?.cost ?? 0;
    let pl = 0;
    let plPct = "";
    if (cost > 0 && wacc > 0) {
      const buy = buyCost(h.units, wacc);
      const net = sellProceeds({ units: h.units, price: h.ltp, avgCost: buy.perUnit, holdingDays: 400 });
      pl = net.profit;
      plPct = `${net.profitPercent.toFixed(2)}%`;
    } else if (cost > 0) {
      pl = h.value - cost;
      plPct = `${((pl / cost) * 100).toFixed(2)}%`;
    }
    return csvRow([
      i + 1,
      h.scrip,
      h.description,
      h.units,
      h.ltp,
      h.previousClose,
      h.value,
      h.previousValue,
      cost > 0 ? wacc : "",
      cost > 0 ? cost : "",
      cost > 0 ? pl : "",
      cost > 0 ? plPct : "",
      `${h.percentChange.toFixed(2)}%`,
      totals.value > 0 ? `${((h.value / totals.value) * 100).toFixed(2)}%` : "0.00%",
      h.sector ?? "",
    ]);
  });
  return [
    csvRow([
      "SN",
      "Scrip",
      "Description",
      "Units",
      "LTP",
      "Prev close",
      "Value (LTP)",
      "Value (prev close)",
      "Avg buy",
      "Cost",
      "Unrealized P/L",
      "P/L %",
      "Day change",
      "Weight",
      "Sector",
    ]),
    ...rows,
  ].join("\n");
}

function StatChip({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <p className="whitespace-nowrap text-[0.68rem] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`num whitespace-nowrap font-semibold ${valueClass ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}

/** Single-row chip rail: never wraps, scrolls horizontally when squeezed. */
function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

type SortKey =
  | "scrip"
  | "units"
  | "ltp"
  | "previousClose"
  | "value"
  | "avgBuy"
  | "unrealized"
  | "percentChange"
  | "weight";

function PortfolioPage() {
  const { compactNumbers, autoRefresh, refreshMinutes } = useSettings();
  const q = useQuery({
    ...enrichedPortfolioQuery(),
    refetchInterval: autoRefresh ? refreshMinutes * 60_000 : false,
  });
  const investment = useQuery(investmentSummaryQuery());
  const market = useQuery(marketSnapshotQuery());
  const schemesQ = useQuery(mfSchemesQuery());
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [yoOpen, setYoOpen] = useState(false);
  const [yoVersion, setYoVersion] = useState(0);
  const [view, setView] = useState<"actual" | "yobroker" | "broker">("actual");
  useEffect(() => {
    const onChange = () => setYoVersion((v) => v + 1);
    window.addEventListener("yobroker:change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("yobroker:change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  void yoVersion;
  const yoData = (() => {
    try {
      return loadYoWallet(null);
    } catch {
      return {
        active: false,
        cash: 0,
        holdings: [],
        orders: [],
        trades: [],
        seq: 1,
        createdAt: "",
      } as ReturnType<typeof loadYoWallet>;
    }
  })();
  const yoActive = yoData.active;
  const connections = useQuery(brokerConnectionsQuery());
  const realBrokerId = (connections.data?.find((c) => c.brokerId !== "yobroker")?.brokerId ??
    null) as BrokerId | null;
  const brokerHoldings = useQuery({
    ...brokerHoldingsQuery(realBrokerId),
    enabled: Boolean(realBrokerId) && view === "broker",
  });
  const { sort, toggle } = useSort<SortKey>(
    { key: "value", dir: "desc" },
    {
      scrip: "text",
      units: "number",
      ltp: "number",
      previousClose: "number",
      value: "number",
      avgBuy: "number",
      unrealized: "number",
      percentChange: "number",
      weight: "number",
    },
  );

  const holdings = q.data?.holdings ?? [];
  const totals = {
    units: q.data?.totalUnits ?? 0,
    value: q.data?.totalValue ?? 0,
    valuePrev: q.data?.totalPreviousValue ?? 0,
    dayChange: q.data?.dayChange ?? 0,
    dayPct: q.data?.dayChangePercent ?? 0,
  };

  const totalInvestment = investment.data?.totalInvestment ?? 0;
  const pendingCount = investment.data?.pendingCount ?? 0;

  const costMap = useMemo(
    () => new Map((investment.data?.scrips ?? []).map((s) => [s.scrip, s] as const)),
    [investment.data],
  );
  const isOpenEnd = (scrip: string) =>
    schemesQ.data?.some((s) => s.symbol.toUpperCase() === scrip.toUpperCase() && s.fundType === "open_end") ?? false;

  const costOf = (scrip: string) => costMap.get(scrip);
  // Real pocket P/L: buy-side commission amortized + sell charges + CGT — open-end MF has no charges
  const plOf = (h: EnrichedHolding) => {
    const c = costMap.get(h.scrip);
    if (!c || c.cost <= 0 || c.waccRate <= 0) return 0;
    const open = isOpenEnd(h.scrip);
    const buy = buyCost(h.units, c.waccRate, { isOpenEnd: open });
    const net = sellProceeds({ units: h.units, price: h.ltp, avgCost: buy.perUnit, holdingDays: 400, isOpenEnd: open });
    return net.profit;
  };
  const buyOf = (h: EnrichedHolding) => {
    const c = costMap.get(h.scrip);
    if (!c || c.waccRate <= 0) return null;
    return buyCost(h.units, c.waccRate, { isOpenEnd: isOpenEnd(c.scrip) });
  };

  // Totals for footer: all-in cost and net receivable
  const totalBuyCost = useMemo(() => {
    let sum = 0;
    for (const h of holdings) {
      const b = buyOf(h);
      if (b) sum += b.total;
      else {
        const c = costMap.get(h.scrip);
        if (c) sum += c.cost;
      }
    }
    return sum;
  }, [holdings, costMap, schemesQ.data]);
  const totalNetReceivable = useMemo(() => {
    let sum = 0;
    for (const h of holdings) {
      const c = costMap.get(h.scrip);
      if (!c || c.waccRate <= 0) {
        sum += h.value;
        continue;
      }
      const open = isOpenEnd(h.scrip);
      const buy = buyCost(h.units, c.waccRate, { isOpenEnd: open });
      const net = sellProceeds({ units: h.units, price: h.ltp, avgCost: buy.perUnit, holdingDays: 400, isOpenEnd: open });
      sum += net.netReceivable;
    }
    return sum;
  }, [holdings, costMap, schemesQ.data]);
  const unrealizedPL = totalNetReceivable - totalBuyCost;
  const allInAvgWacc = holdings.length > 0 && totalBuyCost > 0 ? totalBuyCost / totals.units : investment.data?.avgWacc ?? 0;

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? holdings.filter((h) =>
          [h.scrip, h.description, h.name].some((s) => s.toLowerCase().includes(term)),
        )
      : holdings;
    const weightOf = (h: EnrichedHolding) => (totals.value > 0 ? h.value / totals.value : 0);
    const getter = (h: EnrichedHolding): string | number => {
      switch (sort.key) {
        case "scrip":
          return h.scrip;
        case "units":
          return h.units;
        case "ltp":
          return h.ltp;
        case "previousClose":
          return h.previousClose;
        case "value":
          return h.value;
        case "avgBuy":
          return costMap.get(h.scrip)?.waccRate ?? 0;
        case "unrealized":
          return plOf(h);
        case "percentChange":
          return h.dayChange;
        case "weight":
          return weightOf(h);
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [holdings, search, sort, totals.value, costMap]);

  const liveCount = q.data?.liveCount ?? 0;

  const priceMap = useMemo(
    () => new Map((market.data?.prices ?? []).map((p) => [p.symbol, p] as const)),
    [market.data],
  );
  const yoEnriched = useMemo(() => {
    if (!yoActive) return null;
    const holdingsYo = yoData.holdings.map((h) => {
      const live = priceMap.get(h.symbol);
      const ltp = live?.ltp ?? h.avgCost;
      const prev = live?.previousClose ?? h.avgCost;
      const value = h.qty * ltp;
      const prevValue = h.qty * prev;
      return {
        scrip: h.symbol,
        description: live?.name ?? h.symbol,
        units: h.qty,
        ltp,
        previousClose: prev,
        change: ltp - prev,
        percentChange: prev > 0 ? ((ltp - prev) / prev) * 100 : 0,
        value,
        previousValue: prevValue,
        dayChange: value - prevValue,
        avgCost: h.avgCost,
      } as EnrichedHolding & { avgCost: number };
    });
    const totalValue = holdingsYo.reduce((s, h) => s + h.value, 0);
    const totalPrev = holdingsYo.reduce((s, h) => s + h.previousValue, 0);
    return {
      holdings: holdingsYo,
      totalValue,
      totalPrev,
      dayChange: totalValue - totalPrev,
      dayPct: totalPrev > 0 ? ((totalValue - totalPrev) / totalPrev) * 100 : 0,
      totalUnits: holdingsYo.reduce((s, h) => s + h.units, 0),
    };
  }, [yoActive, yoData.holdings, priceMap]);

  const yoItems = useMemo(() => {
    if (!yoEnriched) return [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? yoEnriched.holdings.filter((h) =>
          [h.scrip, h.description].some((s) => s.toLowerCase().includes(term)),
        )
      : yoEnriched.holdings;
    const weightOf = (h: (typeof yoEnriched.holdings)[number]) =>
      yoEnriched.totalValue > 0 ? h.value / yoEnriched.totalValue : 0;
    const getter = (h: (typeof yoEnriched.holdings)[number]): string | number => {
      switch (sort.key) {
        case "scrip":
          return h.scrip;
        case "units":
          return h.units;
        case "ltp":
          return h.ltp;
        case "previousClose":
          return h.previousClose;
        case "value":
          return h.value;
        case "avgBuy":
          return (h as unknown as { avgCost: number }).avgCost ?? 0;
        case "unrealized":
          return h.value - h.units * ((h as unknown as { avgCost: number }).avgCost ?? 0);
        case "percentChange":
          return h.dayChange;
        case "weight":
          return weightOf(h);
        default:
          return "";
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [yoEnriched, search, sort]);

  // Real broker (NaasaX) holdings enriched with live prices, same row shape as
  // the Yo view so the table, sorting and history panel can be shared. Avg buy
  // comes from your WACC data when available.
  const brokerEnriched = useMemo(() => {
    if (!realBrokerId || !brokerHoldings.data) return null;
    const rows = brokerHoldings.data.map((h) => {
      const live = priceMap.get(h.symbol);
      const ltp = live?.ltp ?? h.closePrice ?? 0;
      const prev = live?.previousClose ?? h.closePrice ?? 0;
      const value = h.availableQty * ltp;
      const prevValue = h.availableQty * prev;
      const avgBuy = costMap.get(h.symbol)?.waccRate ?? 0;
      return {
        scrip: h.symbol,
        description: live?.name ?? h.symbol,
        units: h.availableQty,
        ltp,
        previousClose: prev,
        change: ltp - prev,
        percentChange: prev > 0 ? ((ltp - prev) / prev) * 100 : 0,
        value,
        previousValue: prevValue,
        dayChange: value - prevValue,
        avgBuy,
        sector: null as string | null,
      };
    });
    const totalValue = rows.reduce((s, h) => s + h.value, 0);
    const totalPrev = rows.reduce((s, h) => s + h.previousValue, 0);
    return {
      holdings: rows,
      totalValue,
      totalPrev,
      dayChange: totalValue - totalPrev,
      dayPct: totalPrev > 0 ? ((totalValue - totalPrev) / totalPrev) * 100 : 0,
      totalUnits: rows.reduce((s, h) => s + h.units, 0),
    };
  }, [realBrokerId, brokerHoldings.data, priceMap, costMap]);

  const brokerItems = useMemo(() => {
    if (!brokerEnriched) return [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? brokerEnriched.holdings.filter((h) =>
          [h.scrip, h.description].some((s) => s.toLowerCase().includes(term)),
        )
      : brokerEnriched.holdings;
    const weightOf = (h: (typeof brokerEnriched.holdings)[number]) =>
      brokerEnriched.totalValue > 0 ? h.value / brokerEnriched.totalValue : 0;
    const getter = (h: (typeof brokerEnriched.holdings)[number]): string | number => {
      switch (sort.key) {
        case "scrip":
          return h.scrip;
        case "units":
          return h.units;
        case "ltp":
          return h.ltp;
        case "previousClose":
          return h.previousClose;
        case "value":
          return h.value;
        case "avgBuy":
          return h.avgBuy;
        case "unrealized":
          return h.avgBuy > 0 ? h.value - h.units * h.avgBuy : h.value;
        case "percentChange":
          return h.dayChange;
        case "weight":
          return weightOf(h);
        default:
          return "";
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [brokerEnriched, search, sort]);

  // Cost basis + export source follow the active view so Broker exports broker rows.
  const brokerExportCostOf = (scrip: string) => {
    const h = brokerEnriched?.holdings.find((x) => x.scrip === scrip);
    if (!h || h.avgBuy <= 0) return undefined;
    return { cost: h.units * h.avgBuy, waccRate: h.avgBuy };
  };
  const expIsBroker = view === "broker";
  const expItems = (
    expIsBroker ? (brokerEnriched ? brokerItems : []) : items
  ) as unknown as EnrichedHolding[];
  const expTotals = expIsBroker
    ? {
        value: brokerEnriched?.totalValue ?? 0,
        valuePrev: brokerEnriched?.totalPrev ?? 0,
      }
    : totals;
  const expCostOf = expIsBroker ? brokerExportCostOf : costOf;
  const expFilename = expIsBroker ? "broker-portfolio" : "portfolio";

  // auto-switch to Yo Broker view when activated first time
  useEffect(() => {
    if (yoActive && view === "actual" && yoData.holdings.length > 0) {
      // keep actual as default, don't auto-switch
    }
  }, [yoActive, yoData.holdings.length, view]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Portfolio</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            {view === "yobroker" && yoEnriched
              ? `${yoEnriched.holdings.length} scrip${yoEnriched.holdings.length === 1 ? "" : "s"} · virtual Yo Broker portfolio. Click any scrip for detail.`
              : view === "broker" && brokerEnriched
                ? `${brokerEnriched.holdings.length} scrip${brokerEnriched.holdings.length === 1 ? "" : "s"} · live ${realBrokerId === "naasa-x" ? "Naasa X" : realBrokerId} broker holdings. Click any scrip for detail.`
                : `${holdings.length} scrip${holdings.length === 1 ? "" : "s"} · ${liveCount} valued at live NEPSE prices. Click any scrip for its full detail.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            disabled={expItems.length === 0}
            formats={[
              {
                title: "CSV",
                description: "Spreadsheet-friendly rows of every holding",
                filename: expFilename,
                extension: "csv",
                build: () => portfolioCsv(expItems, expTotals, expCostOf),
              },
              {
                title: "JSON",
                description: "Raw holdings with live prices and sector data",
                filename: expFilename,
                extension: "json",
                build: () => JSON.stringify({ holdings: expItems, totals: expTotals }, null, 2),
              },
              {
                title: "PDF",
                description: "Formatted holdings table for printing or sharing",
                filename: expFilename,
                extension: "pdf",
                build: () => "",
                pdf: () => ({
                  title: expIsBroker ? "Broker holdings at live prices" : "Portfolio holdings at live prices",
                  head: [
                    "SN",
                    "Scrip",
                    "Description",
                    "Units",
                    "LTP",
                    "Value",
                    "Avg buy",
                    "P/L",
                    "Day %",
                  ],
                  body: expItems.map((h, i) => {
                    const c = expCostOf(h.scrip);
                    const pl = c && c.cost > 0 ? h.value - c.cost : null;
                    return [
                      i + 1,
                      h.scrip,
                      h.description,
                      formatQty(h.units),
                      h.ltp.toFixed(2),
                      h.value.toFixed(2),
                      c && c.waccRate > 0 ? c.waccRate.toFixed(2) : "-",
                      pl == null ? "-" : `${pl >= 0 ? "+" : ""}${pl.toFixed(2)}`,
                      `${h.percentChange >= 0 ? "+" : ""}${h.percentChange.toFixed(2)}%`,
                    ];
                  }),
                  foot: expIsBroker
                    ? [
                        "",
                        "Total",
                        `${brokerEnriched?.holdings.length ?? 0} scrips · live broker prices`,
                        formatQty(brokerEnriched?.totalUnits ?? 0),
                        "",
                        (brokerEnriched?.totalValue ?? 0).toFixed(2),
                        "-",
                        "-",
                        `${(brokerEnriched?.dayPct ?? 0) >= 0 ? "+" : ""}${(brokerEnriched?.dayPct ?? 0).toFixed(2)}%`,
                      ]
                    : [
                        "",
                        "Total",
                        `${holdings.length} scrips · ${liveCount} at live prices`,
                        formatQty(totals.units),
                        "",
                        totals.value.toFixed(2),
                        investment.data && investment.data.avgWacc > 0
                          ? investment.data.avgWacc.toFixed(2)
                          : "-",
                        totalInvestment > 0
                          ? `${unrealizedPL >= 0 ? "+" : ""}${unrealizedPL.toFixed(2)}`
                          : "-",
                        `${totals.dayPct >= 0 ? "+" : ""}${totals.dayPct.toFixed(2)}%`,
                      ],
                }),
              },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void q.refetch();
              void investment.refetch();
              if (view === "broker") void brokerHoldings.refetch();
            }}
            disabled={q.isFetching || investment.isFetching}
            className="gap-1.5"
            aria-label="Refresh portfolio"
          >
            <RefreshCw
              className={`size-3.5 ${q.isFetching || investment.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
      </div>

      {yoActive || realBrokerId ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border/70 bg-card p-1">
            {(
              [
                { id: "actual", label: "Actual", show: true },
                { id: "yobroker", label: "Yo Broker", show: yoActive },
                { id: "broker", label: "Broker", show: Boolean(realBrokerId) },
              ] as const
            )
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setView(t.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    view === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {view === "yobroker"
              ? `Virtual ${formatNpr(yoData.cash)} cash · ${yoEnriched?.holdings.length ?? 0} holdings`
              : view === "broker"
                ? `Live ${realBrokerId === "naasa-x" ? "Naasa X" : realBrokerId} holdings`
                : "Real demat holdings"}
          </span>
        </div>
      ) : null}

      {q.data?.marketStale ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          The market feed is temporarily unreachable. Prices shown are MeroShare's own, which may
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

      {view === "yobroker" && yoEnriched ? (
        <ChipRow>
          <StatChip
            icon={<Coins className="size-4" />}
            label="Yo scrips"
            value={String(yoEnriched.holdings.length)}
          />
          <StatChip
            icon={<Wallet className="size-4" />}
            label="Yo units"
            value={<CompactQty value={yoEnriched.totalUnits} compact={compactNumbers} />}
          />
          <StatChip
            icon={
              yoEnriched.dayChange > 0 ? (
                <TrendingUp className="size-4 text-gain" />
              ) : yoEnriched.dayChange < 0 ? (
                <TrendingDown className="size-4 text-loss" />
              ) : (
                <TrendingUp className="size-4" />
              )
            }
            label="Yo market value"
            value={formatNpr(yoEnriched.totalValue, { compact: compactNumbers })}
            valueClass={
              yoEnriched.dayChange > 0 ? "text-gain" : yoEnriched.dayChange < 0 ? "text-loss" : ""
            }
          />
          <StatChip
            icon={<Wallet className="size-4" />}
            label="Virtual cash"
            value={formatNpr(yoData.cash, { compact: compactNumbers })}
          />
          <StatChip
            icon={
              yoEnriched.dayChange > 0 ? (
                <TrendingUp className="size-4 text-gain" />
              ) : yoEnriched.dayChange < 0 ? (
                <TrendingDown className="size-4 text-loss" />
              ) : (
                <TrendingUp className="size-4" />
              )
            }
            label="Yo day change"
            value={
              <>
                {yoEnriched.dayChange > 0 ? "+" : yoEnriched.dayChange < 0 ? "-" : ""}
                <CompactNpr value={Math.abs(yoEnriched.dayChange)} compact={compactNumbers} /> ({yoEnriched.dayPct.toFixed(2)}%)
              </>
            }
            valueClass={
              yoEnriched.dayChange > 0 ? "text-gain" : yoEnriched.dayChange < 0 ? "text-loss" : ""
            }
          />
          <StatChip
            icon={<PiggyBank className="size-4" />}
            label="Yo total"
            value={formatNpr(yoEnriched.totalValue + yoData.cash, { compact: compactNumbers })}
          />
        </ChipRow>
      ) : view === "broker" ? (
        !realBrokerId ? (
          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              No broker connected. Link your Naasa X terminal to see live broker holdings here.
            </p>
            <Button size="sm" asChild>
              <Link to="/settings" search={{ tab: "advanced" }}>
                Connect broker
              </Link>
            </Button>
          </Panel>
        ) : brokerHoldings.isPending ? (
          <LoadingBlock label="Loading broker holdings" rows={1} />
        ) : brokerHoldings.isError || !brokerEnriched ? (
          <ErrorBlock
            error={brokerHoldings.error}
            retry={() => void brokerHoldings.refetch()}
          />
        ) : (
          <ChipRow>
            <StatChip
              icon={<Coins className="size-4" />}
              label="Broker scrips"
              value={String(brokerEnriched.holdings.length)}
            />
            <StatChip
              icon={<Wallet className="size-4" />}
              label="Broker units"
              value={<CompactQty value={brokerEnriched.totalUnits} compact={compactNumbers} />}
            />
            <StatChip
              icon={
                brokerEnriched.dayChange > 0 ? (
                  <TrendingUp className="size-4 text-gain" />
                ) : brokerEnriched.dayChange < 0 ? (
                  <TrendingDown className="size-4 text-loss" />
                ) : (
                  <TrendingUp className="size-4" />
                )
              }
              label="Broker value"
              value={formatNpr(brokerEnriched.totalValue, { compact: compactNumbers })}
              valueClass={
                brokerEnriched.dayChange > 0
                  ? "text-gain"
                  : brokerEnriched.dayChange < 0
                    ? "text-loss"
                    : ""
              }
            />
            <StatChip
              icon={
                brokerEnriched.dayChange > 0 ? (
                  <TrendingUp className="size-4 text-gain" />
                ) : brokerEnriched.dayChange < 0 ? (
                  <TrendingDown className="size-4 text-loss" />
                ) : (
                  <TrendingUp className="size-4" />
                )
              }
              label="Broker day change"
              value={
                <>
                  {brokerEnriched.dayChange > 0 ? "+" : brokerEnriched.dayChange < 0 ? "-" : ""}
                  <CompactNpr value={Math.abs(brokerEnriched.dayChange)} compact={compactNumbers} /> ({brokerEnriched.dayPct.toFixed(2)}%)
                </>
              }
              valueClass={
                brokerEnriched.dayChange > 0
                  ? "text-gain"
                  : brokerEnriched.dayChange < 0
                    ? "text-loss"
                    : ""
              }
            />
          </ChipRow>
        )
      ) : (
        <ChipRow>
          <StatChip
            icon={<Coins className="size-4" />}
            label="Scrips held"
            value={String(holdings.length)}
          />
          <StatChip
            icon={<Wallet className="size-4" />}
            label="Total units"
            value={<CompactQty value={totals.units} compact={compactNumbers} />}
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
            valueClass={
              totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""
            }
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
            value={
              <>
                {totals.dayChange > 0 ? "+" : totals.dayChange < 0 ? "-" : ""}
                <CompactNpr value={Math.abs(totals.dayChange)} compact={compactNumbers} /> ({totals.dayPct.toFixed(2)}%)
              </>
            }
            valueClass={
              totals.dayChange > 0 ? "text-gain" : totals.dayChange < 0 ? "text-loss" : ""
            }
          />
          <StatChip
            icon={<PiggyBank className="size-4" />}
            label={pendingCount > 0 ? `Investment` : "Total investment"}
            value={
              investment.isLoading ? "…" : formatNpr(totalBuyCost, { compact: compactNumbers })
            }
          />
          {totalBuyCost > 0 ? (
            <StatChip
              icon={
                unrealizedPL >= 0 ? (
                  <TrendingUp className="size-4 text-gain" />
                ) : (
                  <TrendingDown className="size-4 text-loss" />
                )
              }
              label="Return"
              value={`${unrealizedPL >= 0 ? "+" : ""}${formatNpr(unrealizedPL, { compact: compactNumbers })} (${((unrealizedPL / totalBuyCost) * 100).toFixed(2)}%)`}
              valueClass={unrealizedPL >= 0 ? "text-gain" : "text-loss"}
            />
          ) : null}
        </ChipRow>
      )}

      {view === "yobroker" && yoEnriched ? (
        yoEnriched.holdings.length === 0 ? (
          <EmptyBlock
            title="No Yo holdings"
            description="Buy virtual scrips with Yo Broker to see them here. Use the Terminal or Market to place paper orders."
          />
        ) : yoItems.length === 0 ? (
          <EmptyBlock title="No matches" description="Nothing matches your search." />
        ) : (
          <Panel padding="none" className="overflow-hidden">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">SN</TableHead>
                  <SortableTh
                    label="Scrip"
                    active={sort.key === "scrip"}
                    dir={sort.dir}
                    onClick={() => toggle("scrip")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Units"
                    active={sort.key === "units"}
                    dir={sort.dir}
                    onClick={() => toggle("units")}
                    align="right"
                  />
                  <SortableTh
                    label="LTP"
                    active={sort.key === "ltp"}
                    dir={sort.dir}
                    onClick={() => toggle("ltp")}
                    align="right"
                  />
                  <SortableTh
                    label="Prev close"
                    active={sort.key === "previousClose"}
                    dir={sort.dir}
                    onClick={() => toggle("previousClose")}
                    align="right"
                  />
                  <SortableTh
                    label="Value"
                    active={sort.key === "value"}
                    dir={sort.dir}
                    onClick={() => toggle("value")}
                    align="right"
                  />
                  <SortableTh
                    label="Avg cost"
                    active={sort.key === "avgBuy"}
                    dir={sort.dir}
                    onClick={() => toggle("avgBuy")}
                    align="right"
                  />
                  <SortableTh
                    label="Net P/L"
                    active={sort.key === "unrealized"}
                    dir={sort.dir}
                    onClick={() => toggle("unrealized")}
                    align="right"
                  />
                  <SortableTh
                    label="Day"
                    active={sort.key === "percentChange"}
                    dir={sort.dir}
                    onClick={() => toggle("percentChange")}
                    align="right"
                  />
                  <SortableTh
                    label="Weight"
                    active={sort.key === "weight"}
                    dir={sort.dir}
                    onClick={() => toggle("weight")}
                    align="right"
                    className="pr-4"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {yoItems.map((h, idx) => {
                  const weight =
                    yoEnriched.totalValue > 0 ? (h.value / yoEnriched.totalValue) * 100 : 0;
                  const avg = (h as unknown as { avgCost: number }).avgCost ?? 0;
                  const pl = h.value - h.units * avg;
                  const plPct = avg > 0 ? (pl / (h.units * avg)) * 100 : 0;
                  return (
                    <TableRow
                      key={`${h.scrip}-${idx}`}
                      className="cursor-pointer"
                      onClick={() => setPicked(h.scrip)}
                    >
                      <TableCell className="pl-4 text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold hover:text-primary">{h.scrip}</p>
                        <p className="max-w-52 truncate text-xs text-muted-foreground">
                          {h.description}
                        </p>
                      </TableCell>
                      <TableCell className="num text-right">{formatQty(h.units)}</TableCell>
                      <TableCell className="text-right">
                        <span className="num font-medium">{formatNpr(h.ltp)}</span>
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">
                        {h.previousClose > 0 ? formatNpr(h.previousClose) : "-"}
                      </TableCell>
                      <TableCell className="num text-right font-medium">
                        {formatNpr(h.value)}
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">
                        {formatNpr(avg)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaPill
                          value={pl}
                        >{`${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} (${plPct.toFixed(1)}%)`}</DeltaPill>
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaPill
                          value={h.percentChange}
                        >{`${h.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(h.dayChange))} (${h.percentChange.toFixed(2)}%)`}</DeltaPill>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-xs text-muted-foreground">
                            {weight.toFixed(1)}%
                          </span>
                          <div
                            className="h-1 w-14 overflow-hidden rounded-full bg-muted"
                            aria-hidden
                          >
                            <div
                              className="h-full rounded-full bg-violet-500/60"
                              style={{ width: `${Math.min(100, weight)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        )
      ) : view === "broker" ? (
        !realBrokerId ? (
          <EmptyBlock
            title="No broker connected"
            description="Link your Naasa X terminal in Settings → Advanced to see live broker holdings here."
          />
        ) : brokerHoldings.isPending ? (
          <LoadingBlock label="Loading broker holdings" />
        ) : brokerHoldings.isError || !brokerEnriched ? (
          <ErrorBlock error={brokerHoldings.error} retry={() => void brokerHoldings.refetch()} />
        ) : brokerEnriched.holdings.length === 0 ? (
          <EmptyBlock
            title="No broker holdings"
            description="Your connected broker account currently holds no scrips."
          />
        ) : brokerItems.length === 0 ? (
          <EmptyBlock title="No matches" description="Nothing matches your search." />
        ) : (
          <Panel padding="none" className="overflow-hidden">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">SN</TableHead>
                  <SortableTh
                    label="Scrip"
                    active={sort.key === "scrip"}
                    dir={sort.dir}
                    onClick={() => toggle("scrip")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Units"
                    active={sort.key === "units"}
                    dir={sort.dir}
                    onClick={() => toggle("units")}
                    align="right"
                  />
                  <SortableTh
                    label="LTP"
                    active={sort.key === "ltp"}
                    dir={sort.dir}
                    onClick={() => toggle("ltp")}
                    align="right"
                  />
                  <SortableTh
                    label="Prev close"
                    active={sort.key === "previousClose"}
                    dir={sort.dir}
                    onClick={() => toggle("previousClose")}
                    align="right"
                  />
                  <SortableTh
                    label="Value"
                    active={sort.key === "value"}
                    dir={sort.dir}
                    onClick={() => toggle("value")}
                    align="right"
                  />
                  <SortableTh
                    label="Avg buy"
                    active={sort.key === "avgBuy"}
                    dir={sort.dir}
                    onClick={() => toggle("avgBuy")}
                    align="right"
                  />
                  <SortableTh
                    label="Net P/L"
                    active={sort.key === "unrealized"}
                    dir={sort.dir}
                    onClick={() => toggle("unrealized")}
                    align="right"
                  />
                  <SortableTh
                    label="Day"
                    active={sort.key === "percentChange"}
                    dir={sort.dir}
                    onClick={() => toggle("percentChange")}
                    align="right"
                  />
                  <SortableTh
                    label="Weight"
                    active={sort.key === "weight"}
                    dir={sort.dir}
                    onClick={() => toggle("weight")}
                    align="right"
                    className="pr-4"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokerItems.map((h, idx) => {
                  const weight =
                    brokerEnriched.totalValue > 0 ? (h.value / brokerEnriched.totalValue) * 100 : 0;
                  const hasBasis = h.avgBuy > 0;
                  const pl = hasBasis ? h.value - h.units * h.avgBuy : 0;
                  const plPct = hasBasis && h.units * h.avgBuy > 0 ? (pl / (h.units * h.avgBuy)) * 100 : 0;
                  return (
                    <TableRow
                      key={`${h.scrip}-${idx}`}
                      className="cursor-pointer"
                      onClick={() => setPicked(h.scrip)}
                    >
                      <TableCell className="pl-4 text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold hover:text-primary">{h.scrip}</p>
                        <p className="max-w-52 truncate text-xs text-muted-foreground">
                          {h.description}
                        </p>
                      </TableCell>
                      <TableCell className="num text-right">{formatQty(h.units)}</TableCell>
                      <TableCell className="text-right">
                        <span className="num font-medium">{formatNpr(h.ltp)}</span>
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">
                        {h.previousClose > 0 ? formatNpr(h.previousClose) : "-"}
                      </TableCell>
                      <TableCell className="num text-right font-medium">
                        {formatNpr(h.value)}
                      </TableCell>
                      <TableCell
                        className="num text-right text-muted-foreground"
                        title={hasBasis ? "WACC avg buy" : "No WACC cost data for this scrip"}
                      >
                        {hasBasis ? formatNpr(h.avgBuy) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasBasis ? (
                          <DeltaPill
                            value={pl}
                          >{`${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} (${plPct.toFixed(1)}%)`}</DeltaPill>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeltaPill
                          value={h.percentChange}
                        >{`${h.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(h.dayChange))} (${h.percentChange.toFixed(2)}%)`}</DeltaPill>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-xs text-muted-foreground">
                            {weight.toFixed(1)}%
                          </span>
                          <div
                            className="h-1 w-14 overflow-hidden rounded-full bg-muted"
                            aria-hidden
                          >
                            <div
                              className="h-full rounded-full bg-emerald-500/60"
                              style={{ width: `${Math.min(100, weight)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {brokerItems.length !== brokerEnriched.holdings.length ? (
              <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                Showing {brokerItems.length} of {brokerEnriched.holdings.length} scrips · filtered
                value {formatNpr(brokerItems.reduce((s, h) => s + h.value, 0))}
              </p>
            ) : null}
          </Panel>
        )
      ) : q.isLoading ? (
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
        <Panel padding="none" className="overflow-hidden">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <SortableTh
                  label="Scrip"
                  active={sort.key === "scrip"}
                  dir={sort.dir}
                  onClick={() => toggle("scrip")}
                  align="left"
                  kind="text"
                />
                <SortableTh
                  label="Units"
                  active={sort.key === "units"}
                  dir={sort.dir}
                  onClick={() => toggle("units")}
                  align="right"
                />
                <SortableTh
                  label="LTP"
                  active={sort.key === "ltp"}
                  dir={sort.dir}
                  onClick={() => toggle("ltp")}
                  align="right"
                />
                <SortableTh
                  label="Prev close"
                  active={sort.key === "previousClose"}
                  dir={sort.dir}
                  onClick={() => toggle("previousClose")}
                  align="right"
                />
                <SortableTh
                  label="Value"
                  active={sort.key === "value"}
                  dir={sort.dir}
                  onClick={() => toggle("value")}
                  align="right"
                />
                <SortableTh
                  label="Avg buy"
                  active={sort.key === "avgBuy"}
                  dir={sort.dir}
                  onClick={() => toggle("avgBuy")}
                  align="right"
                />
                <SortableTh
                  label="Net P/L"
                  active={sort.key === "unrealized"}
                  dir={sort.dir}
                  onClick={() => toggle("unrealized")}
                  align="right"
                />
                <SortableTh
                  label="Day"
                  active={sort.key === "percentChange"}
                  dir={sort.dir}
                  onClick={() => toggle("percentChange")}
                  align="right"
                />
                <SortableTh
                  label="Weight"
                  active={sort.key === "weight"}
                  dir={sort.dir}
                  onClick={() => toggle("weight")}
                  align="right"
                  className="pr-4"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((h, idx) => {
                const weight = totals.value > 0 ? (h.value / totals.value) * 100 : 0;
                const basis = costOf(h.scrip);
                const hasBasis = Boolean(basis && basis.cost > 0 && basis.waccRate > 0);
                const open = isOpenEnd(h.scrip);
                const buy = hasBasis ? buyCost(h.units, basis!.waccRate, { isOpenEnd: open }) : null;
                const net = hasBasis && buy ? sellProceeds({ units: h.units, price: h.ltp, avgCost: buy.perUnit, holdingDays: 400, isOpenEnd: open }) : null;
                const pl = net ? net.profit : hasBasis ? h.value - (basis?.cost ?? 0) : 0;
                const plPct = net ? net.profitPercent : hasBasis && (basis?.cost ?? 0) > 0 ? (pl / (basis?.cost ?? 1)) * 100 : 0;
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
                      {h.previousClose > 0 ? formatNpr(h.previousClose) : "-"}
                    </TableCell>
                    <TableCell className="num text-right font-medium">
                      {formatNpr(h.value)}
                    </TableCell>
                    <TableCell
                      className="num text-right text-muted-foreground"
                      title={
                        hasBasis
                          ? basis?.status === "pending"
                            ? "Estimated from purchase price (WACC not confirmed yet)"
                            : "CDSC-calculated WACC — hover for all-in"
                          : "No cost data (blocked or not available)"
                      }
                    >
                      {hasBasis && (basis?.waccRate ?? 0) > 0 ? (
                        (() => {
                          const buy = buyCost(h.units, basis!.waccRate);
                          return (
                            <span title={`All-in ${formatNpr(buy.perUnit)} incl. broker+SEBON+DP`}>
                              {basis?.status === "pending" ? "~" : ""}
                              {formatNpr(basis?.waccRate ?? 0)}
                            </span>
                          );
                        })()
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      title={
                        hasBasis
                          ? `Net after all charges & CGT · Breakeven ${formatNpr(breakEvenPrice(h.units, buyCost(h.units, basis!.waccRate).perUnit, 400))}`
                          : undefined
                      }
                    >
                      {hasBasis ? (
                        <DeltaPill value={pl}>
                          {`${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} (${plPct.toFixed(1)}%)`}
                        </DeltaPill>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeltaPill value={h.percentChange}>
                        {`${h.dayChange >= 0 ? "+" : "-"}${formatNpr(Math.abs(h.dayChange))} (${h.percentChange.toFixed(2)}%)`}
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
                  <TableCell className="num text-right font-semibold text-muted-foreground" title={`All-in avg ${formatNpr(allInAvgWacc)}`}>
                    {allInAvgWacc > 0 ? formatNpr(allInAvgWacc) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalBuyCost > 0 ? (
                      <DeltaPill value={unrealizedPL}>
                        {`${unrealizedPL >= 0 ? "+" : "-"}${formatNpr(Math.abs(unrealizedPL))}`}
                      </DeltaPill>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
        </Panel>
      )}

      {view === "actual" && q.data && q.data.sectors.length > 0 ? (
        <Panel as="section">
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
        </Panel>
      ) : null}

      {view === "yobroker" && yoEnriched && yoEnriched.holdings.length > 0 ? (
        <HistoryPanel
          holdings={yoEnriched.holdings as unknown as EnrichedHolding[]}
          onPickScrip={setPicked}
        />
      ) : view === "broker" && brokerEnriched && brokerEnriched.holdings.length > 0 ? (
        <HistoryPanel
          holdings={brokerEnriched.holdings as unknown as EnrichedHolding[]}
          onPickScrip={setPicked}
        />
      ) : view === "actual" && holdings.length > 0 ? (
        <HistoryPanel holdings={holdings} onPickScrip={setPicked} />
      ) : null}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />
      <YoBrokerModal open={yoOpen} onOpenChange={setYoOpen} />
    </div>
  );
}
