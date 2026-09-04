import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { HistoryPanel } from "@/components/portfolio/history-panel";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { enrichedPortfolioQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
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
    links: [
      canonicalLink("/analytics"),
    ],
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
];

interface Slice {
  name: string;
  value: number;
}

function ActiveSector(props: ComponentProps<typeof Sector>) {
  const radius = typeof props.outerRadius === "number" ? props.outerRadius : 88;
  return <Sector {...props} outerRadius={radius + 5} />;
}

function AllocationPie({
  title,
  slices,
  total,
  onPick,
}: {
  title: string;
  slices: Slice[];
  total: number;
  onPick?: (name: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex != null ? slices[activeIndex] : undefined;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <h2 className="mb-3 font-display text-base font-semibold">{title}</h2>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative h-52 w-full max-w-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
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
                {slices.map((s, i) => (
                  <Cell key={s.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                wrapperStyle={{ zIndex: 50, outline: "none" }}
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: "0.75rem",
                }}
                formatter={(value: number, name: string) => [
                  `${formatNpr(value, { compact: true })} (${total > 0 ? ((value / total) * 100).toFixed(1) : "0"}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="max-w-24 truncate text-xs font-semibold">
              {active ? active.name : "Total"}
            </span>
            <span className="num text-sm font-semibold">
              {formatNpr(active ? active.value : total, { compact: true })}
            </span>
          </div>
        </div>
        <ul className="grid w-full gap-1.5">
          {slices.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(slices.indexOf(s))}
                onMouseLeave={() => setActiveIndex(null)}
                onClick={() => onPick?.(s.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-accent/10"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="num shrink-0 text-muted-foreground">
                  {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
                </span>
                <span className="num shrink-0 font-medium">
                  {formatNpr(s.value, { compact: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AnalyticsPage() {
  const q = useQuery(enrichedPortfolioQuery());
  const [picked, setPicked] = useState<string | null>(null);

  const holdings = q.data?.holdings ?? [];
  const total = q.data?.totalValue ?? 0;

  const rows = holdings
    .map((h) => ({
      scrip: h.scrip,
      name: h.name,
      value: h.value,
      weight: total > 0 ? (h.value / total) * 100 : 0,
      pct: h.previousClose > 0 ? h.percentChange : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const top5 = rows.slice(0, 5).reduce((s, r) => s + r.weight, 0);
  const gainers = rows.filter((r) => r.pct > 0);
  const losers = rows.filter((r) => r.pct < 0);
  const movers = [...rows]
    .filter((r) => r.pct !== 0)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 5);

  const sectorSlices: Slice[] = (q.data?.sectors ?? []).map((s) => ({
    name: s.sector,
    value: s.value,
  }));
  const hasSectors = sectorSlices.length > 1;

  const scripSlices: Slice[] =
    rows.length <= 8
      ? rows.map((r) => ({ name: r.scrip, value: r.value }))
      : [
          ...rows.slice(0, 7).map((r) => ({ name: r.scrip, value: r.value })),
          { name: "Others", value: rows.slice(7).reduce((s, r) => s + r.value, 0) },
        ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Analytics</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          How your capital is distributed today.
        </p>
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Crunching numbers" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          title="Nothing to analyse"
          description="Analytics appear once you hold at least one scrip."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total value" value={formatNpr(total)} tone="brand" />
            <StatCard
              label="Top 5 concentration"
              value={`${top5.toFixed(1)}%`}
              sub="Share of portfolio in largest 5 scrips"
            />
            <StatCard
              label="Gainers today"
              value={`${gainers.length}/${rows.length}`}
              sub={`${losers.length} losing · ${rows.length - gainers.length - losers.length} flat`}
            />
          </div>

          <div className={`grid gap-4 ${hasSectors ? "lg:grid-cols-2" : ""}`}>
            {hasSectors ? (
              <AllocationPie title="Allocation by sector" slices={sectorSlices} total={total} />
            ) : null}
            <AllocationPie
              title="Allocation by scrip"
              slices={scripSlices}
              total={total}
              onPick={setPicked}
            />
          </div>

          {movers.length > 0 ? (
            <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <h2 className="mb-3 font-display text-base font-semibold">Biggest movers today</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {movers.map((m) => (
                  <li key={m.scrip}>
                    <button
                      type="button"
                      onClick={() => setPicked(m.scrip)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left transition-colors hover:border-primary/30"
                    >
                      <span className="text-sm font-medium">{m.scrip}</span>
                      <span
                        className={`num inline-flex items-center gap-0.5 text-sm font-semibold ${m.pct > 0 ? "text-gain" : "text-loss"}`}
                      >
                        {m.pct > 0 ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <ArrowDownRight className="size-3.5" />
                        )}
                        {formatPercent(Math.abs(m.pct))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <h2 className="mb-4 font-display text-base font-semibold">Allocation by scrip</h2>
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.scrip}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <button
                      type="button"
                      onClick={() => setPicked(r.scrip)}
                      className="font-medium transition-colors hover:text-primary"
                    >
                      {r.scrip}
                    </button>
                    <span className="num text-muted-foreground">
                      {formatNpr(r.value)} · {r.weight.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(r.weight, 1)}%`,
                        background: "var(--gradient-brand)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

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
