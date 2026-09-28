import {
  breakEvenPrice,
  buyCost,
  sellProceeds,
  type BuyCost,
  type SellResult,
} from "./fees";

export interface NetPosition {
  buy: BuyCost;
  net: SellResult;
  breakeven: number;
  profit: number;
  profitPct: number;
}

/**
 * One place for unrealized P/L math: all-in buy cost, net sell proceeds after
 * broker/SEBON/DP + CGT, and the breakeven price. Open-end mutual funds skip
 * all charges on both legs. holdingDays defaults to 400 (long-term band)
 * where the real holding age is unknown.
 */
export function netPosition(
  units: number,
  waccRate: number,
  ltp: number,
  opts?: { isOpenEnd?: boolean; holdingDays?: number },
): NetPosition {
  const open = opts?.isOpenEnd ?? false;
  const days = opts?.holdingDays ?? 400;
  const buy = buyCost(units, waccRate, { isOpenEnd: open });
  const net = sellProceeds({
    units,
    price: ltp,
    avgCost: buy.perUnit,
    holdingDays: days,
    isOpenEnd: open,
  });
  const breakeven = breakEvenPrice(units, buy.perUnit, days, { isOpenEnd: open });
  return { buy, net, breakeven, profit: net.profit, profitPct: net.profitPercent };
}
