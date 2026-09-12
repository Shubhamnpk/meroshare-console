// Server-only Naasa X login worker (scripted Keycloak form flow).
// Proven against production 2026-09-08; see docs/xnasa-api-reference.md §12.
// Single attempt per call (no retry loops: protects the user's broker account
// from lockouts). Read-only proof: never places, modifies, or cancels orders.
import type { BrokerTestResult } from "./types";

const BASE = "https://x.naasasecurities.com.np";
const KC = "https://auth.naasasecurities.com.np";
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

const WALLET_BASE = "https://wallet.naasasecurities.com.np";
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
  const params = new URLSearchParams({ Tickers: sym, Exchange: "NEPSE" });
  const json = await naasaJson<unknown>(session, `/api/feed/Services.GetMDepth?${params}`);
  const root = (json ?? {}) as Record<string, unknown>;
  const { errorCode, rows } = unwrapBrokerData(json);
  const message = typeof root["Message"] === "string" ? (root["Message"] as string) : "";
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
      if (rows.length > 0 || !logHit) {
        console.error(`[brokers] report ${reportType} [${v.label}] ${c.from}..${c.to}: ${rows.length} rows`);
      }
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
    console.error(`[brokers] report ${reportType} [undated]: ${rows.length} rows`);
    merged.push(...rows);
  }
  console.error(
    `[brokers] report ${reportType}: ${merged.length} merged rows from ${chunks.length} window(s)`,
  );
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
}

/** List pending after-market orders (`POST /api/trading/amo/list`). */
export async function getNaasaAmoList(session: NaasaSession): Promise<NaasaAmoOrder[]> {  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/amo/list", {
    method: "POST",
    body: {},
  });
  const rows = (
    Array.isArray(json["data"]) ? (json["data"] as unknown[]) : []
  ) as Record<string, unknown>[];
  // eslint-disable-next-line no-console
  console.error("[amo-list] keys", rows.length > 0 ? Object.keys(rows[0] ?? {}) : []);
  const numOrNull = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  return rows.map((r) => {
    const sideRaw = String(r["BuySellInd"] ?? r["BuySellType"] ?? "").toUpperCase();
    return {
      alertName: typeof r["AlertName"] === "string" ? (r["AlertName"] as string) : null,
      scrip: String(r["Scrip"] ?? r["symbol"] ?? "").toUpperCase(),
      side: sideRaw.startsWith("S") ? "SELL" : sideRaw.startsWith("B") ? "BUY" : "UNKNOWN",
      quantity: numOrNull(r["OrderQty"] ?? r["Quantity"]) ?? 0,
      price: numOrNull(r["OrderPrice"] ?? r["Price"]),
      triggerPrice: numOrNull(r["TriggerPrice"]),
      validTill:
        typeof r["ValidTill"] === "string"
          ? (r["ValidTill"] as string)
          : typeof r["validTill"] === "string"
            ? (r["validTill"] as string)
            : null,
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
  const sym = input.scrip.trim().toUpperCase();
  const body = {
    AlertName: input.alertName ?? "",
    Scrip: sym.replace(/^25\.1!/, ""),
    OrderPrice: input.price ?? 0,
    TriggerPrice: input.triggerPrice ?? input.price ?? 0,
    OrderQty: input.quantity,
    BuySellInd: input.side === "SELL" ? "S" : "B",
    ValidTill: input.validTill ?? "",
  };
  // eslint-disable-next-line no-console
  console.error("[amo-cancel] request", body);
  const json = await naasaJson<Record<string, unknown>>(session, "/api/trading/amo/cancel", {
    method: "POST",
    body,
  });
  // eslint-disable-next-line no-console
  console.error("[amo-cancel] response", json);
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
      "AMO cancel rejected by broker.";
    return { ok: false, message: msg };
  }
  return {
    ok: true,
    message:
      (typeof json["Message"] === "string" && json["Message"]) ||
      (typeof json["message"] === "string" && json["message"]) ||
      `AMO order for ${sym} cancelled.`,
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Place a REAL order. Callers must confirm with the user first. */
export async function placeNaasaOrder(
  session: NaasaSession,
  input: NaasaPlaceInput,
): Promise<NaasaPlaceResult> {
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
  const body: Record<string, unknown> = {
    BuySellType: input.side === "BUY" ? "Buy" : "Sell",
    DeliveryFlag: input.side === "BUY" ? "DEL" : "AUTO",
    OrderTerms: input.validity,
    OrderType: isMkt ? "MKT" : "NORMAL",
    Price: isMkt ? "0" : String(input.price),
    Quantity: input.quantity,
    Scrip: sym,
    ...(validTill ? { ValidTill: validTill } : {}),
  };
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
      const preview = (await res.text()).slice(0, 160);
      console.error(`[brokers] tradeflow ${path} -> ${res.status}: ${preview}`);
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
      console.error(`[brokers] banks -> ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return [];
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (json["isSuccess"] === false) {
      console.error(`[brokers] banks rejected: ${String(json["message"] ?? "unknown").slice(0, 120)}`);
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
        console.error(
          `[brokers] tradeflow refresh rejected for clientId=${clientId}: ${res.status}`,
        );
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as { accessToken?: unknown };
      if (typeof json.accessToken === "string" && json.accessToken.length > 0) {
        return { accessToken: json.accessToken, clientId };
      }
      console.error(`[brokers] tradeflow refresh empty token for clientId=${clientId}`);
    } catch (err) {
      console.error(
        `[brokers] tradeflow refresh error for clientId=${clientId}: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      done();
    }
  }
  return null;
}
