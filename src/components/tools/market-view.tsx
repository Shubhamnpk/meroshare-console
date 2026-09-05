import { useMemo } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  Eye,
  FileText,
  Hourglass,
  Landmark,
  PieChart,
  Stamp,
} from "lucide-react";
import { formatNpr } from "@/lib/format";
import { useDocViewer } from "@/components/ui/use-doc-viewer";
import {
  MF_PIPELINE_TYPES,
  type MfApproval,
  type MfDebentureSummary,
  type MfHoldingsMap,
  type MfPerformance,
  type MfPipeline,
  type MfPipelineOverview,
  type MfPipelineType,
  type MfScheme,
} from "@/lib/mutual-funds/types";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { StockMap } from "./stock-map";

function Donut({ slices }: { slices: { label: string; pct: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.pct, 0) || 1;
  let acc = 0;
  const stops = slices
    .map((s) => {
      const from = (acc / total) * 360;
      acc += s.pct;
      const to = (acc / total) * 360;
      return `${s.color} ${from}deg ${to}deg`;
    })
    .join(", ");
  return (
    <div className="flex items-center gap-4">
      <div
        className="size-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label={slices.map((s) => `${s.label} ${s.pct.toFixed(0)}%`).join(", ")}
      >
        <div className="flex size-full items-center justify-center">
          <div className="flex size-16 flex-col items-center justify-center rounded-full bg-card">
            <span className="num text-sm font-bold">{total.toFixed(0)}%</span>
            <span className="text-[0.6rem] uppercase text-muted-foreground">mapped</span>
          </div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="num font-bold">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketView({
  schemes,
  performances,
  pipeline,
  pipeType,
  onPipeType,
  pipeOverview,
  approvals,
  debentures,
  onPickFund,
  stockMap,
  stockMapLoading,
}: {
  schemes: MfScheme[];
  performances: Map<string, MfPerformance>;
  pipeline: MfPipeline | null;
  pipeType: MfPipelineType;
  onPipeType: (t: MfPipelineType) => void;
  pipeOverview: MfPipelineOverview | null;
  approvals: MfApproval[];
  debentures: MfDebentureSummary | null;
  onPickFund: (symbol: string) => void;
  stockMap?: MfHoldingsMap | null;
  stockMapLoading?: boolean;
}) {
  const industry = useMemo(() => {
    let cap = 0;
    let fix = 0;
    let cash = 0;
    let size = 0;
    let mapped = 0;
    for (const s of schemes) {
      const p = performances.get(s.symbol);
      const w = p?.totalPaidUp ?? s.paidUp ?? 0;
      size += w;
      if (
        p &&
        w > 0 &&
        (p.capitalMarketPct ?? 0) + (p.fixedIncomePct ?? 0) + (p.cashPct ?? 0) > 0
      ) {
        cap += (p.capitalMarketPct ?? 0) * w;
        fix += (p.fixedIncomePct ?? 0) * w;
        cash += (p.cashPct ?? 0) * w;
        mapped += w;
      }
    }
    return {
      size,
      cap: mapped > 0 ? cap / mapped : 0,
      fix: mapped > 0 ? fix / mapped : 0,
      cash: mapped > 0 ? cash / mapped : 0,
      coverage: size > 0 ? (mapped / size) * 100 : 0,
    };
  }, [schemes, performances]);

  const pipelineSymbols = useMemo(() => {
    // Match upcoming names to listed symbols so tapping jumps to the live fund.
    const byName = new Map(schemes.map((s) => [s.name.toLowerCase(), s.symbol]));
    return new Map(
      (pipeline?.items ?? []).map((item) => {
        const hit = [...byName.entries()].find(
          ([name]) =>
            name.includes(item.company.toLowerCase().slice(0, 12)) ||
            item.company.toLowerCase().includes(name.slice(0, 12)),
        );
        return [item.company, hit?.[1] ?? null] as const;
      }),
    );
  }, [pipeline, schemes]);

  const { openPreview, modal: docModal } = useDocViewer();

  return (
    <div className="space-y-4">
      {docModal}
      {/* Where the industry's money sits */}
      <Panel as="section">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          <PieChart className="size-4 text-primary" /> Where the industry's money sits
        </h3>
        <p className="num mt-1 text-xs text-muted-foreground">
          {formatNpr(industry.size, { compact: true })} across {schemes.length} schemes
          {industry.coverage > 0 ? ` · mix mapped for ${industry.coverage.toFixed(0)}%` : ""}
        </p>
        <div className="mt-3">
          <Donut
            slices={[
              { label: "Shares", pct: industry.cap, color: "var(--primary)" },
              { label: "Bonds & debentures", pct: industry.fix, color: "#a78bfa" },
              { label: "Cash", pct: industry.cash, color: "var(--muted-foreground)" },
            ]}
          />
        </div>
        <p className="mt-3 text-[0.68rem] leading-relaxed text-muted-foreground">
          Weighted by fund size from the latest disclosed portfolios. When this tilts toward cash,
          managers are waiting, often the brave moment to buy discounted units.
        </p>
      </Panel>

      {/* Industry stock map */}
      {stockMapLoading ? (
        <Panel as="section">
          <div className="h-5 w-52 animate-pulse rounded-lg bg-muted" />
          <div className="mt-3 space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        </Panel>
      ) : stockMap && stockMap.slices.length > 0 ? (
        <StockMap
          map={stockMap}
          title="Where all funds are betting"
          hint="Every disclosed stock holding across every scheme, combined, the market's most-crowded bets in one view."
          initial={10}
        />
      ) : null}

      {/* Coming soon */}
      {pipeline && pipeline.items.length > 0 ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Hourglass className="size-4 text-primary" /> Coming soon
            <span className="num rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {pipeline.count}
            </span>
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {MF_PIPELINE_TYPES.map((t) => {
              const count = pipeOverview?.counts[t];
              const active = pipeType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPipeType(t)}
                  className={cn(
                    "num rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {t === "mfs" ? "MFs" : t}
                  {count != null ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>
          <p className="num mt-1.5 text-xs text-muted-foreground">
            {formatNpr(pipeline.totalAmount ?? 0, { compact: true })} awaiting SEBON approval
            {pipeline.asOfBs ? ` · as of ${pipeline.asOfBs}` : ""}
          </p>
          <ul className="mt-3 space-y-2">
            {pipeline.items.map((item) => {
              const listed = pipelineSymbols.get(item.company);
              const inner = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{item.company}</span>
                    <span className="num block text-[11px] text-muted-foreground">
                      {item.amount != null ? formatNpr(item.amount, { compact: true }) : ""}
                      {item.units != null
                        ? ` · ${formatNpr(item.units, { compact: true })} units`
                        : ""}
                      {item.issueType ? ` · ${item.issueType}` : ""}
                      {item.sector ? ` · ${item.sector}` : ""}
                      {item.appliedDate ? ` · applied ${item.appliedDate}` : ""}
                    </span>
                  </span>
                  {item.status ? (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      {item.status}
                    </span>
                  ) : null}
                  {listed ? (
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </>
              );
              return (
                <li
                  key={`${item.company}-${item.units ?? ""}-${item.appliedDate ?? ""}`}
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2"
                  title={item.remarks ?? undefined}
                >
                  {listed ? (
                    <button
                      type="button"
                      onClick={() => onPickFund(listed)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* Fresh approvals */}
      {approvals.length > 0 ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Stamp className="size-4 text-primary" /> Fresh SEBON approvals
          </h3>
          <ul className="mt-2 divide-y divide-border/50">
            {approvals.map((a) => (
              <li key={`${a.title}-${a.bsDate ?? ""}`} className="py-2">
                {a.pdfUrl ? (
                  <button
                    type="button"
                    onClick={() => openPreview(a.title, a.pdfUrl)}
                    className="group flex w-full items-center gap-2 text-left"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium group-hover:text-primary">
                        {a.title}
                      </span>
                      <span className="num block text-[11px] text-muted-foreground">
                        {a.bsDate ?? a.adDate ?? ""}
                      </span>
                    </span>
                    <Eye className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.title}</span>
                      <span className="num block text-[11px] text-muted-foreground">
                        {a.bsDate ?? a.adDate ?? ""}
                      </span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Fixed-income corner */}
      {debentures && debentures.top.length > 0 ? (
        <Panel as="section">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Landmark className="size-4 text-primary" /> Fixed-income corner
          </h3>
          <p className="num mt-1 text-xs text-muted-foreground">
            {debentures.count} debentures from {debentures.issuers} issuers
            {debentures.couponMin != null && debentures.couponMax != null
              ? ` · coupons ${debentures.couponMin.toFixed(2)}–${debentures.couponMax.toFixed(2)}%`
              : ""}
          </p>
          <ul className="mt-3 space-y-2">
            {debentures.top.map((d) => (
              <li
                key={`${d.issuer}-${d.instrument}`}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2"
              >
                <span
                  className={cn(
                    "num flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gain/10 font-bold text-gain",
                  )}
                >
                  <span className="text-sm leading-none">
                    {d.couponPct != null ? d.couponPct.toFixed(2) : "-"}
                  </span>
                  <span className="text-[0.6rem] font-medium">%</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{d.issuer}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {d.instrument}
                  </span>
                  <span className="num block text-[11px] text-muted-foreground">
                    {d.dateBs ? `${d.dateBs}` : ""}
                    {d.issueManager ? ` · ${d.issueManager}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-start gap-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            <BadgePercent className="mt-0.5 size-3 shrink-0" />
            Compare these locked-in coupons against a fund's expected payout before choosing between
            steady income and market upside.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
