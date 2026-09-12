// Broker-link server functions. Passwords are accepted only to (a) run one
// live test login or (b) be encrypted into the vault in the same call —
// they are never persisted in plaintext and never returned to the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  brokerMeta,
  type BrokerBank,
  type BrokerConnectionMeta,
  type BrokerDepth,
  type BrokerDepthRow,
  type BrokerFunds,
  type BrokerHolding,
  type BrokerId,
  type BrokerOrder,
  type BrokerQuote,
  type BrokerTestResult,
  type BrokerTrade,
  type CancelOrderRequest,
  type CancelOrderResult,
  type FundTransaction,
  type FundTransactionPage,
  type FundTransactionQuery,
  type PlaceOrderRequest,
  type PlaceOrderResult,
  type WithdrawRequest,
  type WithdrawResult,
} from "./types";
import { listConnections, loadCredentials, removeConnection, saveConnection } from "./vault.server";
import {
  BrokerSessionError,
  cancelNaasaOrder,
  dropNaasaSession,
  dropWalletSession,
  exchangeTradeflowToken,
  getNaasaDepth,
  getNaasaHoldings,
  getNaasaOrderBook,
  getNaasaQuote,
  getNaasaSession,
  getNaasaTokens,
  getNaasaTradeBook,
  getNaasaAmoList,
  getTradeflowBanks,
  getTradeflowFunds,
  getTradeflowTxns,
  getWalletAccessToken,
  requestTradeflowWithdraw,
  cancelNaasaAmo,
  placeNaasaAmo,
  placeNaasaOrder,
  testNaasaLogin,
  type NaasaAmoOrder,
  type NaasaSession,
} from "./naasa.server";

const brokerInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  username: z.string().trim().email().max(128),
  password: z.string().min(1).max(128),
});

async function runTest(
  brokerId: BrokerId,
  username: string,
  password: string,
): Promise<BrokerTestResult> {
  brokerMeta(brokerId); // throws on unknown broker
  if (brokerId === "naasa-x") return testNaasaLogin(username, password);
  throw new Error(`No login worker for broker: ${brokerId}`);
}

/** Live test login. Does NOT save anything. */
export const testBrokerConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => brokerInput.parse(input))
  .handler(async ({ data }): Promise<BrokerTestResult> => {
    return runTest(data.brokerId, data.username, data.password);
  });

/** Test-then-save: only credentials that just proved working are stored. */
export const saveBrokerConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => brokerInput.parse(input))
  .handler(async ({ data }): Promise<BrokerConnectionMeta> => {
    const result = await runTest(data.brokerId, data.username, data.password);
    if (!result.ok) {
      throw new Error(result.error ?? "Broker login failed. Connection was not saved.");
    }
    return saveConnection(data.brokerId, data.username, data.password, result.displayName);
  });

export const listBrokerConnections = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrokerConnectionMeta[]> => listConnections(),
);

/** Does this server have a vault key? The UI uses it to explain setup
 * problems instead of letting every button fail cryptically. */
export const brokerVaultStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean }> => {
    const secret = process.env["BROKER_VAULT_SECRET"];
    return { configured: !!secret && secret.length >= 32 };
  },
);

export const removeBrokerConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await removeConnection(data.brokerId);
    return { ok: true };
  });

/** Re-run the live test using SAVED credentials (no password round-trip). */
export const retestBrokerConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerTestResult> => {
    const creds = await loadCredentials(data.brokerId);
    if (!creds) throw new Error("No saved connection for this broker.");
    return runTest(data.brokerId, creds.username, creds.password);
  });

// ---------------------------------------------------------------------------
// Live trading reads + order placement on a SAVED connection.
// Reads use a short-lived cached broker session; placement reuses it too.
// ---------------------------------------------------------------------------

const numOrNull = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

async function withSavedSession(
  brokerId: BrokerId,
): Promise<{ session: NaasaSession; cacheKey: string }> {
  if (brokerId !== "naasa-x") throw new Error(`No trading worker for broker: ${brokerId}`);
  const creds = await loadCredentials(brokerId);
  if (!creds)
    throw new Error("No saved connection for this broker. Connect it in Settings → Advanced.");
  const cacheKey = `${brokerId}:${creds.username.toLowerCase()}`;
  try {
    return { session: await getNaasaSession(cacheKey, creds.username, creds.password), cacheKey };
  } catch (err) {
    dropNaasaSession(cacheKey);
    throw err;
  }
}

/** Run an op with the cached session; once stale, re-login and retry once. */
async function withBrokerSession<T>(
  brokerId: BrokerId,
  op: (s: NaasaSession) => Promise<T>,
): Promise<T> {
  const first = await withSavedSession(brokerId);
  try {
    return await op(first.session);
  } catch (err) {
    if (err instanceof BrokerSessionError) {
      dropNaasaSession(first.cacheKey);
      const second = await withSavedSession(brokerId);
      return await op(second.session);
    }
    throw err;
  }
}

const symbolInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  symbol: z.string().trim().min(3).max(24),
});

export const getBrokerQuote = createServerFn({ method: "GET" })
  .validator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }): Promise<BrokerQuote | null> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const row = await getNaasaQuote(session, data.symbol);
      if (!row) return null;
      const num = (k: string) => numOrNull(row[k]);
      return {
        symbol: data.symbol.trim().toUpperCase(),
        ltp: num("LTP"),
        change: num("Change") ?? num("change"),
        changePercent: num("%Change") ?? num("PercentChange") ?? num("PctChange"),
        open: num("Open"),
        high: num("High"),
        low: num("Low"),
        close: num("Close"),
        volume: num("Volume") ?? num("TTQ"),
        turnover: num("Turnover") ?? num("TTV"),
        bidQty: num("BidQty"),
        bidPrice: num("BidPrice"),
        offerQty: num("OfferQty"),
        offerPrice: num("OfferPrice"),
        weekHigh52: num("52WeekHigh"),
        weekLow52: num("52WeekLow"),
        lastTradeTime: strOrNull(row["LastTradeTime"]),
      };
    });
  });

function toDepthRows(rows: Record<string, unknown>[], side: "bid" | "ask"): BrokerDepthRow[] {
  return rows
    .map((r) => {
      const priceKeys =
        side === "bid"
          ? ["BBR", "BidPrice", "bid", "price"]
          : ["BSR", "OfferPrice", "ask", "price"];
      const qtyKeys =
        side === "bid"
          ? ["BBQ", "BidQty", "qty", "quantity"]
          : ["BSQ", "OfferQty", "qty", "quantity"];
      const pick = (keys: string[]) => {
        for (const k of keys) {
          const n = numOrNull(r[k]);
          if (n !== null) return n;
        }
        return null;
      };
      return {
        side,
        price: pick(priceKeys),
        quantity: pick(qtyKeys),
        orders: numOrNull(r["SO"] ?? r["orders"]),
      };
    })
    .filter((r) => r.price !== null && r.quantity !== null)
    .slice(0, 5);
}

export const getBrokerDepth = createServerFn({ method: "GET" })
  .validator((input: unknown) => symbolInput.parse(input))
  .handler(async ({ data }): Promise<BrokerDepth> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const depth = await getNaasaDepth(session, data.symbol);
      // Broker returns one row set; split heuristically when side is marked,
      // else mirror top-5 both sides from bid/ask column pairs.
      const bids = toDepthRows(
        depth.rows.filter((r) => /b/i.test(String(r["side"] ?? "B"))),
        "bid",
      );
      const asks = toDepthRows(
        depth.rows.filter((r) => /a|s/i.test(String(r["side"] ?? "S"))),
        "ask",
      );
      const fallback = depth.rows.length > 0 && bids.length === 0 && asks.length === 0;
      return {
        errorCode: depth.errorCode,
        message: depth.message,
        bids: fallback ? toDepthRows(depth.rows, "bid") : bids,
        asks: fallback ? [] : asks,
      };
    });
  });

export const getBrokerHoldings = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerHolding[]> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const rows = await getNaasaHoldings(session);
      return rows.map((r) => ({
        symbol: String(r["NEPSECode"] ?? ""),
        availableQty: numOrNull(r["AvailableQty"]) ?? 0,
        closePrice: numOrNull(r["ClosePrice"]),
        marketValue: numOrNull(r["MarketValue"]),
      }));
    });
  });

export const getBrokerOrderBook = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        brokerId: z.enum(["naasa-x"]),
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BrokerOrder[]> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const rows = await getNaasaOrderBook(session, {
        ...(data.fromDate ? { fromDate: data.fromDate } : {}),
        ...(data.toDate ? { toDate: data.toDate } : {}),
      });
      return rows.map((r) => {
        const sideRaw = String(
          r["BuySellType"] ?? r["B/S"] ?? r["BuySellIndicator"] ?? "",
        ).toUpperCase();
        const id = String(
          r["LatestOrderID"] ??
            r["OrderId"] ??
            r["OrderNo"] ??
            r["BrokerTranID"] ??
            r["TranId"] ??
            "",
        ).trim();
        const remaining =
          numOrNull(r["RemainingQty"]) ??
          (numOrNull(r["Quantity"]) !== null && numOrNull(r["TradedQuantity"]) !== null
            ? Math.max(0, (numOrNull(r["Quantity"]) ?? 0) - (numOrNull(r["TradedQuantity"]) ?? 0))
            : (numOrNull(r["Quantity"]) ?? 0));
        return {
          id,
          symbol: String(r["Scrip"] ?? ""),
          side: sideRaw.startsWith("S") ? "SELL" : sideRaw.startsWith("B") ? "BUY" : "UNKNOWN",
          quantity: numOrNull(r["Quantity"]) ?? 0,
          price: numOrNull(r["Price"]),
          status: String(r["OrderStatus"] ?? ""),
          orderType: String(r["OrderType"] ?? ""),
          validity: String(r["OrderTerms"] ?? "DAY"),
          orderId: String(r["LatestOrderID"] ?? r["OrderId"] ?? r["OrderNo"] ?? ""),
          tranId: String(r["BrokerTranID"] ?? r["TranId"] ?? ""),
          remainingQty: remaining,
          orderStatus: String(r["OrderStatus"] ?? ""),
          deliveryFlag: String(r["DeliveryFlag"] ?? "DEL"),
        };
      });
    });
  });

const placeInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  side: z.enum(["BUY", "SELL"]),
  symbol: z.string().trim().min(3).max(24),
  quantity: z.number().int().min(1).max(100000),
  price: z.number().min(0).max(100000),
  orderType: z.enum(["LMT", "MKT"]),
  validity: z.enum(["DAY", "GTD", "GTC", "IOC", "FOK"]),
  validTill: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Order needs explicit confirmation." }),
  }),
});

/** Places a REAL order at the broker. Refuses without confirmed: true. */
export const placeBrokerOrder = createServerFn({ method: "POST" })
  .validator((input: unknown): PlaceOrderRequest => placeInput.parse(input) as PlaceOrderRequest)
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      return placeNaasaOrder(session, {
        side: data.side,
        symbol: data.symbol,
        quantity: data.quantity,
        price: data.price,
        orderType: data.orderType,
        validity: data.validity,
        validTill: data.validTill,
      });
    });
  });

const placeAmoInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  side: z.enum(["BUY", "SELL"]),
  symbol: z.string().trim().min(3).max(24),
  quantity: z.number().int().min(1).max(100000),
  price: z.number().positive().max(100000),
  ltp: z.number().positive().max(1000000),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Order needs explicit confirmation." }),
  }),
});

/** Places a REAL after-market order. Only valid while the market is closed. */
export const placeBrokerAmo = createServerFn({ method: "POST" })
  .validator((input: unknown) => placeAmoInput.parse(input))
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      return placeNaasaAmo(session, {
        side: data.side,
        symbol: data.symbol,
        quantity: data.quantity,
        price: data.price,
        ltp: data.ltp,
      });
    });
  });

export const getBrokerAmoList = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<NaasaAmoOrder[]> => {
    return withBrokerSession(data.brokerId, async (session) => getNaasaAmoList(session));
  });

const cancelAmoInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  alertName: z.string().max(128).nullable().optional(),
  scrip: z.string().trim().min(3).max(24),
  price: z.number().min(0).max(100000).nullable(),
  triggerPrice: z.number().min(0).max(100000).nullable().optional(),
  quantity: z.number().int().min(1).max(100000),
  side: z.enum(["BUY", "SELL"]),
  validTill: z.string().max(32).nullable().optional(),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Cancelling needs explicit confirmation." }),
  }),
});

/** Cancels a REAL after-market order. Refuses without confirmed: true. */
export const cancelBrokerAmo = createServerFn({ method: "POST" })
  .validator((input: unknown) => cancelAmoInput.parse(input))
  .handler(async ({ data }): Promise<CancelOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      return cancelNaasaAmo(session, {
        alertName: data.alertName ?? null,
        scrip: data.scrip,
        price: data.price,
        triggerPrice: data.triggerPrice ?? null,
        quantity: data.quantity,
        side: data.side,
        validTill: data.validTill ?? null,
      });
    });
  });

export const getBrokerTradeBook = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        brokerId: z.enum(["naasa-x"]),
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BrokerTrade[]> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const rows = await getNaasaTradeBook(session, {
        ...(data.fromDate ? { fromDate: data.fromDate } : {}),
        ...(data.toDate ? { toDate: data.toDate } : {}),
      });
      // eslint-disable-next-line no-console
      console.error("[tradebook] keys", rows.length > 0 ? Object.keys(rows[0] ?? {}) : []);
      return rows.map((r) => {
        const sideRaw = String(r["B/S"] ?? r["BuySellType"] ?? "").toUpperCase();
        // Date/time keys vary by report: prefer explicit fields, else split a
        // combined datetime ("2026-09-12T14:30:00" or "... 14:30:00").
        const rawDate =
          r["Date"] ?? r["TradeDate"] ?? r["BusinessDate"] ?? r["TransactionDate"] ?? r["DateTime"] ?? "";
        const rawTime =
          r["Time"] ?? r["TradeTime"] ?? r["TransactionTime"] ?? r["LastTradeTime"] ?? "";
        let date = String(rawDate ?? "");
        let time = String(rawTime ?? "");
        const combined = date || time;
        const m = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(String(combined));
        if (m) {
          if (!date || /T/.test(String(rawDate ?? ""))) date = m[1]!;
          if (!time) time = m[2]!;
        }
        return {
          id: String(r["ExchangeTradeID"] ?? "").trim(),
          orderNo: String(r["ExchangeOrderNo"] ?? r["OrderNo"] ?? "").trim(),
          symbol: String(r["Scrip"] ?? ""),
          side: sideRaw.startsWith("S") ? "SELL" : sideRaw.startsWith("B") ? "BUY" : "UNKNOWN",
          quantity: numOrNull(r["Quantity"]) ?? 0,
          price: numOrNull(r["Price"]),
          amount: numOrNull(r["Amount"]),
          date,
          time,
          account: String(r["Account"] ?? r["TradingAccount"] ?? ""),
        };
      });
    });
  });

const cancelInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  orderId: z.string().min(1).max(64),
  tranId: z.string().min(1).max(64),
  orderStatus: z.string().min(1).max(32),
  buySellType: z.enum(["Buy", "Sell"]),
  deliveryFlag: z.string().max(8).optional(),
  orderTerms: z.string().max(8).optional(),
  price: z.string().max(24),
  quantity: z.number().int().min(1).max(100000),
  symbol: z.string().trim().min(3).max(24),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Cancelling needs explicit confirmation." }),
  }),
});

/** Cancels a REAL order at the broker. Refuses without confirmed: true. */
export const cancelBrokerOrder = createServerFn({ method: "POST" })
  .validator((input: unknown): CancelOrderRequest => cancelInput.parse(input) as CancelOrderRequest)
  .handler(async ({ data }): Promise<CancelOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      return cancelNaasaOrder(session, {
        orderStatus: data.orderStatus,
        buySellType: data.buySellType,
        deliveryFlag: data.deliveryFlag,
        orderTerms: data.orderTerms,
        price: data.price,
        quantity: data.quantity,
        symbol: data.symbol,
        orderId: data.orderId,
        tranId: data.tranId,
      });
    });
  });

export const getBrokerFunds = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerFunds> => {
    const { collateral, utilization } = await withTradeflow(data.brokerId, (bearer) =>
      getTradeflowFunds(bearer),
    );
    return toBrokerFunds(collateral, utilization);
  });

/**
 * Tradeflow bearer for fund-side calls. Wallet-host token first (tradeflow
 * 401s the X-session Keycloak bearer — audience mismatch — but honours its
 * own app family's tokens), then the X-token exchange/fallback chain.
 */
async function withTradeflow<T>(
  brokerId: BrokerId,
  op: (bearer: string) => Promise<T>,
): Promise<T> {
  const creds = await loadCredentials(brokerId);
  if (creds) {
    const key = `wallet:${creds.username.toLowerCase()}`;
    try {
      const wToken = await getWalletAccessToken(key, creds.username, creds.password);
      console.error("[brokers] tradeflow: using wallet-host token");
      return await op(wToken);
    } catch (err) {
      console.error(
        `[brokers] tradeflow: wallet-token path failed (${err instanceof Error ? err.message : err}), trying X token`,
      );
      dropWalletSession(key);
    }
  }
  return withBrokerSession(brokerId, async (session) => {
    const tokens = await getNaasaTokens(session);
    if (!tokens.accessToken) {
      console.error("[brokers] tradeflow: no Keycloak access token in broker session");
      throw new Error("Broker identity token unavailable. Retest the connection.");
    }
    let bearer = tokens.accessToken;
    if (tokens.refreshToken) {
      const exchanged = await exchangeTradeflowToken(tokens.refreshToken);
      if (exchanged) {
        console.error(`[brokers] tradeflow: token exchanged (clientId=${exchanged.clientId})`);
        bearer = exchanged.accessToken;
      } else {
        console.error(
          "[brokers] tradeflow: refresh exchange failed, falling back to Keycloak bearer",
        );
      }
    } else {
      console.error(
        "[brokers] tradeflow: no Keycloak refresh token, using Keycloak bearer directly",
      );
    }
    return op(bearer);
  });
}

const fundTxnInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  search: z.string().trim().max(64).optional(),
  transactionType: z.string().trim().max(32).optional(),
  gateway: z.string().trim().max(32).optional(),
  status: z.string().trim().max(32).optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.number().int().min(1).max(1000).optional(),
});

export const getBrokerFundTransactions = createServerFn({ method: "GET" })
  .validator(
    (input: unknown): FundTransactionQuery => fundTxnInput.parse(input) as FundTransactionQuery,
  )
  .handler(async ({ data }): Promise<FundTransactionPage> => {
    const page = await withTradeflow(data.brokerId, (bearer) =>
      getTradeflowTxns(bearer, {
        ...(data.search ? { search: data.search } : {}),
        ...(data.transactionType ? { transactionType: data.transactionType } : {}),
        ...(data.gateway ? { gateway: data.gateway } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.fromDate ? { dateFrom: data.fromDate } : {}),
        ...(data.toDate ? { dateTo: data.toDate } : {}),
        pageNumber: data.page ?? 1,
      }),
    );
    if (page.rows.length > 0) {
      const first = page.rows[0]!;
      console.error(
        `[brokers] fund-txns row keys: ${Object.entries(first)
          .map(([k, v]) => `${k}:${typeof v}`)
          .join(",")}`,
      );
    }
    return {
      totalCount: page.totalCount,
      totalPages: page.totalPages,
      pageSize: page.pageSize,
      currentPage: page.currentPage,
      rows: page.rows.map(toFundTransaction),
    };
  });

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

/** Row normalisation (exact wallet keys first, then fallbacks). */
function toFundTransaction(row: Record<string, unknown>): FundTransaction {
  const amountRaw =
    row["amount"] ?? row["Amount"] ?? row["TransactionAmount"] ?? row["NetAmount"] ?? null;
  const amount =
    typeof amountRaw === "number" ? amountRaw : Number(String(amountRaw ?? "").replace(/,/g, ""));
  const dt = row["dateTime"] ?? row["Date"] ?? row["TransactionDate"] ?? row["CreatedDate"] ?? null;
  return {
    id: pick(row, ["id", "Id", "TransactionId", "Reference", "ReferenceNo"]),
    date: typeof dt === "string" && dt.length > 0 ? formatTxnDate(dt) : pick(row, ["ValueDate"]),
    type: pick(row, ["transactionType", "TransactionType", "Type", "TxnType"]),
    gateway: pick(row, ["source", "Source", "Gateway", "PaymentMode", "Instrument", "Channel"]),
    status: pick(row, ["status", "Status", "TransactionStatus", "State"]),
    amount: Number.isFinite(amount) ? amount : null,
    reference: pick(row, [
      "remark",
      "id",
      "Id",
      "Reference",
      "ReferenceNo",
      "Remarks",
      "Narration",
      "TransactionId",
    ]),
  };
}

function formatTxnDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function toBrokerFunds(
  collateral: Record<string, unknown>,
  utilization: Record<string, unknown>,
): BrokerFunds {
  const shapeOf = (o: unknown) =>
    o && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>)
          .map(([k, v]) => `${k}:${Array.isArray(v) ? `arr[${v.length}]` : typeof v}`)
          .join(",")
      : typeof o;
  console.error(`[brokers] funds: collateral shape {${shapeOf(collateral)}}`);
  console.error(`[brokers] funds: utilization shape {${shapeOf(utilization)}}`);
  const cn = (v: unknown) => numOrNull(v);
  return {
    balance: cn(collateral["balance"]),
    ledgerBalance: cn(collateral["ledgerBalance"]),
    finalCollateral: cn(collateral["finalCollateral"]),
    tmsLimit: cn(collateral["tmsLimit"]),
    collateralUsed: cn(utilization["collateralUsed"]),
    availableForWithdraw: cn(utilization["collateralAvailableForWithdrawl"]),
    pendingOrder: cn(utilization["pendingOrder"]),
    intradayFundTransfers: cn(utilization["intradayFundTransfers"]),
    unbilledSales: cn(utilization["unbilledSales"]),
    overallRemaining: cn(utilization["overallRemainingCollateral"]),
  };
}

export const getBrokerBanks = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerBank[]> => {
    const rows = await withTradeflow(data.brokerId, (bearer) => getTradeflowBanks(bearer));
    return rows.map((r) => ({
      accountNumber: String(r["accountNumber"] ?? ""),
      accountName: String(r["accountName"] ?? ""),
      bankName: String(r["bankName"] ?? ""),
      branchName: String(r["branchName"] ?? ""),
      isPrimary: r["isPrimary"] === true,
    }));
  });

const withdrawInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  amount: z.number().positive().max(100_000_000),
  isQuickRefund: z.boolean().optional(),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Withdrawal needs explicit confirmation." }),
  }),
});

/** Requests a REAL withdrawal to the primary bank. Refuses without confirmed: true. */
export const requestBrokerWithdraw = createServerFn({ method: "POST" })
  .validator((input: unknown): WithdrawRequest => withdrawInput.parse(input) as WithdrawRequest)
  .handler(async ({ data }): Promise<WithdrawResult> => {
    const result = await withTradeflow(data.brokerId, (bearer) =>
      requestTradeflowWithdraw(bearer, data.amount, data.isQuickRefund ?? false),
    );
    return result;
  });
