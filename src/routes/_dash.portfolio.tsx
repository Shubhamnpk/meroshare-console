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
import { StatChip, ChipRow } from "@/components/stat-chip";
import { CompactNpr, CompactQty } from "@/components/market/compact-value";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Coins,
  PiggyBank,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { sortBy, useSort } from "@/components/sortable-table";
import { ExportButton, buildCsv } from "@/components/export-dialog";
import {
  TableCell,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { HistoryPanel } from "@/components/portfolio/history-panel";
import {
  HoldingsTable,
  toPaperRows,
  type HoldingsSortKey as SortKey,
} from "@/components/portfolio/holdings-table";
import { brokerConnectionsQuery, brokerHoldingsQuery, enrichedPortfolioQuery, investmentSummaryQuery, mfSchemesQuery, waccSearchQuery } from "@/lib/queries";
import type { BrokerId } from "@/lib/brokers/types";
import { useSettings } from "@/lib/settings";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { netPosition } from "@/lib/calc/position";
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
          "Every stock in your demat account valued at live NEPSE prices, its price history and dividend record.",
      },
      { property: "og:title", content: "Portfolio | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Every stock in your demat account valued at live NEPSE prices, its price history and dividend record.",
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
  isOpenEnd: (scrip: string) => boolean,
) {
  const rows = holdings.map((h, i) => {
    const c = costOf(h.scrip);
    const wacc = c?.waccRate ?? 0;
    const cost = c?.cost ?? 0;
    let pl = 0;
    let plPct = "";
    if (cost > 0 && wacc > 0) {
      const pos = netPosition(h.units, wacc, h.ltp, { isOpenEnd: isOpenEnd(h.scrip) });
      pl = pos.profit;
      plPct = `${pos.profitPct.toFixed(2)}%`;
    } else if (cost > 0) {
      pl = h.value - cost;
      plPct = `${((pl / cost) * 100).toFixed(2)}%`;
    }
    return [
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
    ];
  });
  return buildCsv(
    [
      "SN",
      "Stock",
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
    ],
    rows,
  );
}

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
    return netPosition(h.units, c.waccRate, h.ltp, { isOpenEnd: isOpenEnd(h.scrip) }).profit;
  };
  const buyOf = (h: EnrichedHolding) => {
    const c = costMap.get(h.scrip);
    if (!c || c.waccRate <= 0) return null;
    return netPosition(h.units, c.waccRate, h.ltp, { isOpenEnd: isOpenEnd(h.scrip) }).buy;
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
      sum += netPosition(h.units, c.waccRate, h.ltp, { isOpenEnd: open }).net.netReceivable;
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
        avgBuy: h.avgCost,
      } as EnrichedHolding & { avgBuy: number };
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
          return h.avgBuy;
        case "unrealized":
          return h.value - h.units * h.avgBuy;
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
              ? `${yoEnriched.holdings.length} stock${yoEnriched.holdings.length === 1 ? "" : "s"} · virtual Yo Broker portfolio. Click any stock for detail.`
              : view === "broker" && brokerEnriched
                ? `${brokerEnriched.holdings.length} stock${brokerEnriched.holdings.length === 1 ? "" : "s"} · live ${realBrokerId === "naasa-x" ? "Naasa X" : realBrokerId} broker holdings. Click any stock for detail.`
                : `${holdings.length} stock${holdings.length === 1 ? "" : "s"} · ${liveCount} valued at live NEPSE prices. Click any stock for its full detail.`}
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
                build: () => portfolioCsv(expItems, expTotals, expCostOf, isOpenEnd),
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
                    "Stock",
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
                        `${brokerEnriched?.holdings.length ?? 0} stocks · live broker prices`,
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
                        `${holdings.length} stocks · ${liveCount} at live prices`,
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
          placeholder="Search by stock or company name…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      {view === "yobroker" && yoEnriched ? (
        <ChipRow>
          <StatChip
            icon={<Coins className="size-4" />}
            label="Yo stocks"
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
              label="Broker stocks"
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
            label="Stocks held"
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
            description="Buy virtual stocks with Yo Broker to see them here. Use the Terminal or Market to place paper orders."
          />
        ) : yoItems.length === 0 ? (
          <EmptyBlock title="No matches" description="Nothing matches your search." />
        ) : (
          <HoldingsTable
            rows={toPaperRows(yoItems, yoEnriched.totalValue, {
              avgTitle: "Avg cost",
              noBasisTitle: "No cost data for this stock",
            })}
            sort={sort}
            onToggle={toggle}
            onPick={(scrip) => setPicked(scrip)}
            avgLabel="Avg buy"
            weightBarClass="bg-emerald-500/60"
            footnote={
              yoItems.length !== yoEnriched.holdings.length ? (
                <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                  Showing {yoItems.length} of {yoEnriched.holdings.length} stocks ·
                  filtered value {formatNpr(yoItems.reduce((s, h) => s + h.value, 0))}
                </p>
              ) : null
            }
          />
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
            description="Your connected broker account currently holds no stocks."
          />
        ) : brokerItems.length === 0 ? (
          <EmptyBlock title="No matches" description="Nothing matches your search." />
        ) : (
          <HoldingsTable
            rows={toPaperRows(brokerItems, brokerEnriched.totalValue, {
              avgTitle: "WACC avg buy",
              noBasisTitle: "No WACC cost data for this stock",
            })}
            sort={sort}
            onToggle={toggle}
            onPick={(scrip) => setPicked(scrip)}
            avgLabel="Avg buy"
            weightBarClass="bg-emerald-500/60"
            footnote={
              brokerItems.length !== brokerEnriched.holdings.length ? (
                <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                  Showing {brokerItems.length} of {brokerEnriched.holdings.length} stocks ·
                  filtered value {formatNpr(brokerItems.reduce((s, h) => s + h.value, 0))}
                </p>
              ) : null
            }
          />
        )
      ) : q.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : holdings.length === 0 ? (
        <EmptyBlock
          title="No holdings"
          description="Your demat account currently holds no stocks."
        />
      ) : items.length === 0 ? (
        <EmptyBlock
          title="No matches"
          description="Nothing matches your search. Try a different stock or company."
        />
      ) : (
          <HoldingsTable
            rows={items.map((h, idx) => {
              const basis = costOf(h.scrip);
              const hasBasis = Boolean(basis && basis.cost > 0 && basis.waccRate > 0);
              const open = isOpenEnd(h.scrip);
              const pos = hasBasis
                ? netPosition(h.units, basis!.waccRate, h.ltp, { isOpenEnd: open })
                : null;
              const pl = pos ? pos.profit : hasBasis ? h.value - (basis?.cost ?? 0) : 0;
              const plPct = pos
                ? pos.profitPct
                : hasBasis && (basis?.cost ?? 0) > 0
                  ? (pl / (basis?.cost ?? 1)) * 100
                  : 0;
              const waccRate = basis?.waccRate ?? 0;
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
                weight: totals.value > 0 ? (h.value / totals.value) * 100 : 0,
                avg:
                  hasBasis && waccRate > 0
                    ? {
                        value: waccRate,
                        prefix: basis?.status === "pending" ? "~" : "",
                        title: `All-in ${formatNpr(pos!.buy.perUnit)} incl. broker+SEBON+DP`,
                        cellTitle:
                          basis?.status === "pending"
                            ? "Estimated from purchase price (WACC not confirmed yet)"
                            : "CDSC-calculated WACC — hover for all-in",
                      }
                    : {
                        value: null,
                        cellTitle: "No cost data (blocked or not available)",
                      },
                pl: hasBasis
                  ? {
                      value: pl,
                      pct: plPct,
                      title: `${pl >= 0 ? "+" : "-"}${formatNpr(Math.abs(pl))} net · Breakeven ${formatNpr(pos!.breakeven)}`,
                    }
                  : null,
              };
            })}
            sort={sort}
            onToggle={toggle}
            onPick={(scrip) => setPicked(scrip)}
            avgLabel="Avg buy"
            trendArrows
            weightBarClass="bg-primary/60"
            footer={
              items.length === holdings.length ? (
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
                    <TableCell
                      className="num text-right font-semibold text-muted-foreground"
                      title={`All-in avg ${formatNpr(allInAvgWacc)}`}
                    >
                      {allInAvgWacc > 0 ? formatNpr(allInAvgWacc) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {totalBuyCost > 0 ? (
                        <DeltaPill
                          value={unrealizedPL}
                          title={`${unrealizedPL >= 0 ? "+" : "-"}${formatNpr(Math.abs(unrealizedPL))} net total`}
                        >
                          {`${unrealizedPL >= 0 ? "+" : ""}${((unrealizedPL / totalBuyCost) * 100).toFixed(2)}%`}
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
              ) : null
            }
            footnote={
              items.length !== holdings.length ? (
                <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
                  Showing {items.length} of {holdings.length} stocks · filtered value{" "}
                  {formatNpr(items.reduce((s, h) => s + h.value, 0))}
                </p>
              ) : null
            }
          />
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
