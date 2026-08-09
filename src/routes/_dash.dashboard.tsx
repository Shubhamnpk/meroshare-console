import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Briefcase, Rocket, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard, DeltaPill } from "@/components/stat-card";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { applicableIssuesQuery, portfolioQuery } from "@/lib/queries";
import { formatDate, formatNpr, formatPercent, formatQty, toNumber } from "@/lib/format";

export const Route = createFileRoute("/_dash/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MeroShare Investor Console" },
      { name: "description", content: "Live snapshot of your MeroShare portfolio value, day movers and open IPO issues." },
      { property: "og:title", content: "Dashboard — MeroShare Investor Console" },
      { property: "og:description", content: "Live snapshot of your MeroShare portfolio value, day movers and open issues." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const portfolio = useQuery(portfolioQuery());
  const issues = useQuery(applicableIssuesQuery());

  const items = portfolio.data?.meroShareMyPortfolio ?? [];
  const ltpTotal = toNumber(portfolio.data?.totalValueAsOfLastTransactionPrice);
  const prevTotal = toNumber(portfolio.data?.totalValueAsOfPreviousClosingPrice);
  const change = ltpTotal - prevTotal;
  const changePct = prevTotal ? (change / prevTotal) * 100 : 0;
  const totalUnits = items.reduce((sum, i) => sum + toNumber(i.currentBalance), 0);

  const movers = items
    .map((item) => {
      const ltp = toNumber(item.lastTransactionPrice);
      const prev = toNumber(item.previousClosingPrice);
      const pct = prev ? ((ltp - prev) / prev) * 100 : 0;
      return {
        scrip: String(item.scrip ?? item.script ?? "—"),
        ltp,
        pct,
        value: toNumber(item.valueAsOfLastTransactionPrice),
      };
    })
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 6);

  const openIssues = (issues.data ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your holdings valued at last traded price, refreshed every minute.
        </p>
      </div>

      {portfolio.isLoading ? (
        <LoadingBlock label="Loading portfolio" />
      ) : portfolio.isError ? (
        <ErrorBlock error={portfolio.error} retry={() => void portfolio.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Portfolio value (LTP)"
              value={formatNpr(ltpTotal)}
              tone="brand"
              icon={<Briefcase className="size-4" />}
              sub={
                <span className="flex items-center gap-2">
                  <DeltaPill value={change}>
                    {change >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {formatPercent(changePct)}
                  </DeltaPill>
                  vs previous close
                </span>
              }
            />
            <StatCard
              label="Value at previous close"
              value={formatNpr(prevTotal)}
              sub="Yesterday's closing valuation"
            />
            <StatCard
              label="Day change"
              value={formatNpr(Math.abs(change))}
              tone={change >= 0 ? "gain" : "loss"}
              sub={change >= 0 ? "Unrealised gain today" : "Unrealised loss today"}
            />
            <StatCard
              label="Scrips held"
              value={items.length}
              sub={`${formatQty(totalUnits)} total units`}
            />
          </div>

          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold">Today's movers</h2>
              <Link to="/portfolio" className="text-xs font-medium text-primary hover:underline">
                View portfolio
              </Link>
            </div>
            {movers.length === 0 ? (
              <EmptyBlock title="No holdings yet" description="Scrips in your demat account will appear here." />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {movers.map((m) => (
                  <li
                    key={m.scrip}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.scrip}</p>
                      <p className="num text-xs text-muted-foreground">{formatNpr(m.value)}</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-medium">{formatNpr(m.ltp)}</p>
                      <DeltaPill value={m.pct}>{formatPercent(m.pct)}</DeltaPill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold">Open issues</h2>
          <Link to="/ipo" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Apply <ArrowUpRight className="size-3" />
          </Link>
        </div>
        {issues.isLoading ? (
          <LoadingBlock label="Loading issues" rows={2} />
        ) : issues.isError ? (
          <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
        ) : openIssues.length === 0 ? (
          <EmptyBlock
            title="No open issues"
            description="New IPO, FPO and right share offerings you can apply for will show up here."
            icon={<Rocket className="size-6" />}
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {openIssues.map((issue) => (
              <li
                key={issue.companyShareId}
                className="rounded-xl border border-border/60 bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{issue.companyName}</p>
                    <p className="num text-xs text-muted-foreground">
                      {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                    {issue.statusName ?? "Open"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Closes {formatDate(issue.issueCloseDate)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
