import { createFileRoute } from "@tanstack/react-router";
import { GitCompareArrows } from "lucide-react";
import { StockCompare } from "@/components/tools/stock-compare";

export const Route = createFileRoute("/_dash/stock-compare")({
  head: () => ({
    meta: [
      { title: "Stock Compare | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Compare up to 4 NEPSE stocks side-by-side on P/E, ROE, dividends, score and more.",
      },
      { property: "og:title", content: "Stock Compare | MeroShare" },
    ],
  }),
  component: StockComparePage,
});

function StockComparePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <GitCompareArrows className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Stock Compare
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Side-by-side comparison of fundamentals, valuation and scores.
          </p>
        </div>
      </div>

      <StockCompare />
    </div>
  );
}
