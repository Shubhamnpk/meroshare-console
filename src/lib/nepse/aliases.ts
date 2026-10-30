// Symbol aliases: renamed schemes where the holding (CDSC/demat side) and the
// market feed disagree, e.g. holding GYSM vs feed GSYM — same scheme.
// Canonical = the name market feeds use. Add new renames here as
// `ALIAS (holding side): CANONICAL (feed side)`; everything that joins
// holdings to feed data resolves through canonicalSymbol().
// NEVER apply these to CDSC/myPurchase calls — CDSC knows the demat-side name.
const SYMBOL_ALIASES: Record<string, string> = {
  // GARIMA SUBARNA YOJANA (OPEN ENDED MUTUAL FUND): CDSC/demat GYSM ==
  // YONEPSE archive GSYM (verified in the monthly files; the mirror carries
  // none of the variants, and GYSA/GSYA keys don't exist there either).
  GYSM: "GSYM",
};

/** Feed-side name for a symbol (uppercase in, uppercase out, identity fallback). */
export function canonicalSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "";
  const upper = symbol.toUpperCase();
  return SYMBOL_ALIASES[upper] ?? upper;
}

/**
 * Every key worth trying in a feed-side map, most exact first:
 * the symbol itself, its canonical form, then any alias pointing at the
 * same canonical (covers the reverse disagreement too).
 */
export function matchSymbols(symbol: string | null | undefined): string[] {
  if (!symbol) return [];
  const upper = symbol.toUpperCase();
  const canonical = SYMBOL_ALIASES[upper] ?? upper;
  const out = [upper];
  if (canonical !== upper) out.push(canonical);
  for (const [alias, target] of Object.entries(SYMBOL_ALIASES)) {
    if (target === canonical && alias !== upper && alias !== canonical) out.push(alias);
  }
  return out;
}
