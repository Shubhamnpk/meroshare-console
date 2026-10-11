/**
 * Foreign-currency conversion into NPR for the Global portfolio view.
 * INR is pegged (~1.6 NPR); GBP/GBX cross through GBPUSD=X, EUR through
 * EURGBP=X, everything dollar-denominated through USDNPR=X.
 */

export const INR_NPR_PEG = 1.6;

const FX_TTL = 60 * 60_000;
const fxCaches = new Map<string, { rate: number; expires: number }>();

async function yahooFxRate(pair: string): Promise<number | null> {
  const now = Date.now();
  const hit = fxCaches.get(pair);
  if (hit && hit.expires > now) return hit.rate;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${pair}?range=5d&interval=1d`, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) return hit?.rate ?? null;
      const doc = (await res.json()) as {
        chart?: { result?: { meta?: { regularMarketPrice?: number } }[] };
      };
      const rate = Number(doc.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0);
      if (rate > 0) fxCaches.set(pair, { rate, expires: now + FX_TTL });
      return rate > 0 ? rate : (hit?.rate ?? null);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return hit?.rate ?? null;
  }
}

/** USD→NPR rate (cached hourly). Null when unreachable. */
export function usdNprRate(): Promise<number | null> {
  return yahooFxRate("USDNPR=X");
}

/** USD per GBP (cached hourly). Null when unreachable. */
export function gbpUsdRate(): Promise<number | null> {
  return yahooFxRate("GBPUSD=X");
}

/** GBP per EUR (cached hourly). Null when unreachable. */
export function eurGbpRate(): Promise<number | null> {
  return yahooFxRate("EURGBP=X");
}

/** Convert a foreign amount into NPR. Null when the rate is unknown. */
export async function toNpr(amount: number, currency: string | null): Promise<number | null> {
  if (!(amount >= 0)) return null;
  // Pence is case-sensitive: Yahoo "GBp" and T212 "GBX" are both 1/100 GBP.
  // (Uppercasing first would collapse "GBp" into pounds — a 100x error.)
  const raw = (currency ?? "").trim();
  if (raw === "GBX" || raw === "GBp") {
    const [usdPerGbp, usdNpr] = await Promise.all([gbpUsdRate(), usdNprRate()]);
    if (!usdPerGbp || !usdNpr) return null;
    return (amount / 100) * usdPerGbp * usdNpr;
  }
  const cur = raw.toUpperCase();
  if (cur === "" || cur === "NPR") return amount;
  if (cur === "INR") return amount * INR_NPR_PEG;
  if (cur === "USD") {
    const rate = await usdNprRate();
    return rate ? amount * rate : null;
  }
  if (cur === "GBP") {
    const [usdPerGbp, usdNpr] = await Promise.all([gbpUsdRate(), usdNprRate()]);
    if (!usdPerGbp || !usdNpr) return null;
    return amount * usdPerGbp * usdNpr;
  }
  if (cur === "EUR") {
    const [eurGbp, usdPerGbp, usdNpr] = await Promise.all([eurGbpRate(), gbpUsdRate(), usdNprRate()]);
    if (!eurGbp || !usdPerGbp || !usdNpr) return null;
    return amount * eurGbp * usdPerGbp * usdNpr;
  }
  // Other currencies need their own cross, which we don't fetch yet.
  return null;
}

/**
 * Convert any supported amount into another currency, pivoting through NPR
 * (rates are cached hourly). Same currency is a pass-through. Null when a
 * leg has no rate — callers fall back to native figures, never zeros.
 */
export async function convertCurrency(amount: number, from: string | null, to: string | null): Promise<number | null> {
  const src = (from ?? "").trim();
  const dst = (to ?? "").trim() || "NPR";
  if (!src || src.toUpperCase() === dst.toUpperCase()) return amount;
  const sign = amount < 0 ? -1 : 1;
  const inNpr = await toNpr(Math.abs(amount), src);
  if (inNpr == null) return null;
  if (dst.toUpperCase() === "NPR") return sign * inNpr;
  const perUnit = await toNpr(1, dst);
  if (perUnit == null || perUnit <= 0) return null;
  return (sign * inNpr) / perUnit;
}

/** Clear cached FX (tests). */
export function clearFxCache(): void {
  fxCaches.clear();
}
