import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Building2,
  Calculator,
  ClipboardList,
  Clock,
  GitCompareArrows,
  Globe,
  Landmark,
  PiggyBank,
  Search,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/tools")({
  head: () => ({
    meta: [
      { title: "Tools | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Investor tools: stock screener, sector heatmap, stock compare, mutual funds, broker analytics and more.",
      },
      { property: "og:title", content: "Tools | MeroShare Investor Console" },
    ],
  }),
  component: ToolsPage,
});

const TOOLS = [
  {
    to: "/best-shares",
    icon: TrendingUp,
    title: "Best Shares",
    description:
      "Top-ranked NEPSE stocks by short-term momentum and long-term fundamentals, with red-flag checks.",
    tag: "Screener",
  },
  {
    to: "/market-depth",
    icon: Globe,
    title: "Market Depth",
    description:
      "Live ticker tape, all-time charts for indices & sectors, market breadth, and sector depth matrix.",
    tag: "Market",
  },
  {
    to: "/stock-compare",
    icon: GitCompareArrows,
    title: "Stock Compare",
    description: "Side-by-side comparison of P/E, ROE, dividends and scores for up to 4 stocks.",
    tag: "Compare",
  },
  {
    to: "/dividend-vs-fd",
    icon: Calculator,
    title: "Dividend vs FD",
    description: "Compare dividend investing with fixed deposit returns over your time horizon.",
    tag: "Calculator",
  },
  {
    to: "/mutual-funds",
    icon: PiggyBank,
    title: "Mutual Funds",
    description:
      "Every mutual fund scheme listed on NEPSE with live price, distributions and yield in one table.",
    tag: "Funds",
  },
  {
    to: "/brokers",
    icon: Building2,
    title: "Brokers",
    description:
      "Daily floor sheet, money flow, biggest trades and the full NEPSE broker directory.",
    tag: "Market flow",
  },
  {
    to: "/ipo-pipeline",
    icon: ClipboardList,
    title: "IPO Pipeline",
    description:
      "Every IPO, right, FPO and debenture issue waiting on SEBON approval, plus fresh approvals.",
    tag: "Pipeline",
  },
  {
    to: "/debentures",
    icon: Landmark,
    title: "Debentures",
    description: "Follow listed debentures, coupons and maturities in one place.",
    tag: "Bonds",
  },
  {
    to: "/time-machine",
    icon: Clock,
    title: "Time Machine",
    description:
      "What if you had bought then? Backtest SIP, bonus and cash dividends against every close.",
    tag: "Backtester",
  },
] as const;

function ToolsPage() {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string>("All");

  const tags = useMemo(() => ["All", ...new Set(TOOLS.map((t) => t.tag))], []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return TOOLS.filter(
      (t) =>
        (tag === "All" || t.tag === tag) &&
        (!term ||
          t.title.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term)),
    );
  }, [query, tag]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
          <Blocks className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Tools</h1>
          <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
            Small helpers for researching the Nepali market. Informational only not
            financial advice.
          </p>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            aria-label="Search tools"
            className="h-10 w-full rounded-xl border border-border/60 bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-hidden"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                tag === t
                  ? "border-primary/60 bg-primary/15 text-primary font-semibold"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No tools match “{query.trim()}”</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different search or category.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTag("All");
            }}
            className="mt-3 rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-md sm:p-5"
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
              <div className="relative flex items-start justify-between gap-2">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
                  <tool.icon className="size-5" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tool.tag}
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:text-primary" />
                </span>
              </div>
              <div className="relative mt-3 min-w-0 flex-1">
                <p className="font-display text-base font-semibold sm:text-lg">{tool.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
              </div>
              <span className="relative mt-3 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open tool <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
