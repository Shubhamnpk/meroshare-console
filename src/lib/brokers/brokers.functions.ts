// Broker-link server functions. Passwords are accepted only to (a) run one
// live test login or (b) be encrypted into the vault in the same call —
// they are never persisted in plaintext and never returned to the client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  brokerMeta,
  type BrokerBank,
  type BrokerCompanyInfo,
  type BrokerConnectionMeta,
  type BrokerDepth,
  type BrokerDepthRow,
  type BrokerFunds,
  type BrokerHolding,
  type BrokerId,
  type BrokerMarketStatus,
  type BrokerOrder,
  type BrokerOrderEvent,
  type BrokerQuote,
  type BrokerTestResult,
  type BrokerTicket,
  type BrokerTrade,
  type BrokerStatementRow,
  type BrokerTrigger,
  type CancelOrderRequest,
  type CancelOrderResult,
  type FundTransaction,
  type FundTransactionPage,
  type FundTransactionQuery,
  type ModifyOrderRequest,
  type PlaceOrderRequest,
  type PlaceOrderResult,
  type PlaceTriggerRequest,
  type WithdrawRequest,
  type WithdrawResult,
} from "./types";
import { listConnections, loadCredentials, removeConnection, saveConnection } from "./vault.server";
import {
  BrokerSessionError,
  cancelNaasaOrder,
  deleteNaasaWatchlist,
  dropNaasaSession,
  dropWalletSession,
  exchangeTradeflowToken,
  getNaasaAmoList,
  getNaasaCompanyInfo,
  getNaasaDepth,
  getNaasaHoldings,
  getNaasaMarketStatus,
  getNaasaMarketWatch,
  getNaasaOrderBook,
  getNaasaOrderHistory,
  getNaasaQuote,
  getNaasaSession,
  getNaasaTickets,
  getNaasaTokens,
  getNaasaTradeBook,
  getNaasaWatchlists,
  getTradeflowBanks,
  getTradeflowFunds,
  getTradeflowStatement,
  getTradeflowTxns,
  getWalletAccessToken,
  modifyNaasaOrder,
  requestTradeflowWithdraw,
  saveNaasaWatchlist,
  cancelNaasaAmo,
  placeNaasaAmo,
  placeNaasaOrder,
  testNaasaLogin,
  type NaasaAmoOrder,
  type NaasaSession,
} from "./naasa.server";
import {
  blazeLogin,
  cancelBlazeOrder,
  getBlazeTriggers,
  modifyBlazeOrder,
  placeBlazeOrder,
  placeBlazeTrigger,
} from "./blaze.server";
import {
  consumeTmsProof,
  getTmsCaptcha as getTmsCaptchaWorker,
  getTmsHoldings as getTmsHoldingsWorker,
  getTmsIndices as getTmsIndicesWorker,
  getTmsMarketWatch as getTmsMarketWatchWorker,
  getTmsOrderBook as getTmsOrderBookWorker,
  getTmsTradeBook as getTmsTradeBookWorker,
  getTmsSession as getTmsSessionWorker,
  normalizeTmsHost as normalizeTmsHostWorker,
  reauthTmsLogin,
  testTmsLogin,
  tmsCacheKey,
  verifyTmsOtp as verifyTmsOtpWorker,
  type TmsCaptcha,
  type TmsReauthResult,
  type TmsTestResult,
} from "./tms.server";

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
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x", "tms"]) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await removeConnection(data.brokerId);
    return { ok: true };
  });

/** Re-run the live test using SAVED credentials (no password round-trip). */
export const retestBrokerConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x", "tms"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerTestResult> => {
    if (data.brokerId === "tms") {
      throw new Error("TMS needs a fresh captcha — reconnect it in Settings → Advanced.");
    }
    const creds = await loadCredentials(data.brokerId);
    if (!creds) throw new Error("No saved connection for this broker.");
    return runTest(data.brokerId, creds.username, creds.password);
  });

// ---------------------------------------------------------------------------
// Classic TMS (captcha login — user-in-the-loop, never silent).
// ---------------------------------------------------------------------------

export const getTmsCaptcha = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ host: z.string().trim().max(128).optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<TmsCaptcha> => getTmsCaptchaWorker(data.host));

const tmsTestInput = z.object({
  host: z.string().trim().max(128).optional(),
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(128),
  captchaId: z.string().min(1).max(128),
  captchaText: z.string().trim().min(1).max(16),
});

/** Live TMS test login. Does NOT save anything. May ask for OTP. */
export const testTmsConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => tmsTestInput.parse(input))
  .handler(async ({ data }): Promise<TmsTestResult> => testTmsLogin(data));

const tmsOtpInput = z.object({
  pendingId: z.string().min(1).max(128),
  otp: z.string().trim().min(1).max(16),
});

/** Complete the TMS OTP step. Does NOT save anything. */
export const verifyTmsOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => tmsOtpInput.parse(input))
  .handler(async ({ data }): Promise<TmsTestResult> => verifyTmsOtpWorker(data));

// ---------------------------------------------------------------------------
// TMS reads — same shapes the Broker page already renders. Each call
// rehydrates the cached cookie jar + token (or surfaces reconnect).
// ---------------------------------------------------------------------------

function tmsBaseOf(host: string | null | undefined): string {
  return `${normalizeTmsHostWorker(host)}/tmsapi`;
}

async function withTmsSession<T>(
  brokerId: "tms",
  op: (args: { base: string; token: string; cookies: string; xsrf: string }) => Promise<T>,
): Promise<T> {
  const creds = await loadCredentials(brokerId);
  if (!creds) throw new Error("No saved TMS connection. Connect it in Settings → Advanced.");
  const host = normalizeTmsHostWorker(creds.host ?? undefined);
  const base = `${host}/tmsapi`;
  const key = tmsCacheKey(host, creds.username);
  const session = await getTmsSessionWorker(key);
  try {
    return await op({ base, token: session.token, cookies: session.cookies, xsrf: session.xsrf });
  } catch (err) {
    if (err instanceof BrokerSessionError) throw err;
    throw err;
  }
}

function toTmsHoldings(rows: Record<string, unknown>[]): import("./types").BrokerHolding[] {
  return rows.map((r) => ({
    symbol: String(r["symbol"] ?? r["scrip"] ?? r["NEPSECode"] ?? ""),
    availableQty:
      typeof r["qty"] === "number"
        ? r["qty"]
        : typeof r["quantity"] === "number"
          ? r["quantity"]
          : Number(String(r["quantity"] ?? r["qty"] ?? 0).replace(/,/g, "")) || 0,
    closePrice:
      r["closePrice"] != null ? Number(String(r["closePrice"]).replace(/,/g, "")) || null : null,
    marketValue:
      r["marketValue"] != null ? Number(String(r["marketValue"]).replace(/,/g, "")) || null : null,
  }));
}

export const getTmsHoldings = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["tms"]) }).parse(input))
  .handler(async ({ data }): Promise<import("./types").BrokerHolding[]> => {
    return withTmsSession(data.brokerId, async ({ base, token, cookies, xsrf }) => {
      const { createTmsClientFromSession } = await import("./tms.server");
      const client = createTmsClientFromSession(cookies, xsrf);
      const { rows } = await getTmsHoldingsWorker(client, token, base);
      return toTmsHoldings(rows);
    });
  });

export const getTmsOrderBook = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["tms"]) }).parse(input))
  .handler(async ({ data }): Promise<import("./types").BrokerOrder[]> => {
    return withTmsSession(data.brokerId, async ({ base, token, cookies, xsrf }) => {
      const { createTmsClientFromSession } = await import("./tms.server");
      const client = createTmsClientFromSession(cookies, xsrf);
      const { rows } = await getTmsOrderBookWorker(client, token, base);
      return rows.map((r) => ({
        id: String(r["orderId"] ?? r["id"] ?? ""),
        symbol: String(r["symbol"] ?? r["scrip"] ?? ""),
        side: String(r["side"] ?? "")
          .toUpperCase()
          .startsWith("S")
          ? ("SELL" as const)
          : ("BUY" as const),
        quantity: Number(r["quantity"] ?? 0) || 0,
        price: r["price"] != null ? Number(String(r["price"]).replace(/,/g, "")) || null : null,
        status: String(r["status"] ?? ""),
        orderType: String(r["orderType"] ?? ""),
        validity: String(r["validity"] ?? "DAY"),
        orderId: String(r["orderId"] ?? ""),
        tranId: String(r["tranId"] ?? ""),
        remainingQty: Number(r["remainingQty"] ?? r["quantity"] ?? 0) || 0,
        orderStatus: String(r["orderStatus"] ?? r["status"] ?? ""),
        deliveryFlag: String(r["deliveryFlag"] ?? "DEL"),
        date: String(r["date"] ?? ""),
        time: String(r["time"] ?? ""),
      }));
    });
  });

export const getTmsTradeBook = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["tms"]) }).parse(input))
  .handler(async ({ data }): Promise<import("./types").BrokerTrade[]> => {
    return withTmsSession(data.brokerId, async ({ base, token, cookies, xsrf }) => {
      const { createTmsClientFromSession } = await import("./tms.server");
      const client = createTmsClientFromSession(cookies, xsrf);
      const { rows } = await getTmsTradeBookWorker(client, token, base);
      return rows.map((r) => ({
        id: String(r["tradeId"] ?? r["id"] ?? ""),
        orderNo: String(r["orderNo"] ?? ""),
        symbol: String(r["symbol"] ?? ""),
        side: String(r["side"] ?? "")
          .toUpperCase()
          .startsWith("S")
          ? ("SELL" as const)
          : ("BUY" as const),
        quantity: Number(r["quantity"] ?? 0) || 0,
        price: r["price"] != null ? Number(String(r["price"]).replace(/,/g, "")) || null : null,
        amount: r["amount"] != null ? Number(String(r["amount"]).replace(/,/g, "")) || null : null,
        date: String(r["date"] ?? ""),
        time: String(r["time"] ?? ""),
        account: String(r["account"] ?? ""),
      }));
    });
  });

const tmsSaveInput = z.object({
  proofId: z.string().min(1).max(128),
});

/**
 * Save a TMS connection from a proof token minted by a just-completed test
 * or OTP verification. The proof carries the proven credentials, so saving
 * never re-logs-in (captchas are single-use). Single use, 5-min TTL.
 */
export const saveTmsConnection = createServerFn({ method: "POST" })
  .validator((input: unknown) => tmsSaveInput.parse(input))
  .handler(async ({ data }): Promise<BrokerConnectionMeta> => {
    const proof = consumeTmsProof(data.proofId);
    if (!proof) {
      throw new Error("Proof expired. Test the login again, then save promptly.");
    }
    return saveConnection("tms", proof.username, proof.password, proof.displayName, proof.host);
  });

// ---------------------------------------------------------------------------
// TMS silent re-auth — when the 30-min session expires, try to re-login
// in the background with saved creds + fresh captcha. Client handles OCR.
// ---------------------------------------------------------------------------

/** Fetch a fresh captcha for re-auth. Returns the image for client-side OCR. */
export const startTmsReauth = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["tms"]) }).parse(input))
  .handler(async ({ data }): Promise<TmsCaptcha> => {
    const creds = await loadCredentials(data.brokerId);
    if (!creds) throw new Error("No saved TMS connection.");
    return getTmsCaptchaWorker(creds.host ?? undefined);
  });

/** Submit the solved captcha to complete re-auth. Caches session on success. */
export const completeTmsReauth = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        brokerId: z.enum(["tms"]),
        captchaId: z.string().min(1).max(128),
        captchaText: z.string().trim().min(1).max(16),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<TmsReauthResult> => {
    const creds = await loadCredentials(data.brokerId);
    if (!creds) return { ok: false, error: "No saved TMS connection." };
    return reauthTmsLogin({
      host: creds.host ?? "",
      username: creds.username,
      password: creds.password,
      captchaId: data.captchaId,
      captchaText: data.captchaText,
    });
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
  // Case-insensitive key lookup — broker sometimes returns lower/upper variants
  const lcMap = (r: Record<string, unknown>) => {
    const m = new Map<string, unknown>();
    for (const [k, v] of Object.entries(r)) m.set(k.toLowerCase(), v);
    return m;
  };
  return rows
    .map((r) => {
      const m = lcMap(r);
      const get = (keys: string[]) => {
        for (const k of keys) {
          const n = numOrNull(m.get(k.toLowerCase()) ?? r[k]);
          if (n !== null) return n;
        }
        return null;
      };
      const priceKeys =
        side === "bid"
          ? ["bbr", "bidprice", "bid_price", "buyprice", "bid", "price", "rate"]
          : ["bsr", "offerprice", "offer_price", "sellprice", "ask", "price", "rate"];
      const qtyKeys =
        side === "bid"
          ? ["bbq", "bidqty", "bid_qty", "buyqty", "qty", "quantity", "volume"]
          : ["bsq", "offerqty", "offer_qty", "sellqty", "qty", "quantity", "volume"];
      const orderKeys =
        side === "bid"
          ? ["bo", "buyorders", "bidorders", "orders"]
          : ["so", "sellorders", "askorders", "orders"];
      return {
        side,
        price: get(priceKeys),
        quantity: get(qtyKeys),
        orders: get(orderKeys),
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
      // Naasa wraps levels inside a single row: {Ticker, DateTime, depth: [...]} or "depth" string
      // Your log: keys=Ticker,DateTime,depth → need to unwrap
      let rawRows: Record<string, unknown>[] = depth.rows;
      if (rawRows.length === 1 && rawRows[0]!["depth"] !== undefined) {
        const d = rawRows[0]!["depth"];
        if (typeof d === "string") {
          const t = (d as string).trim();
          try {
            const parsed = t ? (JSON.parse(t) as unknown) : [];
            if (Array.isArray(parsed)) rawRows = parsed as Record<string, unknown>[];
            else if (parsed && typeof parsed === "object")
              rawRows = [parsed as Record<string, unknown>];
            else rawRows = [];
          } catch {
            // pipe format: BBR^BBQ^BO^BSR^BSQ^SO | ...
            if (t.includes("^") || t.includes("|")) {
              rawRows = t
                .split("|")
                .map((seg) => seg.trim())
                .filter(Boolean)
                .map((seg) => {
                  const p = seg.split("^");
                  return {
                    BBR: p[0],
                    BBQ: p[1],
                    BO: p[2],
                    BSR: p[3],
                    BSQ: p[4],
                    SO: p[5],
                  } as Record<string, unknown>;
                });
            } else rawRows = [];
          }
        } else if (Array.isArray(d)) {
          rawRows = d as Record<string, unknown>[];
        } else if (d && typeof d === "object") {
          rawRows = [d as Record<string, unknown>];
        }
      }
      const hasSideCol = rawRows.some((r) => "side" in r || "Side" in r || "SIDE" in r);
      let bids: BrokerDepthRow[];
      let asks: BrokerDepthRow[];
      if (hasSideCol) {
        bids = toDepthRows(
          rawRows.filter((r) => /b/i.test(String(r["side"] ?? r["Side"] ?? r["SIDE"] ?? "B"))),
          "bid",
        );
        asks = toDepthRows(
          rawRows.filter((r) => /a|s/i.test(String(r["side"] ?? r["Side"] ?? r["SIDE"] ?? "S"))),
          "ask",
        );
      } else {
        bids = toDepthRows(rawRows, "bid");
        asks = toDepthRows(rawRows, "ask");
      }
      if (rawRows.length > 0 && bids.length === 0 && asks.length === 0) {
        bids = toDepthRows(rawRows, "bid");
        asks = toDepthRows(rawRows, "ask");
      }
      return {
        errorCode: depth.errorCode,
        message: depth.message,
        bids,
        asks,
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
        const rawDate =
          r["Date"] ??
          r["OrderDate"] ??
          r["BusinessDate"] ??
          r["EntryDate"] ??
          r["CreatedDate"] ??
          r["DateTime"] ??
          "";
        const rawTime = r["Time"] ?? r["OrderTime"] ?? r["EntryTime"] ?? r["LastTradeTime"] ?? "";
        let date = String(rawDate ?? "");
        let time = String(rawTime ?? "");
        const combined = date || time;
        const m = /(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(String(combined));
        if (m) {
          if (!date || /T/.test(String(rawDate ?? ""))) date = m[1]!;
          if (!time) time = m[2]!;
        }
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
          date,
          time,
        };
      });
    });
  });

const engineInput = { engine: z.enum(["proxy", "direct"]).optional() };

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
  ...engineInput,
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Order needs explicit confirmation." }),
  }),
});

/** Places a REAL order at the broker. Refuses without confirmed: true. */
export const placeBrokerOrder = createServerFn({ method: "POST" })
  .validator((input: unknown): PlaceOrderRequest => placeInput.parse(input) as PlaceOrderRequest)
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      if (data.engine === "direct") {
        return placeBlazeOrder(session, {
          side: data.side,
          symbol: data.symbol,
          quantity: data.quantity,
          price: data.price,
          orderType: data.orderType,
          validity: data.validity,
        });
      }
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

const modifyInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  tranId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  orderStatus: z.string().min(1).max(32),
  remainingQty: z.number().positive().max(100000),
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
  ...engineInput,
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Modifying needs explicit confirmation." }),
  }),
});

/** Modifies a REAL order at the broker. Refuses without confirmed: true. */
export const modifyBrokerOrder = createServerFn({ method: "POST" })
  .validator((input: unknown): ModifyOrderRequest => modifyInput.parse(input) as ModifyOrderRequest)
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      if (data.engine === "direct") {
        return modifyBlazeOrder(session, {
          side: data.side,
          symbol: data.symbol,
          quantity: data.quantity,
          price: data.price,
          orderType: data.orderType,
          validity: data.validity,
          tranId: data.tranId,
          orderId: data.orderId,
          remainingQty: data.remainingQty,
        });
      }
      return modifyNaasaOrder(session, {
        side: data.side,
        symbol: data.symbol,
        quantity: data.quantity,
        price: data.price,
        orderType: data.orderType,
        validity: data.validity,
        validTill: data.validTill,
        tranId: data.tranId,
        orderId: data.orderId,
        orderStatus: data.orderStatus,
        remainingQty: data.remainingQty,
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

      return rows.map((r) => {
        const sideRaw = String(r["B/S"] ?? r["BuySellType"] ?? "").toUpperCase();
        // Date/time keys vary by report: prefer explicit fields, else split a
        // combined datetime ("2026-09-12T14:30:00" or "... 14:30:00").
        const rawDate =
          r["Date"] ??
          r["TradeDate"] ??
          r["BusinessDate"] ??
          r["TransactionDate"] ??
          r["DateTime"] ??
          "";
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
  ...engineInput,
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Cancelling needs explicit confirmation." }),
  }),
});

/** Cancels a REAL order at the broker. Refuses without confirmed: true. */
export const cancelBrokerOrder = createServerFn({ method: "POST" })
  .validator((input: unknown): CancelOrderRequest => cancelInput.parse(input) as CancelOrderRequest)
  .handler(async ({ data }): Promise<CancelOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      if (data.engine === "direct") {
        return cancelBlazeOrder(session, {
          orderId: data.orderId,
          tranId: data.tranId,
          side: data.buySellType === "Sell" ? "SELL" : "BUY",
          symbol: data.symbol,
          quantity: data.quantity,
          price: Number(data.price) || 0,
          ...(data.orderTerms ? { validity: data.orderTerms } : {}),
        });
      }
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
      return await op(wToken);
    } catch {
      dropWalletSession(key);
    }
  }
  return withBrokerSession(brokerId, async (session) => {
    const tokens = await getNaasaTokens(session);
    if (!tokens.accessToken) {
      throw new Error("Broker identity token unavailable. Retest the connection.");
    }
    let bearer = tokens.accessToken;
    if (tokens.refreshToken) {
      const exchanged = await exchangeTradeflowToken(tokens.refreshToken);
      if (exchanged) bearer = exchanged.accessToken;
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

export const getBrokerStatement = createServerFn({ method: "GET" })
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
  .handler(async ({ data }): Promise<BrokerStatementRow[]> => {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return withTradeflow(data.brokerId, (bearer) =>
      getTradeflowStatement(
        bearer,
        data.fromDate ?? from.toISOString().slice(0, 10),
        data.toDate ?? today,
      ),
    );
  });

export const getBrokerWatchlists = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }) => {
    return withBrokerSession(data.brokerId, async (s) => getNaasaWatchlists(s));
  });

export const getBrokerWatchlistSymbols = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ brokerId: z.enum(["naasa-x"]), template: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    return withBrokerSession(data.brokerId, async (s) => getNaasaMarketWatch(s, data.template));
  });

export const saveBrokerWatchlist = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        brokerId: z.enum(["naasa-x"]),
        template: z.string().min(1).max(64),
        symbols: z.array(z.string().trim().min(2).max(24)).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return withBrokerSession(data.brokerId, async (s) =>
      saveNaasaWatchlist(s, data.template, data.symbols),
    );
  });

export const deleteBrokerWatchlist = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ brokerId: z.enum(["naasa-x"]), template: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    return withBrokerSession(data.brokerId, async (s) => deleteNaasaWatchlist(s, data.template));
  });

export const getBrokerOrderHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({ brokerId: z.enum(["naasa-x"]), orderId: z.string().trim().min(1).max(64) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BrokerOrderEvent[]> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const rows = await getNaasaOrderHistory(session, data.orderId);
      return rows.map((r) => {
        const rawDate =
          r["Date"] ?? r["OrderDate"] ?? r["BusinessDate"] ?? r["EntryDate"] ?? r["DateTime"] ?? "";
        const rawTime = r["Time"] ?? r["OrderTime"] ?? r["EntryTime"] ?? "";
        return {
          status: String(r["OrderStatus"] ?? r["Status"] ?? ""),
          quantity: numOrNull(r["Quantity"]),
          price: numOrNull(r["Price"]),
          tradedQty: numOrNull(r["TradedQuantity"] ?? r["TradedQty"]),
          remainingQty: numOrNull(r["RemainingQty"] ?? r["RemainingQuantity"]),
          date: String(rawDate ?? ""),
          time: String(rawTime ?? ""),
          message: String(r["Message"] ?? r["Remarks"] ?? r["Remark"] ?? ""),
        };
      });
    });
  });

export const getBrokerCompanyInfo = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({ brokerId: z.enum(["naasa-x"]), symbol: z.string().trim().min(3).max(24) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BrokerCompanyInfo | null> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const r = await getNaasaCompanyInfo(session, data.symbol);
      if (!r) return null;
      const pick = (...keys: string[]): unknown => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
        }
        return null;
      };
      const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
      return {
        symbol: data.symbol.trim().toUpperCase(),
        companyName: str(pick("CompanyName", "companyName", "Security Name", "InstrumentName")),
        isin: str(pick("ISIN", "isin")),
        tickSize: numOrNull(pick("TickSize", "tickSize")),
        marketLot: numOrNull(pick("MarketLot", "marketLot", "LotSize")),
        maxOrderSize: numOrNull(pick("Max. Order Size", "MaxOrderSize", "maxOrderSize")),
        dprLow: numOrNull(pick("DPR Low", "dprLow", "DprLow")),
        dprHigh: numOrNull(pick("DPR High", "dprHigh", "DprHigh")),
        preOpenDprLow: numOrNull(pick("PreOpen DPR Low", "preOpenDprLow")),
        preOpenDprHigh: numOrNull(pick("PreOpen DPR High", "preOpenDprHigh")),
        weekHigh52: numOrNull(pick("52WeekHigh", "weekHigh52")),
        weekLow52: numOrNull(pick("52WeekLow", "weekLow52")),
        listingDate: str(pick("ListingDate", "listingDate", "TradingStartDate")),
        activeStatus: str(pick("ActiveStatus", "activeStatus")),
      };
    });
  });

export const getBrokerMarketStatus = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerMarketStatus> => {
    return withBrokerSession(data.brokerId, async (session) => getNaasaMarketStatus(session));
  });

export const getBrokerTickets = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerTicket[]> => {
    return withBrokerSession(data.brokerId, async (session) => getNaasaTickets(session));
  });

export const getBrokerTriggers = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<BrokerTrigger[]> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const rows = await getBlazeTriggers(session);
      return rows.map((r) => {
        const sideRaw = String(r["BuySellInd"] ?? "").toUpperCase();
        return {
          id: String(r["TriggerId"] ?? ""),
          symbol: String(r["Symbol"] ?? ""),
          side: sideRaw.startsWith("S") ? "SELL" : sideRaw.startsWith("B") ? "BUY" : "UNKNOWN",
          orderQty: numOrNull(r["OrderQty"]) ?? 0,
          orderPrice: numOrNull(r["OrderPrice"]),
          triggerPrice: numOrNull(r["TriggerPrice"]),
          status: String(r["OrderStatus"] ?? r["Status"] ?? ""),
          validTill: strOrNull(r["ValidTill"]),
        };
      });
    });
  });

const triggerInput = z.object({
  brokerId: z.enum(["naasa-x"]),
  symbol: z.string().trim().min(3).max(24),
  side: z.enum(["BUY", "SELL"]),
  orderQty: z.number().int().min(1).max(100000),
  orderPrice: z.number().positive().max(100000),
  triggerPrice: z.number().min(0).max(100000).optional(),
  alertName: z.string().trim().max(64).optional(),
  confirmed: z.literal(true, {
    errorMap: () => ({ message: "Trigger order needs explicit confirmation." }),
  }),
});

/** Places a REAL trigger/stop order via the direct path. Refuses without confirmed: true. */
export const placeBrokerTrigger = createServerFn({ method: "POST" })
  .validator(
    (input: unknown): PlaceTriggerRequest => triggerInput.parse(input) as PlaceTriggerRequest,
  )
  .handler(async ({ data }): Promise<PlaceOrderResult> => {
    return withBrokerSession(data.brokerId, async (session) => {
      return placeBlazeTrigger(session, {
        symbol: data.symbol,
        orderQty: data.orderQty,
        orderPrice: data.orderPrice,
        ...(data.triggerPrice !== undefined ? { triggerPrice: data.triggerPrice } : {}),
        buySellInd: data.side,
        ...(data.alertName ? { alertName: data.alertName } : {}),
      });
    });
  });

/** Direct-path health check: BLAZE login with the saved session's token. */
export const getBrokerDirectStatus = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<{ loginOk: boolean; message: string }> => {
    return withBrokerSession(data.brokerId, async (session) => {
      const tokens = await getNaasaTokens(session);
      if (!tokens.accessToken) {
        return { loginOk: false, message: "No identity token in broker session." };
      }
      const r = await blazeLogin(tokens.accessToken);
      return { loginOk: r.ok, message: r.message };
    });
  });

export const getBrokerWsCredentials = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ brokerId: z.enum(["naasa-x"]) }).parse(input))
  .handler(async ({ data }): Promise<{ wsUrl: string; clientCode: string } | null> => {
    const { session } = await withSavedSession(data.brokerId);
    if (!session.clientCode || !session.sessionNo) return null;
    const wsUrl = `wss://serverx.naasasecurities.com.np:8006/WebSocket/Connect?UserId=${encodeURIComponent(session.clientCode)}&Password=${encodeURIComponent(session.sessionNo)}&protocol=WSS&ClientIP=&Source=1`;
    return { wsUrl, clientCode: session.clientCode };
  });
