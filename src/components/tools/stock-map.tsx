import { useState } from "react";
import { Layers } from "lucide-react";
import { formatNpr } from "@/lib/format";
import type { MfHoldingsMap } from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
  "bg-primary",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-sky-400",
  "bg-rose-400",
  "bg-teal-300",
  "bg-orange-400",
];

/**
 * A ranked, weight-barred stock map: every stock's share of the combined
 * disclosed portfolio. Made for house-level and market-wide views.
 */
export function StockMap({
  map,
  title,
  hint,
  initial = 8,
}: {
  map: MfHoldingsMap;
  title: string;
  hint?: string;
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const slices = expanded ? map.slices : map.slices.slice(0, initial);
  const shownWeight = slices.reduce((s, x) => s + x.weightPct, 0);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Layers className="size-4 text-primary" /> {title}
        </h3>
        <p className="num text-[11px] text-muted-foreground">
          {formatNpr(map.totalMarketValue, { compact: true })} mapped · {map.coverage} schemes
        </p>
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}

      {slices.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface px-3 py-4 text-center text-xs text-muted-foreground">
          No disclosed stock holdings yet.
        </p>
      ) : (
        <>
          <ol className="mt-3 space-y-2.5">
            {slices.map((s, i) => (
              <li key={s.stockSymbol}>
                <div className="flex items-baseline gap-2.5 text-xs">
                  <span
                    className={cn(
                      "num w-5 shrink-0 text-right font-bold",
                      i < 3 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="w-20 shrink-0 truncate font-bold">{s.stockSymbol}</span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        BAR_COLORS[i % BAR_COLORS.length],
                      )}
                      style={{ width: `${Math.min(100, Math.max(2, s.weightPct))}%` }}
                    />
                  </span>
                  <span className="num w-14 shrink-0 text-right font-bold">
                    {s.weightPct.toFixed(1)}%
                  </span>
                </div>
                <p className="num mt-0.5 pl-7 text-[0.68rem] text-muted-foreground sm:pl-0 sm:text-right">
                  {formatNpr(s.marketValue, { compact: true })}
                  {s.schemes > 1 ? ` · in ${s.schemes} schemes` : ""}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex items-center justify-between">
            <p className="num text-[0.68rem] text-muted-foreground">
              Top {slices.length} ≈ {shownWeight.toFixed(0)}% of mapped money
            </p>
            {map.slices.length > initial ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {expanded ? "Show fewer" : `All ${map.slices.length}`}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
