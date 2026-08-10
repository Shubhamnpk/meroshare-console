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

export interface MutualFundRow {
  symbol: string;
  fundName: string;
  fundSize: number;
  dailyNav: number;
  dailyNavDate: string | null;
  weeklyNav: number;
  monthlyNav: number;
}

export interface BrokerRow {
  id: number;
  memberCode: number | string;
  memberName: string;
  membershipType: string | null;
  phone: string | null;
  districts: string[];
  tmsLink: string | null;
  branchCount: number | null;
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
