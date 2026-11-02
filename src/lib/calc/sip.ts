/**
 * SIP engine: what a fixed monthly amount becomes in a fund, with the fees
 * that actually leave your pocket and dividends that actually arrive.
 *
 * Two series, one code path:
 * - raw NAV points          -> price-only result
 * - dividend-adjusted NAV   -> dividends implicitly reinvested (the feed's
 *   adj_nav carries them; the 5% dividend tax is NOT modelled there, say so
 *   in the UI)
 *
 * Pure functions, no React, no fetch. Rounding happens at render, never here.
 */
import { xirrPercent, type CashFlow } from "./xirr";

export interface SipNavPoint {
  date: string; // YYYY-MM-DD
  nav: number;
}

export interface SipDividend {
  date: string; // book closure date, % of Rs 10 par
  pct: number;
}

export interface SipOptions {
  /** Monthly installment in rupees. */
  amount: number;
  /** First installment date, YYYY-MM-DD. Moved to the first NAV if earlier. */
  startIso: string;
  /** Model the Rs 5 DP charge + Rs 4.52 payment gateway fee. Default true. */
  fees?: boolean | undefined;
  /** Reinvest dividends at the book-closure date's NAV. Default true. */
  reinvest?: boolean | undefined;
  /** Valuation date (defaults to the last NAV). Clamped into the series. */
  endIso?: string | undefined;
  dpCharge?: number | undefined;
  gatewayFee?: number | undefined;
  dividendTax?: number | undefined;
  par?: number | undefined;
}

export interface SipBuy {
  date: string;
  nav: number;
  units: number;
}

export interface SipSeriesPoint {
  date: string;
  paid: number; // cumulative cash out of pocket
  value: number; // units * NAV on that date
}

export interface SipResult {
  installments: number;
  /** Cash that left the pocket: installments + gateway fees. */
  paid: number;
  /** What actually bought units: installments minus DP charges. */
  invested: number;
  units: number;
  avgBuyNav: number;
  value: number;
  profit: number;
  totalReturnPct: number;
  /** Annual rate of the whole cash-flow stream, in percent. */
  xirr: number | null;
  buys: SipBuy[];
  series: SipSeriesPoint[];
  /** The stream behind `xirr`, for derived rates (real XIRR, tax variants). */
  flows: CashFlow[];
  divUnits: number;
  divCash: number;
  firstInstallment: string | null;
  /** Start moved forward because the fund's NAV history begins later. */
  startMoved: boolean;
  lastNavDate: string;
}

const DAY_MS = 86_400_000;

function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** NAV on or after `dateIso` (the next published NAV when the fund skipped a day). */
function navOn(points: SipNavPoint[], dateIso: string): SipNavPoint | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date < dateIso) lo = mid + 1;
    else hi = mid;
  }
  return lo < points.length ? points[lo]! : null;
}

/** Last NAV on or before `dateIso`: the value you actually held that day. */
function navOnOrBefore(points: SipNavPoint[], dateIso: string): SipNavPoint | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date <= dateIso) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? points[lo - 1]! : null;
}

export function simulateSip(points: SipNavPoint[], dividends: SipDividend[], opts: SipOptions): SipResult | null {
  const series = points.filter((p) => p.date && p.nav > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (series.length < 2) return null;

  const amount = Math.max(0, opts.amount);
  const dp = opts.fees === false ? 0 : (opts.dpCharge ?? 5);
  const fee = opts.fees === false ? 0 : (opts.gatewayFee ?? 4.52);
  const tax = opts.dividendTax ?? 0.05;
  const par = opts.par ?? 10;
  const reinvest = opts.reinvest !== false;

  let end = series[series.length - 1]!.date;
  if (opts.endIso && opts.endIso < end) {
    const clamped = navOnOrBefore(series, opts.endIso);
    if (!clamped) return null;
    end = clamped.date;
  }

  let start = opts.startIso;
  let startMoved = false;
  if (start < series[0]!.date) {
    start = series[0]!.date;
    startMoved = true;
  }
  const endD = new Date(`${end}T00:00:00`);

  const divs = dividends
    .filter((d) => d.date >= start && d.date <= end && d.pct > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  type Ev = { date: string; kind: "sip" } | { date: string; kind: "div"; pct: number };
  const events: Ev[] = [];
  let cur = new Date(`${start}T00:00:00`);
  while (cur <= endD) {
    events.push({ date: iso(cur), kind: "sip" });
    cur = addMonths(cur, 1);
  }
  for (const d of divs) events.push({ date: d.date, kind: "div", pct: d.pct });
  // Same-date dividend and installment: apply the dividend first so the new
  // installment buys at the post-dividend NAV, like the fund's own ledger.
  events.sort((a, b) => (a.date === b.date ? (a.kind === "div" ? -1 : 1) : a.date < b.date ? -1 : 1));

  let units = 0;
  let invested = 0;
  let paid = 0;
  let divUnits = 0;
  let divCash = 0;
  const buys: SipBuy[] = [];
  const seriesOut: SipSeriesPoint[] = [];
  const flows: CashFlow[] = [];
  let firstInstallment: string | null = null;

  for (const ev of events) {
    if (ev.kind === "sip") {
      const tick = navOn(series, ev.date);
      if (!tick || tick.date > end) break;
      const u = (amount - dp) / tick.nav;
      units += u;
      invested += amount - dp;
      paid += amount + fee;
      if (!firstInstallment) firstInstallment = tick.date;
      buys.push({ date: tick.date, nav: tick.nav, units: u });
      flows.push({ date: tick.date, amount: -(amount + fee) });
      seriesOut.push({ date: tick.date, paid, value: units * tick.nav });
    } else {
      const gross = units * (ev.pct / 100) * par;
      const net = gross * (1 - tax);
      divCash += gross;
      if (reinvest) {
        const tick = navOn(series, ev.date);
        if (tick) {
          const bought = net / tick.nav;
          units += bought;
          divUnits += bought;
        }
      } else {
        flows.push({ date: ev.date, amount: net });
      }
    }
  }

  const lastTick = navOn(series, end);
  if (!lastTick || units <= 0) return null;
  const value = units * lastTick.nav;
  flows.push({ date: lastTick.date, amount: value });
  const avgBuyNav = invested > 0 ? invested / units : 0;

  return {
    installments: buys.length,
    paid,
    invested,
    units,
    avgBuyNav,
    value,
    profit: value - paid,
    totalReturnPct: paid > 0 ? ((value - paid) / paid) * 100 : 0,
    xirr: xirrPercent(flows),
    buys,
    series: seriesOut,
    flows,
    divUnits,
    divCash,
    firstInstallment,
    startMoved,
    lastNavDate: lastTick.date,
  };
}
