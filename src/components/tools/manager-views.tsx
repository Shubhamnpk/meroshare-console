import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Landmark,
  PieChart,
  ScrollText,
} from "lucide-react";
import { DeltaPill } from "@/components/stat-card";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import type { LivePrice } from "@/lib/nepse/types";
import type {
  MfHoldingsMap,
  MfManagerDetail,
  MfManagerFacts,
  MfPerformance,
  MfProduct,
} from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { discountPct, referenceNav, type ManagerAgg } from "./mf-math";
import { StockMap } from "./stock-map";

function shortName(name: string): string {
  return name.replace(/ Capital( Limited)?$| Mutual Fund$/i, "").trim() || name;
}

export function ManagerGrid({
  aggs,
  onPick,
}: {
  aggs: ManagerAgg[];
  onPick: (slug: string) => void;
}) {
  const sorted = useMemo(() => [...aggs].sort((a, b) => b.aum - a.aum), [aggs]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((a) => (
        <button
          key={a.manager.slug}
          type="button"
          onClick={() => onPick(a.manager.slug)}
          className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-sm font-bold text-primary">
                {shortName(a.manager.name).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-bold leading-tight">
                  {shortName(a.manager.name)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {a.schemes.length} scheme{a.schemes.length === 1 ? "" : "s"}
                  {a.openCount > 0 && a.closeCount > 0
                    ? ` · ${a.openCount} open / ${a.closeCount} closed`
                    : ""}
                </p>
              </div>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>

          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Funds managed
              </p>
              <p className="num text-xl font-bold">
                {a.aum > 0 ? formatNpr(a.aum, { compact: true }) : "-"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Avg. discount
              </p>
              <p
                className={cn(
                  "num text-sm font-bold",
                  a.avgDiscount != null && a.avgDiscount < -2 && "text-gain",
                )}
              >
                {a.avgDiscount != null ? formatPercent(a.avgDiscount) : "-"}
              </p>
            </div>
          </div>

          {a.allocCap + a.allocFix + a.allocCash > 0 ? (
            <div
              className="flex h-1.5 gap-px overflow-hidden rounded-full"
              title={`Shares ${a.allocCap.toFixed(0)}% · Bonds ${a.allocFix.toFixed(0)}% · Cash ${a.allocCash.toFixed(0)}%`}
            >
              <div className="bg-primary" style={{ width: `${a.allocCap}%` }} />
              <div className="bg-violet-400" style={{ width: `${a.allocFix}%` }} />
              <div className="bg-muted-foreground/40" style={{ width: `${a.allocCash}%` }} />
            </div>
          ) : null}

          <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <span>
              {a.bargains > 0 ? (
                <span className="font-semibold text-gain">
                  {a.bargains} bargain{a.bargains === 1 ? "" : "s"}
                </span>
              ) : (
                "No deep discounts"
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              View funds <ArrowUpRight className="size-3" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ManagerDetail({
  agg,
  facts,
  detail,
  products,
  livePrices,
  performances,
  stockMap,
  stockMapLoading,
  onPickFund,
  onBack,
}: {
  agg: ManagerAgg;
  facts: MfManagerFacts | null;
  detail: MfManagerDetail | null;
  products: MfProduct[];
  livePrices: Map<string, LivePrice>;
  performances: Map<string, MfPerformance>;
  stockMap?: MfHoldingsMap | null;
  stockMapLoading?: boolean;
  onPickFund: (symbol: string) => void;
  onBack: () => void;
}) {
  const m = agg.manager;
  const mfBlurb = products.find((p) => p.type === "mutual_fund")?.description ?? null;
  const otherProducts = products.filter((p) => p.type !== "mutual_fund").slice(0, 4);
  const rows = useMemo(
    () =>
      agg.schemes.map((s) => {
        const p = performances.get(s.symbol) ?? null;
        const live = livePrices.get(s.symbol) ?? null;
        const { nav } = p ? referenceNav(p) : { nav: null as number | null };
        return {
          scheme: s,
          perf: p,
          live,
          nav,
          discount: discountPct(live?.ltp ?? p?.ltp ?? null, nav),
        };
      }),
    [agg.schemes, performances, livePrices],
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All managers
      </button>

      <Panel padding="none" className="overflow-hidden" as="section">
        <div className="bg-gradient-to-br from-primary/15 via-transparent to-transparent p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 font-display text-lg font-bold text-primary">
                {shortName(m.name).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold sm:text-2xl">{m.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {agg.schemes.length} scheme{agg.schemes.length === 1 ? "" : "s"}
                  {agg.openCount > 0 && agg.closeCount > 0
                    ? ` · ${agg.openCount} open-end / ${agg.closeCount} close-end`
                    : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Funds managed
              </p>
              <p className="num text-2xl font-bold">
                {agg.aum > 0 ? formatNpr(agg.aum, { compact: true }) : "-"}
              </p>
              {agg.avgDiscount != null ? (
                <p className="num text-xs text-muted-foreground">
                  avg.{" "}
                  <span className={cn("font-semibold", agg.avgDiscount < -2 && "text-gain")}>
                    {formatPercent(agg.avgDiscount)}
                  </span>{" "}
                  vs NAV
                </p>
              ) : null}
            </div>
          </div>
          {mfBlurb ? (
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              {mfBlurb}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {m.website ? <ManagerLink href={m.website} label="Website" /> : null}
            {m.navUrl ? <ManagerLink href={m.navUrl} label="Daily NAV" /> : null}
            {m.reportsUrl ? <ManagerLink href={m.reportsUrl} label="Reports" /> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
          <HeroTile label="Schemes" value={String(agg.schemes.length)} />
          <HeroTile label="Open-end" value={agg.openCount > 0 ? String(agg.openCount) : "-"} />
          <HeroTile label="Close-end" value={agg.closeCount > 0 ? String(agg.closeCount) : "-"} />
          <HeroTile
            label="Bargains"
            value={agg.bargains > 0 ? String(agg.bargains) : "-"}
            accent={agg.bargains > 0}
          />
        </div>

        {agg.allocCap + agg.allocFix + agg.allocCash > 0 ? (
          <div className="border-t border-border/60 px-4 py-3 sm:px-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <PieChart className="size-3.5 text-primary" /> Where this house invests
            </p>
            <div className="mt-2 flex h-2.5 gap-1 overflow-hidden rounded-full">
              <div className="bg-primary" style={{ width: `${agg.allocCap}%` }} />
              <div className="bg-violet-400" style={{ width: `${agg.allocFix}%` }} />
              <div className="bg-muted-foreground/40" style={{ width: `${agg.allocCash}%` }} />
            </div>
            <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Shares {agg.allocCap.toFixed(0)}%</span>
              <span>Bonds {agg.allocFix.toFixed(0)}%</span>
              <span>Cash {agg.allocCash.toFixed(0)}%</span>
            </div>
          </div>
        ) : null}
      </Panel>

      {/* House stock map */}
      {stockMapLoading ? (
        <Panel as="section">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-muted" />
          <div className="mt-3 space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        </Panel>
      ) : stockMap && stockMap.slices.length > 0 ? (
        <StockMap
          map={stockMap}
          title={`Where ${shortName(m.name)}'s money sits`}
          hint="Every disclosed stock holding across this house's schemes, combined, ranked by rupees invested."
        />
      ) : null}

      {/* Schemes */}
      <Panel as="section">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Landmark className="size-4 text-primary" /> Schemes
          <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {rows.length}
          </span>
        </h3>
        <ul className="mt-2 divide-y divide-border/50">
          {rows.map((r) => (
            <li key={r.scheme.symbol}>
              <button
                type="button"
                onClick={() => onPickFund(r.scheme.symbol)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">{r.scheme.symbol}</span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold text-primary">
                      {r.scheme.fundType === "open_end" ? "Open" : "Closed"}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {r.scheme.name}
                  </span>
                </span>
                <span className="num hidden shrink-0 text-right text-xs sm:block">
                  <span className="block text-muted-foreground">
                    NAV {r.nav != null ? formatNpr(r.nav) : "-"}
                  </span>
                  <span className="block font-semibold">
                    {(r.live?.ltp ?? r.perf?.ltp) != null
                      ? formatNpr(r.live?.ltp ?? r.perf?.ltp ?? 0)
                      : "-"}{" "}
                    {r.live ? (
                      <DeltaPill value={r.live.percentChange}>
                        {formatPercent(r.live.percentChange)}
                      </DeltaPill>
                    ) : null}
                  </span>
                </span>
                <span
                  className={cn(
                    "num w-20 shrink-0 text-right text-xs font-bold",
                    r.discount != null && r.discount < -2 && "text-gain",
                    r.discount != null && r.discount > 2 && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {r.discount != null ? formatPercent(r.discount) : "-"}
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {/* House facts */}
      {facts && facts.facts.length > 0 ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ScrollText className="size-4 text-primary" /> About the house
          </h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {facts.facts.map((f) => (
              <div
                key={f.label}
                className={cn(
                  "rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-[13px]",
                  f.value.length > 90 && "sm:col-span-2",
                )}
              >
                <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="mt-1 leading-relaxed">{f.value}</dd>
              </div>
            ))}
          </dl>
          {facts.variants.length > 0 ? (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="text-xs font-semibold">Known schemes & variants</p>
              <ul className="mt-1.5 space-y-1.5">
                {facts.variants.slice(0, 6).map((v) => (
                  <li key={v.name} className="text-[13px]">
                    <span className="font-medium">{v.name}</span>
                    {v.description ? (
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {v.description}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Beyond mutual funds */}
      {otherProducts.length > 0 ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Building2 className="size-4 text-primary" /> Also from this house
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {otherProducts.map((p) => (
              <span
                key={p.type}
                title={p.description ?? p.label}
                className="rounded-full border border-border/60 bg-surface px-2.5 py-1 text-[11px] font-medium"
              >
                {p.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {formatQty(otherProducts.length)} more service
            {otherProducts.length === 1 ? "" : "s"} beyond mutual funds, SIP, PMS, DP and issue
            management.
          </p>
        </Panel>
      ) : null}

      {/* Documents & portals */}
      {detail && (detail.portals.length > 0 || detail.documents.length > 0) ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ScrollText className="size-4 text-primary" /> Documents & portals
            <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {detail.documents.length}
            </span>
          </h3>
          {detail.portals.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {detail.portals.map((p) => (
                <ManagerLink key={p.url} href={p.url} label={p.label} />
              ))}
            </div>
          ) : null}
          {detail.sipOffered && detail.sipDetail ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">SIP: </span>
              {detail.sipDetail}
            </p>
          ) : null}
          {detail.documents.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {detail.documents.slice(0, 8).map((d, i) => (
                <li key={`${d.url ?? d.title}-${i}`}>
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium group-hover:text-primary">
                          {d.title}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {d.category ?? ""}
                          {d.scheme ? ` · ${d.scheme}` : ""}
                          {d.date ? ` · ${d.date}` : ""}
                        </span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-[13px]">
                      {d.title}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {detail.documents.length > 8 ? (
            <p className="num mt-2 text-[11px] text-muted-foreground">
              +{detail.documents.length - 8} more documents in the feed
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function HeroTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("num text-sm font-bold", accent && "text-gain")}>{value}</p>
    </div>
  );
}

function ManagerLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
    >
      {label} <ExternalLink className="size-3" />
    </a>
  );
}
