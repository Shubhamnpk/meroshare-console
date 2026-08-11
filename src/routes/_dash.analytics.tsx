import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { portfolioQuery } from "@/lib/queries";
import { formatNpr, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_dash/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics : MeroShare Investor Console" },
      { name: "description", content: "Concentration, weight and day-change analytics across your holdings." },
      { property: "og:title", content: "Analytics : MeroShare Investor Console" },
      { property: "og:description", content: "Concentration, weight and day-change analytics across your holdings." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const q = useQuery(portfolioQuery());
  const items = q.data?.meroShareMyPortfolio ?? [];
  const total = items.reduce((s, i) => s + toNumber(i.valueAsOfLastTransactionPrice), 0);
  const rows = items
    .map((i) => {
      const value = toNumber(i.valueAsOfLastTransactionPrice);
      const ltp = toNumber(i.lastTransactionPrice);
      const prev = toNumber(i.previousClosingPrice);
      return {
        scrip: String(i.scrip ?? i.script ?? "—"),
        value,
        weight: total ? (value / total) * 100 : 0,
        pct: prev ? ((ltp - prev) / prev) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
  const top5 = rows.slice(0, 5).reduce((s, r) => s + r.weight, 0);
  const gainers = rows.filter((r) => r.pct > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">How your capital is distributed today.</p>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Crunching numbers" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock title="Nothing to analyse" description="Analytics appear once you hold at least one scrip." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total value" value={formatNpr(total)} tone="brand" />
            <StatCard label="Top 5 concentration" value={`${top5.toFixed(1)}%`} sub="Share of portfolio in largest 5 scrips" />
            <StatCard label="Gainers today" value={`${gainers}/${rows.length}`} sub="Scrips trading above previous close" />
          </div>
          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <h2 className="mb-4 font-display text-base font-semibold">Allocation by scrip</h2>
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.scrip}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{r.scrip}</span>
                    <span className="num text-muted-foreground">{formatNpr(r.value)} · {r.weight.toFixed(1)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(r.weight, 1)}%`, background: "var(--gradient-brand)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
