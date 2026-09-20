import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  screenerDataQuery,
  marketSectorsQuery,
  marketSnapshotQuery,
  indexGraphQuery,
} from "@/lib/queries";
import { MarketOverview } from "@/components/tools/market-overview";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { canonicalLink, ogImage } from "@/lib/seo";

export const Route = createFileRoute("/_dash/market-depth")({
  head: () => ({
    meta: [
      { title: "Market Depth | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "NEPSE market depth console: live marquee ticker, indices with full-range charts, sector depth matrix, and heatmaps.",
      },
      { property: "og:title", content: "Market Depth | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "NEPSE market depth console: live marquee ticker, indices with full-range charts, sector depth matrix, and heatmaps.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/market-depth")],
  }),
  component: MarketDepthPage,
});

function MarketDepthPage() {
  const navigate = useNavigate();
  const screenerQuery = useQuery(screenerDataQuery());
  const sectorsQuery = useQuery(marketSectorsQuery());
  const snapshotQuery = useQuery(marketSnapshotQuery());
  const prices = screenerQuery.data?.prices ?? [];
  const indices = snapshotQuery.data?.indices ?? [];
  const sectorIndices = sectorsQuery.data ?? [];

  const nepseGraph = useQuery(indexGraphQuery("NEPSE"));
  const sensitiveGraph = useQuery(indexGraphQuery("SENSITIVE"));
  const floatGraph = useQuery(indexGraphQuery("FLOAT"));

  const indexGraphQueries: Record<
    string,
    { data?: import("@/lib/nepse/types").PricePoint[]; isLoading: boolean }
  > = {
    NEPSE: { data: nepseGraph.data, isLoading: nepseGraph.isLoading },
    SENSITIVE: {
      data: sensitiveGraph.data,
      isLoading: sensitiveGraph.isLoading,
    },
    FLOAT: { data: floatGraph.data, isLoading: floatGraph.isLoading },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => void navigate({ to: "/market" })}
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
          <Globe className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-3xl">Market Depth &amp; Heatmap</h1>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none">
            Live ticker tape, benchmarks with all-time history, market breadth, and sector depth
            matrix.
          </p>
        </div>
      </div>

      {screenerQuery.isLoading ? (
        <LoadingBlock label="Loading market depth" />
      ) : screenerQuery.isError ? (
        <ErrorBlock error={screenerQuery.error} retry={() => void screenerQuery.refetch()} />
      ) : (
        <MarketOverview
          prices={prices}
          indices={indices}
          sectorIndices={sectorIndices}
          indexGraphQueries={indexGraphQueries}
        />
      )}
    </div>
  );
}
