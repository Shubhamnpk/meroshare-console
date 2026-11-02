/**
 * XIRR: the one annual rate that turns a cash-flow stream into its present
 * value. Bisection, not Newton: SIP streams have a sign change near the end
 * and Newton diverges on them. Bisection on [-0.99, 5] always converges and
 * costs at most 200 evaluations.
 */
export interface CashFlow {
  /** ISO date (YYYY-MM-DD) or anything `new Date()` parses. */
  date: string;
  /** Negative = money out of pocket, positive = money back. */
  amount: number;
}

const DAY_MS = 86_400_000;
const YEARS_PER_MS = 1 / (365 * DAY_MS);

export function xirrFromCashFlows(flows: CashFlow[]): number | null {
  const usable = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0);
  if (usable.length < 2) return null;
  const hasNegative = usable.some((f) => f.amount < 0);
  const hasPositive = usable.some((f) => f.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const t0 = new Date(usable[0]!.date).getTime();
  if (!Number.isFinite(t0)) return null;
  const pts = usable.map((f) => ({
    a: f.amount,
    t: (new Date(f.date).getTime() - t0) * YEARS_PER_MS,
  }));
  // The first flow is at t=0 and does not move the NPV; keep it for the
  // sign checks above only.
  const npv = (r: number) => {
    let s = 0;
    for (const p of pts) s += p.a / Math.pow(1 + r, p.t);
    return s;
  };

  let lo = -0.99;
  let hi = 5;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  if (flo === 0) return lo;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** XIRR as a percent (e.g. 7.53), or null when the stream has no solution. */
export function xirrPercent(flows: CashFlow[]): number | null {
  const r = xirrFromCashFlows(flows);
  return r == null ? null : r * 100;
}
