import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
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
  const { autoRefresh, refreshMinutes } = useSettings();
  const interval = autoRefresh ? refreshMinutes * 60_000 : false;
  const screenerQuery = useQuery({ ...screenerDataQuery(), refetchInterval: interval });
  const sectorsQuery = useQuery({ ...marketSectorsQuery(), refetchInterval: interval });
  const snapshotQuery = useQuery({ ...marketSnapshotQuery(), refetchInterval: interval });
  const prices = screenerQuery.data?.prices ?? [];
  const indices = snapshotQuery.data?.indices ?? [];
  const sectorIndices = sectorsQuery.data ?? [];

  const nepseGraph = useQuery({ ...indexGraphQuery("NEPSE"), refetchInterval: interval });
  const sensitiveGraph = useQuery({ ...indexGraphQuery("SENSITIVE"), refetchInterval: interval });
  const floatGraph = useQuery({ ...indexGraphQuery("FLOAT"), refetchInterval: interval });

  const isFetching =
    screenerQuery.isFetching ||
    sectorsQuery.isFetching ||
    snapshotQuery.isFetching ||
    nepseGraph.isFetching ||
    sensitiveGraph.isFetching ||
    floatGraph.isFetching;

  const refreshAll = () => {
    void screenerQuery.refetch();
    void sectorsQuery.refetch();
    void snapshotQuery.refetch();
    void nepseGraph.refetch();
    void sensitiveGraph.refetch();
    void floatGraph.refetch();
  };

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
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold sm:text-3xl">Market Depth &amp; Heatmap</h1>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-none">
            Live ticker tape, benchmarks with all-time history, market breadth, and sector depth
            matrix.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "hidden rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline",
              autoRefresh ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground",
            )}
            title={
              autoRefresh
                ? `Auto-refreshes every ${refreshMinutes} minute${refreshMinutes === 1 ? "" : "s"} (change in Settings)`
                : "Auto-refresh is off (change in Settings)"
            }
          >
            {autoRefresh ? `Auto · ${refreshMinutes}m` : "Manual"}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={refreshAll}
            disabled={isFetching}
            aria-label="Refresh market depth"
            title="Refresh now"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {screenerQuery.isLoading ? (
        <LoadingBlock label="Loading market depth" />
      ) : screenerQuery.isError ? (
        <ErrorBlock error={screenerQuery.error} retry={() => void screenerQuery.refetch()} />
      ) : (
        <>
          {(snapshotQuery.isError || sectorsQuery.isError) && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs"
            >
              <TriangleAlert className="size-4 shrink-0 text-amber-400" />
              <span className="min-w-0 flex-1 text-muted-foreground">
                {snapshotQuery.isError && sectorsQuery.isError
                  ? "Market indices and sub-indices failed to load — charts and points may be incomplete."
                  : snapshotQuery.isError
                    ? "Market indices failed to load — benchmarks may be incomplete."
                    : "Sub-indices failed to load — sector points may be incomplete."}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (snapshotQuery.isError) void snapshotQuery.refetch();
                  if (sectorsQuery.isError) void sectorsQuery.refetch();
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-amber-500/40 bg-surface px-2.5 py-1 font-semibold text-amber-500 transition-colors hover:bg-amber-500/10"
              >
                <RotateCcw className="size-3" />
                Retry
              </button>
            </div>
          )}
          <MarketOverview
            prices={prices}
            indices={indices}
            sectorIndices={sectorIndices}
            indexGraphQueries={indexGraphQueries}
          />
        </>
      )}
    </div>
  );
}
