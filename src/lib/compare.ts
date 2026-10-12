import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { screenerDataQuery } from "./queries";
import { computeLongTermScore, type LongTermScore } from "./nepse/screener";
import { formatNpr, formatPercent } from "./format";
import type { DividendRow, FinancialReport, LivePrice } from "./nepse/types";

export interface CompareRow {
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

export interface CompareSource {
  prices: LivePrice[];
  dividends: Record<string, DividendRow[]>;
  faceValues: Record<string, number>;
  financials: Record<string, FinancialReport[]>;
}

/** One row of side-by-side fundamentals, same math as the Stock Compare tool. */
export function buildCompareRows(symbols: string[], src: CompareSource): CompareRow[] {
  const { prices, dividends, faceValues, financials } = src;
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
      const roe = eps != null && netWorth != null && netWorth > 0 ? Math.round((eps / netWorth) * 1000) / 10 : null;
      const pb = netWorth != null && netWorth > 0 ? price.ltp / netWorth : null;
      const latestDiv = symDividends[0] ?? null;
      const dividendYield = latestDiv && fv > 0 && price.ltp > 0 ? (latestDiv.totalDividend * fv) / price.ltp : null;
      const fiscalYears = [...new Set(symDividends.map((d) => d.fiscalYear).filter(Boolean))].sort().reverse();
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

      const score = computeLongTermScore(price, symFinancials, symDividends, fv);

      return {
        symbol: sym,
        name: price.name,
        ltp: price.ltp,
        change: price.percentChange,
        pe,
        pb,
        roe,
        eps,
        dividendYield: dividendYield != null ? Math.round(dividendYield * 100) / 100 : null,
        dividendStreak: streak,
        score,
      };
    })
    .filter(Boolean) as CompareRow[];
}

export interface CompareMetric {
  key: "ltp" | "change" | "pe" | "pb" | "roe" | "eps" | "dividendYield" | "dividendStreak" | "score";
  label: string;
  format: (r: CompareRow) => string;
}

export const COMPARE_METRICS: CompareMetric[] = [
  { key: "ltp", label: "LTP", format: (r) => formatNpr(r.ltp) },
  { key: "change", label: "Change", format: (r) => formatPercent(r.change) },
  { key: "pe", label: "P/E", format: (r) => (r.pe != null ? String(r.pe) : "-") },
  { key: "pb", label: "P/B", format: (r) => (r.pb != null ? String(r.pb) : "-") },
  { key: "roe", label: "ROE", format: (r) => (r.roe != null ? `${r.roe}%` : "-") },
  { key: "eps", label: "EPS", format: (r) => (r.eps != null ? formatNpr(r.eps) : "-") },
  {
    key: "dividendYield",
    label: "Div Yield",
    format: (r) => (r.dividendYield != null ? `${r.dividendYield}%` : "-"),
  },
  { key: "dividendStreak", label: "Streak", format: (r) => `${r.dividendStreak}y` },
  {
    key: "score",
    label: "Score",
    format: (r) => (r.score?.score != null ? String(r.score.score) : "-"),
  },
];

/** Screener-backed compare rows for any symbol list (empty symbols → no fetch). */
export function useCompareRows(symbols: string[]): { rows: CompareRow[]; isLoading: boolean } {
  const q = useQuery({ ...screenerDataQuery(), enabled: symbols.length > 0 });
  const rows = useMemo(
    () =>
      buildCompareRows(symbols, {
        prices: q.data?.prices ?? [],
        dividends: q.data?.dividends ?? {},
        faceValues: q.data?.faceValues ?? {},
        financials: q.data?.financials ?? {},
      }),
    [symbols, q.data],
  );
  return { rows, isLoading: q.isLoading };
}
