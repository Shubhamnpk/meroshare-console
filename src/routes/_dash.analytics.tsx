import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ComponentProps } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { SwipeStrip, SwipeItem } from "@/components/swipeable-cards";
import { Heatmap, type HeatTile } from "@/components/market/heatmap";
import { ModeSwitch } from "@/components/market/heatmap-controls";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { HistoryPanel } from "@/components/portfolio/history-panel";
import { PortfolioDayCard } from "@/components/portfolio/portfolio-day-card";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { enrichedPortfolioQuery, globalValuationQuery } from "@/lib/queries";
import { formatNpr, formatPercent, formatQty } from "@/lib/format";
import { sectorOf } from "@/lib/nepse/sectors";
import { deriveHoldings, useGlobalTxns } from "@/lib/world/store";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics : MeroShare Investor Console" },
      {
        name: "description",
        content: "Concentration, weight and day-change analytics across your holdings.",
      },
      { property: "og:title", content: "Analytics : MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Concentration, weight and day-change analytics across your holdings.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/analytics")],
  }),
  component: AnalyticsPage,
});

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#0ea5e9",
  "#d946ef",
];
const OTHERS_COLOR = "#94a3b8";
/** Slices kept before the tail rolls into the expandable bucket row. */
const STOCK_KEEP = 5;
const SECTOR_KEEP = 5;

/** Anything past the cutoff rolls into a muted bucket slice. */
function collapseSlices(slices: Slice[], keep: number, othersLabel: string): Slice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  return [
    ...sorted.slice(0, keep),
    {
      name: othersLabel,
      value: sorted.slice(keep).reduce((s, r) => s + r.value, 0),
      others: true,
    },
  ];
}

interface Slice {
  name: string;
  value: number;
  /** Imported Global holding, valued in NPR like the demat rows. */
  foreign?: boolean;
  /** The rolled-up tail slice, drawn in muted grey. */
  others?: boolean;
}

/** Foreign lots carry fractions, kitta do not. */
function unitsLabel(row: { units: number; foreign: boolean }): string {
  return row.foreign ? String(Number(row.units.toFixed(6))) : formatQty(row.units);
}

function ActiveSector(props: ComponentProps<typeof Sector>) {
  const radius = typeof props.outerRadius === "number" ? props.outerRadius : 88;
  return <Sector {...props} outerRadius={radius + 5} />;
}

function PieTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload?: Slice }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  if (!first) return null;
  const { name, value } = first;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="max-w-[180px] rounded-xl border border-border/70 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="flex items-center gap-1 truncate font-semibold">
        {first.payload?.foreign ? <Globe className="size-3 shrink-0 text-info" /> : null}
        {name}
      </p>
      <p className="num mt-0.5 text-muted-foreground">
        {formatNpr(value, { compact: true })} ({pct}%)
      </p>
    </div>
  );
}

function AllocationPie({
  title,
  slices,
  total,
  keep,
  othersLabel = "Others",
  onPick,
}: {
  title: string;
  slices: Slice[];
  total: number;
  /** Wedges kept before the tail rolls into a bucket slice. */
  keep: number;
  /** Bucket name. Sectors already own a real "Others", so that pie renames it. */
  othersLabel?: string;
  onPick?: (name: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hasTail = slices.length > keep + 1;
  const visible = expanded ? slices : collapseSlices(slices, keep, othersLabel);
  const active = activeIndex != null ? visible[activeIndex] : undefined;

  const toggleExpanded = (next: boolean) => {
    setActiveIndex(null);
    setExpanded(next);
  };

  return (
    <Panel as="section">
      <h2 className="mb-3 font-display text-base font-semibold">{title}</h2>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-52 w-full max-w-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visible}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={2}
                strokeWidth={0}
                {...(activeIndex != null ? { activeIndex } : {})}
                activeShape={ActiveSector}
                onMouseEnter={(_, i) => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {visible.map((s, i) => (
                  <Cell key={s.name} fill={s.others ? OTHERS_COLOR : PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ zIndex: 50, outline: "none" }} content={<PieTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="max-w-24 truncate text-xs font-semibold">{active ? active.name : "Total"}</span>
            <span className="num text-sm font-semibold">
              {formatNpr(active ? active.value : total, { compact: true })}
            </span>
          </div>
        </div>
        <ul className="grid w-full gap-1.5">
          {visible.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => (s.others ? toggleExpanded(true) : onPick?.(s.name))}
                title={s.others ? `Show all ${slices.length}` : undefined}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-accent/10"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: s.others ? OTHERS_COLOR : PIE_COLORS[i % PIE_COLORS.length] }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="truncate font-medium">{s.name}</span>
                  {s.foreign ? <Globe className="size-3 shrink-0 text-info" aria-label="Global holding" /> : null}
                  {s.others ? (
                    <span className="shrink-0 text-[10px] font-semibold text-info">+{slices.length - keep} more</span>
                  ) : null}
                </span>
                <span className="num shrink-0 text-muted-foreground">
                  {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
                </span>
                <span className="num shrink-0 font-medium">{formatNpr(s.value, { compact: true })}</span>
                {s.others ? <ChevronDown className="size-3.5 shrink-0 text-info" aria-hidden /> : null}
              </button>
            </li>
          ))}
          {hasTail && expanded ? (
            <li>
              <button
                type="button"
                onClick={() => toggleExpanded(false)}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-xs font-semibold text-info transition-colors hover:bg-accent/10"
              >
                <ChevronUp className="size-3.5" /> Show top {keep} only
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </Panel>
  );
}

function AnalyticsPage() {
  const q = useQuery(enrichedPortfolioQuery());
  const [picked, setPicked] = useState<string | null>(null);
  const [heatGrouped, setHeatGrouped] = useState(false);
  const [heatSize, setHeatSize] = useState<"value" | "units">("value");

  const holdings = q.data?.holdings ?? [];

  // Demat book (NEPSE) plus the imported Global book, both valued in NPR.
  // Foreign rows stay tagged so clicks only drill into NEPSE-only sheets.
  const globalTxns = useGlobalTxns();
  const globalLots = useMemo(
    () =>
      deriveHoldings(globalTxns).map((h) => ({
        symbol: h.symbol,
        qty: h.qty,
        avgPrice: h.avgPrice,
        currency: h.currency,
      })),
    [globalTxns],
  );
  const globalValuation = useQuery({ ...globalValuationQuery(globalLots, true) });
  const globalRows = useMemo(() => (globalValuation.data?.rows ?? []).filter((r) => r.ok), [globalValuation.data]);

  const nepseTotal = q.data?.totalValue ?? 0;
  const globalTotal = globalRows.reduce((s, r) => s + r.valueNpr, 0);
  const total = nepseTotal + globalTotal;
  const hasGlobal = globalRows.length > 0;

  const rows = [
    ...holdings.map((h) => ({
      scrip: h.scrip,
      name: h.name,
      value: h.value,
      pct: h.previousClose > 0 ? h.percentChange : 0,
      sector: h.sector ?? sectorOf(h.scrip) ?? "Unclassified",
      units: h.units,
      ltp: h.ltp,
      foreign: false,
    })),
    ...globalRows.map((r) => ({
      scrip: r.symbol,
      name: r.name || r.symbol,
      value: r.valueNpr,
      pct: r.pct,
      sector: r.sector?.trim() || "Unclassified",
      units: r.qty,
      ltp: r.ltpNpr,
      foreign: true,
    })),
  ]
    .map((r) => ({ ...r, weight: total > 0 ? (r.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const rowByScrip = new Map(rows.map((r) => [r.scrip, r]));
  const nepseScrips = new Set(holdings.map((h) => h.scrip.toUpperCase()));
  const pickHolding = (scrip: string) => {
    if (nepseScrips.has(scrip.toUpperCase())) setPicked(scrip);
  };
  const renderHoldingTooltip = (tile: HeatTile) => {
    const r = rowByScrip.get(tile.key);
    if (!r) return null;
    return (
      <>
        <div className="flex flex-col gap-0.5 border-b border-border/50 pb-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-black uppercase tracking-wider">{r.scrip}</span>
            <span className="flex items-center gap-1">
              {r.foreign ? (
                <span className="flex items-center gap-0.5 rounded bg-info/10 px-1 text-[9px] font-bold uppercase tracking-wider text-info">
                  <Globe className="size-2.5" /> Global
                </span>
              ) : null}
              <span className="rounded bg-primary/10 px-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                {r.sector}
              </span>
            </span>
          </div>
          <span className="truncate text-[9px] font-medium text-muted-foreground">{r.name}</span>
        </div>
        <div className="space-y-1.5 text-[11px] font-semibold text-muted-foreground">
          <div className="flex justify-between gap-6">
            <span>{r.foreign ? "LTP (NPR):" : "LTP:"}</span>
            <span className="font-bold text-foreground">{formatNpr(r.ltp)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Units:</span>
            <span className="font-bold text-foreground">{unitsLabel(r)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Value:</span>
            <span className="font-bold text-foreground">
              {formatNpr(r.value, { compact: true })} ({r.weight.toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span>Day change:</span>
            <span className={cn("font-bold", r.pct >= 0 ? "text-gain" : "text-loss")}>{formatPercent(r.pct)}</span>
          </div>
        </div>
      </>
    );
  };

  const top5 = rows.slice(0, 5).reduce((s, r) => s + r.weight, 0);
  const gainers = rows.filter((r) => r.pct > 0);
  const losers = rows.filter((r) => r.pct < 0);
  const movers = [...rows]
    .filter((r) => r.pct !== 0)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  // One sector split across both books, so the pie matches the whole book.
  const bySector = new Map<string, number>();
  for (const r of rows) bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + r.value);
  const sectorSlices: Slice[] = [...bySector.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const hasSectors = sectorSlices.length > 1;

  const scripSlices: Slice[] = rows.map((r) => ({ name: r.scrip, value: r.value, foreign: r.foreign }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Analytics</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">How your capital is distributed today.</p>
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Crunching numbers" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock title="Nothing to analyse" description="Analytics appear once you hold at least one stock." />
      ) : (
        <>
          <SwipeStrip cols="sm:grid-cols-3">
            <SwipeItem>
              <StatCard
                label="Total value"
                value={formatNpr(total)}
                tone="brand"
                className="h-full"
                sub={
                  hasGlobal
                    ? `${formatNpr(nepseTotal, { compact: true })} NEPSE + ${formatNpr(globalTotal, { compact: true })} global`
                    : undefined
                }
              />
            </SwipeItem>
            <SwipeItem>
              <StatCard
                label="Top 5 concentration"
                value={`${top5.toFixed(1)}%`}
                sub="Share of portfolio in largest 5 stocks"
                className="h-full"
              />
            </SwipeItem>
            <SwipeItem>
              <StatCard
                label="Gainers today"
                value={`${gainers.length}/${rows.length}`}
                sub={`${losers.length} losing · ${rows.length - gainers.length - losers.length} flat`}
                className="h-full"
              />
            </SwipeItem>
          </SwipeStrip>

          <PortfolioDayCard holdings={holdings.map((h) => ({ scrip: h.scrip, units: h.units, price: h.ltp }))} />

          <Panel as="section">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Holdings heatmap</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <ModeSwitch
                  label="Size"
                  options={
                    [
                      { key: "value", label: "Value" },
                      { key: "units", label: "Units" },
                    ] as const
                  }
                  value={heatSize}
                  onChange={setHeatSize}
                />
                <ModeSwitch
                  label="Layout"
                  options={
                    [
                      { key: "grouped", label: "Grouped" },
                      { key: "mixed", label: "All mixed" },
                    ] as const
                  }
                  value={heatGrouped ? "grouped" : "mixed"}
                  onChange={(v) => setHeatGrouped(v === "grouped")}
                />
              </div>
            </div>
            <Heatmap
              sizeLabel={
                heatSize === "units"
                  ? hasGlobal
                    ? "units held (NEPSE + global)"
                    : "units held"
                  : hasGlobal
                    ? "holding value (NEPSE + global)"
                    : "holding value"
              }
              heightClass="h-[300px] sm:h-[360px]"
              onPick={pickHolding}
              renderTooltip={renderHoldingTooltip}
              tiles={rows.map((r) => {
                const tag = r.foreign ? " · Global" : "";
                const detail =
                  heatSize === "units"
                    ? `${unitsLabel(r)} units · ${formatPercent(r.pct)}`
                    : `${r.foreign ? "Global · " : ""}${formatPercent(r.pct)} · ${formatNpr(r.value, { compact: true })}`;
                const tile: HeatTile = {
                  key: r.scrip,
                  label: r.scrip,
                  detail,
                  value: heatSize === "units" ? Math.max(r.units, 0) : r.value,
                  change: r.pct,
                  title: `${r.scrip} (${r.name})${tag} · ${unitsLabel(r)} units · ${formatNpr(r.value)} · ${r.weight.toFixed(1)}% of portfolio · ${formatPercent(r.pct)} today`,
                };
                if (heatGrouped) tile.group = r.sector;
                if (r.foreign) tile.disabled = true;
                return tile;
              })}
            />
          </Panel>

          <div className={`grid gap-4 ${hasSectors ? "lg:grid-cols-2" : ""}`}>
            {hasSectors ? (
              <AllocationPie
                title="Allocation by sector"
                slices={sectorSlices}
                total={total}
                keep={SECTOR_KEEP}
                othersLabel="Other sectors"
              />
            ) : null}
            <AllocationPie
              title="Allocation by stock"
              slices={scripSlices}
              total={total}
              keep={STOCK_KEEP}
              onPick={pickHolding}
            />
          </div>

          {movers.length > 0 ? (
            <Panel as="section">
              <h2 className="mb-3 font-display text-base font-semibold">Biggest movers today</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {movers.map((m) => {
                  const inner = (
                    <>
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        {m.foreign ? <Globe className="size-3 shrink-0 text-info" aria-label="Global holding" /> : null}
                        <span className="truncate">{m.scrip}</span>
                      </span>
                      <span
                        className={`num inline-flex items-center gap-0.5 text-sm font-semibold ${m.pct > 0 ? "text-gain" : "text-loss"}`}
                      >
                        {m.pct > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {formatPercent(Math.abs(m.pct))}
                      </span>
                    </>
                  );
                  const shell =
                    "flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left";
                  return (
                    <li key={m.scrip}>
                      {m.foreign ? (
                        <div className={shell}>{inner}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPicked(m.scrip)}
                          className={`${shell} transition-colors hover:border-primary/30`}
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}
          <HistoryPanel holdings={holdings} onPickScrip={setPicked} />
        </>
      )}

      <ScripSheet
        symbol={picked}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      />
    </div>
  );
}
