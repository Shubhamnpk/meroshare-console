/**
 * Stock scoring engine for the Best Shares page.
 *
 * Two independent scoring systems:
 * - Short-term: momentum, volume, price action (days to weeks)
 * - Long-term: valuation, profitability, dividends (months to years)
 *
 * All functions are pure – no API calls, no server imports.
 */
import type { DailyBar, DividendRow, FinancialReport, LivePrice } from "./types";
import { rsi as computeRsi } from "./indicators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShortTermSignal = "BREAKOUT" | "OVERSOLD" | "MOMENTUM" | "WATCHLIST";
export type LongTermSignal = "VALUE" | "INCOME" | "GROWTH" | "BLUECHIP" | "WATCHLIST";

export type RedFlag =
  | "EPS_DECLINING"
  | "NO_DIVIDEND"
  | "PE_TOO_HIGH"
  | "NEGATIVE_EPS"
  | "LOW_ROE";

export interface ShortTermScore {
  score: number;
  rsi: number | null;
  signal: ShortTermSignal;
  momentum: number;
  volume: number;
  priceAction: number;
  liquidity: number;
}

export interface LongTermScore {
  score: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  dividendYield: number | null;
  dividendStreak: number;
  signal: LongTermSignal;
  redFlags: RedFlag[];
  valuation: number;
  profitability: number;
  quality: number;
  dividend: number;
  stability: number;
  growth: number;
}

export interface RankedStock {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  percentChange: number;
  sector: string | null;
  volume: number;
  turnover: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  shortTerm: ShortTermScore | null;
  longTerm: LongTermScore | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Percentile rank an array of values. Returns 0-100 for each index.
 * NaN/null values get rank 0.
 */
function percentileRanks(values: (number | null | undefined)[]): number[] {
  const scored = values.map((v, i) => ({ i, v: v ?? NaN }));
  const valid = scored.filter((s) => Number.isFinite(s.v));
  if (valid.length === 0) return values.map(() => 0);

  const sorted = [...valid].sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  for (let rank = 0; rank < sorted.length; rank++) {
    ranks[sorted[rank]!.i] = ((rank + 1) / sorted.length) * 100;
  }
  return ranks;
}

// ---------------------------------------------------------------------------
// RSI computation from daily bars
// ---------------------------------------------------------------------------

function latestRsi(bars: DailyBar[], period = 14): number | null {
  if (bars.length <= period + 1) return null;
  const indicatorBars = bars.map((b) => ({
    date: b.date,
    open: b.close,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: 0,
  }));
  const rsiValues = computeRsi(indicatorBars, period);
  if (rsiValues.length === 0) return null;
  return rsiValues[rsiValues.length - 1]!.value;
}

// ---------------------------------------------------------------------------
// Short-term scoring
// ---------------------------------------------------------------------------

export function computeShortTermScore(
  price: LivePrice,
  bars: DailyBar[],
  allPrices: LivePrice[],
): ShortTermScore {
  const { ltp, previousClose, high, low, volume, turnover, fiftyTwoWeekHigh, fiftyTwoWeekLow } =
    price;

  // RSI (0-100)
  const rsiVal = latestRsi(bars);

  // 52-week position (0 = at low, 100 = at high)
  const week52Range = (fiftyTwoWeekHigh ?? 0) - (fiftyTwoWeekLow ?? 0);
  const week52Position =
    week52Range > 0 ? clamp(((ltp - (fiftyTwoWeekLow ?? 0)) / week52Range) * 100, 0, 100) : 50;

  // Day change %
  const dayChangePercent = previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0;

  // Volume ranking (compared to all stocks)
  const allVolumes = allPrices.map((p) => p.volume);
  const volumeRanks = percentileRanks(allVolumes);
  const volumeRank = volumeRanks[allPrices.findIndex((p) => p.symbol === price.symbol)] ?? 50;

  // Turnover ranking
  const allTurnovers = allPrices.map((p) => p.turnover);
  const turnoverRanks = percentileRanks(allTurnovers);
  const turnoverRank = turnoverRanks[allPrices.findIndex((p) => p.symbol === price.symbol)] ?? 50;

  // === Component scores (each 0-100) ===

  // Momentum (35 points max)
  // Sweet spot: RSI 30-65 (not overbought), high 52wk position, positive change
  let momentum = 0;
  if (rsiVal != null) {
    // RSI scoring: 30-65 is optimal zone
    if (rsiVal >= 30 && rsiVal <= 65) {
      momentum += 40; // sweet spot
    } else if (rsiVal > 65 && rsiVal <= 80) {
      momentum += 25; // strong but potentially overbought
    } else if (rsiVal < 30) {
      momentum += 20; // oversold, might bounce
    } else {
      momentum += 5; // overbought, risky
    }
  }
  // 52-week position contribution
  momentum += week52Position * 0.3;
  // Day change contribution
  momentum += clamp(dayChangePercent * 5, -10, 15);
  momentum = clamp(momentum, 0, 100);

  // Volume (25 points max)
  let volumeScore = volumeRank * 0.7;
  // Bonus for above-average volume today
  if (volume > 0) {
    const avgVolume = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length;
    if (avgVolume > 0 && volume > avgVolume * 1.5) volumeScore += 15;
  }
  volumeScore = clamp(volumeScore, 0, 100);

  // Price action (25 points max)
  let priceAction = 0;
  // 52-week position
  priceAction += week52Position * 0.4;
  // Positive change is good
  priceAction += clamp(dayChangePercent * 8, -10, 20);
  // Range recovery (close near day high)
  const dayRange = high - low;
  if (dayRange > 0) {
    const closePosition = ((ltp - low) / dayRange) * 100;
    priceAction += closePosition * 0.2;
  }
  priceAction = clamp(priceAction, 0, 100);

  // Liquidity (15 points max)
  const liquidity = turnoverRank;

  // === Composite score ===
  const rawScore = momentum * 0.35 + volumeScore * 0.25 + priceAction * 0.25 + liquidity * 0.15;
  const score = Math.round(clamp(rawScore, 0, 100));

  // === Signal tag ===
  let signal: ShortTermSignal = "WATCHLIST";
  if (week52Position > 80 && volume > 0) {
    const avgVol = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length;
    if (avgVol > 0 && volume > avgVol * 1.5) signal = "BREAKOUT";
  }
  if (rsiVal != null && rsiVal < 30) signal = "OVERSOLD";
  if (dayChangePercent > 2 && volume > 0) {
    const avgVol = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length;
    if (avgVol > 0 && volume > avgVol) signal = "MOMENTUM";
  }

  return {
    score,
    rsi: rsiVal != null ? Math.round(rsiVal * 10) / 10 : null,
    signal,
    momentum: Math.round(momentum),
    volume: Math.round(volumeScore),
    priceAction: Math.round(priceAction),
    liquidity: Math.round(liquidity),
  };
}

// ---------------------------------------------------------------------------
// Long-term scoring
// ---------------------------------------------------------------------------

export function computeLongTermScore(
  price: LivePrice,
  financials: FinancialReport[] | null,
  dividends: DividendRow[],
  faceValue: number,
): LongTermScore {
  // Extract latest financial report
  const latestReport = financials?.[0] ?? null;

  const pe = latestReport?.pe ?? null;
  const netWorth = latestReport?.netWorthPerShare ?? null;
  const pb = netWorth != null && netWorth > 0 ? price.ltp / netWorth : null;
  const eps = latestReport?.eps ?? null;
  const profit = latestReport?.profit ?? null;

  // ROE = EPS / Net Worth per Share * 100
  const roe = eps != null && netWorth != null && netWorth > 0
    ? Math.round((eps / netWorth) * 1000) / 10
    : null;

  // Use latest dividend from history for yield calculation
  const latestDividend = dividends[0] ?? null;
  const dividendYield =
    latestDividend && faceValue > 0 && price.ltp > 0
      ? (latestDividend.totalDividend * faceValue) / (price.ltp * 100)
      : null;

  // Average dividend over last 3 years for consistency scoring
  const recentDividends = dividends.slice(0, 3);
  const avgDividendTotal =
    recentDividends.length > 0
      ? recentDividends.reduce((a, d) => a + d.totalDividend, 0) / recentDividends.length
      : 0;

  // Dividend streak: count consecutive fiscal years with dividends
  const fiscalYears = [...new Set(dividends.map((d) => d.fiscalYear).filter(Boolean))].sort().reverse();
  let dividendStreak = 0;
  if (fiscalYears.length > 0) {
    let expectedYear = parseInt(fiscalYears[0]!);
    for (const fy of fiscalYears) {
      const yr = parseInt(fy!);
      if (yr === expectedYear) {
        dividendStreak++;
        expectedYear--;
      } else if (yr < expectedYear) {
        break; // gap found
      }
    }
  }

  // Dividend growth: compare latest vs 3 years ago
  let dividendGrowth = 0;
  if (dividends.length >= 3 && dividends[2]!.totalDividend > 0) {
    dividendGrowth = ((dividends[0]!.totalDividend - dividends[2]!.totalDividend) / dividends[2]!.totalDividend) * 100;
  }

  // 52-week stability (narrower range = more stable)
  const week52Range =
    (price.fiftyTwoWeekHigh ?? 0) > 0 && (price.fiftyTwoWeekLow ?? 0) > 0
      ? ((price.fiftyTwoWeekHigh ?? 0) - (price.fiftyTwoWeekLow ?? 0)) /
        (price.fiftyTwoWeekLow ?? 1)
      : null;

  // EPS trend: compare latest two reports
  let epsTrend = 0;
  if (financials && financials.length >= 2) {
    const current = financials[0]?.eps;
    const previous = financials[1]?.eps;
    if (current != null && previous != null && previous !== 0) {
      epsTrend = ((current - previous) / Math.abs(previous)) * 100;
    }
  }

  // EPS declining streak: count consecutive quarters of declining EPS
  let epsDecliningStreak = 0;
  if (financials && financials.length >= 2) {
    for (let i = 0; i < financials.length - 1; i++) {
      const curr = financials[i]?.eps;
      const prev = financials[i + 1]?.eps;
      if (curr != null && prev != null && curr < prev) {
        epsDecliningStreak++;
      } else {
        break;
      }
    }
  }

  // === Component scores (each 0-100) ===

  // Valuation (25 points) - P/E (15) + P/B (10)
  let valuation = 0;
  if (pe != null && pe > 0) {
    if (pe < 10) valuation += 15;
    else if (pe < 14) valuation += 12;
    else if (pe < 18) valuation += 9;
    else if (pe < 22) valuation += 6;
    else if (pe < 30) valuation += 3;
    else valuation += 0;
  }
  if (pb != null && pb > 0) {
    if (pb < 1.0) valuation += 10;
    else if (pb < 1.5) valuation += 8;
    else if (pb < 2.0) valuation += 6;
    else if (pb < 3.0) valuation += 3;
    else valuation += 0;
  }
  valuation = clamp(valuation, 0, 100);

  // Profitability (20 points) - EPS (12) + ROE (8)
  let profitability = 0;
  if (eps != null && eps > 0) {
    if (eps > 35) profitability += 12;
    else if (eps > 20) profitability += 10;
    else if (eps > 10) profitability += 7;
    else if (eps > 0) profitability += 4;
  }
  // ROE component (max 8)
  if (roe != null && roe > 0) {
    if (roe > 20) profitability += 8;
    else if (roe > 15) profitability += 7;
    else if (roe > 12) profitability += 5;
    else if (roe > 9) profitability += 3;
    else profitability += 1;
  }
  profitability = clamp(profitability, 0, 100);

  // Quality (15 points) - EPS consistency + profit positive
  let quality = 0;
  // EPS consistency: more reports with positive EPS = better
  if (financials && financials.length > 0) {
    const positiveEpsCount = financials.filter((r) => r.eps != null && r.eps > 0).length;
    const ratio = positiveEpsCount / financials.length;
    if (ratio >= 0.9) quality += 10;
    else if (ratio >= 0.7) quality += 7;
    else if (ratio >= 0.5) quality += 4;
    else quality += 1;
  }
  // Profit positive in latest report
  if (profit != null && profit > 0) quality += 5;
  quality = clamp(quality, 0, 100);

  // Dividend (20 points) - yield + streak + growth
  let dividendScore = 0;
  // Yield component (max 8)
  if (dividendYield != null && dividendYield > 0) {
    if (dividendYield > 6) dividendScore = 8;
    else if (dividendYield > 4) dividendScore = 7;
    else if (dividendYield > 3) dividendScore = 6;
    else if (dividendYield > 2) dividendScore = 5;
    else if (dividendYield > 1) dividendScore = 3;
  }
  // Streak component (max 8) - how many consecutive years paid
  if (dividendStreak >= 8) dividendScore += 8;
  else if (dividendStreak >= 5) dividendScore += 6;
  else if (dividendStreak >= 3) dividendScore += 4;
  else if (dividendStreak >= 1) dividendScore += 2;
  // Growth component (max 4) - dividend increasing over time
  if (dividendGrowth > 20) dividendScore += 4;
  else if (dividendGrowth > 5) dividendScore += 3;
  else if (dividendGrowth > 0) dividendScore += 2;
  // Bonus for bonus shares in latest
  if (latestDividend && latestDividend.bonusShare > 0) {
    dividendScore += 1;
  }
  dividendScore = clamp(dividendScore, 0, 100);

  // Stability (10 points) - 52-week range
  let stability = 0;
  if (week52Range != null) {
    if (week52Range < 0.3) stability = 10;
    else if (week52Range < 0.5) stability = 7;
    else if (week52Range < 0.8) stability = 4;
    else stability = 1;
  }

  // Growth (10 points) - EPS trend
  let growth = 0;
  if (epsTrend > 0) {
    if (epsTrend > 20) growth = 10;
    else if (epsTrend > 10) growth = 7;
    else if (epsTrend > 0) growth = 4;
  }
  if (profit != null && profit > 0 && eps != null && eps > 0) {
    growth = clamp(growth + 2, 0, 10);
  }

  // === Composite score ===
  const rawScore =
    valuation * 0.25 +
    profitability * 0.20 +
    quality * 0.15 +
    dividendScore * 0.20 +
    stability * 0.10 +
    growth * 0.10;
  const score = Math.round(clamp(rawScore, 0, 100));

  // === Red flags ===
  const redFlags: RedFlag[] = [];
  if (epsDecliningStreak >= 3) redFlags.push("EPS_DECLINING");
  if (dividends.length === 0 && avgDividendTotal === 0) redFlags.push("NO_DIVIDEND");
  if (pe != null && pe > 30) redFlags.push("PE_TOO_HIGH");
  if (eps != null && eps < 0) redFlags.push("NEGATIVE_EPS");
  if (roe != null && roe < 5) redFlags.push("LOW_ROE");

  // === Signal tag ===
  let signal: LongTermSignal = "WATCHLIST";
  if (redFlags.length === 0 && pe != null && pe > 0 && pe < 12 && pb != null && pb < 1.5) signal = "VALUE";
  if (redFlags.length === 0 && dividendYield != null && dividendYield > 4) signal = "INCOME";
  if (redFlags.length === 0 && epsTrend > 10 && eps != null && eps > 0) signal = "GROWTH";
  // BLUECHIP: high turnover (proxy for large cap) + consistent dividends
  if (
    redFlags.length === 0 &&
    price.turnover > 10_000_000 &&
    dividendYield != null &&
    dividendYield > 2 &&
    avgDividendTotal > 0
  ) {
    signal = "BLUECHIP";
  }

  return {
    score,
    pe: pe != null ? Math.round(pe * 10) / 10 : null,
    pb: pb != null ? Math.round(pb * 100) / 100 : null,
    roe: roe != null ? Math.round(roe * 10) / 10 : null,
    dividendYield: dividendYield != null ? Math.round(dividendYield * 100) / 100 : null,
    dividendStreak,
    signal,
    redFlags,
    valuation: Math.round(valuation),
    profitability: Math.round(profitability),
    quality: Math.round(quality),
    dividend: Math.round(dividendScore),
    stability: Math.round(stability),
    growth: Math.round(growth),
  };
}
