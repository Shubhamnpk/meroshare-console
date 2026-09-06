import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Blocks,
  Building2,
  ClipboardList,
  Landmark,
  PiggyBank,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_dash/tools")({
  head: () => ({
    meta: [
      { title: "Tools | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Investor tools: top-ranked shares, mutual funds and broker floor-sheet analytics.",
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
    tag: "Stock screener",
  },
  {
    to: "/mutual-funds",
    icon: PiggyBank,
    title: "Mutual Funds",
    description:
      "Every mutual fund scheme listed on NEPSE with live price, distributions and yield in one table.",
    tag: "Fund explorer",
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
    tag: "Coming soon",
  },
  {
    to: "/debentures",
    icon: Landmark,
    title: "Debentures",
    description: "Follow listed debentures, coupons and maturities in one place.",
    tag: "Bonds",
  },
] as const;

function ToolsPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Blocks className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Tools</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Small helpers for researching the Nepali market. Informational only not a advice
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 sm:flex-col sm:items-start sm:gap-4 sm:p-5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-11 sm:rounded-2xl">
              <tool.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 sm:flex-none">
              <p className="font-display text-sm font-semibold sm:text-lg">{tool.title}</p>
              <p className="hidden text-sm leading-relaxed text-muted-foreground sm:mt-1 sm:block">
                {tool.description}
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:ml-auto sm:hidden" />
          </Link>
        ))}
      </div>
    </div>
  );
}
