/**
 * World symbol handling. NEPSE tickers (bare uppercase, e.g. NABIL) 404 on
 * every world feed by design — they belong in the Portfolio views, never
 * here. Resolution order for suffix-less input: as-is (US) → .NS → .BO.
 */

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-=^]*$/;

const NSE_MASTER_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const NSE_MASTER_TTL = 7 * 24 * 60 * 60_000;

let masterCache: { names: Map<string, string>; expires: number } | null = null;

/** Normalize raw input; null when it cannot be a world symbol. */
export function normalizeWorldSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!upper || !SYMBOL_RE.test(upper)) return null;
  return upper;
}

/** Candidate upstream tickers, most exact first. The caller keeps the first hit. */
export function worldCandidates(symbol: string): string[] {
  const out = [symbol];
  if (!symbol.includes(".") && !symbol.includes("-") && !symbol.startsWith("^") && !symbol.endsWith("=X")) {
    out.push(`${symbol}.NS`, `${symbol}.BO`);
  }
  return out;
}

export interface NseEntry {
  symbol: string;
  name: string;
}

/** NSE equity master (official, free): symbol → company name, cached weekly. */
export async function nseMaster(): Promise<Map<string, string>> {
  const now = Date.now();
  if (masterCache && masterCache.expires > now) return masterCache.names;
  const names = new Map<string, string>();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(NSE_MASTER_URL, {
        headers: {
          Accept: "text/csv",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        signal: ctrl.signal,
      });
      if (res.ok) {
        const text = await res.text();
        for (const line of text.split("\n").slice(1)) {
          // Quoted CSV: SYMBOL,NAME,... — names may contain commas.
          const match = line.match(/^"?([^",]+)"?,"?([^"]+?)"?,/);
          if (!match) continue;
          const sym = (match[1] ?? "").trim().toUpperCase();
          const name = (match[2] ?? "").trim();
          if (sym) names.set(sym, name);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fall through with whatever (possibly empty) map we have.
  }
  masterCache = { names, expires: now + NSE_MASTER_TTL };
  return names;
}

/** Clear cached NSE master (tests). */
export function clearNseMaster(): void {
  masterCache = null;
}
