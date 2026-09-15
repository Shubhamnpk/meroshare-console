// Broker connections: registry + shared types (no secrets in these shapes).
// A "broker" here is an external trading terminal account (e.g. Naasa X)
// the user optionally links so the server can act on their behalf.

export const BROKER_IDS = ["naasa-x"] as const;
export type BrokerId = (typeof BROKER_IDS)[number];

export interface BrokerMeta {
  id: BrokerId;
  name: string;
  tagline: string;
  /** Why connecting is useful once linked. */
  capabilities: string[];
  /** Future terminals: shown disabled until a worker exists. */
  comingSoon?: boolean;
}

export const BROKERS: BrokerMeta[] = [
  {
    id: "naasa-x",
    name: "Naasa X",
    tagline: "Naasa Securities web trading (NEPSE)",
    capabilities: ["Holdings & dashboard", "Order book & trades", "Live market data"],
  },
];

/** What the client is ever allowed to see about a saved connection. */
export interface BrokerConnectionMeta {
  brokerId: BrokerId;
  /** Login email as typed (identifies the account, not a secret). */
  username: string;
  /** Display name proven by the last successful test. */
  displayName: string | null;
  connectedAt: string;
  lastTestedAt: string;
}

/** Proof returned by a test login. Contains no secrets. */
export interface BrokerTestResult {
  ok: boolean;
  brokerId: BrokerId;
  displayName: string | null;
  /** First 4 chars + ellipsis: enough to recognise, useless to reuse. */
  clientCodeHint: string | null;
  holdingSymbols: string[];
  steps: string[];
  error?: string | undefined;
  hint?: string | undefined;
}

export function brokerMeta(id: BrokerId): BrokerMeta {
  const found = BROKERS.find((b) => b.id === id);
  if (!found) throw new Error(`Unknown broker: ${id}`);
  return found;
}

/** Live quote row (broker field names, all values arrive as strings). */
export interface BrokerQuote {
  symbol: string;
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  turnover: number | null;
  bidQty: number | null;
  bidPrice: number | null;
  offerQty: number | null;
  offerPrice: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  lastTradeTime: string | null;
}

/** Depth ladder row (best-effort normalisation; empty off-hours). */
export interface BrokerDepthRow {
  side: "bid" | "ask";
  price: number | null;
  quantity: number | null;
  orders: number | null;
}

export interface BrokerDepth {
  errorCode: number;
  message: string;
  bids: BrokerDepthRow[];
  asks: BrokerDepthRow[];
}

export interface BrokerHolding {
  symbol: string;
  availableQty: number;
  closePrice: number | null;
  marketValue: number | null;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL" | "UNKNOWN";
  quantity: number;
  price: number | null;
  status: string;
  orderType: string;
  validity: string;
  /** Canonical ids for cancel/modify. */
  orderId: string;
  tranId: string;
  remainingQty: number;
  orderStatus: string;
  deliveryFlag: string;
  date: string;
  time: string;
}

export interface BrokerTrade {
  id: string;
  orderNo: string;
  symbol: string;
  side: "BUY" | "SELL" | "UNKNOWN";
  quantity: number;
  price: number | null;
  amount: number | null;
  date: string;
  time: string;
  account: string;
}

export interface CancelOrderRequest {
  brokerId: BrokerId;
  orderId: string;
  tranId: string;
  orderStatus: string;
  buySellType: string;
  deliveryFlag?: string | undefined;
  orderTerms?: string | undefined;
  price: string;
  quantity: number;
  symbol: string;
  /** Explicit user confirmation — the server refuses without it. */
  confirmed: true;
}

export interface CancelOrderResult {
  ok: boolean;
  message: string;
}

export interface BrokerFunds {
  balance: number | null;
  ledgerBalance: number | null;
  finalCollateral: number | null;
  tmsLimit: number | null;
  collateralUsed: number | null;
  availableForWithdraw: number | null;
  pendingOrder: number | null;
  intradayFundTransfers: number | null;
  unbilledSales: number | null;
  overallRemaining: number | null;
}

export interface FundTransactionQuery {
  brokerId: BrokerId;
  search?: string | undefined;
  transactionType?: string | undefined;
  gateway?: string | undefined;
  status?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  page?: number | undefined;
}

export interface FundTransaction {
  id: string;
  date: string;
  type: string;
  gateway: string;
  status: string;
  amount: number | null;
  reference: string;
}

export interface FundTransactionPage {
  totalCount: number;
  totalPages: number;
  pageSize: number;
  currentPage: number;
  rows: FundTransaction[];
}

export interface BrokerBank {
  accountNumber: string;
  accountName: string;
  bankName: string;
  branchName: string;
  isPrimary: boolean;
}

export interface WithdrawRequest {
  brokerId: BrokerId;
  amount: number;
  isQuickRefund: boolean;
  /** Explicit user confirmation — the server refuses without it. */
  confirmed: true;
}

export interface WithdrawResult {
  ok: boolean;
  message: string;
}

export interface PlaceOrderRequest {
  brokerId: BrokerId;
  side: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number;
  orderType: "LMT" | "MKT";
  validity: "DAY" | "GTD" | "GTC" | "IOC" | "FOK";
  validTill?: string | undefined;
  /** Explicit user confirmation — the server refuses without it. */
  confirmed: true;
}

export interface PlaceOrderResult {
  ok: boolean;
  message: string;
  tranId: string | null;
}

export interface ModifyOrderRequest {
  brokerId: BrokerId;
  tranId: string;
  orderId: string;
  orderStatus: string;
  remainingQty: number;
  side: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number;
  orderType: "LMT" | "MKT";
  validity: "DAY" | "GTD" | "GTC" | "IOC" | "FOK";
  validTill?: string | undefined;
  /** Explicit user confirmation — the server refuses without it. */
  confirmed: true;
}

export interface BrokerWatchlist {
  name: string;
  symbols: string[];
  isDefault: boolean;
  systemTag: string;
}

export interface BrokerWatchlists {
  templates: BrokerWatchlist[];
}

/** One step in an order's life (placed → partial → complete/cancelled). */
export interface BrokerOrderEvent {
  status: string;
  quantity: number | null;
  price: number | null;
  tradedQty: number | null;
  remainingQty: number | null;
  date: string;
  time: string;
  message: string;
}

/** Broker company snapshot: lot/tick/DPR data the public mirror lacks. */
export interface BrokerCompanyInfo {
  symbol: string;
  companyName: string | null;
  isin: string | null;
  tickSize: number | null;
  marketLot: number | null;
  maxOrderSize: number | null;
  dprLow: number | null;
  dprHigh: number | null;
  preOpenDprLow: number | null;
  preOpenDprHigh: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  listingDate: string | null;
  activeStatus: string | null;
}

export interface BrokerMarketStatus {
  status: string;
  isOpen: boolean;
}

export interface BrokerTicket {
  id: string;
  status: "open" | "pending" | "resolved";
  time: string;
  description: string;
  unread: boolean;
}
