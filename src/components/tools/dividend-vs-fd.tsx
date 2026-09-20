import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DividendVsFd() {
  const [investment, setInvestment] = useState(100_000);
  const [divYield, setDivYield] = useState(5);
  const [fdRate, setFdRate] = useState(9.5);
  const [years, setYears] = useState(10);
  const [divGrowth, setDivGrowth] = useState(3);
  const [priceGrowth, setPriceGrowth] = useState(8);

  const results = useMemo(() => {
    // Stock scenario: dividends reinvested + price appreciation
    let stockUnits = investment; // start with NPR investment
    let stockValue = investment;
    const stockDividends: number[] = [];
    const fdValues: number[] = [];
    const stockValues: number[] = [];

    for (let y = 1; y <= years; y++) {
      const currentDivYield = divYield * Math.pow(1 + divGrowth / 100, y - 1);
      const annualDividend = stockValue * (currentDivYield / 100);
      stockDividends.push(annualDividend);
      // Reinvest dividends
      stockValue = stockValue * (1 + priceGrowth / 100) + annualDividend;
      stockValues.push(stockValue);

      // FD scenario: compound interest
      const fdValue = investment * Math.pow(1 + fdRate / 100, y);
      fdValues.push(fdValue);
    }

    const totalStockReturn = stockValues[years - 1] - investment;
    const totalFdReturn = fdValues[years - 1] - investment;
    const totalDividends = stockDividends.reduce((a, b) => a + b, 0);
    const effectiveStockYield =
      (totalStockReturn / investment / years) * 100;
    const effectiveFdYield =
      (totalFdReturn / investment / years) * 100;

    return {
      stockFinal: stockValues[years - 1],
      fdFinal: fdValues[years - 1],
      totalStockReturn,
      totalFdReturn,
      totalDividends,
      effectiveStockYield,
      effectiveFdYield,
      stockValues,
      fdValues,
      stockDividends,
    };
  }, [investment, divYield, fdRate, years, divGrowth, priceGrowth]);

  const [activeTab, setActiveTab] = useState<"summary" | "yearly">("summary");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Compare dividend investing vs fixed deposit over time.
        </span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Investment (NPR)",
            value: investment,
            onChange: setInvestment,
            step: 10000,
          },
          {
            label: "Dividend Yield %",
            value: divYield,
            onChange: setDivYield,
            step: 0.5,
          },
          {
            label: "FD Rate %",
            value: fdRate,
            onChange: setFdRate,
            step: 0.5,
          },
          {
            label: "Years",
            value: years,
            onChange: setYears,
            step: 1,
            min: 1,
            max: 30,
          },
          {
            label: "Div Growth %/yr",
            value: divGrowth,
            onChange: setDivGrowth,
            step: 1,
          },
          {
            label: "Price Growth %/yr",
            value: priceGrowth,
            onChange: setPriceGrowth,
            step: 1,
          },
        ].map((inp) => (
          <div key={inp.label}>
            <label className="mb-1 block text-[0.65rem] text-muted-foreground">
              {inp.label}
            </label>
            <input
              type="number"
              value={inp.value}
              onChange={(e) => inp.onChange(Number(e.target.value))}
              min={inp.min ?? 0}
              max={inp.max ?? 999}
              step={inp.step}
              className="w-full rounded-lg border border-border/70 bg-card px-3 py-1.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-[0.65rem] text-emerald-400">Stocks (dividends reinvested)</p>
          <p className="mt-1 text-xl font-bold text-emerald-400">
            {formatNpr(results.stockFinal)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-emerald-400/70">
            +{formatNpr(results.totalStockReturn)} ({results.effectiveStockYield.toFixed(1)}%/yr)
          </p>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
          <p className="text-[0.65rem] text-blue-400">Fixed Deposit</p>
          <p className="mt-1 text-xl font-bold text-blue-400">
            {formatNpr(results.fdFinal)}
          </p>
          <p className="mt-0.5 text-[0.65rem] text-blue-400/70">
            +{formatNpr(results.totalFdReturn)} ({results.effectiveFdYield.toFixed(1)}%/yr)
          </p>
        </div>
      </div>

      {/* Winner */}
      <div
        className={cn(
          "rounded-xl border p-3 text-center text-sm font-medium",
          results.stockFinal > results.fdFinal
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
            : "border-blue-500/30 bg-blue-500/5 text-blue-400",
        )}
      >
        {results.stockFinal > results.fdFinal
          ? `Stocks win by ${formatNpr(results.stockFinal - results.fdFinal)} over ${years} years`
          : `FD wins by ${formatNpr(results.fdFinal - results.stockFinal)} over ${years} years`}
      </div>

      {/* Dividend breakdown */}
      <div className="rounded-xl border border-border/70 bg-card p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Dividend income over {years} years: {formatNpr(results.totalDividends)}
        </p>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div
            className="bg-emerald-500"
            style={{
              width: `${(results.totalDividends / results.stockFinal) * 100}%`,
            }}
          />
          <div
            className="bg-emerald-500/30"
            style={{
              width: `${((results.stockFinal - results.totalDividends - investment) / results.stockFinal) * 100}%`,
            }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[0.6rem] text-muted-foreground/70">
          <span>
            Dividends:{" "}
            {((results.totalDividends / results.stockFinal) * 100).toFixed(0)}%
          </span>
          <span>Price gain: the rest</span>
        </div>
      </div>

      {/* Yearly toggle */}
      <div className="flex gap-1">
        {(["summary", "yearly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeTab === t
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "summary" ? "Summary" : "Year-by-Year"}
          </button>
        ))}
      </div>

      {activeTab === "yearly" && (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="px-3 py-1.5 text-left">Year</th>
                <th className="px-3 py-1.5 text-right">Stock Value</th>
                <th className="px-3 py-1.5 text-right">FD Value</th>
                <th className="px-3 py-1.5 text-right">Dividend</th>
                <th className="px-3 py-1.5 text-right">Diff</th>
              </tr>
            </thead>
            <tbody>
              {results.stockValues.map((sv, i) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="px-3 py-1.5">{i + 1}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-400">
                    {formatNpr(sv)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-blue-400">
                    {formatNpr(results.fdValues[i])}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {formatNpr(results.stockDividends[i])}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right font-medium",
                      sv > results.fdValues[i]
                        ? "text-emerald-400"
                        : "text-red-400",
                    )}
                  >
                    {sv > results.fdValues[i] ? "+" : ""}
                    {formatNpr(sv - results.fdValues[i])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
