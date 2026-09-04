// Client-safe types for the public NEPSE market data feed.
// Data is community-sourced and indicative, never used for order placement.

export interface LivePrice {
  symbol: string;
  name: string;
  ltp: number;
  previousClose: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  trades: number;
  lastUpdated: string | null;
  sector: string | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface MarketIndex {
  name: string;
  close: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  percentChange: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  generatedTime: string | null;
}

export interface SectorIndex {
  code: string;
  name: string;
  sector: string | null;
  close: number | null;
  change: number | null;
  percentChange: number | null;
}

export interface MarketSummaryRow {
  detail: string;
  value: number;
}

export interface MoverRow {
  symbol: string;
  name: string;
  value: number;
  label: string;
}

export interface TopStocks {
  gainers: MoverRow[];
  losers: MoverRow[];
  turnover: MoverRow[];
  volume: MoverRow[];
  transactions: MoverRow[];
}

export interface MarketStatus {
  isOpen: boolean;
  lastChecked: string | null;
}

export interface PricePoint {
  time: number;
  value: number;
  volume?: number | undefined;
}

export interface ScripOverview {
  symbol: string;
  name: string;
  sector: string | null;
  instrumentType: string | null;
  isin: string | null;
  faceValue: number | null;
  listingDate: string | null;
  paidUpCapital: number | null;
  marketCapitalization: number | null;
  publicShares: number | null;
  publicPercentage: number | null;
  promoterPercentage: number | null;
  totalShares: number | null;
  website: string | null;
  email: string | null;
  contactPerson: string | null;
  lastUpdated: string | null;
}

export interface DailyBar {
  date: string;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** Range buttons on the trading terminal. */
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";

/** One OHLCV candle. `synthetic` marks bars whose open/high/low were derived
 * from close-only archive data rather than reported by the exchange. */
export interface ChartBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  synthetic: boolean;
}

/** Everything the terminal needs to draw one symbol at one range. */
export interface ChartSeries {
  symbol: string;
  name: string | null;
  range: ChartRange;
  /** Daily candles, ascending. Empty for a pure-intraday (1D) response. */
  bars: ChartBar[];
  /** Same-day tick series, only populated for the 1D range. */
  intraday: PricePoint[];
  /** True when any bar in `bars` was synthesised from close-only archive data. */
  hasSynthetic: boolean;
  source: string;
  fetchedAt: string;
}

export interface ScripDetail {
  overview: ScripOverview | null;
  history: DailyBar[];
  intraday: PricePoint[];
  dividend: DividendRow | null;
}

/** One published financial statement period (annual or quarterly). */
export interface FinancialReport {
  type: string;
  fy: string | null;
  fyNepali: string | null;
  quarter: string | null;
  pe: number | null;
  eps: number | null;
  paidUpCapital: number | null;
  profit: number | null;
  netWorthPerShare: number | null;
  /** Return on Equity - calculated as EPS / netWorthPerShare. */
  roe: number | null;
  /** Non-Performing Loan ratio (%). Banking-specific, from NRB reports. */
  npl: number | null;
  /** Capital Adequacy Ratio (%). Banking-specific, from NRB reports. */
  car: number | null;
  /** Operating Margin (%). Non-banking companies. */
  operatingMargin: number | null;
  submittedDate: string | null;
  /** URL of the source PDF (NEPSE annual/quarterly report). */
  documentUrl: string | null;
}

/** Structured financial history for one scrip from the YONEPSE feed. */
export interface ScripFinancials {
  symbol: string;
  reports: FinancialReport[];
  updatedAt: string | null;
}

export interface MarketSnapshot {
  status: MarketStatus;
  indices: MarketIndex[];
  summary: MarketSummaryRow[];
  prices: LivePrice[];
  stale: boolean;
  fetchedAt: string;
}

export interface DividendRow {
  symbol: string;
  bonusShare: number;
  cashDividend: number;
  totalDividend: number;
  announcementDate: string | null;
  bookCloseDate: string | null;
  fiscalYear: string | null;
}

/** NEPSE exchange message / notice from the YONEPSE news mirror. */
export interface ExchangeMessageRow {
  id: number;
  symbol: string | null;
  title: string;
  body: string | null;
  publishedAt: string | null;
  fileUrl: string | null;
}

/**
 * Resolution of one portfolio history point.
 * - `day`: a point per trading day (best-available: months without daily
 *   coverage contribute one month-end point each).
 * - `month`: a point per month-end close.
 * - `year`: a point per year (year-end close).
 */
export type PortfolioGranularity = "day" | "month" | "year";

/** One snapshot of a portfolio's value at a point, with per-scrip detail. */
export interface PortfolioHistoryPoint {
  time: number;
  value: number;
  breakdown: { symbol: string; units: number; close: number; value: number }[];
}

export interface IpoArchiveRow {
  company: string;
  units: string | null;
  dateRange: string | null;
  announcementDate: string | null;
  url: string | null;
}

export interface EnrichedHolding {
  scrip: string;
  description: string;
  units: number;
  /** Live LTP when the market feed knows the scrip, else MeroShare's own LTP. */
  ltp: number;
  previousClose: number;
  change: number;
  percentChange: number;
  value: number;
  previousValue: number;
  dayChange: number;
  high: number;
  low: number;
  volume: number;
  sector: string | null;
  name: string;
  live: boolean;
}

export interface EnrichedPortfolio {
  holdings: EnrichedHolding[];
  totalValue: number;
  totalPreviousValue: number;
  dayChange: number;
  dayChangePercent: number;
  totalUnits: number;
  liveCount: number;
  marketStale: boolean;
  status: MarketStatus;
  sectors: { sector: string; value: number; weight: number }[];
}
