/**
 * Canonical chart ranges — one list for every terminal, sheet, panel and
 * modal. Add or remove a range here and every surface follows; per-file
 * copies are not allowed. (Feed-level unions like nepse `ChartRange` or
 * `WorldRange` may legally stay wider — the UI simply never offers extras.)
 */
export const CHART_RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y", "MAX"] as const;

export type ChartRangeKey = (typeof CHART_RANGES)[number];
