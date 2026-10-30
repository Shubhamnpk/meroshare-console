import { useQueries } from "@tanstack/react-query";
import { worldQuoteQuery } from "@/lib/queries";
import type { WorldQuote } from "./feed.server";

/**
 * Live world quotes for a symbol list (global watchlist rows/cards). One
 * cached query per symbol, no retries — unknown tickers resolve to null.
 * Returns a symbol → quote map (upper-cased keys).
 *
 * Deliberately not memoized: `useQueries` hands back a fresh array every
 * render, so a memo keyed on it would rebuild every time anyway. Callers use
 * the map inside render, and the build is one pass over a short list.
 */
export function useWorldQuotes(symbols: string[]): Map<string, WorldQuote> {
  const queries = useQueries({
    queries: symbols.map((s) => worldQuoteQuery(s)),
  });
  const map = new Map<string, WorldQuote>();
  queries.forEach((q, i) => {
    const data = q.data;
    if (data) map.set((symbols[i] ?? "").toUpperCase(), data);
  });
  return map;
}
