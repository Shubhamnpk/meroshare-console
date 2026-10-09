import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StockCompare } from "@/components/tools/stock-compare";

export const Route = createFileRoute("/_dash/stock-compare")({
  head: () => ({
    meta: [
      { title: "Stock Compare | MeroShare Investor Console" },
      {
        name: "description",
        content: "Compare up to 4 NEPSE stocks side-by-side on P/E, ROE, dividends, score and more.",
      },
      { property: "og:title", content: "Stock Compare | MeroShare" },
    ],
  }),
  component: StockComparePage,
});

function StockComparePage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else void navigate({ to: "/tools" });
          }}
          aria-label="Back to tools"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <GitCompareArrows className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Stock Compare</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Side-by-side comparison of fundamentals, valuation and scores.
          </p>
        </div>
      </div>

      <StockCompare />
    </div>
  );
}
