/**
 * Benchmarks that share the SIP's own cash-flow dates: a bank recurring
 * deposit (after tax) and the NEPSE index bought on the same days.
 *
 * Comparing a monthly SIP to an index "since launch" is meaningless; the
 * deposits land on different days. Every function here takes the SIP's
 * installment dates so the two experiments differ only in the instrument.
 */
import type { SipNavPoint } from "./sip";

export interface SeriesPoint {
  date: string;
  value: number;
}

/**
 * Recurring deposit on the SIP's dates. Monthly compounding at rate/12, tax
 * on the interest only. Returns the value on `uptoIso` (defaults to the last
 * deposit) plus the monthly series so it can share an axis with the SIP
 * chart; the last series point sits on `uptoIso` so the RD line spans the
 * same window as the fund.
 */
export function rdSeries(
  dates: string[],
  amount: number,
  ratePct: number,
  taxPct = 6,
  uptoIso?: string,
): { value: number; series: SeriesPoint[] } {
  const r = Math.max(0, ratePct) / 100 / 12;
  const netInterest = 1 - Math.max(0, taxPct) / 100;
  const sorted = [...dates].sort();
  const upto = uptoIso && uptoIso > (sorted[sorted.length - 1] ?? "") ? uptoIso : (sorted[sorted.length - 1] ?? "");
  const monthBetween = (a: string, b: string) =>
    Math.max(0, Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / (30.4375 * 86_400_000)));
  const grown = (i: number, upto: string) => {
    let v = 0;
    for (let j = 0; j <= i; j++) v += amount * Math.pow(1 + r, monthBetween(sorted[j]!, upto));
    return v;
  };
  const series: SeriesPoint[] = sorted.map((d, i) => {
    const paid = amount * (i + 1);
    const g = grown(i, d);
    return { date: d, value: paid + (g - paid) * netInterest };
  });
  if (upto && upto !== sorted[sorted.length - 1]) {
    const paid = amount * sorted.length;
    const g = grown(sorted.length - 1, upto);
    series.push({ date: upto, value: paid + (g - paid) * netInterest });
  }
  const last = series[series.length - 1];
  return { value: last?.value ?? 0, series };
}

/** Index bars -> NAV-shaped points so the SIP engine can run on the index. */
export function indexToPoints(bars: { date: string; close: number }[]): SipNavPoint[] {
  return bars
    .filter((b) => b.date && b.close > 0)
    .map((b) => ({ date: b.date, nav: b.close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
