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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="group flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-primary/40 sm:p-6"
          >
            <div className="flex items-start justify-between">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <tool.icon className="size-5" />
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground">
                {tool.tag}
              </span>
            </div>
            <div>
              <p className="font-display text-lg font-semibold">{tool.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open tool
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
