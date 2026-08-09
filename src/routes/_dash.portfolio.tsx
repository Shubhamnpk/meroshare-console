import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { DeltaPill } from "@/components/stat-card";
import { portfolioQuery } from "@/lib/queries";
import { formatNpr, formatPercent, formatQty, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_dash/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — MeroShare Investor Console" },
      { name: "description", content: "Every scrip in your demat account with LTP valuation and day change." },
      { property: "og:title", content: "Portfolio — MeroShare Investor Console" },
      { property: "og:description", content: "Every scrip in your demat account with LTP valuation and day change." },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const q = useQuery(portfolioQuery());
  const items = q.data?.meroShareMyPortfolio ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Portfolio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} scrip{items.length === 1 ? "" : "s"} valued at last traded price.
        </p>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No holdings" description="Your demat account currently holds no scrips." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="hidden grid-cols-[1.4fr_repeat(4,1fr)] gap-3 border-b border-border/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
            <span>Scrip</span><span className="text-right">Units</span><span className="text-right">LTP</span>
            <span className="text-right">Value</span><span className="text-right">Day</span>
          </div>
          <ul className="divide-y divide-border/60">
            {items.map((item, idx) => {
              const ltp = toNumber(item.lastTransactionPrice);
              const prev = toNumber(item.previousClosingPrice);
              const pct = prev ? ((ltp - prev) / prev) * 100 : 0;
              const scrip = String(item.scrip ?? item.script ?? "—");
              return (
                <li key={`${scrip}-${idx}`} className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-[1.4fr_repeat(4,1fr)] md:gap-3">
                  <span className="font-semibold">{scrip}</span>
                  <span className="num text-right">{formatQty(item.currentBalance)}</span>
                  <span className="num text-right text-muted-foreground md:text-foreground">{formatNpr(ltp)}</span>
                  <span className="num text-right font-medium">{formatNpr(item.valueAsOfLastTransactionPrice)}</span>
                  <span className="flex justify-end"><DeltaPill value={pct}>{formatPercent(pct)}</DeltaPill></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
