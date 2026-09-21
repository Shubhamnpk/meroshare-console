// Yo Broker — paper trading, no broker session.
export const YO_INITIAL_CASH = 1_000_000;

export type YoSide = "BUY" | "SELL";
export type YoOrderType = "MKT" | "LMT";
export type YoStatus = "open" | "filled" | "cancelled";

export interface YoHolding {
  symbol: string;
  qty: number;
  avgCost: number;
}

export interface YoOrder {
  id: string;
  symbol: string;
  side: YoSide;
  qty: number;
  price: number | null;
  orderType: YoOrderType;
  status: YoStatus;
  createdAt: string;
  filledAt: string | null;
  fillPrice: number | null;
}

export interface YoTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: YoSide;
  qty: number;
  price: number;
  amount: number;
  at: string;
}

export interface YoWallet {
  cash: number;
  holdings: YoHolding[];
  orders: YoOrder[];
  trades: YoTrade[];
  active: boolean;
  createdAt: string;
  seq: number;
}
