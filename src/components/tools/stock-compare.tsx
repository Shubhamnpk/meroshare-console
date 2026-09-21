import { useMemo, useState } from "react";
import { GitCompareArrows, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { screenerDataQuery } from "@/lib/queries";
import { computeLongTermScore, type LongTermScore } from "@/lib/nepse/screener";
import { formatNpr, formatPercent } from "@/lib/format";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { cn } from "@/lib/utils";

interface CompareRow {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  eps: number | null;
  dividendYield: number | null;
  dividendStreak: number;
  score: LongTermScore | null;
}

function CompareBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/50">
      <div
        className={cn("h-full rounded-full", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function StockCompare() {
  const [symbols, setSymbols] = useState<string[]>(["NABIL", "NICA"]);
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const screenerQuery = useQuery(screenerDataQuery());
  const prices = screenerQuery.data?.prices ?? [];
  const dividends = screenerQuery.data?.dividends ?? {};
  const faceValues = screenerQuery.data?.faceValues ?? {};
  const financials = screenerQuery.data?.financials ?? {};

  const rows = useMemo<CompareRow[]>(() => {
    return symbols
      .map((sym) => {
        const price = prices.find((p) => p.symbol === sym);
        if (!price) return null;
        const symDividends = dividends[sym] ?? [];
        const symFinancials = financials[sym] ?? null;
        const fv = faceValues[sym] ?? 100;
        const report = symFinancials?.[0] ?? null;
        const pe = report?.pe ?? null;
        const eps = report?.eps ?? null;
        const netWorth = report?.netWorthPerShare ?? null;
        const roe =
          eps != null && netWorth != null && netWorth > 0
            ? Math.round((eps / netWorth) * 1000) / 10
            : null;
        const pb =
          netWorth != null && netWorth > 0 ? price.ltp / netWorth : null;
        const latestDiv = symDividends[0] ?? null;
        const dividendYield =
          latestDiv && fv > 0 && price.ltp > 0
            ? (latestDiv.totalDividend * fv) / (price.ltp * 100)
            : null;
        const fiscalYears = [
          ...new Set(symDividends.map((d) => d.fiscalYear).filter(Boolean)),
        ]
          .sort()
          .reverse();
        let streak = 0;
        if (fiscalYears.length > 0) {
          let exp = parseInt(fiscalYears[0]!);
          for (const fy of fiscalYears) {
            const yr = parseInt(fy!);
            if (yr === exp) {
              streak++;
              exp--;
            } else if (yr < exp) break;
          }
        }

        const score = computeLongTermScore(
          price,
          symFinancials,
          symDividends,
          fv,
        );

        return {
          symbol: sym,
          name: price.name,
          ltp: price.ltp,
          change: price.percentChange,
          pe,
          pb,
          roe,
          eps,
          dividendYield:
            dividendYield != null
              ? Math.round(dividendYield * 100) / 100
              : null,
          dividendStreak: streak,
          score,
        };
      })
      .filter(Boolean) as CompareRow[];
  }, [symbols, prices, dividends, faceValues, financials]);

  const addSymbol = () => {
    const s = input.toUpperCase().trim();
    if (s && !symbols.includes(s) && symbols.length < 4) {
      setSymbols([...symbols, s]);
      setInput("");
    }
  };

  const removeSymbol = (sym: string) => {
    setSymbols(symbols.filter((s) => s !== sym));
  };

  const metrics = [
    { key: "ltp" as const, label: "LTP", format: (r: CompareRow) => formatNpr(r.ltp) },
    { key: "change" as const, label: "Change", format: (r: CompareRow) => formatPercent(r.change) },
    { key: "pe" as const, label: "P/E", format: (r: CompareRow) => (r.pe != null ? String(r.pe) : "-") },
    { key: "pb" as const, label: "P/B", format: (r: CompareRow) => (r.pb != null ? String(r.pb) : "-") },
    { key: "roe" as const, label: "ROE", format: (r: CompareRow) => (r.roe != null ? `${r.roe}%` : "-") },
    { key: "eps" as const, label: "EPS", format: (r: CompareRow) => (r.eps != null ? formatNpr(r.eps) : "-") },
    { key: "dividendYield" as const, label: "Div Yield", format: (r: CompareRow) => (r.dividendYield != null ? `${r.dividendYield}%` : "-") },
    { key: "dividendStreak" as const, label: "Streak", format: (r: CompareRow) => `${r.dividendStreak}y` },
    { key: "score" as const, label: "Score", format: (r: CompareRow) => (r.score?.score != null ? String(r.score.score) : "-") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GitCompareArrows className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Compare up to 4 stocks side-by-side.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((sym) => (
          <span
            key={sym}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-3 py-1 text-sm font-medium"
          >
            {sym}
            <button
              onClick={() => removeSymbol(sym)}
              className="ml-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {symbols.length < 4 && (
          <div className="flex items-center gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addSymbol()}
              placeholder="Add symbol..."
              className="w-24 rounded-full border border-border/70 bg-card px-3 py-1 text-sm outline-none focus:border-primary/50"
            />
            <button
              onClick={addSymbol}
              className="rounded-full bg-primary/15 p-1 text-primary hover:bg-primary/25"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Metric
                </th>
                {rows.map((r) => (
                  <th
                    key={r.symbol}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    {r.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 && (
                <tr className="border-b border-border/30 bg-muted/10">
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    Name
                  </td>
                  {rows.map((r) => (
                    <td
                      key={r.symbol}
                      className="px-3 py-1.5 text-right text-xs"
                    >
                      {r.name}
                    </td>
                  ))}
                </tr>
              )}
              {metrics.map((m) => (
                <tr key={m.key} className="border-b border-border/20">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {m.label}
                  </td>
                  {rows.map((r) => {
                    const val = r[m.key as keyof CompareRow];
                    const numVal =
                      typeof val === "number" ? val : null;
                    const allVals = rows
                      .map((rr) => rr[m.key as keyof CompareRow])
                      .filter((v): v is number => typeof v === "number");
                    const maxVal = Math.max(...allVals.map(Math.abs), 1);
                    return (
                      <td
                        key={r.symbol}
                        className={cn(
                          "px-3 py-2 text-right text-xs font-medium",
                          m.key === "change" && numVal != null
                            ? numVal >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            : "",
                          m.key === "score" && numVal != null
                            ? numVal >= 70
                              ? "text-emerald-400"
                              : numVal >= 50
                                ? "text-blue-400"
                                : "text-muted-foreground"
                            : "",
                        )}
                      >
                        {m.format(r)}
                        {numVal != null &&
                          m.key !== "ltp" &&
                          m.key !== "score" && (
                            <div className="mt-1">
                              <CompareBar
                                value={numVal}
                                max={maxVal}
                                color={
                                  numVal >= 0
                                    ? "bg-emerald-400"
                                    : "bg-red-400"
                                }
                              />
                            </div>
                          )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="rounded-xl border border-border/70 bg-card py-8 text-center text-sm text-muted-foreground">
          Add at least one valid symbol to start comparing.
        </div>
      )}

      {picked && (
        <ScripSheet
          symbol={picked}
          open={!!picked}
          onOpenChange={() => setPicked(null)}
        />
      )}
    </div>
  );
}
