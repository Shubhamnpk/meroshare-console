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
  /** YONEPSE row kind, e.g. "open_ended_mutual_fund" whose ltp is the daily NAV. */
  assetType?: string | null;
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

/** Per-scrip buy/sell split for a broker's busiest scrip today. */
export interface BrokerTopStock {
  symbol: string;
  name: string;
  totalAmount: number;
  buyAmount: number;
  sellAmount: number;
}

/** A broker's aggregated trading stats for the current/last session. */
export interface BrokerTodayStats {
  totalAmount: number;
  buyAmount: number;
  sellAmount: number;
  topStock: BrokerTopStock | null;
}

/** Community rating for a broker (ShareHub/Arthakendra data). */
export interface BrokerRating {
  averageRating: number;
  totalRatings: number;
  averageShareTransferDays: number;
  averageCashDepositDays: number;
}

/** One NEPSE member broker from the YONEPSE broker directory. */
export interface BrokerRow {
  /** NEPSE member code, e.g. 58 for Naasa Securities. */
  code: number;
  name: string;
  membershipType: string;
  phone: string | null;
  tmsLink: string | null;
  branchCount: number;
  provinces: string[];
  districts: string[];
  isDealer: boolean;
  active: boolean;
  logoUrl: string | null;
  rating: BrokerRating | null;
  /** Turnover over the trailing 30 sessions. */
  thirtyDaysTurnover: number;
  /** Turnover on the most recent published session before today. */
  latestTurnover: number;
  /** Aggregated buy/sell for today — null when the session hasn't published yet. */
  todayStats: BrokerTodayStats | null;
}

/** Dates with floor sheet data available. */
export interface FloorSheetManifest {
  latestDate: string | null;
  dates: string[];
}

/** Per-broker trading stats aggregated for one trading day. */
export interface BrokerDayStat {
  code: string;
  name: string;
  trades: number;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  buyVolume: number;
  sellVolume: number;
  /** sellAmount - buyAmount; positive means the broker sold more than it bought (net supply). */
  netAmount: number;
  topSymbols: { symbol: string; amount: number; trades: number }[];
}

/** Per-scrip trading stats aggregated for one trading day. */
export interface SymbolDayStat {
  symbol: string;
  name: string;
  trades: number;
  volume: number;
  amount: number;
  avgPrice: number;
  high: number;
  low: number;
  brokers: number;
}

/** Hourly market activity bucket for one trading day. */
export interface HourPoint {
  hour: string;
  trades: number;
  amount: number;
}

/** One reconstructed floor-sheet transaction. */
export interface FloorSheetTrade {
  contractId: string;
  symbol: string;
  buyer: { code: string; name: string } | null;
  seller: { code: string; name: string } | null;
  quantity: number;
  rate: number;
  amount: number;
  time: string | null;
  /** Trading day — set on multi-day trail lookups. */
  date?: string | null;
}

/** Top counterparty for one scrip over the looked-up range. */
export interface TrailParty {
  code: string;
  name: string;
  amount: number;
  trades: number;
}

/** Everything the brokers page draws for one trading day, aggregated server-side. */
export interface FloorSheetDay {
  date: string;
  /** Latest day in the range, null for single-day aggregates. */
  dateTo: string | null;
  /** Trading sessions actually scanned. */
  sessions: number;
  stale: boolean;
  totalTrades: number;
  totalVolume: number;
  totalAmount: number;
  scripsTraded: number;
  brokersActive: number;
  biggestTrade: FloorSheetTrade | null;
  /** Largest single-contract trades of the day, descending by amount. */
  biggestTrades: FloorSheetTrade[];
  hourly: HourPoint[];
  brokerLeaderboard: BrokerDayStat[];
  symbolLeaderboard: SymbolDayStat[];
}

/** Result of a floor-sheet trade trail lookup (broker / scrip / contract, date range). */
export interface FloorSheetTrail {
  date: string;
  /** Latest day in the range, null for single-day lookups. */
  dateTo: string | null;
  stale: boolean;
  /** Total matching trades and amount before the response cap. */
  totalTrades: number;
  totalAmount: number;
  truncated: boolean;
  trades: FloorSheetTrade[];
  /** Top buyers of the scrip over the range (only when a symbol is set). */
  topBuyers: TrailParty[];
  /** Top sellers of the scrip over the range (only when a symbol is set). */
  topSellers: TrailParty[];
}
