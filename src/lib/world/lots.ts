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
 * Earned per symbol, broker totals first: Trading212 files already state
 * every row's Total in GBP (sells even state their own result), so banked
 * gains, dividends and buy cost come straight from the file — one currency,
 * no juggling, broker-authoritative down to their own fees and FX. Rows the
 * file doesn't total (standard imports) fall back to pool math in native
 * currency. One fiction per symbol, never mixed.
 */
export interface SymbolEarned {
  banked: number;
  dividends: number;
  buyCost: number;
  soldQty: number;
  /** Sale proceeds minus the gain: your own buy money coming back. */
  principalReturned: number;
  currency: string;
  brokerStated: boolean;
}

export function deriveSymbolEarned(txns: GlobalTxn[], symbol: string): SymbolEarned {
  const upper = symbol.trim().toUpperCase();
  const rows = txns.filter((t) => t.symbol.trim().toUpperCase() === upper);
  const buys = rows.filter((t) => t.side === "BUY");
  const sells = rows.filter((t) => t.side === "SELL");
  const divs = rows.filter((t) => t.side === "DIV");
  const soldQty = sells.reduce((s, t) => s + (t.qty > 0 ? t.qty : 0), 0);
  const stated = (v: number | null) => v != null && Number.isFinite(v);
  const brokerOk =
    rows.length > 0 &&
    sells.every((t) => stated(t.resultGbp)) &&
    buys.every((t) => stated(t.costGbp)) &&
    divs.every((t) => stated(t.costGbp));
  if (brokerOk) {
    return {
      banked: sells.reduce((s, t) => s + (t.resultGbp ?? 0), 0),
      dividends: divs.reduce((s, t) => s + (t.costGbp ?? 0), 0),
      buyCost: buys.reduce((s, t) => s + (t.costGbp ?? 0), 0),
      soldQty,
      principalReturned: sells.reduce((s, t) => s + ((t.costGbp ?? 0) - (t.resultGbp ?? 0)), 0),
      currency: "GBP",
      brokerStated: true,
    };
  }
  const ccy = rows.find((t) => (t.currency ?? "").trim() !== "")?.currency?.trim() ?? "";
  const r = deriveGlobalRealized(txns, symbol, ccy);
  const proceeds = sells.reduce((s, t) => s + t.qty * t.price, 0);
  return {
    banked: r.realized,
    dividends: r.dividends,
    buyCost: r.buyCost,
    soldQty: r.soldQty,
    principalReturned: proceeds - r.realized,
    currency: ccy,
    brokerStated: false,
  };
}

/**
 * Whole-book earnings from transactions only (never live value), bucketed by
 * the earned currency (usually a single GBP bucket for Trading212 books).
 * Feeds the transactions summary chips.
 */
export interface GlobalBookStats {
  currencies: string[];
  byCurrency: Record<string, { banked: number; dividends: number; buyCost: number; principalReturned: number }>;
  soldQty: number;
}

export function deriveGlobalBookStats(txns: GlobalTxn[]): GlobalBookStats {
  const symbols = [...new Set(txns.map((t) => t.symbol.trim().toUpperCase()).filter(Boolean))];
  const byCurrency: Record<string, { banked: number; dividends: number; buyCost: number; principalReturned: number }> =
    {};
  let soldQty = 0;
  for (const symbol of symbols) {
    const e = deriveSymbolEarned(txns, symbol);
    const bucket = (byCurrency[e.currency] ??= { banked: 0, dividends: 0, buyCost: 0, principalReturned: 0 });
    bucket.banked += e.banked;
    bucket.dividends += e.dividends;
    bucket.buyCost += e.buyCost;
    bucket.principalReturned += e.principalReturned;
    soldQty += e.soldQty;
  }
  return { currencies: Object.keys(byCurrency), byCurrency, soldQty };
}

/**
 * The whole account as one cash story, in file-stated totals (Trading212
 * states every Total in GBP, so a broker book collapses to one currency with
 * no juggling). Deposits are outside money; only gains, dividends and cash
 * interest are earned money. A buy counts as reinvested up to the earned cash
 * freed before it — recycled principal and deposits never count. Sale
 * proceeds split into gain (earned) and returned principal (outside).
 * Withdrawals leave earned cash first. Chronological per currency group, so
 * cross-currency hops never mix. Rows the file doesn't total stay in native
 * price math.
 */
export interface FlowBucket {
  deposits: number;
  withdrawals: number;
  interest: number;
  buys: number;
  sells: number;
  dividends: number;
  reinvested: number;
  /** Cost basis of what is still held (average-cost pool: sells relieve it). */
  investedNow: number;
  /** Of that, the part funded by earlier freed cash. Sells shrink both. */
  reinvestedNow: number;
}

const CASH_INTEREST_RE = /interest/i;
const CASH_WITHDRAW_RE = /withdraw|sent to card/i;

export function deriveAccountFlow(txns: GlobalTxn[]): {
  currencies: string[];
  byCurrency: Record<string, FlowBucket>;
} {
  const num = (v: number) => (Number.isFinite(v) ? v : 0);
  const groups = new Map<string, GlobalTxn[]>();
  for (const t of txns) {
    if (t.side !== "BUY" && t.side !== "SELL" && t.side !== "DIV" && t.side !== "CASH") continue;
    const key = t.costGbp != null ? "GBP" : (t.currency ?? "").trim() || "?";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const byCurrency: Record<string, FlowBucket> = {};
  for (const [key, rows] of groups) {
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    let deposits = 0;
    let withdrawals = 0;
    let interest = 0;
    let buys = 0;
    let sells = 0;
    let dividends = 0;
    let reinvested = 0;
    // Two pots per currency: outside money (deposits minus withdrawals and
    // the deposits spent) and earned money (gains, dividends, interest minus
    // what they funded). Only earned money makes a buy count as reinvested:
    // recycled principal is moved capital, deposits are fresh — neither is
    // reinvestment. Average-cost pools stay per symbol (shares are not
    // fungible), so the remainder is the investment at this moment by source.
    let outsideAvail = 0;
    let earnedAvail = 0;
    const pools = new Map<string, { qty: number; cost: number; reinv: number }>();
    const poolOf = (symbol: string) => {
      const k = symbol.trim().toUpperCase();
      const p = pools.get(k) ?? { qty: 0, cost: 0, reinv: 0 };
      pools.set(k, p);
      return p;
    };
    for (const t of ordered) {
      if (t.side === "BUY") {
        const cost = num(t.costGbp ?? t.costNative);
        buys += cost;
        const reuse = Math.min(cost, earnedAvail);
        reinvested += reuse;
        earnedAvail -= reuse;
        outsideAvail -= cost - reuse;
        if (t.qty > 0 && cost > 0 && t.symbol.trim() !== "") {
          const p = poolOf(t.symbol);
          p.qty += t.qty;
          p.cost += cost;
          p.reinv += reuse;
        }
      } else if (t.side === "SELL") {
        const proceeds = num(t.costGbp ?? t.qty * t.price);
        sells += proceeds;
        // Split proceeds: the gain is earnings, the rest is your own money
        // back (broker states the gain; otherwise the pool average says it).
        let gain = 0;
        if (t.resultGbp != null && Number.isFinite(t.resultGbp)) {
          gain = t.resultGbp;
        } else if (t.symbol.trim() !== "") {
          const p = poolOf(t.symbol);
          if (p.qty > 0 && t.qty > 0) gain = Math.min(t.qty, p.qty) * (t.price - p.cost / p.qty);
        }
        outsideAvail += proceeds - gain;
        earnedAvail += gain;
        if (t.symbol.trim() !== "") {
          const p = poolOf(t.symbol);
          if (p.qty > 0 && t.qty > 0) {
            const take = Math.min(t.qty, p.qty);
            p.cost -= (p.cost / p.qty) * take;
            p.reinv -= (p.reinv / p.qty) * take;
            p.qty -= take;
          }
        }
      } else if (t.side === "DIV") {
        const payout = num(t.costGbp ?? t.qty * t.price);
        dividends += payout;
        earnedAvail += payout;
      } else {
        const total = num(t.costGbp ?? 0);
        const text = `${t.notes ?? ""} ${t.name ?? ""}`;
        if (CASH_INTEREST_RE.test(text)) {
          interest += total;
          earnedAvail += total;
        } else if (total < 0 || CASH_WITHDRAW_RE.test(text)) {
          const out = Math.abs(total);
          withdrawals += out;
          const fromEarned = Math.min(out, earnedAvail);
          earnedAvail -= fromEarned;
          outsideAvail -= out - fromEarned;
        } else {
          deposits += total;
          outsideAvail += total;
        }
      }
    }
    let investedNow = 0;
    let reinvestedNow = 0;
    for (const p of pools.values()) {
      investedNow += Math.max(0, p.cost);
      reinvestedNow += Math.max(0, Math.min(p.reinv, p.cost));
    }
    byCurrency[key] = {
      deposits,
      withdrawals,
      interest,
      buys,
      sells,
      dividends,
      reinvested,
      investedNow,
      reinvestedNow,
    };
  }
  return { currencies: [...groups.keys()], byCurrency };
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
