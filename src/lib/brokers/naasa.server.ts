// Server-only Naasa X login worker (scripted Keycloak form flow).
// Proven against production 2026-09-08; see docs/xnasa-api-reference.md §12.
// Single attempt per call (no retry loops: protects the user's broker account
// from lockouts). Read-only proof: never places, modifies, or cancels orders.
import type { BrokerTestResult } from "./types";

const BASE = process.env["NAASA_BASE_URL"];
const KC = process.env["NAASA_AUTH_URL"];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 20_000;

export class BrokerLoginError extends Error {
  readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = "BrokerLoginError";
    this.hint = hint;
  }
}

interface Jar {
  value: string;
  domain: string;
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** Domain-scoped cookie jar. Sending Keycloak's giant cookies to the app
 * host trips nginx "Cookie Too Large" (observed 2026-09-08). */
function createClient() {
  const jar = new Map<string, Jar>();
  const cookiesFor = (url: string) => {
    const host = new URL(url).hostname;
    return [...jar.entries()]
      .filter(([, m]) => m.domain === host)
      .map(([k, m]) => `${k}=${m.value}`)
      .join("; ");
  };
  const cookies = () =>
    [...jar.entries()].map(([k, m]) => ({ name: k, value: m.value, domain: m.domain }));
  async function req(url: string, opts: RequestInit = {}): Promise<Response> {
    const { done, signal } = withTimeout(TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...opts,
        signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...(opts.headers ?? {}),
          ...(jar.size ? { Cookie: cookiesFor(url) } : {}),
        },
        redirect: "manual",
      });
      const host = new URL(url).hostname;
      const setCookies: string[] =
        typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
        "function"
          ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
          : [];
      for (const c of setCookies) {
        const eq = c.indexOf("=");
        const sc = c.indexOf(";");
        if (eq > 0)
          jar.set(c.slice(0, eq).trim(), {
            value: c.slice(eq + 1, sc > 0 ? sc : undefined).trim(),
            domain: host,
          });
      }
      return res;
    } finally {
      done();
    }
  }
  return { req, cookies };
}

const unesc = (s: string) => s.replace(/&amp;/g, "&");
const absolutize = (u: string) =>
  u.startsWith("http")
    ? u
    : u.startsWith("/")
      ? /^\/(api|login)/.test(u)
        ? BASE + u
        : KC + u
      : KC + "/" + u;

export async function testNaasaLogin(
  username: string,
  password: string,
): Promise<BrokerTestResult> {
  const base: BrokerTestResult = {
    ok: false,
    brokerId: "naasa-x",
    displayName: null,
    clientCodeHint: null,
    holdingSymbols: [],
    steps: [],
  };
  const fail = (error: string, hint: string): BrokerTestResult => ({ ...base, error, hint });
  const { req } = createClient();

  try {
    // 1-2. next-auth csrf + signin (server-built PKCE/state; Auth.js v5 needs POST)
    const csrfRes = await req(`${BASE}/api/auth/csrf`, { headers: { Accept: "application/json" } });
    if (!csrfRes.ok)
      throw new BrokerLoginError(
        "Broker site unreachable.",
        "Check your connection and try again.",
      );
    const csrf = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
    const signin = await req(`${BASE}/api/auth/signin/keycloak`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken ?? "",
        callbackUrl: `${BASE}/login`,
        json: "true",
      }),
    });
    const { url: kcUrl } = (await signin.json().catch(() => ({}))) as { url?: string };
    if (!kcUrl)
      throw new BrokerLoginError(
        "Broker login could not start.",
        "The broker may have changed its login page. Try again later.",
      );
    base.steps.push("signin-ok");

    // 3-4. Keycloak username+password form (single attempt)
    const formHtml = await (await req(kcUrl)).text();
    const action = unesc(
      (formHtml.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/) ?? [])[1] ?? "",
    );
    if (!action)
      throw new BrokerLoginError(
        "Broker login page changed.",
        "The broker may have updated its sign-in. Try again later.",
      );
    const loginRes = await req(action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: kcUrl,
      },
      body: new URLSearchParams({ username, password, credentialId: "" }),
    });
    if (loginRes.status === 200) {
      const text = (await loginRes.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const m = text.match(
        /(invalid[^.]{0,120}|password[^.]{0,120}|expired[^.]{0,80}|locked[^.]{0,80}|verify[^.]{0,80})/i,
      );
      throw new BrokerLoginError(
        "Broker rejected the credentials.",
        (m?.[1] ?? "Wrong email or password.").slice(0, 200),
      );
    }
    base.steps.push("keycloak-ok");

    // 5. follow the code back through the next-auth callback
    let next = loginRes.headers.get("location");
    let hops = 0;
    while (next && hops < 12) {
      hops++;
      const r = await req(absolutize(next));
      next = r.headers.get("location");
      if (r.status === 200) break;
    }
    const session = (await (
      await req(`${BASE}/api/auth/session`, { headers: { Accept: "application/json" } })
    )
      .json()
      .catch(() => ({}))) as { user?: { name?: string; email?: string } };
    if (!session?.user)
      throw new BrokerLoginError(
        "Broker session failed.",
        "Signed in at the broker but the app session did not stick. Try again.",
      );
    base.steps.push("session-ok");
    base.displayName = session.user.name ?? session.user.email ?? null;

    // 6. trading session handshake
    const tl = (await (
      await req(`${BASE}/api/auth/trading-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "LOGIN" }),
      })
    )
      .json()
      .catch(() => ({}))) as { clientCode?: string };
    if (!tl.clientCode) {
      throw new BrokerLoginError(
        "Trading account not activated.",
        "Signed in, but no client code came back — the trading account may not be activated.",
      );
    }
    base.steps.push("trading-ok");
    base.clientCodeHint = `${String(tl.clientCode).slice(0, 4)}…`;

    // 7. read-only proof: holding symbols only (no balances leave the server here)
    const rep = (await (
      await req(`${BASE}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ reportType: "HOLDINGREPORT" }),
      })
    )
      .json()
      .catch(() => ({}))) as { data?: { reportTable?: unknown } };
    let rows: unknown = rep?.data?.reportTable ?? [];
    if (typeof rows === "string") {
      try {
        rows = JSON.parse(rows) as unknown;
      } catch {
        rows = [];
      }
    }
    if (Array.isArray(rows)) {
      base.holdingSymbols = rows
        .map((r) => (r as { NEPSECode?: unknown }).NEPSECode)
        .filter((s): s is string => typeof s === "string");
    }

    // 8. hygiene: log the probe session back out; the saved vault re-logs on demand
    await req(`${BASE}/api/auth/trading-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "LOGOUT" }),
    }).catch(() => undefined);
    base.steps.push("logout-ok");

    return { ...base, ok: true };
  } catch (err) {
    if (err instanceof BrokerLoginError) return fail(err.message, err.hint);
    if (err instanceof Error && err.name === "AbortError") {
      return fail("Broker timed out.", "The broker site is slow or unreachable. Try again.");
    }
    return fail(
      "Unexpected login failure.",
      "Please try again. If it persists, the broker may have changed something.",
    );
  }
}

// ---------------------------------------------------------------------------
// Authenticated operations on a SAVED connection.
// Sessions (cookie jars, never passwords) are cached in memory with a short
// TTL so quote/depth polling doesn't re-login every call. Note: module state
// is per-instance — on multi-instance/Workers deploys each isolate re-logs
// on first use (use KV for a shared jar later).
// ---------------------------------------------------------------------------

export interface NaasaSession {
  cookies: string;
  clientCode: string;
  sessionNo: string;
  obtainedAt: number;
}

const SESSION_TTL_MS = 20 * 60_000;
const sessionCache = new Map<string, NaasaSession>();

export class BrokerSessionError extends Error {
  constructor(message = "Broker session expired. Please retest the connection.") {
    super(message);
    this.name = "BrokerSessionError";
  }
}

/** Full login that KEEPS the session (no logout). Throws BrokerLoginError. */
export async function establishNaasaSession(
  username: string,
  password: string,
): Promise<NaasaSession> {
  const { req, cookies } = createClient();
  const headerFor = (host: string) => {
    const ck = cookies()
      .filter((c) => c.domain === host)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    return ck ? { Cookie: ck } : {};
  };
  const csrfRes = await req(`${BASE}/api/auth/csrf`, { headers: { Accept: "application/json" } });
  if (!csrfRes.ok)
    throw new BrokerLoginError("Broker site unreachable.", "Check your connection and try again.");
  const csrf = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
  const signin = await req(`${BASE}/api/auth/signin/keycloak`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken ?? "",
      callbackUrl: `${BASE}/login`,
      json: "true",
    }),
  });
  const { url: kcUrl } = (await signin.json().catch(() => ({}))) as { url?: string };
  if (!kcUrl)
    throw new BrokerLoginError(
      "Broker login could not start.",
      "The broker may have changed its login page.",
    );
  const formHtml = await (await req(kcUrl)).text();
  const action = unesc(
    (formHtml.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/) ?? [])[1] ?? "",
  );
  if (!action)
    throw new BrokerLoginError(
      "Broker login page changed.",
      "The broker may have updated its sign-in.",
    );
  const loginRes = await req(action, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: kcUrl },
    body: new URLSearchParams({ username, password, credentialId: "" }),
  });
  if (loginRes.status === 200)
    throw new BrokerLoginError(
      "Broker rejected the credentials.",
      "Saved password no longer works — reconnect with the new one.",
    );
  let next = loginRes.headers.get("location");
  let hops = 0;
  while (next && hops < 12) {
    hops++;
    const r = await req(absolutize(next));
    next = r.headers.get("location");
    if (r.status === 200) break;
  }
  const session = (await (
    await req(`${BASE}/api/auth/session`, { headers: { Accept: "application/json" } })
  )
    .json()
    .catch(() => ({}))) as { user?: unknown };
  if (!session?.user)
    throw new BrokerLoginError(
      "Broker session failed.",
      "Signed in at the broker but the app session did not stick.",
    );
  const tl = (await (
    await req(`${BASE}/api/auth/trading-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action: "LOGIN" }),
    })
  )
    .json()
    .catch(() => ({}))) as { clientCode?: string; sessionNo?: string };
  if (!tl.clientCode)
    throw new BrokerLoginError(
      "Trading account not activated.",
      "Signed in, but no client code came back.",
    );
  const host = new URL(BASE).hostname;
  return {
    cookies: headerFor(host).Cookie ?? "",
    clientCode: tl.clientCode,
    sessionNo: tl.sessionNo ?? "",
    obtainedAt: Date.now(),
  };
}

/** Cached session for a saved identity. Never stores passwords. */
export async function getNaasaSession(
  cacheKey: string,
  username: string,
  password: string,
): Promise<NaasaSession> {
  const hit = sessionCache.get(cacheKey);
  if (hit && Date.now() - hit.obtainedAt < SESSION_TTL_MS) return hit;
  const fresh = await establishNaasaSession(username, password);
  sessionCache.set(cacheKey, fresh);
  return fresh;
}

export function dropNaasaSession(cacheKey: string): void {
  sessionCache.delete(cacheKey);
}

// ---------------------------------------------------------------------------
// Wallet-host session: tradeflow only honours tokens minted for its own
// client family. The X-session Keycloak bearer gets 401, so we log into the
// wallet host with the SAME saved vault credentials (single attempt, cached)
// and use that session's access token for tradeflow.
// ---------------------------------------------------------------------------

const WALLET_BASE = process.env["NAASA_WALLET_URL"];
const walletSessionCache = new Map<string, { accessToken: string; obtainedAt: number }>();

async function establishWalletAccessToken(username: string, password: string): Promise<string> {
  const { req } = createClient();
  const absolutizeWallet = (u: string) =>
    u.startsWith("http")
      ? u
      : u.startsWith("/")
        ? /^\/(api|login|auth)/.test(u)
          ? WALLET_BASE + u
          : KC + u
        : KC + "/" + u;
  const csrfRes = await req(`${WALLET_BASE}/api/auth/csrf`, {
    headers: { Accept: "application/json" },
  });
  if (!csrfRes.ok)
    throw new BrokerLoginError("Wallet site unreachable.", "Check your connection and try again.");
  const csrf = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
  const signin = await req(`${WALLET_BASE}/api/auth/signin/keycloak`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken ?? "",
      callbackUrl: `${WALLET_BASE}/`,
      json: "true",
    }),
  });
  const { url: kcUrl } = (await signin.json().catch(() => ({}))) as { url?: string };
  if (!kcUrl)
    throw new BrokerLoginError("Wallet login could not start.", "The wallet app may have changed.");
  const formHtml = await (await req(kcUrl)).text();
  const action = unesc(
    (formHtml.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/) ?? [])[1] ?? "",
  );
  if (!action)
    throw new BrokerLoginError(
      "Wallet login page changed.",
      "The wallet app may have updated its sign-in.",
    );
  const loginRes = await req(action, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: kcUrl },
    body: new URLSearchParams({ username, password, credentialId: "" }),
  });
  if (loginRes.status === 200)
    throw new BrokerLoginError(
      "Wallet rejected the credentials.",
      "Saved password no longer works — reconnect with the new one.",
    );
  let next = loginRes.headers.get("location");
  let hops = 0;
  while (next && hops < 12) {
    hops++;
    const r = await req(absolutizeWallet(next));
    next = r.headers.get("location");
    if (r.status === 200) break;
  }
  const session = (await (
    await req(`${WALLET_BASE}/api/auth/session`, { headers: { Accept: "application/json" } })
  )
    .json()
    .catch(() => ({}))) as { accessToken?: unknown };
  if (typeof session.accessToken !== "string" || session.accessToken.length === 0) {
    throw new BrokerLoginError(
      "Wallet session failed.",
      "Signed in but no wallet token came back.",
    );
  }
  return session.accessToken;
}

/** Cached wallet access token for tradeflow. Never stores passwords. */
export async function getWalletAccessToken(
  cacheKey: string,
  username: string,
  password: string,
): Promise<string> {
  const hit = walletSessionCache.get(cacheKey);
  if (hit && Date.now() - hit.obtainedAt < SESSION_TTL_MS) return hit.accessToken;
  const accessToken = await establishWalletAccessToken(username, password);
  walletSessionCache.set(cacheKey, { accessToken, obtainedAt: Date.now() });
  return accessToken;
}

export function dropWalletSession(cacheKey: string): void {
  walletSessionCache.delete(cacheKey);
}

async function naasaFetch(
  session: NaasaSession,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<Response> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const hasBody = options?.body !== undefined;
    const request: RequestInit = {
      method: options?.method ?? "GET",
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(session.cookies ? { Cookie: session.cookies } : {}),
      },
      redirect: "manual",
      body: hasBody ? JSON.stringify(options.body) : null,
    };
    return await fetch(`${BASE}${path}`, request);
  } finally {
    done();
  }
}

async function naasaJson<T>(
  session: NaasaSession,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await naasaFetch(session, path, init);
  if (res.status === 401) throw new BrokerSessionError();
  return (await res.json().catch(() => ({}))) as T;
}

/** Unwrap broker envelopes: {Result:{ErrorCode,data|Data}} or {ErrorCode,…,data}. */
export function unwrapBrokerData(payload: unknown): {
  errorCode: number;
  rows: Record<string, unknown>[];
  raw: unknown;
} {
  const root = (payload ?? {}) as Record<string, unknown>;
  const o = (root["Result"] ?? root) as Record<string, unknown>;
  const ec = o["ErrorCode"];
  const errorCode = typeof ec === "string" ? Number(ec) : typeof ec === "number" ? ec : 0;
  let data: unknown = o["data"] ?? o["Data"] ?? [];
  if (typeof data === "string") {
    const t = data.trim();
    try {
      data = t ? (JSON.parse(t) as unknown) : [];
    } catch {
      data = [];
    }
  }
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return { errorCode, rows, raw: payload };
}

const QUOTE_COLUMNS =
  "LTP,%Change,BidQty,BidPrice,High,Low,Open,Close,DateTime,OfferQty,OfferPrice,TTQ,WeightedAverage,LastTradeTime,TotalBuyQty,TotalSellQty,Volume,52WeekHigh,52WeekLow,Turnover";

/** Live broker quote for one scrip (upper-case symbol, no exchange prefix). */
export async function getNaasaQuote(
  session: NaasaSession,
  symbol: string,
): Promise<Record<string, unknown> | null> {
  const sym = symbol.trim().toUpperCase();
  const params = new URLSearchParams({ Tickers: `NEPSE.${sym}`, Columns: QUOTE_COLUMNS });
  const json = await naasaJson<unknown>(session, `/api/feed/Services.GetSpecifiedQuote?${params}`);
  const { errorCode, rows } = unwrapBrokerData(json);
  if (errorCode !== 0 || rows.length === 0) return null;
  return rows[0]!;
}

/** Market depth (Level-2). Empty off-hours — broker returns ErrorCode -100. */
export async function getNaasaDepth(
  session: NaasaSession,
  symbol: string,
): Promise<{ errorCode: number; message: string; rows: Record<string, unknown>[] }> {
  const sym = symbol.trim().toUpperCase();
  // Try plain SYM first (docs), fallback to NEPSE.SYM if empty — some envs need prefix
  for (const tickers of [sym, `NEPSE.${sym}`, `25.1!${sym}`]) {
    const params = new URLSearchParams({ Tickers: tickers, Exchange: "NEPSE" });
    const json = await naasaJson<unknown>(session, `/api/feed/Services.GetMDepth?${params}`);
    const root = (json ?? {}) as Record<string, unknown>;
    const result = (root["Result"] ?? root) as Record<string, unknown>;
    const { errorCode, rows } = unwrapBrokerData(json);
    const message =
      (typeof result["Message"] === "string" ? (result["Message"] as string) : "") ||
      (typeof root["Message"] === "string" ? (root["Message"] as string) : "");
    if (rows.length > 0 || errorCode === 0) {
      return { errorCode, message, rows };
    }
    // ec -100 = No data available (off-hours) — don't try other tickers, return as is
    if (errorCode === -100) {
      return { errorCode, message, rows };
    }
  }
  const params = new URLSearchParams({ Tickers: sym, Exchange: "NEPSE" });
  const json = await naasaJson<unknown>(session, `/api/feed/Services.GetMDepth?${params}`);
  const root = (json ?? {}) as Record<string, unknown>;
  const { errorCode, rows } = unwrapBrokerData(json);
  const message =
    typeof (root["Result"] as Record<string, unknown> | undefined)?.["Message"] === "string"
      ? ((root["Result"] as Record<string, unknown>)["Message"] as string)
      : typeof root["Message"] === "string"
        ? (root["Message"] as string)
        : "";
  return { errorCode, message, rows };
}

export async function getNaasaHoldings(session: NaasaSession): Promise<Record<string, unknown>[]> {
  const json = await naasaJson<{ data?: { reportTable?: unknown } }>(session, "/api/report", {
    method: "POST",
    body: { reportType: "HOLDINGREPORT" },
  });
  return toReportRows(json?.data?.reportTable);
}

function toReportRows(tbl: unknown): Record<string, unknown>[] {
  let t: unknown = tbl ?? [];
  if (typeof t === "string") {
    try {
      t = JSON.parse(t) as unknown;
    } catch {
      t = [];
    }
  }
  return Array.isArray(t) ? (t as Record<string, unknown>[]) : [];
}

function toMDY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

/**
 * Report fetch with broker-compatibility handling. Their own app sends both
 * casings ({fromDate} and {FromDate}); the accepted date format is
 * unconfirmed. Two behaviours observed against production:
 * - wide ranges come back empty while 7-day windows return rows (range cap),
 *   so ranges are split into <=7-day windows and merged;
 * - when a window comes back empty we retry alternate shapes and log the
 *   winner. Read-only POSTs.
 */
const CHUNK_DAYS = 7;
/** Winning variant per report type, so later chunks skip the discovery dance. */
const winnerCache = new Map<string, number>();

function splitRange(from: string, to: string): { from: string; to: string }[] {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (!iso.test(from) || !iso.test(to)) return [{ from, to }];
  const out: { from: string; to: string }[] = [];
  const dayMs = 86_400_000;
  let start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [{ from, to }];
  while (start <= end) {
    const chunkEnd = Math.min(start + (CHUNK_DAYS - 1) * dayMs, end);
    out.push({
      from: new Date(start).toISOString().slice(0, 10),
      to: new Date(chunkEnd).toISOString().slice(0, 10),
    });
    start = chunkEnd + dayMs;
  }
  return out;
}

async function fetchReportTable(
  session: NaasaSession,
  reportType: string,
  range?: { fromDate?: string; toDate?: string },
): Promise<Record<string, unknown>[]> {
  const from = range?.fromDate ?? "";
  const to = range?.toDate ?? "";
  const variants: { label: string; body: (f: string, t: string) => Record<string, string> }[] = [
    { label: "lower/iso", body: (f, t) => ({ reportType, fromDate: f, toDate: t }) },
    { label: "upper/iso", body: (f, t) => ({ reportType, FromDate: f, ToDate: t }) },
    { label: "lower/mdy", body: (f, t) => ({ reportType, fromDate: toMDY(f), toDate: toMDY(t) }) },
    { label: "upper/mdy", body: (f, t) => ({ reportType, FromDate: toMDY(f), ToDate: toMDY(t) }) },
  ];
  const chunks = from || to ? splitRange(from || to, to || from) : [{ from, to }];
  const seen = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  const logHit = chunks.length > 3;
  for (const c of chunks) {
    const winnerFirst =
      winnerCache.has(reportType) && chunks.length > 1
        ? [
            variants[winnerCache.get(reportType)!]!,
            ...variants.filter((_, i) => i !== winnerCache.get(reportType)),
          ]
        : variants;
    for (const v of winnerFirst) {
      const json = await naasaJson<{ data?: { reportTable?: unknown } }>(session, "/api/report", {
        method: "POST",
        body: v.body(c.from, c.to),
      });
      const rows = toReportRows(json?.data?.reportTable);
      if (rows.length > 0) {
        winnerCache.set(reportType, variants.indexOf(v));
        for (const r of rows) {
          const k = JSON.stringify(r);
          if (!seen.has(k)) {
            seen.add(k);
            merged.push(r);
          }
        }
        break;
      }
    }
  }
  // Last resort: undated query (broker default window) when dated reads are empty.
  if (merged.length === 0 && (from || to)) {
    const json = await naasaJson<{ data?: { reportTable?: unknown } }>(session, "/api/report", {
      method: "POST",
      body: { reportType, fromDate: "", toDate: "" },
    });
    const rows = toReportRows(json?.data?.reportTable);
    merged.push(...rows);
  }
  return merged;
}

export async function getNaasaOrderBook(
  session: NaasaSession,
  range?: { fromDate?: string; toDate?: string },
): Promise<Record<string, unknown>[]> {
  return fetchReportTable(session, "ORDERBOOK", range);
}

export interface NaasaPlaceInput {
  side: "BUY" | "SELL";
  symbol: string;
  quantity: number;
  price: number; // ignored for MKT
  orderType: "LMT" | "MKT";
  validity: "DAY" | "GTD" | "GTC" | "IOC" | "FOK";
  validTill?: string | undefined; // YYYY-MM-DD, required when GTD
}

export interface NaasaPlaceResult {
  ok: boolean;
  message: string;
  tranId: string | null;
}

export interface NaasaAmoInput {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  ltp: number;
}

function amoResult(json: Record<string, unknown>, fallback: string): NaasaPlaceResult {
  const err = json["error"];
  const success = json["Success"];
  const ec = json["ErrorCode"];
  const bad =
    err !== undefined || success === false || (ec !== undefined && ec !== 0 && ec !== "0");
  if (bad) {
    const msg =
      (typeof err === "string" && err) ||
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
      "After Market Order Placed successfully",
    tranId: typeof tran === "string" || typeof tran === "number" ? String(tran) : null,
  };
}

/**
 * Place a REAL after-market order (`POST /api/trading/amo`). Only valid
 * outside regular + pre-open hours; odd-lot AMO SELL is rejected by the
 * broker ("AMO order not available for odd lot.").
 */
export async function placeNaasaAmo(
  session: NaasaSession,
  input: NaasaAmoInput,
): Promise<NaasaPlaceResult> {
  const sym = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(sym)) throw new Error("Invalid scrip symbol.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new Error("Quantity must be 1-100000.");
  }
  if (input.side === "SELL" && input.quantity < 10) {
    throw new Error("AMO order not available for odd lot.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 100000) {
    throw new Error("Price must be positive for AMO orders.");
  }
  if (!Number.isFinite(input.ltp) || input.ltp <= 0) {
    throw new Error("Live price reference (LTP) is required for AMO orders.");
  }
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/amo", {
    method: "POST",
    body: {
      Scrip: sym,
      OrderPrice: input.price,
      OrderQty: input.quantity,
      BuySellInd: input.side,
      Ltp: input.ltp,
    },
  });
  return amoResult(json, "AMO order rejected by broker.");
}

export interface NaasaAmoOrder {
  alertName: string | null;
  scrip: string;
  side: "BUY" | "SELL" | "UNKNOWN";
  quantity: number;
  price: number | null;
  triggerPrice: number | null;
  validTill: string | null;
  /** Broker lifecycle state, when sent. Null = broker sent none → treat as active. */
  status: string | null;
}

/** AMO rows without an active-like status can't be modified/cancelled. */
export function isAmoActive(status: string | null | undefined): boolean {
  if (status === null || status === undefined) return true;
  const s = String(status).trim();
  if (!s) return true;
  // Broker sends boolean-like lifecycle flags: Status=false means the queued
  // row is no longer live (cancelled/disabled).
  if (/^(false|0|no|off)$/i.test(s)) return false;
  if (/^(true|1|yes|on)$/i.test(s)) return true;
  return !/DISABLE|INACTIVE|EXPIRED|CANCEL|REJECT|EXECUTED|COMPLETE|FILLED|CLOSED|DONE/i.test(s);
}

/** Normalize broker lifecycle flags (boolean or string) to a display status. */
function amoStatusOf(v: unknown): string | null {
  if (v === false) return "Disabled";
  if (v === true) return "Active";
  if (typeof v === "number") return v === 0 ? "Disabled" : String(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    if (/^(false|0|no|off)$/i.test(t)) return "Disabled";
    if (/^(true|1|yes|on)$/i.test(t)) return "Active";
    return t;
  }
  return null;
}

/** List pending after-market orders (`POST /api/trading/amo/list`). */
export async function getNaasaAmoList(session: NaasaSession): Promise<NaasaAmoOrder[]> {
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/amo/list", {
    method: "POST",
    body: {},
  });
  // Broker double-encodes like other endpoints: {data: [...] | "[...]"}.
  let raw: unknown = json["data"] ?? json["Data"] ?? [];
  if (typeof raw === "string") {
    try {
      raw = raw.trim() ? (JSON.parse(raw) as unknown) : [];
    } catch {
      raw = [];
    }
  }
  const rows = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];

  const numOrNull = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;
  return rows.map((r) => {
    const sideRaw = String(
      r["BuySellInd"] ?? r["BuySellType"] ?? r["B/S"] ?? r["Side"] ?? r["side"] ?? "",
    ).toUpperCase();
    const scripRaw = String(
      r["Scrip"] ?? r["scrip"] ?? r["Symbol"] ?? r["symbol"] ?? r["Ticker"] ?? r["ticker"] ?? "",
    ).toUpperCase();
    return {
      alertName:
        strOrNull(r["AlertName"]) ??
        strOrNull(r["alertName"]) ??
        strOrNull(r["TriggerName"]) ??
        strOrNull(r["triggerName"]) ??
        strOrNull(r["Name"]) ??
        strOrNull(r["OrderId"]) ??
        null,
      scrip: scripRaw.replace(/^25\.1!/, "").replace(/^NEPSE\./, ""),
      side: sideRaw.startsWith("S") ? "SELL" : sideRaw.startsWith("B") ? "BUY" : "UNKNOWN",
      quantity: numOrNull(r["OrderQty"] ?? r["Quantity"] ?? r["quantity"] ?? r["OrderQuantity"]) ?? 0,
      price: numOrNull(r["OrderPrice"] ?? r["Price"] ?? r["price"]),
      triggerPrice: numOrNull(r["TriggerPrice"] ?? r["triggerPrice"]),
      validTill:
        strOrNull(r["ValidTill"]) ??
        strOrNull(r["validTill"]) ??
        strOrNull(r["ValidUntil"]) ??
        null,
      status:
        amoStatusOf(r["Status"]) ??
        amoStatusOf(r["status"]) ??
        amoStatusOf(r["OrderStatus"]) ??
        amoStatusOf(r["orderStatus"]) ??
        amoStatusOf(r["State"]) ??
        amoStatusOf(r["state"]) ??
        null,
    };
  });
}

export interface NaasaAmoCancelInput {
  alertName: string | null;
  scrip: string;
  price: number | null;
  triggerPrice: number | null;
  quantity: number;
  side: "BUY" | "SELL";
  validTill: string | null;
}

/** Cancel a REAL after-market order (`POST /api/trading/amo/cancel`). */
export async function cancelNaasaAmo(
  session: NaasaSession,
  input: NaasaAmoCancelInput,
): Promise<{ ok: boolean; message: string }> {
  const sym = input.scrip.trim().toUpperCase().replace(/^25\.1!/, "").replace(/^NEPSE\./, "");
  if (!sym) throw new Error("Scrip missing — refresh the AMO list.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Quantity missing — refresh the AMO list.");
  }
  const body = {
    AlertName: input.alertName ?? "",
    Scrip: sym,
    OrderPrice: input.price ?? 0,
    TriggerPrice: input.triggerPrice ?? input.price ?? 0,
    OrderQty: input.quantity,
    BuySellInd: input.side === "SELL" ? "S" : "B",
    ValidTill: input.validTill ?? "",
  };

  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/amo/cancel", {
    method: "POST",
    body,
  });
  const err = json["error"] ?? json["Error"];
  const success = json["Success"] ?? json["success"] ?? json["isSuccess"];
  const ec = json["ErrorCode"] ?? json["errorCode"] ?? json["statusCode"];
  const msgRaw =
    (typeof json["Message"] === "string" && json["Message"]) ||
    (typeof json["message"] === "string" && json["message"]) ||
    "";
  // Broker success is a Message with no error flags; failure carries
  // error/Success=false/ErrorCode!=0/isSuccess=false, or a Message that
  // reads like a rejection ("not found", "fail", "reject", "error").
  const msgFailed = /fail|reject|error|cannot|could not|not found|no .*order|invalid/i.test(msgRaw);
  const bad =
    err !== undefined ||
    success === false ||
    (ec !== undefined && ec !== 0 && ec !== "0" && ec !== 200 && ec !== "200") ||
    (msgRaw !== "" && msgFailed && success !== true);
  if (bad) {
    const msg =
      (typeof err === "string" && err) ||
      msgRaw ||
      "AMO cancel rejected by broker. Check Alert/Scrip/Price match the queued row.";
    return { ok: false, message: msg };
  }
  return {
    ok: true,
    message: msgRaw || `AMO order for ${sym} cancelled.`,
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Shared validation + body for place and modify (modify adds identity fields). */
function buildNaasaOrderBody(input: NaasaPlaceInput): {
  sym: string;
  body: Record<string, unknown>;
} {
  const sym = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,24}$/.test(sym)) throw new Error("Invalid scrip symbol.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) {
    throw new Error("Quantity must be 1–100000.");
  }
  const isMkt = input.orderType === "MKT";
  if (!isMkt && (!Number.isFinite(input.price) || input.price <= 0 || input.price > 100000)) {
    throw new Error("Price must be positive for limit orders.");
  }
  let validTill: string | undefined;
  if (input.validity === "GTD") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.validTill ?? "");
    if (!m) throw new Error("Valid-till date (YYYY-MM-DD) is required for GTD orders.");
    validTill = `${m[3]}-${MONTHS[Number(m[2]) - 1] ?? m[2]}-${m[1]!.slice(-2)}`;
  }
  return {
    sym,
    body: {
      BuySellType: input.side === "BUY" ? "Buy" : "Sell",
      DeliveryFlag: input.side === "BUY" ? "DEL" : "AUTO",
      OrderTerms: input.validity,
      OrderType: isMkt ? "MKT" : "NORMAL",
      Price: isMkt ? "0" : String(input.price),
      Quantity: input.quantity,
      Scrip: sym,
      ...(validTill ? { ValidTill: validTill } : {}),
    },
  };
}

/** Place a REAL order. Callers must confirm with the user first. */
export async function placeNaasaOrder(
  session: NaasaSession,
  input: NaasaPlaceInput,
): Promise<NaasaPlaceResult> {
  const { sym, body } = buildNaasaOrderBody(input);
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/order", {
    method: "POST",
    body,
  });
  const err = json["error"];
  const success = json["Success"];
  const ec = json["ErrorCode"];
  const bad =
    err !== undefined || success === false || (ec !== undefined && ec !== 0 && ec !== "0");
  if (bad) {
    const msg =
      (typeof err === "string" && err) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      "Order rejected by broker.";
    return { ok: false, message: msg, tranId: null };
  }
  const tran = json["TranId"] ?? json["tranId"] ?? null;
  return {
    ok: true,
    message: (typeof json["Message"] === "string" && json["Message"]) || `Order placed for ${sym}.`,
    tranId: typeof tran === "string" || typeof tran === "number" ? String(tran) : null,
  };
}

export interface NaasaModifyInput extends NaasaPlaceInput {
  tranId: string;
  orderId: string;
  orderStatus: string;
  remainingQty: number;
}

/**
 * Modify a REAL order (same route as place + identity fields). A 409 or
 * "modified-changed" error means the order changed server-side: refresh the
 * book. Callers must confirm with the user first.
 */
export async function modifyNaasaOrder(
  session: NaasaSession,
  input: NaasaModifyInput,
): Promise<NaasaPlaceResult> {
  if (!input.tranId || !input.orderId)
    throw new Error("Order identity missing — refresh the book.");
  if (!Number.isFinite(input.remainingQty) || input.remainingQty < 1) {
    throw new Error("Nothing left to modify on this order.");
  }
  if (input.quantity > Math.floor(input.remainingQty)) {
    throw new Error("Quantity cannot exceed the remaining quantity.");
  }
  const { sym, body } = buildNaasaOrderBody(input);
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/order", {
    method: "POST",
    body: {
      ...body,
      TranId: String(input.tranId),
      OrderId: String(input.orderId),
      OrderStatus: input.orderStatus || "ACCEPTED",
      OriginalRemainingQty: Math.floor(input.remainingQty),
    },
  });
  const err = json["error"];
  const success = json["Success"];
  const ec = json["ErrorCode"];
  const bad =
    err !== undefined || success === false || (ec !== undefined && ec !== 0 && ec !== "0");
  if (bad) {
    const msg =
      (typeof err === "string" && err) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      "Modify rejected by broker.";
    return { ok: false, message: msg, tranId: null };
  }
  const tran = json["TranId"] ?? json["tranId"] ?? input.tranId;
  return {
    ok: true,
    message:
      (typeof json["Message"] === "string" && json["Message"]) || `Order modified for ${sym}.`,
    tranId: typeof tran === "string" || typeof tran === "number" ? String(tran) : null,
  };
}

// ---------------------------------------------------------------------------
// Watchlists (broker templates ↔ local watchlist sync).
// Endpoints: POST /api/watchlist-list {} | POST /api/market-watch
// {template} | POST /api/market-watch/save {tickersList, template} |
// POST /api/market-watch/delete {tickersList, template}
// Ticket format: "NEPSE.SYM^..."  (broker's ^-joined list).
// ---------------------------------------------------------------------------

export interface NaasaWatchlist {
  name: string;
  symbols: string[];
  isDefault: boolean;
  systemTag: string;
}

function parseTickersList(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  // Broker stores either JSON array string or ^-joined NEPSE.SYM list.
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as unknown[];
      return arr
        .map((v) =>
          String(v)
            .replace(/^NEPSE\./, "")
            .toUpperCase(),
        )
        .filter(Boolean);
    } catch {
      // fall through to ^ split
    }
  }
  return s
    .split("^")
    .map((t) =>
      t
        .replace(/^NEPSE\./, "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

function parseWatchlistList(payload: unknown): NaasaWatchlist[] {
  // Observed shapes: {data:"[...]"}  {data:[...]}  {Table:[...]}  {Watchlist:[...]}
  const root = (payload ?? {}) as Record<string, unknown>;
  let data: unknown = root["data"] ?? root["Data"] ?? root["Table"] ?? root["Watchlist"] ?? [];
  if (typeof data === "string") {
    const t = data.trim();
    try {
      data = t ? (JSON.parse(t) as unknown) : [];
    } catch {
      data = [];
    }
  }
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((r) => ({
    name: String(r["Template_Name"] ?? r["template"] ?? r["name"] ?? "Default"),
    symbols: parseTickersList(
      r["tickersList"] ?? r["TickersList"] ?? r["symbols"] ?? r["Symbols"] ?? "",
    ),
    isDefault: String(r["Default_marketWatch"] ?? r["isDefault"] ?? "0") === "1",
    systemTag: String(r["SystemTag"] ?? r["systemTag"] ?? "0"),
  }));
}

export async function getNaasaWatchlists(session: NaasaSession): Promise<NaasaWatchlist[]> {
  const json = await naasaJson<unknown>(session, "/api/watchlist-list", {
    method: "POST",
    body: {},
  });
  return parseWatchlistList(json);
}

export async function getNaasaMarketWatch(
  session: NaasaSession,
  template: string,
): Promise<string[]> {
  const json = await naasaJson<unknown>(session, "/api/market-watch", {
    method: "POST",
    body: { template },
  });
  // {TickerList:"[...]" | [...]} is the symbol set for that template.
  const root = (json ?? {}) as Record<string, unknown>;
  let list: unknown = root["TickerList"] ?? root["tickerList"] ?? root["data"] ?? [];
  if (typeof list === "string") {
    try {
      list = JSON.parse(list as string) as unknown;
    } catch {
      list = [];
    }
  }
  const rows = Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  return rows
    .map((r) =>
      String(r["ticker"] ?? r["Ticker"] ?? r["symbol"] ?? r["Symbol"] ?? "").toUpperCase(),
    )
    .filter(Boolean);
}

export async function saveNaasaWatchlist(
  session: NaasaSession,
  template: string,
  symbols: string[],
): Promise<{ ok: boolean; message: string }> {
  const tickersList = symbols.map((s) => `NEPSE.${s.toUpperCase()}`).join("^");
  const json = await naasaJson<Record<string, unknown>>(session, "/api/market-watch/save", {
    method: "POST",
    body: { tickersList, template },
  });
  const err = json["error"];
  const ec = json["ErrorCode"];
  if (err !== undefined || (ec !== undefined && ec !== 0 && ec !== "0")) {
    const msg =
      (typeof err === "string" && err) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      "Save watchlist failed.";
    return { ok: false, message: msg };
  }
  return {
    ok: true,
    message: (typeof json["Message"] === "string" && json["Message"]) || "Watchlist saved.",
  };
}

export async function deleteNaasaWatchlist(
  session: NaasaSession,
  template: string,
  tickersList?: string,
): Promise<{ ok: boolean; message: string }> {
  const json = await naasaJson<Record<string, unknown>>(session, "/api/market-watch/delete", {
    method: "POST",
    body: { template, ...(tickersList ? { tickersList } : {}) },
  });
  const err = json["error"];
  const ec = json["ErrorCode"];
  if (err !== undefined || (ec !== undefined && ec !== 0 && ec !== "0")) {
    const msg =
      (typeof err === "string" && err) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      "Delete watchlist failed.";
    return { ok: false, message: msg };
  }
  return {
    ok: true,
    message: (typeof json["Message"] === "string" && json["Message"]) || "Watchlist deleted.",
  };
}

// ---------------------------------------------------------------------------
// Trade book, cancel, and fund-side (tradeflow) reads.
// ---------------------------------------------------------------------------

export async function getNaasaTradeBook(
  session: NaasaSession,
  range?: { fromDate?: string; toDate?: string },
): Promise<Record<string, unknown>[]> {
  return fetchReportTable(session, "TRADEBOOK", range);
}

export interface NaasaCancelInput {
  orderStatus: string;
  buySellType: string; // "Buy" | "Sell" as stored on the row
  deliveryFlag?: string | undefined;
  orderTerms?: string | undefined;
  price: string;
  quantity: number;
  symbol: string;
  orderId: string;
  tranId: string;
}

/** Cancel a REAL order. Callers must confirm with the user first. */
export async function cancelNaasaOrder(
  session: NaasaSession,
  input: NaasaCancelInput,
): Promise<{ ok: boolean; message: string }> {
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/order", {
    method: "DELETE",
    body: {
      OrderStatus: input.orderStatus,
      BuySellType: input.buySellType,
      DeliveryFlag: input.deliveryFlag || "DEL",
      OrderTerms: input.orderTerms || "DAY",
      OrderType: "NORMAL",
      Price: input.price || "0",
      Quantity: input.quantity,
      Scrip: input.symbol,
      OrderId: input.orderId,
      TranId: input.tranId,
    },
  });
  const err = json["error"];
  const success = json["Success"];
  const ec = json["ErrorCode"];
  const bad =
    err !== undefined || success === false || (ec !== undefined && ec !== 0 && ec !== "0");
  if (bad) {
    const msg =
      (typeof err === "string" && err) ||
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      "Cancel rejected by broker.";
    return { ok: false, message: msg };
  }
  return {
    ok: true,
    message:
      (typeof json["Message"] === "string" && json["Message"]) ||
      `Order for ${input.symbol} cancelled.`,
  };
}

// ---------------------------------------------------------------------------
// Order history, company info, market status, support tickets (read-only).
// Shapes follow docs/xnasa-api-reference.md §§14-18; every parser below is
// defensive because the broker double-encodes JSON and renames keys per env.
// ---------------------------------------------------------------------------

export interface NaasaTicket {
  id: string;
  status: "open" | "pending" | "resolved";
  time: string;
  description: string;
  unread: boolean;
}

/** Per-order event trail (`POST /api/report/order-history { orderId }`). */
export async function getNaasaOrderHistory(
  session: NaasaSession,
  orderId: string,
): Promise<Record<string, unknown>[]> {
  const id = orderId.trim().slice(0, 64);
  if (!id) return [];
  const json = await naasaJson<{ data?: { reportTable?: unknown } }>(
    session,
    "/api/report/order-history",
    { method: "POST", body: { orderId: id } },
  );
  return toReportRows(json?.data?.reportTable);
}

/**
 * Broker company snapshot (`GET /api/feed/Services.GetCompanyInformation`).
 * Returns the single row object, whether the broker sends an array or a
 * bare object. Null when the service reports an error (ErrorCode != 0).
 */
export async function getNaasaCompanyInfo(
  session: NaasaSession,
  symbol: string,
): Promise<Record<string, unknown> | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;
  const params = new URLSearchParams({ Exchange: "NEPSE", Scrip: sym });
  const json = await naasaJson<unknown>(
    session,
    `/api/feed/Services.GetCompanyInformation?${params}`,
  );
  const { errorCode, rows } = unwrapBrokerData(json);
  if (errorCode !== 0) return null;
  if (rows.length > 0) return rows[0]!;
  const root = (json ?? {}) as Record<string, unknown>;
  const o = (root["Result"] ?? root) as Record<string, unknown>;
  const data = o["data"] ?? o["Data"];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export interface NaasaMarketStatus {
  status: string;
  isOpen: boolean;
}

/** Broker market status (`GET /api/feed/Services.GetMarketStatus`). Read-only poll. */
export async function getNaasaMarketStatus(session: NaasaSession): Promise<NaasaMarketStatus> {
  const json = await naasaJson<unknown>(session, "/api/feed/Services.GetMarketStatus");
  const { rows } = unwrapBrokerData(json);
  let status = "";
  if (rows.length > 0) {
    const r = rows[0]!;
    status = String(r["Status"] ?? r["status"] ?? r["MarketStatus"] ?? r["message"] ?? "");
  }
  if (!status) {
    const root = (json ?? {}) as Record<string, unknown>;
    const o = (root["Result"] ?? root) as Record<string, unknown>;
    const data = o["data"] ?? o["Data"];
    if (typeof data === "string") status = data;
    else if (typeof o["Message"] === "string") status = o["Message"] as string;
    else if (typeof root["Message"] === "string") status = root["Message"] as string;
  }
  const s = status.trim() || "Unknown";
  return { status: s, isOpen: /regular market open/i.test(s) };
}

function normalizeTicketStatus(raw: unknown): NaasaTicket["status"] {
  const t = String(raw ?? "").toLowerCase();
  if (t.includes("resolv") || t.includes("clos")) return "resolved";
  if (t.includes("pend")) return "pending";
  return "open";
}

/** Support tickets (`POST /api/CI/GetTicketLogs {}`). Read-only. */
export async function getNaasaTickets(session: NaasaSession): Promise<NaasaTicket[]> {
  const json = await naasaJson<unknown>(session, "/api/CI/GetTicketLogs", {
    method: "POST",
    body: {},
  });
  const root = (json ?? {}) as Record<string, unknown>;
  let list: unknown = root["tickets"] ?? root["Tickets"] ?? root["data"] ?? root["Data"] ?? json;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list) as unknown;
    } catch {
      list = [];
    }
  }
  const rows = Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  return rows
    .map((r) => {
      const unreadRaw = r["unread"] ?? r["Unread"] ?? r["isUnread"];
      return {
        id: String(r["id"] ?? r["Id"] ?? r["TicketId"] ?? ""),
        status: normalizeTicketStatus(r["status"] ?? r["Status"]),
        time: String(r["time"] ?? r["Time"] ?? r["createdAt"] ?? ""),
        description: String(r["description"] ?? r["Description"] ?? r["subject"] ?? ""),
        unread:
          unreadRaw === true ||
          String(unreadRaw ?? "").toLowerCase() === "true" ||
          Number(unreadRaw) === 1,
      };
    })
    .filter((t) => t.id !== "" || t.description !== "");
}

/** Fund-side backend. API contract: https://api-tradeflow.naasasecurities.com.np/swagger/v1/swagger.json */
const TRADEFLOW = "https://api-tradeflow.naasasecurities.com.np/api/v1";
/** KYC/bank records live on a sibling host (same realm, same Bearer). */
const NEWKYC = "https://api-newkyc.naasasecurities.com.np/api/v1";

/** Keycloak access token behind an established X session (for tradeflow Bearer). */
export async function getNaasaAccessToken(session: NaasaSession): Promise<string | null> {
  const tokens = await getNaasaTokens(session);
  return tokens.accessToken;
}

/** Keycloak tokens behind an established X session. */
export async function getNaasaTokens(session: NaasaSession): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
}> {
  const none = { accessToken: null, refreshToken: null, idToken: null };
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/auth/session`, {
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(session.cookies ? { Cookie: session.cookies } : {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as {
      accessToken?: unknown;
      refreshToken?: unknown;
      idToken?: unknown;
    };
    return {
      accessToken: typeof json.accessToken === "string" ? json.accessToken : null,
      refreshToken: typeof json.refreshToken === "string" ? json.refreshToken : null,
      idToken: typeof json.idToken === "string" ? json.idToken : null,
    };
  } catch {
    return none;
  } finally {
    done();
  }
}

async function tradeflowGet<T>(accessToken: string, path: string): Promise<T> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${TRADEFLOW}${path}`, {
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.status === 401) throw new BrokerSessionError();
    if (!res.ok) {
      return {} as T;
    }
    return (await res.json().catch(() => ({}))) as T;
  } finally {
    done();
  }
}

/** Fund-side collateral + utilization (same identity, tradeflow backend). */
export async function getTradeflowFunds(accessToken: string): Promise<{
  collateral: Record<string, unknown>;
  utilization: Record<string, unknown>;
}> {
  const [collateral, utilization] = await Promise.all([
    tradeflowGet<Record<string, unknown>>(accessToken, "/client-collateral/client"),
    tradeflowGet<Record<string, unknown>>(accessToken, "/client-collateral/utilized-collaterals"),
  ]);
  return { collateral, utilization };
}

export interface TradeflowTxnParams {
  search?: string | undefined;
  transactionType?: string | undefined;
  gateway?: string | undefined;
  status?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  pageNumber?: number | undefined;
  pageSize?: number | undefined;
}

/** Paged fund movement history (deposits/withdrawals). */
export async function getTradeflowTxns(
  accessToken: string,
  params: TradeflowTxnParams,
): Promise<{
  totalCount: number;
  totalPages: number;
  pageSize: number;
  currentPage: number;
  rows: Record<string, unknown>[];
}> {
  const q = new URLSearchParams();
  if (params.search) q.set("Search", params.search);
  if (params.transactionType) q.set("TransactionType", params.transactionType);
  if (params.gateway) q.set("Gateway", params.gateway);
  if (params.status) q.set("Status", params.status);
  if (params.dateFrom) q.set("DateFrom", params.dateFrom);
  if (params.dateTo) q.set("DateTo", params.dateTo);
  q.set("PageNumber", String(params.pageNumber && params.pageNumber > 0 ? params.pageNumber : 1));
  if (params.pageSize) q.set("PageSize", String(params.pageSize));
  const json = await tradeflowGet<Record<string, unknown>>(
    accessToken,
    `/wallet/transaction-summary?${q}`,
  );
  const rows = json["data"];
  return {
    totalCount: typeof json["totalCount"] === "number" ? json["totalCount"] : 0,
    totalPages: typeof json["totalPages"] === "number" ? json["totalPages"] : 0,
    pageSize: typeof json["pageSize"] === "number" ? json["pageSize"] : 10,
    currentPage: typeof json["currentPage"] === "number" ? json["currentPage"] : 0,
    rows: Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [],
  };
}

/** Linked bank accounts (KYC host). */
export async function getTradeflowBanks(accessToken: string): Promise<Record<string, unknown>[]> {
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${NEWKYC}/ssa/banks`, {
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.status === 401) throw new BrokerSessionError();
    if (!res.ok) {
      return [];
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (json["isSuccess"] === false) {
      return [];
    }
    const result = json["result"] as Record<string, unknown> | undefined;
    const banks = result?.["banks"];
    return Array.isArray(banks) ? (banks as Record<string, unknown>[]) : [];
  } finally {
    done();
  }
}

/** Request a REAL withdrawal to the primary bank. Callers must confirm first. */
export async function requestTradeflowWithdraw(
  accessToken: string,
  amount: number,
  isQuickRefund: boolean,
): Promise<{ ok: boolean; message: string }> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new Error("Amount must be positive.");
  }
  const q = new URLSearchParams({
    Amount: String(Math.floor(amount)),
    IsQuickRefund: String(isQuickRefund),
  });
  const { done, signal } = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${TRADEFLOW}/client-collateral/withdraw?${q}`, {
      method: "POST",
      signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (res.status === 401) throw new BrokerSessionError();
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = json["error"];
    const ok = err === undefined && json["isSuccess"] !== false;
    if (!ok) {
      const msg =
        (typeof err === "string" && err) ||
        (typeof json["message"] === "string" && json["message"]) ||
        "Withdrawal request rejected.";
      return { ok: false, message: msg };
    }
    return {
      ok: true,
      message:
        (typeof json["message"] === "string" && json["message"]) || "Withdrawal request submitted.",
    };
  } finally {
    done();
  }
}

export interface TradeflowStatementRow {
  date: string;
  narration: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

/** Account statement export (safe GET). Dates as YYYY-MM-DD. */
export async function getTradeflowStatement(
  accessToken: string,
  fromDate: string,
  toDate: string,
): Promise<TradeflowStatementRow[]> {
  const q = new URLSearchParams({ FromDate: fromDate, ToDate: toDate });
  const json = await tradeflowGet<Record<string, unknown>>(
    accessToken,
    `/user-account-statement/user-account-statement?${q}`,
  );
  let rows: unknown = json["data"] ?? json["Data"] ?? json["rows"] ?? json;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows) as unknown;
    } catch {
      rows = [];
    }
  }
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  return list.map((r) => ({
    date: String(r["date"] ?? r["Date"] ?? r["transactionDate"] ?? r["ValueDate"] ?? ""),
    narration: String(
      r["narration"] ?? r["Narration"] ?? r["remarks"] ?? r["Remarks"] ?? r["description"] ?? "",
    ),
    debit: num(r["debit"] ?? r["Debit"]),
    credit: num(r["credit"] ?? r["Credit"]),
    balance: num(r["balance"] ?? r["Balance"] ?? r["runningBalance"]),
  }));
}

/**
 * Exchange a Keycloak refresh token for a tradeflow-native access token,
 * exactly like the wallet app: POST /auth/refresh {refreshToken, clientId}.
 * Tries known client ids; first success wins. Diagnostic-safe (no secrets logged).
 */
export async function exchangeTradeflowToken(
  kcRefreshToken: string,
): Promise<{ accessToken: string; clientId: string } | null> {
  for (const clientId of ["naasa-x", "blaze", "naasa-wallet"]) {
    const { done, signal } = withTimeout(TIMEOUT_MS);
    try {
      const res = await fetch(`${TRADEFLOW}/auth/refresh`, {
        method: "POST",
        signal,
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken: kcRefreshToken, clientId }),
      });
      if (!res.ok) {
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as { accessToken?: unknown };
      if (typeof json.accessToken === "string" && json.accessToken.length > 0) {
        return { accessToken: json.accessToken, clientId };
      }
    } catch {
      // try the next client id
    } finally {
      done();
    }
  }
  return null;
}
