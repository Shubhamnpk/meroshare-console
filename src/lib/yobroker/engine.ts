import type { YoHolding, YoOrder, YoTrade, YoWallet } from "./types";

function norm(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function yoMarketLot(symbol: string): number {
  // keep simple: most NEPSE equities 10, MFs 1 — engine only blocks 0 qty
  return 1;
}

export function placeYoOrder(
  w: YoWallet,
  args: {
    symbol: string;
    side: "BUY" | "SELL";
    qty: number;
    price?: number | null;
    orderType: "MKT" | "LMT";
  },
  ltp: number | null,
): { wallet: YoWallet; order: YoOrder | null; error?: string } {
  const symbol = norm(args.symbol);
  const qty = Math.floor(Number(args.qty));
  if (!symbol || qty <= 0) return { wallet: w, order: null, error: "Quantity must be positive." };
  const price = args.price != null && Number.isFinite(args.price) ? Number(args.price) : null;
  if (args.orderType === "LMT" && (price == null || price <= 0)) {
    return { wallet: w, order: null, error: "Limit price required." };
  }
  const fillPrice = args.orderType === "MKT" ? (ltp ?? price) : price;
  if (args.orderType === "MKT" && (fillPrice == null || fillPrice <= 0)) {
    return { wallet: w, order: null, error: "Live price unavailable." };
  }

  // validate funds / holdings for immediate market fill
  if (args.side === "BUY" && args.orderType === "MKT" && fillPrice != null) {
    const need = qty * fillPrice;
    if (w.cash + 1e-6 < need) return { wallet: w, order: null, error: "Not enough virtual cash." };
  }
  if (args.side === "SELL") {
    const h = w.holdings.find((x) => x.symbol === symbol);
    if (!h || h.qty < qty) return { wallet: w, order: null, error: "Not enough holdings to sell." };
  }

  const id = `yo-${w.seq}-${Date.now().toString(36)}`;
  const order: YoOrder = {
    id,
    symbol,
    side: args.side,
    qty,
    price,
    orderType: args.orderType,
    status: "open",
    createdAt: new Date().toISOString(),
    filledAt: null,
    fillPrice: null,
  };
  let wallet: YoWallet = { ...w, seq: w.seq + 1, orders: [order, ...w.orders] };
  if (args.orderType === "MKT" && fillPrice != null) {
    wallet = fillYoOrder(wallet, id, fillPrice);
  }
  return { wallet, order };
}

export function fillYoOrder(w: YoWallet, orderId: string, fillPrice: number): YoWallet {
  const idx = w.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return w;
  const o = w.orders[idx]!;
  if (o.status !== "open") return w;
  const price = Number(fillPrice);
  if (!Number.isFinite(price) || price <= 0) return w;

  // re-validate at fill time
  if (o.side === "BUY") {
    const need = o.qty * price;
    if (w.cash + 1e-6 < need) return w;
  } else {
    const h = w.holdings.find((x) => x.symbol === o.symbol);
    if (!h || h.qty < o.qty) return w;
  }

  const filled: YoOrder = {
    ...o,
    status: "filled",
    filledAt: new Date().toISOString(),
    fillPrice: price,
  };
  const orders = [...w.orders];
  orders[idx] = filled;

  let cash = w.cash;
  let holdings: YoHolding[] = w.holdings.map((h) => ({ ...h }));
  const trade: YoTrade = {
    id: `tr-${o.id}`,
    orderId: o.id,
    symbol: o.symbol,
    side: o.side,
    qty: o.qty,
    price,
    amount: o.qty * price,
    at: filled.filledAt!,
  };
  if (o.side === "BUY") {
    cash -= o.qty * price;
    const h = holdings.find((x) => x.symbol === o.symbol);
    if (h) {
      const totalCost = h.avgCost * h.qty + o.qty * price;
      h.qty += o.qty;
      h.avgCost = totalCost / h.qty;
    } else {
      holdings.push({ symbol: o.symbol, qty: o.qty, avgCost: price });
    }
  } else {
    cash += o.qty * price;
    const h = holdings.find((x) => x.symbol === o.symbol)!;
    h.qty -= o.qty;
    if (h.qty <= 0) holdings = holdings.filter((x) => x.symbol !== o.symbol);
  }

  return { ...w, cash, holdings, orders, trades: [trade, ...w.trades] };
}

export function cancelYoOrder(w: YoWallet, orderId: string): YoWallet {
  const idx = w.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return w;
  const o = w.orders[idx]!;
  if (o.status !== "open") return w;
  const orders = [...w.orders];
  orders[idx] = { ...o, status: "cancelled" };
  return { ...w, orders };
}

export function matchYoOrders(w: YoWallet, priceMap: Map<string, number>): YoWallet {
  let cur = w;
  for (const o of w.orders.filter(
    (x) => x.status === "open" && x.orderType === "LMT" && x.price != null,
  )) {
    const ltp = priceMap.get(o.symbol);
    if (ltp == null) continue;
    const hit = o.side === "BUY" ? ltp <= o.price! : ltp >= o.price!;
    if (hit) cur = fillYoOrder(cur, o.id, ltp);
  }
  return cur;
}
