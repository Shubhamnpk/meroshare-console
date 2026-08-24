/**
 * NEPSE transaction cost math: pure functions, no I/O.
 * Rates follow the SEBON/NEPSE circular in force for equity (ordinary share) trades.
 */

export const DP_CHARGE = 25; // Rs per scrip, per settlement, charged by your DP
export const SEBON_RATE = 0.00015; // 0.015% regulatory fee
export const MIN_BROKER_COMMISSION = 10; // Rs

/** Broker commission slabs for equity, applied on the whole amount at the matching slab rate. */
export const BROKER_SLABS: { upto: number; rate: number }[] = [
  { upto: 50_000, rate: 0.0036 },
  { upto: 500_000, rate: 0.0033 },
  { upto: 2_000_000, rate: 0.0031 },
  { upto: 10_000_000, rate: 0.0027 },
  { upto: Number.POSITIVE_INFINITY, rate: 0.0024 },
];

export function brokerRate(amount: number): number {
  const slab = BROKER_SLABS.find((s) => amount <= s.upto);
  return slab ? slab.rate : 0.0024;
}

export function brokerCommission(amount: number): number {
  if (!(amount > 0)) return 0;
  return Math.max(MIN_BROKER_COMMISSION, amount * brokerRate(amount));
}

export function sebonFee(amount: number): number {
  return amount > 0 ? amount * SEBON_RATE : 0;
}

/** Capital gains tax band for an individual investor, by holding period. */
export function cgtRate(holdingDays: number, entity: "individual" | "institution" = "individual") {
  if (entity === "institution") return 0.1;
  return holdingDays >= 365 ? 0.05 : 0.075;
}

export interface BuyCost {
  amount: number;
  commission: number;
  sebon: number;
  dp: number;
  total: number;
  /** Effective per-unit cost including all charges. */
  perUnit: number;
}

export function buyCost(units: number, price: number): BuyCost {
  const amount = Math.max(0, units) * Math.max(0, price);
  const commission = brokerCommission(amount);
  const sebon = sebonFee(amount);
  const dp = amount > 0 ? DP_CHARGE : 0;
  const total = amount + commission + sebon + dp;
  return { amount, commission, sebon, dp, total, perUnit: units > 0 ? total / units : 0 };
}

export interface SellResult {
  units: number;
  price: number;
  amount: number;
  commission: number;
  sebon: number;
  dp: number;
  charges: number;
  /** Proceeds after charges, before tax. */
  netBeforeTax: number;
  costBasis: number;
  /** Gain used for tax: net of charges, against the cost basis. */
  taxableGain: number;
  cgtRate: number;
  cgt: number;
  netReceivable: number;
  profit: number;
  profitPercent: number;
}

export function sellProceeds(input: {
  units: number;
  price: number;
  avgCost?: number;
  holdingDays?: number;
  entity?: "individual" | "institution";
}): SellResult {
  const units = Math.max(0, input.units);
  const price = Math.max(0, input.price);
  const amount = units * price;
  const commission = brokerCommission(amount);
  const sebon = sebonFee(amount);
  const dp = amount > 0 ? DP_CHARGE : 0;
  const charges = commission + sebon + dp;
  const netBeforeTax = amount - charges;
  const costBasis = (input.avgCost ?? 0) * units;
  const taxableGain = Math.max(0, netBeforeTax - costBasis);
  const rate = cgtRate(input.holdingDays ?? 0, input.entity ?? "individual");
  const cgt = costBasis > 0 ? taxableGain * rate : 0;
  const netReceivable = netBeforeTax - cgt;
  const profit = costBasis > 0 ? netReceivable - costBasis : netBeforeTax;
  return {
    units,
    price,
    amount,
    commission,
    sebon,
    dp,
    charges,
    netBeforeTax,
    costBasis,
    taxableGain,
    cgtRate: rate,
    cgt,
    netReceivable,
    profit,
    profitPercent: costBasis > 0 ? (profit / costBasis) * 100 : 0,
  };
}

/**
 * Price at which selling `units` returns exactly the cost basis after all charges.
 * Solved numerically because commission slabs are piecewise and DP is a flat fee.
 */
export function breakEvenPrice(units: number, avgCost: number): number {
  if (!(units > 0) || !(avgCost > 0)) return 0;
  let lo = avgCost;
  let hi = avgCost * 2 + 100;
  const net = (p: number) => sellProceeds({ units, price: p, avgCost, holdingDays: 400 }).profit;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (net(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Weighted average of any set of (units, price) lots. */
export function weightedAverage(lots: { units: number; price: number }[]): {
  units: number;
  cost: number;
  average: number;
} {
  const units = lots.reduce((s, l) => s + Math.max(0, l.units), 0);
  const cost = lots.reduce((s, l) => s + Math.max(0, l.units) * Math.max(0, l.price), 0);
  return { units, cost, average: units > 0 ? cost / units : 0 };
}

/** Adjusted cost after a bonus issue or right issue. */
export function adjustedCost(input: {
  units: number;
  avgCost: number;
  bonusPercent?: number;
  rightPercent?: number;
  rightPrice?: number;
}): { units: number; cost: number; average: number } {
  const baseUnits = Math.max(0, input.units);
  const baseCost = baseUnits * Math.max(0, input.avgCost);
  const bonusUnits = Math.floor((baseUnits * Math.max(0, input.bonusPercent ?? 0)) / 100);
  const rightUnits = Math.floor((baseUnits * Math.max(0, input.rightPercent ?? 0)) / 100);
  const rightCost = rightUnits * Math.max(0, input.rightPrice ?? 100);
  const units = baseUnits + bonusUnits + rightUnits;
  const cost = baseCost + rightCost;
  return { units, cost, average: units > 0 ? cost / units : 0 };
}

export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}
