import type { LivePrice } from "@/lib/nepse/types";
import type { MfManager, MfNavPoint, MfPerformance, MfScheme } from "@/lib/mutual-funds/types";

/** (LTP − NAV) / NAV * 100. Negative = bargain (trading below NAV). */
export function discountPct(ltp: number | null, nav: number | null): number | null {
  if (ltp == null || nav == null || nav <= 0) return null;
  return ((ltp - nav) / nav) * 100;
}

/** Reference NAV: prefer weekly, fall back to monthly. */
export function referenceNav(p: MfPerformance): { nav: number | null; label: string } {
  if (p.weeklyNav != null && p.weeklyNav > 0) return { nav: p.weeklyNav, label: "weekly NAV" };
  if (p.monthlyNav != null && p.monthlyNav > 0) return { nav: p.monthlyNav, label: "monthly NAV" };
  return { nav: null, label: "NAV" };
}

export interface TrailingReturn {
  key: string;
  label: string;
  returnPct: number | null;
  annualized: boolean;
  startDate: string | null;
}

const DAY = 86_400_000;

/** Trailing simple returns cut from the NAV series itself. */
export function trailingReturns(series: MfNavPoint[]): TrailingReturn[] {
  if (series.length < 2) return [];
  const end = series[series.length - 1]!;
  const endMs = Date.parse(`${end.date}T00:00:00Z`);
  const endNav = end.adjNav;
  const windows = [
    { key: "1M", label: "1M", days: 31 },
    { key: "3M", label: "3M", days: 93 },
    { key: "6M", label: "6M", days: 183 },
    { key: "1Y", label: "1Y", days: 365 },
  ];
  const out: TrailingReturn[] = windows.map((w) => {
    const startMs = endMs - w.days * DAY;
    const anchor = [...series].reverse().find((p) => Date.parse(`${p.date}T00:00:00Z`) <= startMs);
    if (!anchor || anchor.adjNav <= 0) {
      return { key: w.key, label: w.label, returnPct: null, annualized: false, startDate: null };
    }
    const r = ((endNav - anchor.adjNav) / anchor.adjNav) * 100;
    return {
      key: w.key,
      label: w.label,
      returnPct: r,
      annualized: w.days >= 365,
      startDate: anchor.date,
    };
  });
  const first = series[0]!;
  const si = first.adjNav > 0 ? ((endNav - first.adjNav) / first.adjNav) * 100 : null;
  const spanYears = (endMs - Date.parse(`${first.date}T00:00:00Z`)) / (365.25 * DAY);
  out.push({
    key: "SI",
    label: "Since start",
    returnPct: si,
    annualized: spanYears >= 1,
    startDate: first.date,
  });
  return out;
}

export interface RiskStats {
  volatilityPct: number | null;
  maxDrawdownPct: number | null;
  /** Plain-language label vs peer volatilities. */
  label: "Lower" | "Typical" | "Higher" | null;
}

/** Annualized volatility from daily NAV moves + max peak-to-trough drawdown. */
export function riskStats(series: MfNavPoint[], peerVols: number[]): RiskStats {
  if (series.length < 10) return { volatilityPct: null, maxDrawdownPct: null, label: null };
  const rets: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!.adjNav;
    const b = series[i]!.adjNav;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 5) return { volatilityPct: null, maxDrawdownPct: null, label: null };
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const volatilityPct = Math.sqrt(variance) * Math.sqrt(252) * 100;

  let peak = series[0]!.adjNav;
  let maxDd = 0;
  for (const p of series) {
    if (p.adjNav > peak) peak = p.adjNav;
    if (peak > 0) maxDd = Math.min(maxDd, (p.adjNav - peak) / peak);
  }

  let label: RiskStats["label"] = null;
  if (peerVols.length >= 3) {
    const sorted = [...peerVols].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.33)]!;
    const hi = sorted[Math.floor(sorted.length * 0.66)]!;
    label = volatilityPct <= lo ? "Lower" : volatilityPct >= hi ? "Higher" : "Typical";
  }
  return { volatilityPct, maxDrawdownPct: maxDd * 100, label };
}

/** Volatility series helper: annualized vol per NAV history (for peer ranking). */
export function seriesVolatility(series: MfNavPoint[]): number | null {
  return riskStats(series, []).volatilityPct;
}

export interface SipResult {
  invested: number;
  units: number;
  value: number;
  gain: number;
  gainPct: number | null;
  months: number;
}

/**
 * Tot up a monthly SIP bought at each month-end NAV.
 * First investment at the first available NAV, value at the latest NAV.
 */
export function simulateSip(series: MfNavPoint[], monthly: number): SipResult | null {
  if (series.length < 2 || monthly <= 0) return null;
  const byMonth = new Map<string, MfNavPoint>();
  for (const p of series) byMonth.set(p.date.slice(0, 7), p);
  const months = [...byMonth.values()];
  if (months.length === 0) return null;
  let units = 0;
  for (const m of months) {
    if (m.adjNav > 0) units += monthly / m.adjNav;
  }
  const latest = series[series.length - 1]!.adjNav;
  const invested = monthly * months.length;
  const value = units * latest;
  const gain = value - invested;
  return {
    invested,
    units,
    value,
    gain,
    gainPct: invested > 0 ? (gain / invested) * 100 : null,
    months: months.length,
  };
}

/** Lumpsum growth: amount invested at the first NAV, valued at the latest. */
export function simulateLumpsum(
  series: MfNavPoint[],
  amount: number,
): Pick<SipResult, "invested" | "value" | "gain" | "gainPct"> | null {
  if (series.length < 2 || amount <= 0) return null;
  const first = series[0]!.adjNav;
  const latest = series[series.length - 1]!.adjNav;
  if (first <= 0) return null;
  const value = (amount / first) * latest;
  const gain = value - amount;
  return { invested: amount, value, gain, gainPct: (gain / amount) * 100 };
}

export interface ManagerAgg {
  manager: MfManager;
  schemes: MfScheme[];
  aum: number;
  avgDiscount: number | null;
  bargains: number;
  allocCap: number;
  allocFix: number;
  allocCash: number;
  openCount: number;
  closeCount: number;
}

/** Roll up every scheme of one house: size, average discount, allocation mix. */
export function aggregateManager(
  manager: MfManager,
  schemes: MfScheme[],
  performances: Map<string, MfPerformance>,
  livePrices: Map<string, LivePrice>,
): ManagerAgg {
  const list = schemes.filter(
    (s) =>
      (s.managerSlug && s.managerSlug === manager.slug) ||
      (!s.managerSlug && s.manager === manager.name),
  );
  let aum = 0;
  const discounts: number[] = [];
  let bargains = 0;
  let capW = 0;
  let fixW = 0;
  let cashW = 0;
  let wSum = 0;
  let openCount = 0;
  let closeCount = 0;
  for (const s of list) {
    if (s.fundType === "open_end") openCount += 1;
    else closeCount += 1;
    const p = performances.get(s.symbol);
    const size = p?.totalPaidUp ?? s.paidUp ?? 0;
    aum += size;
    if (p) {
      const { nav } = referenceNav(p);
      // Only close-end funds trade at market price — open-end always = NAV
      if (s.fundType === "close_end") {
        const d = discountPct(livePrices.get(s.symbol)?.ltp ?? p.ltp, nav);
        if (d != null) {
          discounts.push(d);
          if (d < -2) bargains += 1;
        }
      }
      if (size > 0) {
        capW += (p.capitalMarketPct ?? 0) * size;
        fixW += (p.fixedIncomePct ?? 0) * size;
        cashW += (p.cashPct ?? 0) * size;
        wSum += size;
      }
    }
  }
  return {
    manager,
    schemes: list,
    aum,
    avgDiscount: discounts.length ? discounts.reduce((s, d) => s + d, 0) / discounts.length : null,
    bargains,
    allocCap: wSum > 0 ? capW / wSum : 0,
    allocFix: wSum > 0 ? fixW / wSum : 0,
    allocCash: wSum > 0 ? cashW / wSum : 0,
    openCount,
    closeCount,
  };
}

export type LtpFrequency = "daily" | "weekly" | "monthly";

export interface LtpBucket {
  date: string;
  ltp: number;
  points: number;
}

/** Bucket daily closes into weekly/monthly averages (daily passes through). */
export function bucketCloses(
  bars: { date: string; close: number }[],
  freq: LtpFrequency,
): LtpBucket[] {
  if (freq === "daily") {
    return bars.filter((b) => b.close > 0).map((b) => ({ date: b.date, ltp: b.close, points: 1 }));
  }
  const buckets = new Map<string, { date: string; total: number; n: number }>();
  for (const b of bars) {
    if (b.close <= 0) continue;
    const key = freq === "monthly" ? b.date.slice(0, 7) : weekKey(b.date);
    if (!key) continue;
    const e = buckets.get(key) ?? { date: b.date, total: 0, n: 0 };
    e.date = b.date;
    e.total += b.close;
    e.n += 1;
    buckets.set(key, e);
  }
  return [...buckets.values()]
    .map((b) => ({ date: b.date, ltp: b.total / b.n, points: b.n }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function weekKey(date: string): string | null {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = Math.floor((t - start) / 86_400_000);
  return `${d.getUTCFullYear()}-W${Math.floor(day / 7) + 1}`;
}

export interface JourneyStats {
  latest: LtpBucket;
  first: LtpBucket;
  high: number;
  low: number;
  average: number;
  changePct: number;
  bestEntry: LtpBucket;
  bestExit: LtpBucket;
  fromBestEntryPct: number;
  fromBestExitPct: number;
  rangePositionPct: number;
}

/** Best entry/exit + range position for a price journey. */
export function journeyStats(points: LtpBucket[]): JourneyStats | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const latest = points[points.length - 1]!;
  let bestEntry = first;
  let bestExit = first;
  let sum = 0;
  for (const p of points) {
    if (p.ltp < bestEntry.ltp) bestEntry = p;
    if (p.ltp > bestExit.ltp) bestExit = p;
    sum += p.ltp;
  }
  const average = sum / points.length;
  const changePct = first.ltp > 0 ? ((latest.ltp - first.ltp) / first.ltp) * 100 : 0;
  const range = bestExit.ltp - bestEntry.ltp;
  return {
    latest,
    first,
    high: bestExit.ltp,
    low: bestEntry.ltp,
    average,
    changePct,
    bestEntry,
    bestExit,
    fromBestEntryPct: bestEntry.ltp > 0 ? ((latest.ltp - bestEntry.ltp) / bestEntry.ltp) * 100 : 0,
    fromBestExitPct: bestExit.ltp > 0 ? ((latest.ltp - bestExit.ltp) / bestExit.ltp) * 100 : 0,
    rangePositionPct: range > 0 ? ((latest.ltp - bestEntry.ltp) / range) * 100 : 50,
  };
}

export interface FactGroup {
  heading: string | null;
  prose?: boolean;
  items: { label: string; value: string }[];
}

const FACT_RULES: { heading: string | null; prose?: boolean; match: RegExp }[] = [
  { heading: null, prose: true, match: /^(investment )?(objective|strategy|philosophy)/i },
  { heading: "The fund", match: /^(nature|type|status|listing|category|fund name|scheme name)/i },
  {
    heading: "Money & fees",
    match: /corpus|fund size|aum|nfo|units|price|face|load|fee|expense|charge/i,
  },
  {
    heading: "People",
    match: /sponsor|manager|depository|seed|supervisor|rating|registrar|trustee|custodian/i,
  },
  {
    heading: "Lifecycle & risk",
    match: /incept|allot|matur|duration|tenure|term|allocation target|risk|degree/i,
  },
  { heading: "Payouts", match: /dividend|distribution|payout|bonus|cash dividend|latest.*nav/i },
];

/** Cluster free-form prospectus facts into themed groups for a calm layout. */
export function groupSchemeFacts(facts: { label: string; value: string }[]): FactGroup[] {
  const buckets = new Map<string | null, { label: string; value: string }[]>();
  const order: (string | null)[] = [];
  for (const f of facts) {
    const rule = FACT_RULES.find((r) => r.match.test(f.label));
    const key = rule ? rule.heading : "More facts";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(f);
  }
  // Objective prose first, then themed groups, leftovers last.
  order.sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    if (a === "More facts") return 1;
    if (b === "More facts") return -1;
    return 0;
  });
  return order.map((key) => ({
    heading: key,
    prose: key === null,
    items: buckets.get(key)!,
  }));
}

/** "2y 4m left" style countdown; null when no usable date. */
export function maturityCountdown(maturityDate: string | null): string | null {
  if (!maturityDate) return null;
  const ms = Date.parse(
    maturityDate.includes("T") ? maturityDate : `${maturityDate}T00:00:00+05:45`,
  );
  if (!Number.isFinite(ms)) return null;
  const days = Math.ceil((ms - Date.now()) / DAY);
  if (days <= 0) return "Matured";
  const years = Math.floor(days / 365.25);
  const months = Math.floor((days - years * 365.25) / 30.44);
  if (years > 0) return `${years}y ${months}m left`;
  if (months > 0) return `${months}m left`;
  return `${days}d left`;
}

/** 0–1 life progress from allotment → maturity; null when dates missing. */
export function maturityProgress(
  allotmentDate: string | null,
  maturityDate: string | null,
): number | null {
  if (!allotmentDate || !maturityDate) return null;
  const start = Date.parse(
    allotmentDate.includes("T") ? allotmentDate : `${allotmentDate}T00:00:00+05:45`,
  );
  const end = Date.parse(
    maturityDate.includes("T") ? maturityDate : `${maturityDate}T00:00:00+05:45`,
  );
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}
