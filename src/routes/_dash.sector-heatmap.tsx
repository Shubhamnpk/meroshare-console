import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import {
  screenerDataQuery,
  marketSectorsQuery,
  marketSnapshotQuery,
  indexGraphQuery,
} from "@/lib/queries";
import { MarketOverview } from "@/components/tools/market-overview";
import { LoadingBlock } from "@/components/states";

export const Route = createFileRoute("/_dash/sector-heatmap")({
  head: () => ({
    meta: [
      { title: "Market Depth | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "NEPSE market depth console: live marquee ticker, indices with full-range charts, sector depth matrix, and heatmaps.",
      },
      { property: "og:title", content: "Market Depth | MeroShare" },
    ],
  }),
  component: MarketOverviewPage,
});

function MarketOverviewPage() {
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
    { data: import("@/lib/nepse/types").PricePoint[] | undefined; isLoading: boolean }
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
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
          <Globe className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Market Depth &amp; Heatmap
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live ticker tape, benchmarks with all-time history, market breadth, and sector depth matrix.
          </p>
        </div>
      </div>

      {screenerQuery.isLoading ? (
        <LoadingBlock />
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
