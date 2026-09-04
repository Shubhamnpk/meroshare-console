import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Landmark,
  PieChart,
  Scale,
  Sparkles,
  Wallet,
} from "lucide-react";
import { DeltaPill } from "@/components/stat-card";
import { useDocViewer } from "@/components/ui/use-doc-viewer";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HoldingsDetailSheet } from "./holdings-detail-sheet";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import type { LivePrice } from "@/lib/nepse/types";
import type { ChartRange } from "@/lib/nepse/types";
import type {
  MfManager,
  MfManagerProductDetail,
  MfNavPoint,
  MfSchemeBundle,
} from "@/lib/mutual-funds/types";
import { chartSeriesQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  bucketCloses,
  discountPct,
  groupSchemeFacts,
  journeyStats,
  maturityCountdown,
  maturityProgress,
  referenceNav,
  riskStats,
  simulateLumpsum,
  simulateSip,
  trailingReturns,
  type LtpFrequency,
} from "./mf-math";

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label="Learn more"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 whitespace-normal text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

const JUMP_LINKS = [
  { id: "mf-holdings", label: "Holdings" },
  { id: "mf-nav", label: "Price & NAV" },
  { id: "mf-simulator", label: "Simulator" },
  { id: "mf-peers", label: "Peers" },
  { id: "mf-facts", label: "Facts" },
  { id: "mf-files", label: "Files" },
];

function Section({
  icon: Icon,
  title,
  hint,
  children,
  id,
}: {
  icon: typeof Wallet;
  title: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border/70 bg-card p-4">
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
        <Icon className="size-4 text-primary" /> {title}
        {hint ? <InfoTip text={hint} /> : null}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** LTP marker positioned against NAV on a ±10% band. */
function NavGauge({ ltp, nav }: { ltp: number | null; nav: number | null }) {
  if (ltp == null || nav == null || nav <= 0) return null;
  const disc = ((ltp - nav) / nav) * 100;
  const pos = Math.min(100, Math.max(0, 50 + disc * 5));
  return (
    <div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-gain/60 via-muted to-amber-500/60">
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
          style={{ left: `${pos}%` }}
          title={`LTP ${formatNpr(ltp)} vs NAV ${formatNpr(nav)}`}
        />
        <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/50" />
      </div>
      <div className="num mt-1.5 flex justify-between text-[0.68rem] text-muted-foreground">
        <span>−10% discount</span>
        <span>NAV</span>
        <span>+10% premium</span>
      </div>
    </div>
  );
}

function PercentText({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("font-semibold", value > 0 ? "text-gain" : value < 0 ? "text-loss" : "")}>
      {formatPercent(value)}
      {suffix}
    </span>
  );
}

export interface PeerRow {
  symbol: string;
  name: string;
  nav: number | null;
  ltp: number | null;
  discount: number | null;
  payout: number | null;
}

export function FundDetail({
  bundle,
  live,
  peers,
  managerInfo,
  stockNames,
  productDetail,
  onPick,
  onBack,
  onOpenManager,
  onOpenStock,
}: {
  bundle: MfSchemeBundle;
  live: LivePrice | null;
  peers: PeerRow[];
  managerInfo: MfManager | null;
  stockNames: Map<string, string>;
  productDetail: MfManagerProductDetail | null;
  onPick: (symbol: string) => void;
  onBack: () => void;
  onOpenManager?: (slug: string) => void;
  onOpenStock?: (symbol: string) => void;
}) {
  const { scheme, nav, holdings, returns, performance: perf } = bundle;
  const [sipAmount, setSipAmount] = useState("5000");
  const [sipMode, setSipMode] = useState<"sip" | "lumpsum">("sip");
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const [showHoldingsDetail, setShowHoldingsDetail] = useState(false);
  const { openPreview, modal: docModal } = useDocViewer();

  const closeEnd = scheme?.fundType === "close_end";
  const name = scheme?.name ?? perf?.name ?? bundle.symbol;
  const manager = scheme?.manager || perf?.manager || "";
  const { nav: refNav, label: navLabel } = perf
    ? referenceNav(perf)
    : { nav: nav[nav.length - 1]?.nav ?? null, label: "latest NAV" };
  const ltp = live?.ltp ?? perf?.ltp ?? null;
  const disc = discountPct(ltp, refNav);
  const countdown = maturityCountdown(scheme?.maturityDate ?? perf?.maturityDate ?? null);
  const lifeProgress = maturityProgress(
    scheme?.allotmentDate ?? null,
    scheme?.maturityDate ?? null,
  );

  const trailing = useMemo(() => trailingReturns(nav), [nav]);
  const risk = useMemo(() => riskStats(nav, []), [nav]);

  const apiPeriods = useMemo(() => {
    const out = new Map<string, { value: number | null; annualized: boolean }>();
    for (const p of returns?.periods ?? []) {
      if (p.available && p.returnPct != null) {
        out.set(p.period.toUpperCase(), { value: p.returnPct, annualized: p.annualized });
      }
    }
    if (returns?.sinceInception?.available && returns.sinceInception.returnPct != null) {
      out.set("SI", {
        value: returns.sinceInception.returnPct,
        annualized: returns.sinceInception.annualized,
      });
    }
    return out;
  }, [returns]);

  const returnRows = useMemo(() => {
    const order = [
      { key: "1M", label: "1 month" },
      { key: "3M", label: "3 months" },
      { key: "6M", label: "6 months" },
      { key: "1Y", label: "1 year" },
      { key: "SI", label: "Since start" },
    ];
    return order.map(({ key, label }) => {
      const api = apiPeriods.get(key);
      if (api)
        return {
          key,
          label,
          value: api.value,
          annualized: api.annualized,
          available: api.value != null,
        };
      const t = trailing.find((x) => x.key === key);
      if (t && t.returnPct != null)
        return { key, label, value: t.returnPct, annualized: t.annualized, available: true };
      return { key, label, value: null as number | null, annualized: false, available: false };
    });
  }, [apiPeriods, trailing]);

  const alloc = useMemo(() => {
    const rows = [
      { label: "Shares", value: perf?.capitalMarketPct ?? null, className: "bg-primary" },
      { label: "Bonds", value: perf?.fixedIncomePct ?? null, className: "bg-violet-400" },
      { label: "Cash", value: perf?.cashPct ?? null, className: "bg-muted-foreground/50" },
    ].filter((r) => r.value != null && r.value > 0);
    const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    return { rows, total };
  }, [perf]);

  const holdingsTotal = useMemo(
    () => holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0),
    [holdings],
  );
  const maxHoldingWeight = useMemo(() => {
    if (holdingsTotal <= 0) return 0;
    return Math.max(...holdings.map((h) => ((h.marketValue ?? 0) / holdingsTotal) * 100), 0);
  }, [holdings, holdingsTotal]);
  const visibleHoldings = showAllHoldings ? holdings : holdings.slice(0, 8);

  const sip = useMemo(() => {
    const amt = Number(String(sipAmount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return sipMode === "sip" ? simulateSip(nav, amt) : null;
  }, [sipAmount, sipMode, nav]);
  const lumpsum = useMemo(() => {
    const amt = Number(String(sipAmount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return sipMode === "lumpsum" ? simulateLumpsum(nav, amt) : null;
  }, [sipAmount, sipMode, nav]);
  const sim = sipMode === "sip" ? sip : lumpsum;

  // NAV-only simulation (strips dividend adjustments to show price-only return)
  const navOnly = useMemo(() => {
    const stripped = nav.map((p) => ({ ...p, adjNav: p.nav }));
    const amt = Number(String(sipAmount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return sipMode === "sip" ? simulateSip(stripped, amt) : simulateLumpsum(stripped, amt);
  }, [sipAmount, sipMode, nav]);

  const schemeFacts = useMemo(() => {
    const list = productDetail?.schemesDetail ?? [];
    const upper = bundle.symbol.toUpperCase();
    const match = list.find((sd) => {
      const head = sd.scheme.trim().split(/[([]/)[0]!.trim().toUpperCase();
      return head === upper || sd.scheme.toUpperCase().includes(upper);
    });
    return match?.facts ?? [];
  }, [productDetail, bundle.symbol]);

  const groupedFacts = useMemo(() => groupSchemeFacts(schemeFacts), [schemeFacts]);

  const schemeDocs = useMemo(() => {
    const docs = productDetail?.documents ?? [];
    const upper = bundle.symbol.toUpperCase();
    return docs.filter((d) => (d.scheme ?? "").toUpperCase() === upper);
  }, [productDetail, bundle.symbol]);

  const docGroups = useMemo(() => {
    const prospectus = schemeDocs.filter((d) => /prospectus/i.test(d.category ?? ""));
    const navReports = schemeDocs
      .filter((d) => /nav/i.test(d.category ?? ""))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const others = schemeDocs.filter(
      (d) => !/prospectus/i.test(d.category ?? "") && !/nav/i.test(d.category ?? ""),
    );
    return [
      { key: "prospectus", label: "Prospectus", docs: prospectus, accent: "text-primary" },
      {
        key: "nav",
        label: "NAV reports",
        docs: navReports,
        accent: "text-sky-600 dark:text-sky-400",
      },
      { key: "other", label: "Other filings", docs: others, accent: "text-muted-foreground" },
    ].filter((g) => g.docs.length > 0);
  }, [schemeDocs]);

  /** Freshest filing across groups (NAV reports first) — featured, no expanding needed. */
  const featuredDoc = useMemo(() => {
    const order = ["nav", "prospectus", "other"];
    for (const key of order) {
      const doc = docGroups.find((g) => g.key === key)?.docs[0];
      if (doc) {
        const group = docGroups.find((g) => g.key === key)!;
        return { doc, groupLabel: group.label };
      }
    }
    return null;
  }, [docGroups]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All schemes
        </button>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {JUMP_LINKS.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() =>
                document
                  .getElementById(j.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="shrink-0 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {j.label}
            </button>
          ))}
        </div>

        {/* Hero */}
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="bg-gradient-to-br from-primary/15 via-transparent to-transparent p-4 pb-3 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-bold sm:text-2xl">{bundle.symbol}</h2>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {closeEnd ? "Close-end" : "Open-end"}
                  </span>
                  {closeEnd && disc != null ? (
                    <span
                      className={cn(
                        "num rounded-full px-2 py-0.5 text-[11px] font-bold",
                        disc < -2 && "bg-gain/15 text-gain",
                        disc > 2 && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                        disc >= -2 && disc <= 2 && "bg-muted text-muted-foreground",
                      )}
                    >
                      {disc <= 0
                        ? `${Math.abs(disc).toFixed(2)}% below NAV`
                        : `${disc.toFixed(2)}% above NAV`}
                    </span>
                  ) : null}
                  {perf?.dataStatus && perf.dataStatus !== "ok" ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                      Partial data
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{name}</p>
                {manager ? (
                  scheme?.managerSlug && onOpenManager ? (
                    <button
                      type="button"
                      onClick={() => onOpenManager(scheme.managerSlug!)}
                      className="group/manager mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Building2 className="size-3 text-muted-foreground/60 group-hover/manager:text-primary" />
                      {manager}
                      <ArrowUpRight className="size-3 text-muted-foreground/40 transition-transform group-hover/manager:translate-x-px group-hover/manager:text-primary" />
                    </button>
                  ) : (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="size-3" /> {manager}
                    </p>
                  )
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  NAV <span className="normal-case">({navLabel})</span>
                </p>
                <p className="num text-2xl font-bold sm:text-3xl">
                  {refNav != null ? formatNpr(refNav) : "—"}
                </p>
                {closeEnd ? (
                  <p className="num mt-0.5 text-sm text-muted-foreground">
                    Market {ltp != null ? formatNpr(ltp) : "—"}{" "}
                    {live ? (
                      <DeltaPill value={live.percentChange}>
                        {formatPercent(live.percentChange)}
                      </DeltaPill>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            {closeEnd ? (
              <div className="mt-4">
                <NavGauge ltp={ltp} nav={refNav} />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
            <HeroStat
              label="Fund size"
              value={
                (perf?.totalPaidUp ?? scheme?.paidUp) != null
                  ? formatNpr(perf?.totalPaidUp ?? scheme?.paidUp ?? 0, { compact: true })
                  : "—"
              }
            />
            {holdings.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowHoldingsDetail(true)}
                className="bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Stocks held
                </p>
                <p className="num text-sm font-bold text-primary underline-offset-2 hover:underline">
                  {holdings.length}
                </p>
              </button>
            ) : (
              <HeroStat
                label="Stocks held"
                value={perf?.holdingsCount != null ? formatQty(perf.holdingsCount) : "—"}
              />
            )}
            <HeroStat
              label="Expected payout"
              value={
                perf?.expectedDividendPct != null ? formatPercent(perf.expectedDividendPct) : "—"
              }
            />
            <HeroStat label="Matures" value={countdown ?? "—"} />
          </div>
        </section>

        {/* Market snapshot — close-end only (open-end trades at NAV, no market price) */}
        {closeEnd ? (
          <Section
            icon={Wallet}
            title="Market snapshot"
            hint="Weekly and monthly NAV are the fund's published worth; LTP is what units actually trade for on NEPSE."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SnapshotStat
                label="Weekly NAV"
                value={perf?.weeklyNav != null ? formatNpr(perf.weeklyNav) : "—"}
                hint={
                  perf?.weeklyNav != null && perf?.monthlyNav != null
                    ? `${formatNpr(perf.monthlyNav)} monthly`
                    : "latest published"
                }
              />
              <SnapshotStat
                label="Monthly NAV"
                value={perf?.monthlyNav != null ? formatNpr(perf.monthlyNav) : "—"}
                hint={
                  perf?.weeklyNav != null && perf?.monthlyNav != null
                    ? `${formatNpr(perf.weeklyNav)} weekly`
                    : undefined
                }
              />
              <SnapshotStat
                label="LTP"
                value={ltp != null ? formatNpr(ltp) : "—"}
                hint="NEPSE traded"
                tone={ltp != null && refNav != null && ltp >= refNav ? "text-gain" : "text-loss"}
              />
              <SnapshotStat
                label="LTP vs NAV"
                value={disc != null ? formatPercent(disc) : "—"}
                hint={
                  disc != null
                    ? disc >= 0
                      ? "trading at premium"
                      : "trading at discount"
                    : "not traded"
                }
                tone={
                  disc != null
                    ? disc >= 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-gain"
                    : undefined
                }
              />
            </div>
          </Section>
        ) : null}

        {/* NAV journey */}
        <Section
          icon={Sparkles}
          title="NAV journey"
          hint={
            closeEnd
              ? "Market price line with the published NAV overlaid, the gap between them is your discount or premium. NAV only moves when the monthly report lands."
              : "Published NAV history, open-end funds always trade at NAV, so there's no separate market price."
          }
          id="mf-nav"
        >
          <PriceNavChart symbol={bundle.symbol} nav={nav} closeEnd={closeEnd} />
          <div className="mt-3">
            {returns && !returns.available ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-surface px-3 py-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground">
                  Not enough history yet
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Only {returns.points} NAV point{returns.points === 1 ? "" : "s"} recorded so far.
                </p>
                {returns.latestNav != null ? (
                  <p className="num mt-2 text-sm font-bold">{formatNpr(returns.latestNav)}</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                <div className="num flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                  <span>
                    {returnRows.filter((r) => r.available).length} of {returnRows.length} periods
                    available
                  </span>
                  {returns?.asOf ? <span>As of {returns.asOf}</span> : null}
                </div>
                {returnRows.map((r) => {
                  const positive = r.value != null && r.value >= 0;
                  return (
                    <div
                      key={r.key}
                      className={cn(
                        "relative flex items-center justify-between overflow-hidden rounded-xl border px-3 py-2",
                        r.available
                          ? "border-border/60 bg-surface"
                          : "border-dashed border-border/40 bg-transparent opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute bottom-0 left-0 top-0 w-1",
                          !r.available
                            ? "bg-muted-foreground/30"
                            : positive
                              ? "bg-gain"
                              : "bg-loss",
                        )}
                      />
                      <span className="pl-2">
                        <span className="block text-xs font-bold">{r.label}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          {r.available ? (
                            <>
                              {r.annualized ? "Annualized" : "Trailing return"}
                              {r.annualized ? (
                                <span className="rounded border border-primary/25 px-1 text-[9px] font-bold text-primary">
                                  CAGR
                                </span>
                              ) : null}
                            </>
                          ) : (
                            "Not enough history yet"
                          )}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "num pl-2 text-sm font-bold",
                          r.value != null && (r.value >= 0 ? "text-gain" : "text-loss"),
                        )}
                      >
                        {r.value == null ? "—" : formatPercent(r.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="num mt-2 text-[0.68rem] text-muted-foreground">
              {nav.length} NAV points
              {returns?.asOf ? ` · updated ${returns.asOf}` : ""}
              {returns?.basis ? ` · ${returns.basis}` : ""}
            </p>
          </div>
        </Section>

        {/* Risk */}
        {risk.volatilityPct != null || risk.maxDrawdownPct != null ? (
          <Section
            icon={Scale}
            title="How bumpy is it?"
            hint="Volatility measures how much the NAV wiggles. Drawdown is the worst peak-to-trough fall in the published history. Past wiggles don't predict future ones."
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2.5">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Yearly swing
                </p>
                <p className="num text-lg font-bold">
                  {risk.volatilityPct != null ? `±${risk.volatilityPct.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-surface px-3 py-2.5">
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Worst dip
                </p>
                <p className="num text-lg font-bold text-loss">
                  {risk.maxDrawdownPct != null ? `${risk.maxDrawdownPct.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
          </Section>
        ) : null}

        {/* Allocation */}
        {alloc.rows.length > 0 ? (
          <Section
            icon={PieChart}
            title="Where your money sits"
            hint="How the fund splits its money between shares, bonds and cash right now."
          >
            <div className="flex h-3 gap-1 overflow-hidden rounded-full">
              {alloc.rows.map((r) => (
                <div
                  key={r.label}
                  className={r.className}
                  style={{ width: `${((r.value ?? 0) / (alloc.total || 1)) * 100}%` }}
                  title={`${r.label}: ${formatPercent(r.value ?? 0)} of the fund's assets`}
                />
              ))}
            </div>
            <div className="mt-2.5 space-y-1.5">
              {alloc.rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn("size-2 rounded-full", r.className)} />
                    {r.label}
                  </span>
                  <span className="num font-semibold">{formatPercent(r.value ?? 0)}</span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Holdings */}
        {holdings.length > 0 ? (
          <Section
            icon={Wallet}
            title={`Top holdings${holdingsTotal > 0 ? ` · ${formatNpr(holdingsTotal, { compact: true })}` : ""}`}
            hint="The biggest stock positions in the fund. Weight is each holding's share of the disclosed portfolio."
            id="mf-holdings"
          >
            <HoldingsDonut holdings={holdings} total={holdingsTotal} />
            <ul className="mt-3 space-y-2.5">
              {visibleHoldings.map((h) => {
                const weight = holdingsTotal > 0 ? ((h.marketValue ?? 0) / holdingsTotal) * 100 : 0;
                const stockName = stockNames.get(h.stockSymbol);
                return (
                  <li key={h.stockSymbol}>
                    <button
                      type="button"
                      onClick={() => onOpenStock?.(h.stockSymbol)}
                      className="w-full text-left rounded-xl border border-border/30 bg-muted/5 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="font-semibold text-primary">{h.stockSymbol}</span>
                          {stockName ? (
                            <span className="block truncate text-[0.68rem] font-normal text-muted-foreground">
                              {stockName}
                            </span>
                          ) : null}
                        </span>
                        <span className="num shrink-0 text-muted-foreground">
                          {weight.toFixed(1)}% ·{" "}
                          {h.marketValue != null
                            ? formatNpr(h.marketValue, { compact: true })
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{
                            width: `${maxHoldingWeight > 0 ? Math.max(2, (weight / maxHoldingWeight) * 100) : 0}%`,
                          }}
                          title={`${h.stockSymbol}: ${weight.toFixed(1)}% of the fund's portfolio`}
                        />
                      </div>
                      <p className="num mt-0.5 text-[0.68rem] text-muted-foreground">
                        {h.quantity != null ? `${formatQty(h.quantity)} units` : ""}
                        {h.quantity != null && h.ltp != null ? " · " : ""}
                        {h.ltp != null ? `@ ${formatNpr(h.ltp)}` : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            {holdings.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllHoldings((v) => !v)}
                className="mt-3 w-full rounded-xl border border-border/60 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllHoldings ? "Show fewer" : `Show all ${holdings.length} holdings`}
              </button>
            ) : null}
          </Section>
        ) : null}

        {/* Growth simulator */}
        {nav.length >= 2 ? (
          <Section
            icon={Landmark}
            title="What would you have made?"
            id="mf-simulator"
            hint="Replays your money against the fund's actual published NAV history. Total return includes dividends reinvested; see the breakdown below the chart. History only, not a prediction."
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-border/60 bg-surface p-1">
                {(["sip", "lumpsum"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSipMode(m)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      sipMode === m ? "bg-primary/15 text-primary" : "text-muted-foreground",
                    )}
                  >
                    {m === "sip" ? "Monthly plan" : "One-time"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">रु</span>
                <Input
                  value={sipAmount}
                  onChange={(e) => setSipAmount(e.target.value.replace(/[^0-9,]/g, ""))}
                  inputMode="numeric"
                  className="num h-8 w-28 rounded-lg text-xs"
                  aria-label="Amount in rupees"
                />
                <span className="text-xs text-muted-foreground">
                  {sipMode === "sip" ? "/month" : "once"}
                </span>
              </div>
            </div>
            {sim ? (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                      You put in
                    </p>
                    <p className="num text-sm font-bold">
                      {formatNpr(sim.invested, { compact: true })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                      Worth now
                    </p>
                    <p className="num text-sm font-bold">
                      {formatNpr(sim.value, { compact: true })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface px-3 py-2">
                    <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                      Gain
                    </p>
                    <p className="num text-sm font-bold">
                      <PercentText value={sim.gainPct} />
                    </p>
                  </div>
                </div>
                {navOnly && navOnly.value !== sim.value ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.68rem] text-muted-foreground">
                        From NAV only (no dividends)
                      </span>
                      <span className="num text-xs font-semibold">
                        {formatNpr(navOnly.value, { compact: true })}{" "}
                        <span className="text-muted-foreground">
                          (<PercentText value={navOnly.gainPct} />)
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[0.68rem] text-emerald-600 dark:text-emerald-400">
                        Dividends added
                      </span>
                      <span className="num text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        +{formatNpr(sim.value - navOnly.value, { compact: true })} (
                        {sim.invested > 0
                          ? (((sim.value - navOnly.value) / sim.invested) * 100).toFixed(1)
                          : "0"}
                        %)
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Enter an amount to replay it against this fund's history.
              </p>
            )}
            {sipMode === "sip" && sip ? (
              <p className="num mt-2 text-[0.68rem] text-muted-foreground">
                {sip.months} monthly buys · {formatQty(Math.round(sip.units))} units collected
              </p>
            ) : null}
          </Section>
        ) : null}

        {/* Peers */}
        {peers.length > 0 ? (
          <Section
            icon={ArrowUpRight}
            title="Similar funds"
            id="mf-peers"
            hint="Same fund type, ranked by deepest discount to NAV. Tap any row to open it."
          >
            <ul className="space-y-1">
              {peers.map((p) => (
                <li key={p.symbol}>
                  <button
                    type="button"
                    onClick={() => onPick(p.symbol)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="w-20 shrink-0 text-xs font-bold">{p.symbol}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {p.name}
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary/70"
                          style={{
                            width: `${Math.min(100, Math.max(4, 50 - (p.discount ?? 0) * 4))}%`,
                          }}
                          title={
                            p.discount != null
                              ? `Trading ${Math.abs(p.discount).toFixed(1)}% ${p.discount < 0 ? "below" : "above"} NAV`
                              : "Discount data unavailable"
                          }
                        />
                      </span>
                    </span>
                    <span className="num shrink-0 text-right text-xs">
                      <span className="block font-semibold">
                        {p.nav != null ? formatNpr(p.nav) : "—"}
                      </span>
                      <PercentText value={p.discount} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* Prospectus file + documents */}
        {schemeFacts.length > 0 || docGroups.length > 0 ? (
          <Section
            icon={FileText}
            title="Scheme file"
            hint="Facts pulled from the manager's published prospectus and filings."
            id="mf-files"
          >
            {groupedFacts.length > 0 ? (
              <div className="space-y-2.5">
                {groupedFacts
                  .filter((g) => g.prose)
                  .map((g) => (
                    <div
                      key="objective"
                      className="rounded-2xl border border-border/60 bg-surface p-3.5"
                    >
                      <div className="space-y-2">
                        {g.items.map((f) => (
                          <p key={f.label} className="text-[13px] leading-relaxed">
                            <span className="font-semibold">{f.label}: </span>
                            {f.value}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                <div className="columns-1 gap-2.5 sm:columns-2">
                  {groupedFacts
                    .filter((g) => !g.prose)
                    .map((g) => (
                      <div
                        key={g.heading ?? "group"}
                        className="mb-2.5 break-inside-avoid rounded-2xl border border-border/60 bg-surface p-3.5"
                      >
                        {g.heading ? (
                          <p className="flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                            <span className="size-1.5 rounded-full bg-primary" />
                            {g.heading}
                            <span className="num rounded-full bg-muted px-1.5 py-px font-medium normal-case tracking-normal">
                              {g.items.length}
                            </span>
                          </p>
                        ) : null}
                        <dl className="mt-2.5 grid gap-x-6 gap-y-3">
                          {g.items.map((f) => (
                            <div key={f.label}>
                              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                                {f.label}
                              </dt>
                              <dd className="num mt-0.5 text-[13px] font-medium leading-relaxed">
                                {f.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
            {featuredDoc?.doc.url ? (
              <button
                type="button"
                onClick={() => openPreview(featuredDoc.doc.title, featuredDoc.doc.url)}
                className="group mt-3 flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-3.5 text-left transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-primary/10"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <FileText className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.65rem] font-bold uppercase tracking-widest text-primary">
                    Latest filing · {featuredDoc.groupLabel}
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-bold group-hover:text-primary">
                    {featuredDoc.doc.title}
                  </span>
                  {featuredDoc.doc.date ? (
                    <span className="num mt-0.5 block text-[11px] text-muted-foreground">
                      {featuredDoc.doc.date}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground">
                  Open
                </span>
              </button>
            ) : null}
            {docGroups.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="px-1 text-[0.68rem] font-bold uppercase tracking-widest text-muted-foreground">
                  File archive
                </p>
                {docGroups
                  .map((g) => ({
                    ...g,
                    docs: g.docs.filter((d) => d.title !== featuredDoc?.doc.title),
                  }))
                  .filter((g) => g.docs.length > 0)
                  .map((g) => (
                    <DocGroup
                      key={g.label}
                      label={g.label}
                      docs={g.docs}
                      accent={g.accent}
                      onPreview={openPreview}
                    />
                  ))}
              </div>
            ) : null}
          </Section>
        ) : null}

        {docModal}

        {holdings.length > 0 ? (
          <HoldingsDetailSheet
            holdings={holdings}
            stockNames={stockNames}
            symbol={showHoldingsDetail ? bundle.symbol : null}
            onOpenChange={(open) => {
              if (!open) setShowHoldingsDetail(false);
            }}
            onOpenStock={onOpenStock}
          />
        ) : null}

        {/* Facts */}
        <Section icon={CalendarClock} title="Fund facts" id="mf-facts">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Manager" value={manager || "—"} />
            <Fact
              label="Fund size"
              value={
                (perf?.totalPaidUp ?? scheme?.paidUp) != null
                  ? formatNpr(perf?.totalPaidUp ?? scheme?.paidUp ?? 0, { compact: true })
                  : "—"
              }
            />
            <Fact label="Units" value={scheme?.units != null ? formatQty(scheme.units) : "—"} />
            <Fact
              label="Face value"
              value={scheme?.faceValue != null ? formatNpr(scheme.faceValue) : "—"}
            />
            <Fact label="Allotted" value={scheme?.allotmentDate ?? "—"} />
            <Fact label="Matures" value={scheme?.maturityDate ?? perf?.maturityDate ?? "—"} />
          </dl>
          {lifeProgress != null ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${lifeProgress * 100}%` }}
                  title={`Fund is ${(lifeProgress * 100).toFixed(0)}% through its lifecycle, from allotment to maturity${countdown ? ` (${countdown} remaining)` : ""}`}
                />
              </div>
              <p className="num mt-1 text-[0.68rem] text-muted-foreground">
                {(lifeProgress * 100).toFixed(0)}% through its life
                {countdown ? ` · ${countdown}` : ""}
              </p>
            </div>
          ) : null}
          {(() => {
            const links = [
              managerInfo?.website ? { label: "Manager site", href: managerInfo.website } : null,
              managerInfo?.navUrl ? { label: "NAV reports", href: managerInfo.navUrl } : null,
              managerInfo?.reportsUrl
                ? { label: "Fund reports", href: managerInfo.reportsUrl }
                : null,
            ].flatMap((l) => (l ? [l] : []));
            return links.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    {l.label} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            ) : null;
          })()}
        </Section>

        <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
          NAV, holdings and returns come from the community fund feed and the manager's published
          reports, indicative only, not investment advice. Past performance doesn't predict future
          returns. Mutual fund investments are subject to market risks.
        </p>
      </div>
    </TooltipProvider>
  );
}

const DONUT_COLORS = [
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#14b8d4",
  "#f43f5e",
  "#6366f1",
];

/** Top-6 + Others donut with the total in the middle. */
function HoldingsDonut({
  holdings,
  total,
}: {
  holdings: { stockSymbol: string; marketValue: number | null }[];
  total: number;
}) {
  const top = holdings.slice(0, 6);
  const topSum = top.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const rest = total - topSum;
  const slices = top.map((h) => ({ name: h.stockSymbol, value: h.marketValue ?? 0 }));
  if (rest > 0.001) slices.push({ name: "Others", value: rest });
  let acc = 25; // start at top
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-surface p-3">
      <div className="relative size-28 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-0">
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            strokeWidth="6"
            className="stroke-muted"
          />
          {slices.map((s, i) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            const el = (
              <circle
                key={s.name}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                strokeWidth="6"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeDasharray={`${Math.max(0, pct - 0.6)} 100`}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
              />
            );
            acc += pct;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-sm font-bold">{formatNpr(total, { compact: true })}</span>
          <span className="text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground">
            Total
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.slice(0, 5).map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-[11px]">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
            <span className="num font-bold text-muted-foreground">
              {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
        <li className="num text-[10px] text-muted-foreground">
          {holdings.length} holdings · ≈ {formatNpr(total, { compact: true })}
        </li>
      </ul>
    </div>
  );
}

function DocRowIcon({ title, date }: { title: string; date: string | null }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold group-hover:text-primary">
          {title}
        </span>
        {date ? <span className="num block text-[10px] text-muted-foreground">{date}</span> : null}
      </span>
    </>
  );
}

function DocGroup({
  label,
  docs,
  accent,
  onPreview,
}: {
  label: string;
  docs: { title: string; date: string | null; url: string | null; category: string | null }[];
  accent: string;
  onPreview?: (title: string, url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const visible = open ? docs : docs.slice(0, 3);
  return (
    <div className="rounded-xl border border-border/60 bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", accent)}>
          <FileText className="size-3.5" /> {label}
          <span className="num rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
            {docs.length}
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul className="space-y-1 border-t border-border/60 px-2 py-2">
          {visible.map((d, i) => (
            <li key={`${d.title}-${i}`}>
              {d.url ? (
                onPreview ? (
                  <button
                    type="button"
                    onClick={() => onPreview(d.title, d.url)}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <DocRowIcon title={d.title} date={d.date} />
                    <Eye className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </button>
                ) : (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <DocRowIcon title={d.title} date={d.date} />
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </a>
                )
              ) : (
                <p className="truncate px-1.5 py-1 text-xs">{d.title}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {!open && docs.length > 0 ? (
        <div className="px-3 pb-2.5">
          <p className="truncate text-[11px] font-medium text-muted-foreground">
            Latest: <span className="text-foreground">{docs[0]?.title}</span>
          </p>
          {docs[0]?.date ? (
            <p className="num mt-0.5 text-[10px] text-muted-foreground">{docs[0]?.date}</p>
          ) : null}
        </div>
      ) : null}
      {open && docs.length > 3 ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full border-t border-border/60 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Show fewer
        </button>
      ) : null}
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num text-sm font-bold">{value}</p>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface px-3 py-2.5">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num mt-0.5 text-base font-bold", tone)}>
        {value}{" "}
        {hint ? (
          <span className="align-middle text-[0.65rem] font-medium normal-case tracking-normal text-muted-foreground/70">
            {hint}
          </span>
        ) : null}
      </p>
    </div>
  );
}

const LTP_RANGES: { key: string; label: string; range: ChartRange }[] = [
  { key: "1M", label: "1M", range: "1M" },
  { key: "6M", label: "6M", range: "6M" },
  { key: "1Y", label: "1Y", range: "1Y" },
  { key: "5Y", label: "5Y", range: "5Y" },
  { key: "ALL", label: "All", range: "MAX" },
];

const LTP_FREQS: { key: LtpFrequency; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

/** Market-price journey: LTP history with ranges, Best Entry/Exit and range position. */
function PriceNavChart({
  symbol,
  nav,
  closeEnd,
}: {
  symbol: string;
  nav: MfNavPoint[];
  closeEnd: boolean;
}) {
  const [range, setRange] = useState<ChartRange>("1Y");
  const [freq, setFreq] = useState<LtpFrequency>("daily");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seriesQ = useQuery({ ...chartSeriesQuery(symbol, range), enabled: closeEnd });

  const buckets = useMemo(() => bucketCloses(seriesQ.data?.bars ?? [], freq), [seriesQ.data, freq]);
  const stats = useMemo(() => journeyStats(buckets), [buckets]);

  const W = 640;
  const H = 210;
  const PAD = 12;
  const geom = useMemo(() => {
    const t = (d: string) => Date.parse(`${d}T00:00:00Z`);

    // Close-end: combine LTP buckets + NAV overlay
    if (closeEnd && buckets.length >= 2) {
      const t0 = t(buckets[0]!.date);
      const t1 = t(buckets[buckets.length - 1]!.date);
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
      const navIn = nav.filter((p) => {
        const pt = t(p.date);
        return Number.isFinite(pt) && pt >= t0 && pt <= t1 && p.nav > 0;
      });
      const lo = Math.min(
        ...buckets.map((b) => b.ltp),
        ...navIn.map((p) => p.nav),
        ...navIn.map((p) => p.adjNav),
      );
      const hi = Math.max(
        ...buckets.map((b) => b.ltp),
        ...navIn.map((p) => p.nav),
        ...navIn.map((p) => p.adjNav),
      );
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      const span = t1 - t0;
      const rg = hi - lo || 1;
      const x = (ms: number) => PAD + ((ms - t0) / span) * (W - PAD * 2);
      const y = (v: number) => PAD + (1 - (v - lo) / rg) * (H - PAD * 2);
      const ltpPath = buckets
        .map((b, i) => `${i === 0 ? "M" : "L"} ${x(t(b.date)).toFixed(1)},${y(b.ltp).toFixed(1)}`)
        .join(" ");
      let navPath = "";
      let adjNavPath = "";
      navIn.forEach((p, i) => {
        const X = x(t(p.date)).toFixed(1);
        navPath += i === 0 ? `M ${X},${y(p.nav).toFixed(1)}` : ` H ${X} V ${y(p.nav).toFixed(1)}`;
        adjNavPath +=
          i === 0 ? `M ${X},${y(p.adjNav).toFixed(1)}` : ` H ${X} V ${y(p.adjNav).toFixed(1)}`;
      });
      return { t0, t1, x, y, ltpPath, navPath, adjNavPath, navIn, lo, hi };
    }

    // Open-end: NAV + adjusted NAV lines
    if (!closeEnd && nav.length >= 2) {
      const validNav = nav.filter((p) => {
        const pt = t(p.date);
        return Number.isFinite(pt) && p.nav > 0;
      });
      if (validNav.length < 2) return null;
      const t0 = t(validNav[0]!.date);
      const t1 = t(validNav[validNav.length - 1]!.date);
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
      const lo = Math.min(...validNav.map((p) => p.nav), ...validNav.map((p) => p.adjNav));
      const hi = Math.max(...validNav.map((p) => p.nav), ...validNav.map((p) => p.adjNav));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      const span = t1 - t0;
      const rg = hi - lo || 1;
      const x = (ms: number) => PAD + ((ms - t0) / span) * (W - PAD * 2);
      const y = (v: number) => PAD + (1 - (v - lo) / rg) * (H - PAD * 2);
      const navPath = validNav
        .map((p, i) => `${i === 0 ? "M" : "L"} ${x(t(p.date)).toFixed(1)},${y(p.nav).toFixed(1)}`)
        .join(" ");
      const adjNavPath = validNav
        .map(
          (p, i) => `${i === 0 ? "M" : "L"} ${x(t(p.date)).toFixed(1)},${y(p.adjNav).toFixed(1)}`,
        )
        .join(" ");
      return { t0, t1, x, y, ltpPath: "", navPath, adjNavPath, navIn: validNav, lo, hi };
    }

    return null;
  }, [buckets, nav, closeEnd]);

  const hovered = hover != null ? (buckets[hover] ?? null) : null;
  const hoverNav =
    hovered != null && geom
      ? ([...geom.navIn].reverse().find((p) => p.date <= hovered.date) ?? null)
      : null;
  const hoverDisc =
    hovered && hoverNav && hoverNav.nav > 0
      ? ((hovered.ltp - hoverNav.nav) / hoverNav.nav) * 100
      : null;

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || !geom || buckets.length === 0) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const ms = geom.t0 + ((frac * W - PAD) / (W - PAD * 2)) * (geom.t1 - geom.t0);
    let best = 0;
    let bestGap = Infinity;
    buckets.forEach((b, i) => {
      const gap = Math.abs(Date.parse(`${b.date}T00:00:00Z`) - ms);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    setHover(best);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {closeEnd ? (
          <>
            <div className="flex rounded-full border border-border/60 bg-surface p-1">
              {LTP_RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRange(r.range)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    range === r.range ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-full border border-border/60 bg-surface p-1">
              {LTP_FREQS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFreq(f.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    freq === f.key ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <span className="num ml-auto text-[11px] text-muted-foreground">
          {closeEnd && buckets.length > 0 ? `${buckets.length} points` : ""}
        </span>
      </div>

      {!closeEnd && nav.length < 2 ? (
        <p className="rounded-xl bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
          Not enough NAV history for {symbol} yet.
        </p>
      ) : closeEnd && seriesQ.isLoading ? (
        <div className="flex h-44 items-center justify-center rounded-xl bg-surface text-xs text-muted-foreground">
          Loading market prices…
        </div>
      ) : closeEnd && !stats ? (
        <p className="rounded-xl bg-surface px-3 py-6 text-center text-xs text-muted-foreground">
          No market price history for {symbol} in this range yet.
        </p>
      ) : geom ? (
        <>
          {closeEnd && stats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SnapshotStat label="Latest" value={formatNpr(stats.latest.ltp)} />
              <SnapshotStat
                label="Range move"
                value={formatPercent(stats.changePct)}
                tone={stats.changePct >= 0 ? "text-gain" : "text-loss"}
              />
              <SnapshotStat label="High" value={formatNpr(stats.high)} />
              <SnapshotStat label="Low" value={formatNpr(stats.low)} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {closeEnd ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-5 rounded-full bg-primary" /> Market price
              </span>
            ) : null}
            {geom.navIn.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "w-5",
                    closeEnd
                      ? "h-0 border-t-2 border-dashed border-amber-500"
                      : "h-0.5 rounded-full bg-amber-500",
                  )}
                />{" "}
                NAV (price only)
              </span>
            ) : null}
            {geom.navIn.some((p) => p.adjNav !== p.nav) ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-5 border-t-2 border-dashed border-emerald-500" /> Total
                return (incl. dividends)
              </span>
            ) : null}
            {closeEnd ? <span className="ml-auto hidden sm:inline">Hover for values</span> : null}
          </div>

          <div
            ref={wrapRef}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            className="relative"
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-52 w-full"
              role="img"
              aria-label={closeEnd ? "Market price with NAV overlay" : "NAV history"}
            >
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={PAD}
                  x2={W - PAD}
                  y1={H * f}
                  y2={H * f}
                  className="stroke-muted"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              ))}
              {geom.navPath ? (
                <path
                  d={geom.navPath}
                  fill="none"
                  stroke={closeEnd ? "#f59e0b" : "#f59e0b"}
                  strokeWidth="2"
                  strokeDasharray={closeEnd ? "6 3" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {geom.adjNavPath && geom.navIn.some((p) => p.adjNav !== p.nav) ? (
                <path
                  d={geom.adjNavPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {closeEnd && geom.ltpPath ? (
                <path
                  d={geom.ltpPath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {hovered && geom ? (
                <g>
                  <line
                    x1={geom.x(Date.parse(`${hovered.date}T00:00:00Z`))}
                    x2={geom.x(Date.parse(`${hovered.date}T00:00:00Z`))}
                    y1={PAD}
                    y2={H - PAD}
                    className="stroke-foreground/30"
                    strokeWidth="1"
                  />
                  <circle
                    cx={geom.x(Date.parse(`${hovered.date}T00:00:00Z`))}
                    cy={geom.y(hovered.ltp)}
                    r="4"
                    fill="var(--primary)"
                    stroke="var(--background)"
                    strokeWidth="2"
                  />
                </g>
              ) : null}
            </svg>
            {hovered && geom ? (
              <div
                className="num pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
                style={{
                  left: `${Math.min(88, Math.max(12, (geom.x(Date.parse(`${hovered.date}T00:00:00Z`)) / W) * 100))}%`,
                  top: 0,
                }}
              >
                <p className="font-bold text-muted-foreground">{hovered.date}</p>
                {closeEnd ? (
                  <p className="font-bold text-primary">Price {formatNpr(hovered.ltp)}</p>
                ) : null}
                {hoverNav ? (
                  <>
                    <p className="font-bold text-amber-600 dark:text-amber-400">
                      NAV {formatNpr(hoverNav.nav)}
                    </p>
                    {hoverNav.adjNav !== hoverNav.nav ? (
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        Total {formatNpr(hoverNav.adjNav)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {closeEnd && hoverDisc != null ? (
                  <p className={cn("font-bold", hoverDisc <= 0 ? "text-gain" : "text-loss")}>
                    {hoverDisc <= 0 ? "" : "+"}
                    {hoverDisc.toFixed(2)}% vs NAV
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {closeEnd && stats ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-gain/25 bg-gain/5 p-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-gain">
                  Best entry · lowest price
                </p>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <p className="num text-lg font-bold text-gain">
                    {formatNpr(stats.bestEntry.ltp)}
                  </p>
                  <p className="num text-[11px] text-muted-foreground">{stats.bestEntry.date}</p>
                </div>
                <p className="num mt-1 text-[11px] text-muted-foreground">
                  Latest is {formatPercent(stats.fromBestEntryPct)} from this point
                </p>
              </div>
              <div className="rounded-xl border border-loss/25 bg-loss/5 p-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-widest text-loss">
                  Best exit · highest price
                </p>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <p className="num text-lg font-bold text-loss">{formatNpr(stats.bestExit.ltp)}</p>
                  <p className="num text-[11px] text-muted-foreground">{stats.bestExit.date}</p>
                </div>
                <p className="num mt-1 text-[11px] text-muted-foreground">
                  Latest is {formatPercent(stats.fromBestExitPct)} from this point
                </p>
              </div>
            </div>
          ) : null}

          {closeEnd && stats ? (
            <div className="rounded-xl border border-border/60 bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
                    Range position
                  </p>
                  <p className="num mt-1 text-xs text-muted-foreground">
                    Average {formatNpr(stats.average)}
                  </p>
                </div>
                <p className="num text-sm font-bold">{stats.rangePositionPct.toFixed(0)}%</p>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.max(0, stats.rangePositionPct))}%` }}
                  title={`Current price is ${stats.rangePositionPct.toFixed(0)}% of the way between the period's low (${formatNpr(stats.low)}) and high (${formatNpr(stats.high)})`}
                />
              </div>
              <div className="num mt-1.5 flex justify-between text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                <span>{formatNpr(stats.low)}</span>
                <span>{formatNpr(stats.high)}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
