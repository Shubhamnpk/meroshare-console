import type { GlobalTxn } from "./import";

/**
 * Still-held FIFO lots for one global symbol. Sells consume the oldest buys
 * first; DIV/CASH never enter lots. Pure — same FIFO discipline as the
 * demat holding-age math, but priced in native currency per lot.
 */
export interface GlobalLot {
  /** ISO date of the buy. */
  date: string;
  /** Units still held from this buy. */
  qty: number;
  /** Native per-share buy price. */
  price: number;
  /** Native currency of the buy (GBX, USD, EUR, …). */
  currency: string;
}

export function deriveGlobalLots(txns: GlobalTxn[], symbol: string): GlobalLot[] {
  const upper = symbol.trim().toUpperCase();
  const ordered = txns
    .filter((t) => t.symbol.trim().toUpperCase() === upper)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lots: GlobalLot[] = [];
  for (const t of ordered) {
    if (t.side === "BUY") {
      if (t.qty > 0 && t.date) lots.push({ date: t.date, qty: t.qty, price: t.price, currency: t.currency });
    } else if (t.side === "SELL") {
      let remaining = t.qty;
      while (remaining > 0 && lots.length > 0) {
        const first = lots[0]!;
        if (first.qty > remaining) {
          first.qty -= remaining;
          remaining = 0;
        } else {
          remaining -= first.qty;
          lots.shift();
        }
      }
    }
  }
  return lots.filter((l) => l.qty > 0);
}

/**
 * What the sold shares and dividends already earned: average-cost realized
 * gain (proceeds minus relieved cost, same pool discipline as
 * deriveHoldings) plus cash dividends. The missing third number next to
 * unrealized lots gain — together they are the whole story of a stock.
 */
export interface GlobalRealized {
  /** Proceeds minus relieved cost across sells (native, pool currency). */
  realized: number;
  /** Cash dividends in the reference currency (other currencies skipped). */
  dividends: number;
  /** Units sold in total. */
  soldQty: number;
  /** Raw buy cost incl. file fees — denominator for total-return %. */
  buyCost: number;
}

export function deriveGlobalRealized(txns: GlobalTxn[], symbol: string, currency: string): GlobalRealized {
  const upper = symbol.trim().toUpperCase();
  const ordered = txns
    .filter((t) => t.symbol.trim().toUpperCase() === upper)
    .sort((a, b) => a.date.localeCompare(b.date));
  let qty = 0;
  let cost = 0;
  let realized = 0;
  let dividends = 0;
  let soldQty = 0;
  let buyCost = 0;
  for (const t of ordered) {
    if (t.side === "BUY") {
      if (t.qty > 0 && Number.isFinite(t.costNative)) {
        qty += t.qty;
        cost += Math.max(0, t.costNative);
        buyCost += Math.max(0, t.costNative);
      }
    } else if (t.side === "SELL") {
      if (t.qty > 0) soldQty += t.qty;
      if (qty > 0 && t.qty > 0) {
        const take = Math.min(t.qty, qty);
        const avg = cost / qty;
        realized += take * (t.price - avg);
        cost -= avg * take;
        qty -= take;
      }
    } else if (t.side === "DIV") {
      if (t.qty > 0 && t.price > 0 && sameNativeCurrency(t.currency, currency)) dividends += t.qty * t.price;
    }
  }
  return { realized, dividends, soldQty, buyCost };
}

/**
 * Native-currency equality for gain math. Pence is case-sensitive on purpose:
 * Yahoo "GBp" and Trading212 "GBX" are both 1/100 GBP — uppercasing first
 * would collapse "GBp" into pounds (a 100x error). See lib/world/fx.ts.
 */
export function sameNativeCurrency(a: string, b: string): boolean {
  const norm = (s: string) => {
    const t = s.trim();
    return t === "GBX" || t === "GBp" ? "GBX" : t.toUpperCase();
  };
  return norm(a) === norm(b);
}
