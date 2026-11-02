/**
 * Inflation and deposit rates, Nepal. Static tables transcribed from NRB's
 * Current Macroeconomic and Financial Situation annual reports (2019/20 to
 * 2025/26) plus the current-year reading. Replace the current-year row when
 * NRB publishes; the historical rows rarely change.
 *
 * Fiscal years run Shrawan 1 to Ashad end (about 16 July to 15 July).
 */
export interface MacroYear {
  fy: string; // "2019/20" (runs 16 Jul 2019 - 15 Jul 2020)
  startAd: string; // Shrawan 1
  endAd: string; // Ashad end, exclusive upper bound
  cpiPct: number;
  depositPct: number | null; // weighted average deposit rate
  fdPct: number | null; // representative 1-year individual FD
}

export const MACRO_YEARS: MacroYear[] = [
  { fy: "2019/20", startAd: "2019-07-16", endAd: "2020-07-16", cpiPct: 6.15, depositPct: 6.01, fdPct: 9.5 },
  { fy: "2020/21", startAd: "2020-07-16", endAd: "2021-07-16", cpiPct: 3.6, depositPct: 4.65, fdPct: 7.5 },
  { fy: "2021/22", startAd: "2021-07-16", endAd: "2022-07-16", cpiPct: 6.32, depositPct: 7.41, fdPct: 10.5 },
  { fy: "2022/23", startAd: "2022-07-16", endAd: "2023-07-16", cpiPct: 7.74, depositPct: 7.86, fdPct: 11.0 },
  { fy: "2023/24", startAd: "2023-07-16", endAd: "2024-07-16", cpiPct: 5.44, depositPct: 5.77, fdPct: 7.5 },
  { fy: "2024/25", startAd: "2024-07-16", endAd: "2025-07-16", cpiPct: 4.06, depositPct: 4.19, fdPct: 5.5 },
  { fy: "2025/26", startAd: "2025-07-16", endAd: "2026-07-16", cpiPct: 3.08, depositPct: 3.21, fdPct: 4.8 },
  // Current year: y-o-y CPI in Bhadra 2083 (NRB monthly report). Deposit
  // column left open until the mid-July publication.
  { fy: "2026/27", startAd: "2026-07-16", endAd: "2027-07-16", cpiPct: 6.34, depositPct: null, fdPct: 4.1 },
];

export const MACRO_SOURCE =
  "Inflation and deposit rates from NRB Current Macroeconomic and Financial Situation reports (2019/20-2025/26); the current-year row is the latest monthly reading. FD is a representative top rate, not a series.";

const EARLIEST = MACRO_YEARS[0]!.startAd;

/**
 * Cumulative price-level growth from `fromIso` to `toIso`, prorated inside
 * each fiscal year. Dates before the table starts clamp to its first year.
 */
export function inflationFactor(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso < EARLIEST ? EARLIEST : fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 1;
  let factor = 1;
  for (const y of MACRO_YEARS) {
    const ys = new Date(`${y.startAd}T00:00:00`).getTime();
    const ye = new Date(`${y.endAd}T00:00:00`).getTime();
    const lo = Math.max(from, ys);
    const hi = Math.min(to, ye);
    if (hi <= lo) continue;
    const share = (hi - lo) / (ye - ys);
    factor *= Math.pow(1 + y.cpiPct / 100, share);
  }
  return factor;
}

/** Value deflated back to the money of `fromIso`. */
export function realValue(value: number, fromIso: string, toIso: string): number {
  return value / inflationFactor(fromIso, toIso);
}
