import { createFileRoute } from "@tanstack/react-router";
import { Calculator } from "lucide-react";
import { DividendVsFd } from "@/components/tools/dividend-vs-fd";

export const Route = createFileRoute("/_dash/dividend-vs-fd")({
  head: () => ({
    meta: [
      { title: "Dividend vs FD | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Compare dividend investing with fixed deposit returns over time with reinvestment.",
      },
      { property: "og:title", content: "Dividend vs FD Calculator | MeroShare" },
    ],
  }),
  component: DividendVsFdPage,
});

function DividendVsFdPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Calculator className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Dividend vs FD
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            See if dividend investing beats fixed deposits over your time horizon.
          </p>
        </div>
      </div>

      <DividendVsFd />
    </div>
  );
}
