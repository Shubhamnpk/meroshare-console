import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { BackButton as HistoryBackButton } from "@/components/back-button";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { FundBrowse } from "@/components/tools/fund-browse";
import { FundDetail, type PeerRow } from "@/components/tools/fund-detail";
import { FundHeatmap, type HeatRow } from "@/components/tools/fund-heatmap";
import { ManagerDetail, ManagerGrid } from "@/components/tools/manager-views";
import { MarketView } from "@/components/tools/market-view";
import { aggregateManager, discountPct, referenceNav } from "@/components/tools/mf-math";
import {
  mfApprovalsQuery,
  mfDebenturesQuery,
  mfFeedHealthQuery,
  mfManagerDetailQuery,
  mfManagerFactsQuery,
  mfManagerHoldingsQuery,
  mfManagerProductQuery,
  mfManagersQuery,
  mfMarketHoldingsQuery,
  mfPerformanceQuery,
  mfPipelineByTypeQuery,
  mfPipelineOverviewQuery,
  mfProductsQuery,
  mfSchemeQuery,
  mfSchemesQuery,
  screenerDataQuery,
} from "@/lib/queries";
import { formatNumber, formatPercent } from "@/lib/format";
import type { MfPerformance, MfPipelineType } from "@/lib/mutual-funds/types";
import type { LivePrice } from "@/lib/nepse/types";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/mutual-funds")({
  head: () => ({
    meta: [
      { title: "Mutual Funds | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Nepali mutual fund schemes with NAV tracking, discounts to NAV, returns, holdings and growth simulators.",
      },
      { property: "og:title", content: "Mutual Funds | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Nepali mutual fund schemes with NAV tracking, discount analytics and manager views.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/mutual-funds")],
  }),
  component: MutualFundsPage,
});

type Tab = "schemes" | "managers" | "market" | "heatmap";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3.5 py-2 leading-tight">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num font-semibold">{value}</p>
    </div>
  );
}

function MutualFundsPage() {
  const managersQ = useQuery(mfManagersQuery());
  const schemesQ = useQuery(mfSchemesQuery());
  const perfQ = useQuery(mfPerformanceQuery());
  const screenerQ = useQuery(screenerDataQuery());
  const [pipeType, setPipeType] = useState<MfPipelineType>("mfs");
  const pipelineQ = useQuery(mfPipelineByTypeQuery(pipeType));
  const pipeOverviewQ = useQuery(mfPipelineOverviewQuery());
  const healthQ = useQuery(mfFeedHealthQuery());
  const approvalsQ = useQuery(mfApprovalsQuery());
  const debenturesQ = useQuery(mfDebenturesQuery());
  const productsQ = useQuery(mfProductsQuery());
  const [tab, setTab] = useState<Tab>("schemes");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedManager, setPickedManager] = useState<string | null>(null);
  const [pickedStock, setPickedStock] = useState<string | null>(null);
  const bundleQ = useQuery(mfSchemeQuery(picked));
  const factsQ = useQuery(mfManagerFactsQuery(pickedManager));
  const detailQ = useQuery(mfManagerDetailQuery(pickedManager));
  const mgrHoldQ = useQuery(mfManagerHoldingsQuery(pickedManager));
  const mktHoldQ = useQuery(mfMarketHoldingsQuery(tab === "market" && !picked && !pickedManager));

  const managers = useMemo(() => managersQ.data ?? [], [managersQ.data]);
  const schemes = useMemo(() => schemesQ.data ?? [], [schemesQ.data]);
  const performances = useMemo(() => {
    const map = new Map<string, MfPerformance>();
    for (const p of perfQ.data ?? []) map.set(p.symbol, p);
    return map;
  }, [perfQ.data]);
  const livePrices = useMemo(() => {
    const map = new Map<string, LivePrice>();
    for (const p of screenerQ.data?.prices ?? []) map.set(p.symbol, p);
    return map;
  }, [screenerQ.data]);
  const products = useMemo(() => productsQ.data ?? {}, [productsQ.data]);

  const aggs = useMemo(
    () => managers.map((m) => aggregateManager(m, schemes, performances, livePrices)),
    [managers, schemes, performances, livePrices],
  );
  const agg = pickedManager ? (aggs.find((a) => a.manager.slug === pickedManager) ?? null) : null;

  const stats = useMemo(() => {
    if (schemes.length === 0) return null;
    const discounts: number[] = [];
    for (const p of performances.values()) {
      // Only close-end funds trade at market price - open-end always = NAV
      if (p.fundType !== "close_end") continue;
      const { nav } = referenceNav(p);
      const d = discountPct(p.ltp, nav);
      if (d != null) discounts.push(d);
    }
    const bargains = discounts.filter((d) => d < -2).length;
    const avg = discounts.length ? discounts.reduce((s, d) => s + d, 0) / discounts.length : null;
    return { bargains, avg };
  }, [schemes.length, performances]);

  const bundle = bundleQ.data ?? null;
  const live = picked ? (livePrices.get(picked) ?? null) : null;
  const bundleManagerSlug = bundle?.scheme?.managerSlug ?? null;
  const prodDetailQ = useQuery(mfManagerProductQuery(bundleManagerSlug));
  const stockNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of screenerQ.data?.prices ?? []) map.set(p.symbol, p.name);
    return map;
  }, [screenerQ.data]);
  const peers = useMemo<PeerRow[]>(() => {
    if (!bundle) return [];
    const type = bundle.scheme?.fundType ?? bundle.performance?.fundType ?? "close_end";
    const rows: PeerRow[] = [];
    for (const p of performances.values()) {
      if (p.symbol === bundle.symbol) continue;
      const scheme = schemes.find((s) => s.symbol === p.symbol);
      const pType = scheme?.fundType ?? p.fundType;
      if (pType !== type) continue;
      const { nav } = referenceNav(p);
      const ltp = livePrices.get(p.symbol)?.ltp ?? p.ltp;
      rows.push({
        symbol: p.symbol,
        name: p.name,
        nav,
        ltp,
        discount: discountPct(ltp, nav),
        payout: p.expectedDividendPct,
      });
    }
    return rows.sort((a, b) => (a.discount ?? 999) - (b.discount ?? 999)).slice(0, 5);
  }, [bundle, performances, schemes, livePrices]);

  const managerInfo = useMemo(() => {
    if (!bundle) return null;
    const slug = bundle.scheme?.managerSlug;
    const name = bundle.scheme?.manager || bundle.performance?.manager;
    return managers.find((m) => (slug && m.slug === slug) || (name && m.name === name)) ?? null;
  }, [bundle, managers]);

  const heatRows = useMemo<HeatRow[]>(() => {
    const out: HeatRow[] = [];
    for (const s of schemes) {
      const p = performances.get(s.symbol);
      const live = livePrices.get(s.symbol);
      const { nav } = p ? referenceNav(p) : { nav: null as number | null };
      const ltp = live?.ltp ?? p?.ltp ?? null;
      const size = p?.totalPaidUp ?? s.paidUp ?? 0;
      if (!(size > 0)) continue;
      out.push({
        symbol: s.symbol,
        name: s.name,
        manager: s.manager,
        fundType: s.fundType,
        size,
        units: s.units,
        ltp,
        nav,
        discount: discountPct(ltp, nav),
        dayChange: live?.percentChange ?? null,
      });
    }
    return out;
  }, [schemes, performances, livePrices]);

  const pickFund = (symbol: string) => {
    setPickedManager(null);
    setPicked(symbol);
  };

  const loading = managersQ.isLoading || schemesQ.isLoading || perfQ.isLoading;
  const error = managersQ.error ?? schemesQ.error ?? perfQ.error;

  return (
    <div className="space-y-5">
      <HistoryBackButton fallback="/tools" />
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <PiggyBank className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Mutual Funds</h1>
          <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
            NAV tracking, discounts, returns and holdings for every Nepali scheme.
          </p>
        </div>
      </div>

      {!picked && !pickedManager ? (
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-surface p-1 self-start">
          {(["schemes", "heatmap", "managers", "market"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      {picked ? (
        bundleQ.isLoading ? (
          <>
            <BackButton onClick={() => setPicked(null)} label="All schemes" />
            <LoadingBlock label={`Loading ${picked}`} />
          </>
        ) : bundleQ.isError || !bundle ? (
          <>
            <BackButton onClick={() => setPicked(null)} label="All schemes" />
            <ErrorBlock error={bundleQ.error} retry={() => void bundleQ.refetch()} />
          </>
        ) : (
          <FundDetail
            bundle={bundle}
            live={live}
            peers={peers}
            managerInfo={managerInfo}
            stockNames={stockNames}
            productDetail={prodDetailQ.data ?? null}
            onPick={pickFund}
            onBack={() => setPicked(null)}
            onOpenManager={(slug) => {
              setPicked(null);
              setPickedManager(slug);
            }}
            onOpenStock={setPickedStock}
          />
        )
      ) : pickedManager && agg ? (
        factsQ.isLoading ? (
          <>
            <BackButton onClick={() => setPickedManager(null)} label="All managers" />
            <LoadingBlock label="Loading manager" />
          </>
        ) : (
          <ManagerDetail
            agg={agg}
            facts={factsQ.data ?? null}
            detail={detailQ.data ?? null}
            products={products[agg.manager.slug] ?? []}
            livePrices={livePrices}
            performances={performances}
            stockMap={mgrHoldQ.data ?? null}
            stockMapLoading={mgrHoldQ.isLoading}
            onPickFund={pickFund}
            onBack={() => setPickedManager(null)}
          />
        )
      ) : loading ? (
        <LoadingBlock label="Loading mutual funds" />
      ) : error ? (
        <ErrorBlock
          error={error}
          retry={() => {
            void managersQ.refetch();
            void schemesQ.refetch();
            void perfQ.refetch();
          }}
        />
      ) : schemes.length === 0 ? (
        <EmptyBlock
          title="No mutual funds"
          description="No mutual fund schemes in the feed right now."
        />
      ) : tab === "schemes" ? (
        <>
          {stats ? (
            <div className="flex flex-wrap gap-2">
              <StatChip label="Schemes" value={formatNumber(schemes.length)} />
              <StatChip label="Trading below NAV" value={formatNumber(stats.bargains)} />
              <StatChip
                label="Avg. discount"
                value={stats.avg !== null ? formatPercent(stats.avg) : "-"}
              />
            </div>
          ) : null}
          <FundBrowse
            schemes={schemes}
            performances={performances}
            managers={managers}
            livePrices={livePrices}
            onPick={pickFund}
          />
        </>
      ) : tab === "heatmap" ? (
        <FundHeatmap rows={heatRows} onPick={pickFund} />
      ) : tab === "managers" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Fund houses" value={formatNumber(managers.length)} />
            <StatChip
              label="With schemes live"
              value={formatNumber(aggs.filter((a) => a.schemes.length > 0).length)}
            />
          </div>
          <ManagerGrid aggs={aggs} onPick={setPickedManager} />
        </>
      ) : (
        <MarketView
          schemes={schemes}
          performances={performances}
          pipeline={pipelineQ.data ?? null}
          pipeType={pipeType}
          onPipeType={setPipeType}
          pipeOverview={pipeOverviewQ.data ?? null}
          approvals={approvalsQ.data ?? []}
          debentures={debenturesQ.data ?? null}
          onPickFund={pickFund}
          stockMap={mktHoldQ.data ?? null}
          stockMapLoading={mktHoldQ.isLoading}
        />
      )}

      {!picked && !pickedManager ? (
        <p className="text-[11px] text-muted-foreground">
          NAV, holdings, pipeline and notices come from community feeds, indicative only, not
          investment advice. Past performance doesn't predict future returns.
          {healthQ.data ? (
            <>
              {" "}
              Feed: {healthQ.data.schemes} schemes · {healthQ.data.managers} managers
              {healthQ.data.snapshotAsOf ? ` · snapshot ${healthQ.data.snapshotAsOf}` : ""}
              {healthQ.data.servingFrom ? ` · via ${healthQ.data.servingFrom}` : ""}.
            </>
          ) : null}
        </p>
      ) : null}

      <ScripSheet
        symbol={pickedStock}
        onOpenChange={(open) => {
          if (!open) setPickedStock(null);
        }}
      />
    </div>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      ← {label}
    </button>
  );
}
