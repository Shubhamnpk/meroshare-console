// Direct BLAZE backend client (api-trading.naasasecurities.com.np).
// Shapes follow docs/xnasa-api-reference.md §24.2: client-derived + browser-
// verified calls, never executed against a live account here. The X-proxy
// path in naasa.server.ts stays the default engine; this module is the
// direct alternative, reachable via engine: "direct" on the order fns.
import { createCipheriv, randomBytes } from "node:crypto";
import type { NaasaSession } from "./naasa.server";
import { BrokerLoginError, getNaasaTokens } from "./naasa.server";

const BLAZE = "https://api-trading.naasasecurities.com.np";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
/** AES-256-CBC key observed in the charts bundle (32 bytes → AES-256). */
const AES_KEY = "CpqSramdF3sNVbAAPC5y!sjgckBX*5c6";

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/**
 * CryptoJS-compatible envelope: random 16-byte IV prepended to the raw
 * ciphertext, whole thing Base64. Sent as `{ payload: "<b64>" }`.
 */
export function encryptBlazeBody(body: Record<string, unknown>): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(AES_KEY, "utf8"), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return Buffer.concat([iv, enc]).toString("base64");
}

/** Responses are double-JSON: parse twice, tolerating single encoding. */
function decodeBlaze<T>(raw: unknown): T {
  let cur = raw;
  for (let i = 0; i < 2; i++) {
    if (typeof cur === "string") {
      const t = cur.trim();
      if (!t) return {} as T;
      try {
        cur = JSON.parse(t) as unknown;
      } catch {
        return {} as T;
      }
    } else break;
  }
  return (cur ?? {}) as T;
}

export interface BlazeIdentity {
  bearer: string;
  sessionNo: string;
  clientCode: string;
}

/** Bearer (raw Keycloak access token) + trading identity behind an X session. */
async function blazeIdentity(session: NaasaSession): Promise<BlazeIdentity> {
  const tokens = await getNaasaTokens(session);
  if (!tokens.accessToken) {
    throw new BrokerLoginError(
      "Direct trading identity unavailable.",
      "Retest the broker connection, then try again.",
    );
  }
  if (!session.sessionNo || !session.clientCode) {
    throw new BrokerLoginError(
      "Direct trading session missing.",
      "Retest the broker connection, then try again.",
    );
  }
  return {
    bearer: tokens.accessToken,
    sessionNo: session.sessionNo,
    clientCode: session.clientCode,
  };
}

/** BLAZE trading login (`POST /api/Login {}` + Keycloak bearer). */
export async function blazeLogin(kcAccessToken: string): Promise<{ ok: boolean; message: string }> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${BLAZE}/api/Login`, {
      method: "POST",
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${kcAccessToken}`,
      },
      body: "{}",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 400) {
      return { ok: false, message: String(json["message"] ?? "Authorization token not found.") };
    }
    const ok = res.ok && json["success"] !== false;
    return {
      ok,
      message: String(json["message"] ?? (ok ? "Login successful." : "Login rejected.")),
    };
  } finally {
    done();
  }
}

async function blazePost<T>(
  id: BlazeIdentity,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${BLAZE}${path}`, {
      method: "POST",
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${id.bearer}`,
        SessionNo: id.sessionNo,
        LoginID: id.clientCode,
      },
      body: JSON.stringify({ payload: encryptBlazeBody(body) }),
    });
    if (res.status === 401) {
      throw new BrokerLoginError(
        "Direct trading session expired.",
        "Retest the broker connection, then try again.",
      );
    }
    const raw = (await res.json().catch(() => ({}))) as unknown;
    return decodeBlaze<T>(raw);
  } finally {
    done();
  }
}

async function blazeGet<T>(bearer: string, path: string): Promise<T> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${BLAZE}${path}`, {
      signal,
      headers: { "User-Agent": UA, Accept: "application/json", Authorization: `Bearer ${bearer}` },
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    return decodeBlaze<T>(json);
  } finally {
    done();
  }
}

function blazeResult(
  json: Record<string, unknown>,
  fallback: string,
): { ok: boolean; message: string; tranId: string | null } {
  const ec = json["ErrorCode"] ?? json["errorCode"];
  const bad =
    json["error"] !== undefined ||
    json["Success"] === false ||
    json["success"] === false ||
    (ec !== undefined && ec !== 0 && ec !== "0");
  if (bad) {
    const msg =
      (typeof json["error"] === "string" && json["error"]) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      fallback;
    return { ok: false, message: msg, tranId: null };
  }
  const tran = json["TranId"] ?? json["tranId"] ?? null;
  return {
    ok: true,
    message:
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      fallback,
    tranId: typeof tran === "string" || typeof tran === "number" ? String(tran) : null,
  };
}

export interface BlazeOrderInput {
  side: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number;
  orderType: "LMT" | "MKT";
  validity: "DAY" | "GTD" | "GTC" | "IOC" | "FOK";
}

function blazeBaseBody(
  id: BlazeIdentity,
  input: BlazeOrderInput,
): { sym: string; body: Record<string, unknown> } {
  const sym = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(sym)) throw new Error("Invalid scrip symbol.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new Error("Quantity must be 1–100000.");
  }
  const isMkt = input.orderType === "MKT";
  if (!isMkt && (!Number.isFinite(input.price) || input.price <= 0 || input.price > 100000)) {
    throw new Error("Price must be positive for limit orders.");
  }
  return {
    sym,
    body: {
      SessionNo: id.sessionNo,
      ClientCode: id.clientCode,
      OrderPlacedBy: null,
      Source: 0,
      TradingAccount: "CNC",
      Exchange: "NEPSE",
      Scrip: sym,
      Quantity: input.quantity,
      Price: isMkt ? 0 : input.price,
      Market: "0",
      OrderTerms: input.validity,
      BuySellIndicator: input.side === "BUY" ? "B" : "S",
      BuySellType: input.side === "BUY" ? "Buy" : "Sell",
      TriggerPrice: "",
      DeliveryTerms: "D",
      MarketSegment: "RL",
      DeliveryFlag: input.side === "BUY" ? "DEL" : "AUTO",
      OrderCategory: "NORMAL",
      // Doc-literal is NORMAL; MKT mirrors the X-proxy translation (LMT→NORMAL).
      OrderType: isMkt ? "MKT" : "NORMAL",
      AccRefCode: "SELF",
      TermValidity: " ",
      DisclosedQuantity: "",
      ProductType: "CASH",
      AMOBulkIndicator: "",
      OrderId: "",
      isSquareOff: 0,
      TranId: "",
      OriginalRemainingQty: 0,
    },
  };
}

/** Place a REAL order via the direct path. Callers must confirm first. */
export async function placeBlazeOrder(
  session: NaasaSession,
  input: BlazeOrderInput,
): Promise<{ ok: boolean; message: string; tranId: string | null }> {
  const id = await blazeIdentity(session);
  const { sym, body } = blazeBaseBody(id, input);
  const json = await blazePost<Record<string, unknown>>(id, "/api/Order/PlacedOrder", body);
  const r = blazeResult(json, "Order rejected by broker.");
  return {
    ...r,
    message:
      r.ok && r.message === "Order rejected by broker." ? `Order placed for ${sym}.` : r.message,
  };
}

export interface BlazeModifyInput extends BlazeOrderInput {
  orderId: string;
  tranId: string;
  remainingQty: number;
}

/** Modify a REAL order via the direct path. Callers must confirm first. */
export async function modifyBlazeOrder(
  session: NaasaSession,
  input: BlazeModifyInput,
): Promise<{ ok: boolean; message: string; tranId: string | null }> {
  if (!input.tranId || !input.orderId)
    throw new Error("Order identity missing — refresh the book.");
  if (!Number.isFinite(input.remainingQty) || input.remainingQty < 1) {
    throw new Error("Nothing left to modify on this order.");
  }
  if (input.quantity > Math.floor(input.remainingQty)) {
    throw new Error("Quantity cannot exceed the remaining quantity.");
  }
  const id = await blazeIdentity(session);
  const { body } = blazeBaseBody(id, input);
  const json = await blazePost<Record<string, unknown>>(id, "/api/Order/ModifyOrder", {
    ...body,
    OrderId: String(input.orderId),
    TranId: String(input.tranId),
    AMOBulkIndicator: "ACCEPTED",
    OriginalRemainingQty: Math.floor(input.remainingQty),
  });
  return blazeResult(json, "Modify rejected by broker.");
}

export interface BlazeCancelInput {
  orderId: string;
  tranId: string;
  side: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number;
  validity?: string | undefined;
}

/** Cancel a REAL order via the direct path. Callers must confirm first. */
export async function cancelBlazeOrder(
  session: NaasaSession,
  input: BlazeCancelInput,
): Promise<{ ok: boolean; message: string }> {
  const id = await blazeIdentity(session);
  const sym = input.symbol.trim().toUpperCase();
  const json = await blazePost<Record<string, unknown>>(id, "/api/Order/CancelOrder", {
    SessionNo: id.sessionNo,
    ClientCode: id.clientCode,
    OrderPlacedBy: null,
    Source: 0,
    TradingAccount: "CNC",
    OrderId: String(input.orderId),
    Exchange: "NEPSE",
    Scrip: sym,
    Quantity: input.quantity,
    Price: input.price,
    Market: "0",
    OrderTerms: input.validity ?? "DAY",
    BuySellIndicator: input.side === "BUY" ? "B" : "S",
    BuySellType: input.side === "BUY" ? "Buy" : "Sell",
    TriggerPrice: "",
    DeliveryTerms: "D",
    MarketSegment: "RL",
    DeliveryFlag: "",
    OrderCategory: "NORMAL",
    OrderType: "NORMAL",
    AccRefCode: "SELF",
  });
  const r = blazeResult(json, "Cancel rejected by broker.");
  return { ok: r.ok, message: r.message };
}

/** Direct order list (`POST /api/Order/GetOrderList`). Read-only. */
export async function getBlazeOrderList(session: NaasaSession): Promise<Record<string, unknown>[]> {
  const id = await blazeIdentity(session);
  const json = await blazePost<Record<string, unknown>>(id, "/api/Order/GetOrderList", {
    SessionNo: id.sessionNo,
    LoginID: id.clientCode,
  });
  // Order list arrives via DecodeReportJsonObject: { errorCode, data: "<json>" }.
  const data = json["data"] ?? json["Data"];
  const rows = decodeBlaze<unknown>(typeof data === "string" ? data : (data ?? []));
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Direct exposure block (`POST /api/Order/ProfileDetails` → Data[3]). Read-only. */
export async function getBlazeProfile(session: NaasaSession): Promise<Record<string, unknown>> {
  const id = await blazeIdentity(session);
  const json = await blazePost<Record<string, unknown>>(id, "/api/Order/ProfileDetails", {
    SessionNo: id.sessionNo,
    LoginID: id.clientCode,
  });
  const data = json["Data"] ?? json["data"];
  const blocks = decodeBlaze<unknown>(typeof data === "string" ? data : (data ?? []));
  const arr = Array.isArray(blocks) ? blocks : [];
  const exposure = arr[3];
  return exposure && typeof exposure === "object" ? (exposure as Record<string, unknown>) : {};
}

export interface BlazeTriggerInput {
  symbol: string;
  orderQty: number;
  orderPrice: number;
  triggerPrice?: number | undefined;
  buySellInd: "BUY" | "SELL";
  alertName?: string | undefined;
}

/** Place a REAL trigger/stop order. Callers must confirm first. */
export async function placeBlazeTrigger(
  session: NaasaSession,
  input: BlazeTriggerInput,
): Promise<{ ok: boolean; message: string; tranId: string | null }> {
  const id = await blazeIdentity(session);
  const sym = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(sym)) throw new Error("Invalid scrip symbol.");
  const json = await blazePost<Record<string, unknown>>(id, "/api/TriggerOrder/Order", {
    ClientCode: id.clientCode,
    SessionNo: id.sessionNo,
    AlertName: input.alertName ?? `${sym}-${Date.now().toString(36)}`,
    Ticker: sym,
    AlertExpression: "",
    ColumnList: "",
    EmailNotification: "",
    SMSNotification: "",
    PushNotification: "",
    ApplicationNotification: "1",
    Status: "1",
    Remarks: "TriggerOrder",
    OrderAlert: "1",
    OrderQty: input.orderQty,
    OrderPrice: input.orderPrice,
    ...(input.triggerPrice !== undefined ? { TriggerPrice: input.triggerPrice } : {}),
    BuySellInd: input.buySellInd === "SELL" ? "S" : "B",
  });
  return blazeResult(json, "Trigger order rejected by broker.");
}

/** Pending trigger/stop orders. Read-only. */
export async function getBlazeTriggers(session: NaasaSession): Promise<Record<string, unknown>[]> {
  const id = await blazeIdentity(session);
  const json = await blazePost<Record<string, unknown>>(id, "/api/TriggerOrder/GetOrders", {
    SessionNo: id.sessionNo,
    LoginID: id.clientCode,
  });
  const data = json["data"] ?? json["Data"];
  const rows = decodeBlaze<unknown>(typeof data === "string" ? data : (data ?? []));
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Direct quote snapshot. Read-only; needs the charts-backend bearer. */
export async function getBlazeQuote(
  bearer: string,
  symbol: string,
): Promise<Record<string, unknown> | null> {
  const sym = symbol.trim().toUpperCase();
  const q = new URLSearchParams({ ticker: sym, columns: "LTP,Instrument" });
  const json = await blazeGet<Record<string, unknown>>(
    bearer,
    `/api/MarketWatch/GetSpecifiedQuote?${q}`,
  );
  if (String(json["statusCode"] ?? "") !== "200") return null;
  const table = json["reportTable"];
  const rows = Array.isArray(table) ? (table as Record<string, unknown>[]) : [];
  return rows[0] ?? null;
}

/** Direct market overview triplet. Read-only. */
export async function getBlazeMarketOverview(
  bearer: string,
): Promise<{ status: unknown; advances: unknown; summary: unknown }> {
  const [status, advances, summary] = await Promise.all([
    blazeGet<unknown>(bearer, "/api/MarketWatch/GetMarketStatus"),
    blazeGet<unknown>(bearer, "/api/MarketWatch/GetAdvancesDeclines"),
    blazeGet<unknown>(bearer, "/api/Home/MarketSummary/"),
  ]);
  return { status, advances, summary };
}
