// Server-only classic-TMS login worker (NEPSE TMS Angular terminal).
// Bundle-verified 2026-09-16 against tms77 (docs/tms-bundles/main.js):
// challenge auth (btoa password), captcha id/image, XSRF cookies,
// `Authorization: Bearer <id_token>` with refresh from the response
// `authorization` header, API at {host}/tmsapi + bare paths.
// Sessions can't silently re-login (captcha), so expiry surfaces as
// "reconnect with a fresh captcha" instead of an invisible retry loop.
import type { BrokerTestResult } from "./types";
import { BrokerSessionError } from "./naasa.server";

const DEFAULT_HOST = process.env["TMS_BASE_URL"] ?? "https://tms77.nepsetms.com.np";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
const SESSION_TTL_MS = 30 * 60_000;
const PENDING_TTL_MS = 5 * 60_000;

export class TmsLoginError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = "TmsLoginError";
    this.hint = hint;
  }
}

/** SSRF guard: TMS lives on *.nepsetms.com.np over https only. */
export function normalizeTmsHost(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return DEFAULT_HOST;
  let url: URL;
  try {
    url = new URL(s.includes("://") ? s : `https://${s}`);
  } catch {
    throw new TmsLoginError("That TMS address looks wrong.", "Use https://tmsNN.nepsetms.com.np.");
  }
  if (url.protocol !== "https:" || !/\.nepsetms\.com\.np$/i.test(url.hostname)) {
    throw new TmsLoginError(
      "Only official TMS hosts are allowed.",
      "Use your broker's https://tmsNN.nepsetms.com.np address.",
    );
  }
  return `https://${url.hostname}`;
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

interface Jar {
  cookies: Map<string, string>;
}

export interface TmsClient {
  req: (url: string, opts?: RequestInit) => Promise<Response>;
  jar: Jar;
  cookieHeader: () => string;
}

function createClient(): TmsClient {
  const jar: Jar = { cookies: new Map() };
  const cookieHeader = () => [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  async function req(url: string, opts: RequestInit = {}): Promise<Response> {
    const { done, signal } = withTimeout(TIMEOUT_MS);
    try {
      const headers = new Headers(opts.headers);
      if (!headers.has("User-Agent")) headers.set("User-Agent", UA);
      const ck = cookieHeader();
      if (ck) headers.set("Cookie", ck);
      const res = await fetch(url, { ...opts, headers, signal, redirect: "manual" });
      const getSetCookie =
        typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
        "function"
          ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
          : [];
      for (const c of getSetCookie) {
        const eq = c.indexOf("=");
        const sc = c.indexOf(";");
        if (eq > 0)
          jar.cookies.set(c.slice(0, eq).trim(), c.slice(eq + 1, sc > 0 ? sc : undefined).trim());
      }
      return res;
    } finally {
      done();
    }
  }
  return { req, jar, cookieHeader };
}

/** Refresh id_token from the response `authorization` header (part after space). */
export function refreshTokenFrom(res: Response, current: string): string {
  const h = res.headers.get("authorization");
  if (h) {
    const parts = h.split(" ");
    const token = (parts.length > 1 ? parts[parts.length - 1] : parts[0]) ?? "";
    if (token.trim()) return token.trim();
  }
  return current;
}

/** Auth headers for an authed call: XSRF + Bearer. */
export function tmsHeaders(client: TmsClient, token: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
  };
  const xsrf = client.jar.cookies.get("XSRF-TOKEN") ?? "";
  if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

interface ChallengeBody {
  userName: string;
  password: string;
  jwt: string;
  otp: string;
  captchaIdentifier: string;
  userCaptcha: string;
}

async function challenge(
  base: string,
  client: TmsClient,
  token: string,
  body: ChallengeBody,
): Promise<{ status: number; json: Record<string, unknown>; token: string }> {
  const res = await client.req(`${base}/authApi/authenticate`, {
    method: "POST",
    headers: { ...tmsHeaders(client, token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json, token: refreshTokenFrom(res, token) };
}

export interface TmsCaptcha {
  captchaId: string;
  imageDataUrl: string;
}

/** Fresh captcha for the login form. Single attempt downstream (no spam). */
export async function getTmsCaptcha(host?: string): Promise<TmsCaptcha> {
  const base = `${normalizeTmsHost(host)}/tmsapi`;
  const { req } = createClient();
  const idRes = await req(`${base}/captcha/id`, { headers: { Accept: "application/json" } });
  if (!idRes.ok) {
    throw new TmsLoginError(
      "TMS site unreachable.",
      "Check the host address and your connection, then try again.",
    );
  }
  const { id } = (await idRes.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    throw new TmsLoginError("TMS login changed.", "The broker may have updated its sign-in.");
  }
  const imgRes = await req(`${base}/captcha/image/${encodeURIComponent(id)}`, {
    headers: { Accept: "image/*" },
  });
  if (!imgRes.ok) {
    throw new TmsLoginError("Captcha failed to load.", "Reload the captcha and try again.");
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mime = imgRes.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return { captchaId: id, imageDataUrl: `data:${mime};base64,${buf.toString("base64")}` };
}

function decodeJwtUsername(jwt: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64").toString("utf8"),
    ) as Record<string, unknown>;
    for (const k of ["userName", "username", "name", "fullName", "clientName", "sub"]) {
      const v = payload[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return null;
  } catch {
    return null;
  }
}

function toReportSteps(prefix: string, rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [`${prefix}: empty`];
  return [`${prefix}: ${rows.length} rows (keys: ${Object.keys(rows[0] ?? {}).join(",")})`];
}

async function proofHoldings(
  base: string,
  client: TmsClient,
  token: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  const res = await client.req(`${base}/dp-holding/dto`, {
    headers: tmsHeaders(client, token),
  });
  const next = refreshTokenFrom(res, token);
  if (res.status === 401) throw new BrokerSessionError();
  const json = (await res.json().catch(() => [])) as unknown;
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return { rows, token: next };
}

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

export interface TmsTestInput {
  host?: string | undefined;
  username: string;
  password: string;
  captchaId: string;
  captchaText: string;
}

export interface TmsTestResult extends BrokerTestResult {
  needsOtp: boolean;
  /** Opaque id for the OTP step — no secrets cross to the client. */
  pendingId: string | null;
  /**
   * Proof of a just-completed test login. The save call consumes it instead
   * of re-logging in (captchas are single-use). Server memory only, 5-min TTL.
   */
  proofId: string | null;
}

interface ProofCtx {
  host: string;
  username: string;
  password: string;
  displayName: string | null;
  createdAt: number;
}

const proofStore = new Map<string, ProofCtx>();

function mintProof(
  host: string,
  username: string,
  password: string,
  displayName: string | null,
): string {
  const proofId = crypto.randomUUID();
  proofStore.set(proofId, { host, username, password, displayName, createdAt: Date.now() });
  return proofId;
}

/** Consume a proof token (single use). Returns null when missing/expired. */
export function consumeTmsProof(proofId: string): ProofCtx | null {
  const ctx = proofStore.get(proofId);
  if (ctx) proofStore.delete(proofId);
  if (!ctx || Date.now() - ctx.createdAt > PENDING_TTL_MS) return null;
  return ctx;
}

interface PendingCtx {
  base: string;
  client: TmsClient;
  username: string;
  password: string;
  jwt: string | null;
  otpToken: string | null;
  captchaId: string;
  captchaText: string;
  createdAt: number;
}

const pendingStore = new Map<string, PendingCtx>();

function fail(brokerId: "tms", error: string, hint: string): TmsTestResult {
  return {
    ok: false,
    brokerId,
    displayName: null,
    clientCodeHint: null,
    holdingSymbols: [],
    steps: [],
    error,
    hint,
    needsOtp: false,
    pendingId: null,
    proofId: null,
  };
}

/**
 * Live test login (does NOT save). Follows the bundle's 3-branch state
 * machine: direct jwt → done; `otpVerification` → token OTP; jwt + OTP modal
 * → jwt OTP. Read-only proof: dp-holding row count + keys only.
 */
export async function testTmsLogin(input: TmsTestInput): Promise<TmsTestResult> {
  const base = `${normalizeTmsHost(input.host)}/tmsapi`;
  const username = input.username.trim();
  if (!username) throw new TmsLoginError("Enter your TMS username.", "Usually your client code.");
  if (!input.password) throw new TmsLoginError("Enter your TMS password.", "Nothing is saved yet.");
  if (!input.captchaText.trim() || !input.captchaId) {
    throw new TmsLoginError("Solve the captcha first.", "Type the characters shown in the image.");
  }
  const client = createClient();
  try {
    const first = await challenge(base, client, "", {
      userName: username,
      password: b64(input.password),
      jwt: "",
      otp: "",
      captchaIdentifier: input.captchaId,
      userCaptcha: input.captchaText.trim(),
    });
    if (first.status === 400 || first.status === 401) {
      const msg = typeof first.json["message"] === "string" ? first.json["message"] : "";
      throw new TmsLoginError(
        "TMS rejected the login.",
        msg.slice(0, 200) || "Wrong username, password, or captcha.",
      );
    }
    const message = typeof first.json["message"] === "string" ? first.json["message"] : "";
    const data = (first.json["data"] ?? {}) as Record<string, unknown>;
    const jwt =
      typeof data["jwt"] === "string" && data["jwt"]
        ? (data["jwt"] as string)
        : first.token || null;

    // Branch 1: two-factor token OTP.
    if (message === "otpVerification") {
      const otpToken = typeof data === "string" ? data : null;
      const pendingId = crypto.randomUUID();
      pendingStore.set(pendingId, {
        base,
        client,
        username,
        password: input.password,
        jwt: null,
        otpToken,
        captchaId: input.captchaId,
        captchaText: input.captchaText.trim(),
        createdAt: Date.now(),
      });
      return {
        ok: false,
        brokerId: "tms",
        displayName: null,
        clientCodeHint: null,
        holdingSymbols: [],
        steps: ["otp-required"],
        needsOtp: true,
        pendingId,
        proofId: null,
      };
    }

    if (!jwt) {
      throw new TmsLoginError(
        "TMS session failed.",
        "Signed in but no token came back. Try again.",
      );
    }
    // Branch 2/3: direct login (OTP modal, if any, is handled via pending below).
    const proof = await proofHoldings(base, client, jwt);
    cacheTmsSession(input.host ?? DEFAULT_HOST, username, client, jwt);
    const displayName = decodeJwtUsername(jwt) ?? username;
    return {
      ok: true,
      brokerId: "tms",
      displayName,
      clientCodeHint: null,
      holdingSymbols: [],
      steps: ["login-ok", ...toReportSteps("dp-holding", proof.rows)],
      needsOtp: false,
      pendingId: null,
      proofId: mintProof(normalizeTmsHost(input.host), username, input.password, displayName),
    };
  } catch (err) {
    if (err instanceof TmsLoginError) return fail("tms", err.message, err.hint);
    if (err instanceof Error && err.name === "AbortError") {
      return fail("tms", "TMS timed out.", "The broker site is slow. Try again.");
    }
    if (err instanceof BrokerSessionError) {
      return fail("tms", "TMS session failed.", "Signed in but the session did not stick.");
    }
    return fail("tms", "Unexpected login failure.", "Try again in a bit.");
  }
}

// ---------------------------------------------------------------------------
// Silent re-auth — used when the 30-min session expires. Same challenge
// flow as testTmsLogin but: (a) no proof minting, (b) uses saved creds,
// (c) returns a minimal result the reauth hook can act on.
// ---------------------------------------------------------------------------

export interface TmsReauthResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

/**
 * Re-login with saved credentials + a fresh captcha. Caches the session
 * on success. Does NOT mint a proof (connection is already saved).
 */
export async function reauthTmsLogin(input: {
  host: string;
  username: string;
  password: string;
  captchaId: string;
  captchaText: string;
}): Promise<TmsReauthResult> {
  const base = `${normalizeTmsHost(input.host)}/tmsapi`;
  const username = input.username.trim();
  if (!username)
    return { ok: false, error: "No TMS username saved.", hint: "Reconnect in Settings." };
  if (!input.password)
    return { ok: false, error: "No TMS password saved.", hint: "Reconnect in Settings." };
  if (!input.captchaText.trim() || !input.captchaId) {
    return { ok: false, error: "Solve the captcha first." };
  }
  const client = createClient();
  try {
    const first = await challenge(base, client, "", {
      userName: username,
      password: b64(input.password),
      jwt: "",
      otp: "",
      captchaIdentifier: input.captchaId,
      userCaptcha: input.captchaText.trim(),
    });
    if (first.status === 400 || first.status === 401) {
      const msg = typeof first.json["message"] === "string" ? first.json["message"] : "";
      return {
        ok: false,
        error: msg.slice(0, 200) || "Wrong captcha or credentials.",
        hint: "Try solving the captcha again.",
      };
    }
    const message = typeof first.json["message"] === "string" ? first.json["message"] : "";
    const data = (first.json["data"] ?? {}) as Record<string, unknown>;
    const jwt =
      typeof data["jwt"] === "string" && data["jwt"]
        ? (data["jwt"] as string)
        : first.token || null;

    // OTP required — can't silently reauth with OTP, user must handle it.
    if (message === "otpVerification") {
      return {
        ok: false,
        error: "TMS requires OTP verification.",
        hint: "Use Settings → Advanced → NEPSE TMS → Connect to re-authenticate.",
      };
    }

    if (!jwt) {
      return { ok: false, error: "Signed in but no session token returned." };
    }

    cacheTmsSession(input.host, username, client, jwt);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "TMS timed out.", hint: "Broker site is slow. Try again." };
    }
    return { ok: false, error: "Re-authentication failed." };
  }
}

/** Complete the OTP step started by testTmsLogin. Single attempt per call. */
export async function verifyTmsOtp(input: {
  pendingId: string;
  otp: string;
}): Promise<TmsTestResult> {
  const ctx = pendingStore.get(input.pendingId);
  if (!ctx || Date.now() - ctx.createdAt > PENDING_TTL_MS) {
    pendingStore.delete(input.pendingId);
    return fail("tms", "Login expired.", "Start over with a fresh captcha.");
  }
  pendingStore.delete(input.pendingId);
  const otp = input.otp.trim();
  if (!otp) return fail("tms", "Enter the OTP.", "Check your SMS/email for the code.");
  try {
    // Token-OTP branch mirrors loginWithOtp (empty captcha fields, per bundle).
    // JWT-OTP branch mirrors loginOtp (reuses the solved captcha).
    const res = ctx.otpToken
      ? await challenge(ctx.base, ctx.client, "", {
          userName: ctx.username,
          password: "",
          jwt: "",
          otp,
          captchaIdentifier: "",
          userCaptcha: "",
        })
      : await challenge(ctx.base, ctx.client, "", {
          userName: "",
          password: "",
          jwt: ctx.jwt ?? "",
          otp,
          captchaIdentifier: ctx.captchaId,
          userCaptcha: ctx.captchaText,
        });
    if (res.status === 400 || res.status === 401) {
      const msg = typeof res.json["message"] === "string" ? res.json["message"] : "";
      throw new TmsLoginError("Wrong OTP.", msg.slice(0, 200) || "Check the code and try again.");
    }
    const data = (res.json["data"] ?? {}) as Record<string, unknown>;
    const jwt =
      (typeof data["jwt"] === "string" && data["jwt"] ? (data["jwt"] as string) : null) ??
      res.token ??
      ctx.jwt;
    if (!jwt) throw new TmsLoginError("TMS session failed.", "No token came back. Start over.");
    const proof = await proofHoldings(ctx.base, ctx.client, jwt);
    cacheTmsSession(ctx.base, ctx.username, ctx.client, jwt);
    const displayName = decodeJwtUsername(jwt) ?? ctx.username;
    return {
      ok: true,
      brokerId: "tms",
      displayName,
      clientCodeHint: null,
      holdingSymbols: [],
      steps: ["otp-ok", ...toReportSteps("dp-holding", proof.rows)],
      needsOtp: false,
      pendingId: null,
      proofId: mintProof(normalizeTmsHost(ctx.base), ctx.username, ctx.password, displayName),
    };
  } catch (err) {
    if (err instanceof TmsLoginError) return fail("tms", err.message, err.hint);
    if (err instanceof BrokerSessionError) return fail("tms", "TMS session failed.", "Start over.");
    return fail("tms", "Unexpected login failure.", "Try again in a bit.");
  }
}

// ---------------------------------------------------------------------------
// Cached sessions for saved connections. TMS cannot silently re-login
// (captcha), so an expired token throws BrokerSessionError with a
// reconnect hint instead of retrying.
// ---------------------------------------------------------------------------

export interface TmsSession {
  cookies: string;
  xsrf: string;
  token: string;
  obtainedAt: number;
}

const sessionCache = new Map<string, TmsSession>();

export function dropTmsSession(cacheKey: string): void {
  sessionCache.delete(cacheKey);
}

export async function getTmsSession(cacheKey: string): Promise<TmsSession> {
  const hit = sessionCache.get(cacheKey);
  if (hit && Date.now() - hit.obtainedAt < SESSION_TTL_MS) return hit;
  sessionCache.delete(cacheKey);
  throw new BrokerSessionError("TMS session expired. Reconnect with a fresh captcha.");
}

export function putTmsSession(cacheKey: string, session: Omit<TmsSession, "obtainedAt">): void {
  sessionCache.set(cacheKey, { ...session, obtainedAt: Date.now() });
}

/** Cache key derivable at read time (no jar needed). */
export function tmsCacheKey(host: string, username: string): string {
  return `tms:${normalizeTmsHost(host)}:${username.trim().toLowerCase()}`;
}

function cacheTmsSession(host: string, username: string, client: TmsClient, token: string): void {
  putTmsSession(tmsCacheKey(host, username), {
    cookies: client.cookieHeader(),
    xsrf: client.jar.cookies.get("XSRF-TOKEN") ?? "",
    token,
  });
}

// ---------------------------------------------------------------------------
// Authenticated TMS reads (same id_token + XSRF the bundle uses). Every
// call maintains the token from the response header, matching the interceptor.
// On 401, the caller should surface "reconnect with a fresh captcha".
// ---------------------------------------------------------------------------

async function tmsGet<T>(
  client: TmsClient,
  token: string,
  base: string,
  path: string,
): Promise<{ json: T; token: string }> {
  const res = await client.req(`${base}${path}`, { headers: tmsHeaders(client, token) });
  const next = refreshTokenFrom(res, token);
  if (res.status === 401) throw new BrokerSessionError();
  const json = (await res.json().catch(() => [])) as T;
  return { json, token: next };
}

export async function getTmsHoldings(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  const { json, token: next } = await tmsGet<unknown>(client, token, base, "/dp-holding/dto");
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return { rows, token: next };
}

export async function getTmsAllHoldings(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  // Some tenants prefer the BOID-based endpoint; try dto first, fall back.
  try {
    return await getTmsHoldings(client, token, base);
  } catch (err) {
    if (!(err instanceof BrokerSessionError)) throw err;
    throw err;
  }
}

export async function getTmsOrderBook(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  // Bundle probes: /orderbook/, /tmsapi/orderbook, /tmsapi/orderbook/client etc.
  // Start with the simplest that the probe bundles list.
  const candidates = [
    "/orderbook/",
    "/tmsapi/orderbook/",
    "/orderbook/client/",
    "/tmsapi/orderbook/client/",
  ];
  let lastErr: unknown = null;
  for (const path of candidates) {
    const full = path.startsWith("/tmsapi") ? `${normalizeTmsHost(base)}${path}` : `${base}${path}`;
    try {
      const { json, token: next } = await tmsGet<unknown>(
        client,
        token,
        normalizeTmsHost(base),
        full.replace(normalizeTmsHost(base), ""),
      );
      // Normalize: the endpoint may return on the same base; just use base + path suffix.
      void full;
      const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
      return { rows, token: next };
    } catch (e) {
      lastErr = e;
      if (e instanceof BrokerSessionError) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Order book unavailable.");
}

export async function getTmsTradeBook(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  const { json, token: next } = await tmsGet<unknown>(client, token, base, "/trade-book");
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return { rows, token: next };
}

export async function getTmsMarketWatch(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  const { json, token: next } = await tmsGet<unknown>(client, token, base, "/exchange/marketwatch");
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return { rows, token: next };
}

export async function getTmsIndices(
  client: TmsClient,
  token: string,
  base: string,
): Promise<{ rows: Record<string, unknown>[]; token: string }> {
  const { json, token: next } = await tmsGet<unknown>(client, token, base, "/index/exchangeIndex");
  const rows = Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
  return { rows, token: next };
}

export function createTmsClientFromSession(cookies: string, xsrf: string): TmsClient {
  const jar: Jar = { cookies: new Map() };
  for (const part of cookies.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.cookies.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  if (xsrf) jar.cookies.set("XSRF-TOKEN", xsrf);
  const cookieHeader = () => [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  async function req(url: string, opts: RequestInit = {}): Promise<Response> {
    const { done, signal } = withTimeout(TIMEOUT_MS);
    try {
      const headers = new Headers(opts.headers);
      if (!headers.has("User-Agent")) headers.set("User-Agent", UA);
      const ck = cookieHeader();
      if (ck) headers.set("Cookie", ck);
      const res = await fetch(url, { ...opts, headers, signal, redirect: "manual" });
      const getSetCookie =
        typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
        "function"
          ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
          : [];
      for (const c of getSetCookie) {
        const eq = c.indexOf("=");
        const sc = c.indexOf(";");
        if (eq > 0)
          jar.cookies.set(c.slice(0, eq).trim(), c.slice(eq + 1, sc > 0 ? sc : undefined).trim());
      }
      return res;
    } finally {
      done();
    }
  }
  return { req, jar, cookieHeader };
}

export function tmsDefaultHost(): string {
  return DEFAULT_HOST;
}
