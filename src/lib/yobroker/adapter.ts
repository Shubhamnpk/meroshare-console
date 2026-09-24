import type {
  BrokerFunds,
  BrokerHolding,
  BrokerOrder,
  BrokerStatementRow,
  BrokerTrade,
  FundTransaction,
  FundTransactionPage,
} from "@/lib/brokers/types";
import type { YoWallet } from "./types";

export function yoToHoldings(
  w: YoWallet,
  priceMap: Map<string, { ltp: number | null; closePrice: number | null }>,
): BrokerHolding[] {
  return w.holdings.map((h) => {
    const live = priceMap.get(h.symbol);
    const close = live?.closePrice ?? h.avgCost;
    const ltp = live?.ltp ?? h.avgCost;
    return {
      symbol: h.symbol,
      availableQty: h.qty,
      closePrice: close,
      marketValue: h.qty * (ltp ?? h.avgCost),
    };
  });
}

export function yoToOrders(w: YoWallet): BrokerOrder[] {
  return w.orders.map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    quantity: o.qty,
    price: o.price ?? o.fillPrice ?? null,
    status: o.status === "open" ? "OPEN" : o.status === "filled" ? "COMPLETE" : "CANCELLED",
    orderType: o.orderType,
    validity: "DAY",
    orderId: o.id,
    tranId: o.id,
    remainingQty: o.status === "open" ? o.qty : 0,
    tradedQty: o.status === "filled" ? o.qty : 0,
    amount: (o.price ?? o.fillPrice ?? null) !== null ? (o.price ?? o.fillPrice ?? 0) * o.qty : null,
    exchangeOrderNo: "",
    orderStatus: o.status === "open" ? "OPEN" : o.status === "filled" ? "COMPLETE" : "CANCELLED",
    deliveryFlag: "CNC",
    date: o.createdAt.slice(0, 10),
    time: o.createdAt.slice(11, 16),
  }));
}

export function yoToTrades(w: YoWallet): BrokerTrade[] {
  return w.trades.map((t) => ({
    id: t.id,
    orderNo: t.orderId,
    symbol: t.symbol,
    side: t.side,
    quantity: t.qty,
    price: t.price,
    amount: t.amount,
    date: t.at.slice(0, 10),
    time: t.at.slice(11, 16),
    account: "Yo Broker",
  }));
}

export function yoToFunds(w: YoWallet, holdingsValue: number): BrokerFunds {
  const total = w.cash + holdingsValue;
  return {
    balance: w.cash,
    ledgerBalance: w.cash,
    finalCollateral: total,
    tmsLimit: total,
    collateralUsed: holdingsValue,
    availableForWithdraw: w.cash,
    pendingOrder: 0,
    intradayFundTransfers: 0,
    unbilledSales: 0,
    overallRemaining: w.cash,
  };
}

export function yoToFundTxns(w: YoWallet, page = 1, pageSize = 20): FundTransactionPage {
  const rows: FundTransaction[] = [
    {
      id: "init",
      date: w.createdAt.slice(0, 10),
      type: "DEPOSIT",
      gateway: "Virtual",
      status: "COMPLETE",
      amount: 1_000_000,
      reference: "Yo Broker initial virtual cash",
    },
    ...w.trades.map((t) => ({
      id: t.id,
      date: t.at.slice(0, 10),
      type: t.side === "BUY" ? "DEBIT" : "CREDIT",
      gateway: "Virtual",
      status: "COMPLETE",
      amount: t.amount,
      reference: `${t.side} ${t.qty} ${t.symbol} @ ${t.price}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    totalCount: rows.length,
    totalPages,
    pageSize,
    currentPage,
    rows: rows.slice(start, start + pageSize),
  };
}

export function yoToStatement(w: YoWallet): BrokerStatementRow[] {
  return yoToFundTxns(w, 1, 100).rows.map((r) => ({
    date: r.date,
    narration: r.reference,
    debit: r.type === "DEBIT" ? r.amount : null,
    credit: r.type === "CREDIT" || r.type === "DEPOSIT" ? r.amount : null,
    balance: null,
  }));
}
