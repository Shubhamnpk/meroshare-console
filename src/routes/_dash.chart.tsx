import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DeltaPill } from "@/components/stat-card";
import { NeoCandlestickChart } from "@/components/market/candlestick-chart";
import { marketSnapshotQuery, scripDetailQuery } from "@/lib/queries";
import { formatNpr, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_dash/chart")({
  head: () => ({
    meta: [
      { title: "Trading Chart | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Free candlestick chart for the Nepali market (NEPSE) — search any listed scrip. Powered by your own NEPSE data mirror.",
      },
      { property: "og:title", content: "Trading Chart | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Daily candlestick chart for every NEPSE-listed scrip.",
      },
    ],
  }),
  component: ChartPage,
});

const DEFAULT_SYMBOL = "NABIL";
const QUICK = ["NABIL", "NRIC", "SHIVM", "HDL", "NMB", "NTC", "ICICIBANK", "KBL", "NIMB"];

function ChartPage() {
  const { theme } = useSettings();
  const light =
    theme === "light" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);

  const snapshot = useQuery(marketSnapshotQuery());
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [query, setQuery] = useState("");

  const detail = useQuery(scripDetailQuery(symbol));

  const prices = useMemo(() => snapshot.data?.prices ?? [], [snapshot.data?.prices]);
  const price = prices.find((p) => p.symbol === symbol);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return prices.slice(0, 8);
    return prices
      .filter((p) => p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [prices, query]);

  const pick = (s: string) => {
    setSymbol(s);
    setQuery("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Trading Chart</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Candlestick charts for every listed scrip on NEPSE — free, using your own NEPSE data.
          </p>
        </div>
        <a
          href="/market"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Go to market <ArrowUpRight className="size-3" />
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            const first = results[0];
            if (first) pick(first.symbol);
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scrip, e.g. NABIL, NRIC, SHIVM…"
            className="h-10 rounded-xl pl-9 pr-20"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
            disabled={!results.length}
          >
            Go
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                symbol === s
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {query && results.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {results.map((p) => (
              <button
                key={p.symbol}
                type="button"
                onClick={() => pick(p.symbol)}
                className={cn(
                  "flex items-center justify-between rounded-xl border border-border/60 bg-surface px-2.5 py-2 text-left transition-colors hover:border-primary/40",
                  symbol === p.symbol && "border-primary/40 bg-background/50",
                )}
              >
                <span className="truncate font-semibold">{p.symbol}</span>
                <DeltaPill value={p.percentChange}>{formatPercent(p.percentChange)}</DeltaPill>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {price ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-semibold num">{price.symbol}</p>
              <p className="text-xs text-muted-foreground">{price.name}</p>
            </div>
            <div className="text-right">
              <p className="num text-lg font-semibold">{formatNpr(price.ltp)}</p>
              <DeltaPill value={price.percentChange}>{formatPercent(price.percentChange)}</DeltaPill>
            </div>
          </div>
        ) : null}

        {detail.isError ? (
          <p className="rounded-xl border border-border/60 bg-surface px-3 py-6 text-sm text-muted-foreground">
            No chart data for this scrip yet.
          </p>
        ) : detail.data?.history.length ? (
          <NeoCandlestickChart
            key={symbol + light}
            bars={detail.data!.history}
            theme={light ? "light" : "dark"}
            height={520}
          />
        ) : (
          <div className="animate-pulse">
            <div className="h-[300px] w-full rounded-xl border border-border/60 bg-surface" />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          OHLC from the public NEPSE mirror (bitnepal) + YONEPSE community feed — indicative,
          not for order placement. Daily candles.
        </p>
      </div>
    </div>
  );
}
