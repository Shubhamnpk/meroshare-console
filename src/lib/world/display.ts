import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/lib/settings";
import { formatNpr } from "@/lib/format";
import { native } from "@/components/world/global-position-sheet";
import { fxRatesQuery } from "@/lib/queries";

/** The Settings display currency (NPR by default) for cross-currency totals. */
export function useDisplayCurrency(): string {
  const { displayCurrency } = useSettings();
  return displayCurrency || "NPR";
}

/**
 * Per-unit rates from each source currency into the display currency, read
 * from the server (same FX the valuation trusts — browsers can block direct
 * Yahoo calls). Null while loading or when a rate is missing — callers show
 * placeholders, never mixed-currency sums.
 */
export function useDisplayRates(sources: string[]): Record<string, number> | null {
  const to = useDisplayCurrency();
  const uniq = [...new Set(sources)].sort();
  const q = useQuery({ ...fxRatesQuery(uniq, to), enabled: uniq.length > 0 });
  if (uniq.length === 0) return {};
  return q.data?.rates ?? null;
}

/** One money string in the display currency (NPR formatting for NPR). */
export function formatDisplay(v: number, ccy: string, opts?: { compact?: boolean }): string {
  return ccy === "NPR" ? formatNpr(v, opts) : native(v, ccy);
}
