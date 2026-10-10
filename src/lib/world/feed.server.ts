export type WorldSource = "yahoo" | "finnhub" | "stooq";

export interface WorldQuote {
  symbol: string;
  name: string | null;
  currency: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  ltp: number;
  previousClose: number;
  percentChange: number;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number;
  /** Exchange timestamp of the quote (unix seconds). */
  asOf: number | null;
  /** Regular-session window (unix seconds) for open/closed display. */
  sessionStart: number | null;
  sessionEnd: number | null;
  /** First trade date (unix seconds) for "listed since". */
  listedSince: number | null;
  source: WorldSource;
  stale: boolean;
  fetchedAt: string;
}

export interface WorldBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type WorldRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "MAX";

const WORLD_API_KEY = typeof process.env !== "undefined" ? (process.env["WORLD_API_KEY"] ?? "") : "";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TTL_QUOTE = 60_000;
const TTL_HISTORY = 6 * 60 * 60_000;
/** Intraday moves fast — 5 minutes, not hours. */
const TTL_INTRADAY = 5 * 60_000;
const FETCH_TIMEOUT = 8000;

interface CacheEntry {
  value: unknown;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function cachedJson<T>(key: string, url: string, ttlMs: number): Promise<{ data: T | null; hit: boolean }> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { data: hit.value as T, hit: true };
  const data = (await fetchJson(url)) as T | null;
  if (data != null) cache.set(key, { value: data, expires: now + ttlMs });
  return { data, hit: false };
}

type YahooChart = {
  chart?: {
    error?: unknown;
    result?: {
      meta?: Record<string, unknown>;
      timestamp?: number[];
      events?: {
        splits?: Record<string, { date?: number; numerator?: number; denominator?: number }>;
      };
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
        adjclose?: { adjclose?: (number | null)[] }[];
      };
    }[];
  };
};

/**
 * Parse a Yahoo v8 chart document into daily/intraday bars. Exported for tests.
 *
 * One convention everywhere: RAW prices, split-adjusted only. Yahoo's
 * adjclose also strips dividends, which silently re-prices history — the
 * same day then reads differently per range, and nothing agrees with the
 * live quote or intraday (both raw). Splits alone move every leg together,
 * so those still compound backward; dividend ex-dates print the real dip.
 */
export function parseYahooChart(doc: unknown): { bars: WorldBar[]; meta: Record<string, unknown> } {
  const chart = (doc as YahooChart)?.chart;
  const result = chart?.result?.[0];
  const meta = (result?.meta ?? {}) as Record<string, unknown>;
  const ts = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const splits = Object.values(result?.events?.splits ?? {})
    .map((s) => ({
      date: num(s.date),
      ratio: num(s.numerator) > 0 && num(s.denominator) > 0 ? num(s.denominator) / num(s.numerator) : 1,
    }))
    .filter((s) => s.date > 0 && s.ratio > 0 && s.ratio !== 1)
    .sort((a, b) => a.date - b.date);
  const splitFactor = (t: number) => {
    let f = 1;
    for (const s of splits) {
      if (t < s.date) f *= s.ratio;
      else break;
    }
    return f;
  };
  const now = Math.floor(Date.now() / 1000);
  const livePrice = num(meta["regularMarketPrice"]);
  const bars: WorldBar[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const t = num(ts[i]);
    if (!(t > 0)) continue;
    const f = splitFactor(t);
    let close = num(quote.close?.[i]) * f;
    const isLast = i === ts.length - 1;
    // Today's bar prints O/H/L while its close is still null — fill it with
    // the live quote so the day isn't silently dropped (stale-meta guard:
    // only when the bar is from the last 3 days).
    if (!(close > 0) && isLast && livePrice > 0 && t > now - 3 * 86400) {
      close = livePrice * f;
    }
    if (!(close > 0)) continue;
    const d = new Date(t * 1000);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    bars.push({
      date,
      open: num(quote.open?.[i]) * f || close,
      high: num(quote.high?.[i]) * f || close,
      low: num(quote.low?.[i]) * f || close,
      close,
      volume: Math.round(num(quote.volume?.[i]) / f),
    });
  }
  return { bars, meta };
}

const YAHOO_RANGE: Record<WorldRange, { range: string; interval: string }> = {
  "1D": { range: "1D", interval: "15m" },
  "1W": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "2Y": { range: "2y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  MAX: { range: "max", interval: "1wk" },
};

async function yahooDocument(
  symbol: string,
  range: WorldRange,
): Promise<{ bars: WorldBar[]; meta: Record<string, unknown> } | null> {
  const { range: r, interval } = YAHOO_RANGE[range];
  const key = `world:yahoo:${symbol}:${range}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${interval}&events=div%2Csplits`;
  const { data } = await cachedJson<unknown>(key, url, TTL_HISTORY);
  if (data == null) return null;
  const parsed = parseYahooChart(data);
  if (parsed.bars.length === 0) return null;
  return parsed;
}

function yahooQuoteFrom(symbol: string, parsed: { bars: WorldBar[]; meta: Record<string, unknown> }): WorldQuote {
  const meta = parsed.meta;
  const last = parsed.bars[parsed.bars.length - 1]!;
  const ltp = num(meta["regularMarketPrice"]) || last.close;
  // Previous close prefers the prior daily bar — the same series the chart
  // draws — so the day amount and day % always share one base. Meta only
  // backs it up; a missing previous close yields 0 (callers show "—").
  // Never the first bar's open: that spans the whole window, not one day.
  const prevBar = parsed.bars.length >= 2 ? parsed.bars[parsed.bars.length - 2]! : null;
  const prev = prevBar ? prevBar.close : num(meta["chartPreviousClose"]) || 0;
  const pct = prev > 0 ? ((ltp - prev) / prev) * 100 : 0;
  const nameRaw = meta["longName"] ?? meta["shortName"];
  const sectorRaw = meta["sector"];
  const industryRaw = meta["industry"];
  const period = meta["currentTradingPeriod"] as { regular?: { start?: unknown; end?: unknown } } | undefined;
  const sessionStart = num(period?.regular?.start);
  const sessionEnd = num(period?.regular?.end);
  return {
    symbol,
    name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null,
    currency: typeof meta["currency"] === "string" ? (meta["currency"] as string) : null,
    exchange: typeof meta["fullExchangeName"] === "string" ? (meta["fullExchangeName"] as string) : null,
    sector: typeof sectorRaw === "string" && sectorRaw.trim() ? sectorRaw.trim() : null,
    industry: typeof industryRaw === "string" && industryRaw.trim() ? industryRaw.trim() : null,
    ltp,
    previousClose: prev,
    percentChange: pct,
    dayHigh: num(meta["regularMarketDayHigh"]) || null,
    dayLow: num(meta["regularMarketDayLow"]) || null,
    fiftyTwoWeekHigh: num(meta["fiftyTwoWeekHigh"]) || null,
    fiftyTwoWeekLow: num(meta["fiftyTwoWeekLow"]) || null,
    volume: num(meta["regularMarketVolume"]) || last.volume,
    asOf: num(meta["regularMarketTime"]) || null,
    sessionStart: sessionStart > 0 ? sessionStart : null,
    sessionEnd: sessionEnd > 0 ? sessionEnd : null,
    listedSince: num(meta["firstTradeDate"]) || null,
    source: "yahoo",
    stale: false,
    fetchedAt: new Date().toISOString(),
  };
}

type FinnhubQuote = { c?: number; pc?: number; h?: number; l?: number };

async function finnhubQuote(symbol: string): Promise<WorldQuote | null> {
  if (!WORLD_API_KEY) return null;
  // Free tier covers US quotes; NSE tickers 401 here and fall through.
  const key = `world:finnhub:${symbol}`;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(WORLD_API_KEY)}`;
  const { data } = await cachedJson<FinnhubQuote>(key, url, TTL_QUOTE);
  const ltp = num(data?.c);
  if (!(ltp > 0)) return null;
  const prev = num(data?.pc) || ltp;
  return {
    symbol,
    name: null,
    currency: "USD",
    exchange: null,
    sector: null,
    industry: null,
    ltp,
    previousClose: prev,
    percentChange: prev > 0 ? ((ltp - prev) / prev) * 100 : 0,
    dayHigh: num(data?.h) || null,
    dayLow: num(data?.l) || null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    volume: 0,
    asOf: null,
    sessionStart: null,
    sessionEnd: null,
    listedSince: null,
    source: "finnhub",
    stale: false,
    fetchedAt: new Date().toISOString(),
  };
}

type StooqRow = { symbol: string; close: number; previousClose: number };

/** Parse a Stooq q/l CSV payload (Symbol,Date,Time,Open,High,Low,Close,Volume). Exported for tests. */
export function parseStooqCsv(text: string): StooqRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const rows: StooqRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    if (cells.length < 8) continue;
    const close = num(cells[6]);
    if (!(close > 0)) continue;
    // Quote CSVs carry no previous close; callers treat pct as unknown (0).
    rows.push({ symbol: (cells[0] ?? "").toUpperCase(), close, previousClose: close });
  }
  return rows;
}

function stooqSymbol(symbol: string): string {
  // Stooq wants lowercase with a market suffix; bare US tickers default to .us.
  const lower = symbol.toLowerCase();
  return lower.includes(".") ? lower : `${lower}.us`;
}

async function stooqQuote(symbol: string): Promise<WorldQuote | null> {
  const key = `world:stooq:${symbol}`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(symbol))}&f=sd2t2ohlcv&h&e=csv`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expires > now) return cached.value as WorldQuote;
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: ctrl.signal });
    if (!res.ok) return null;
    const rows = parseStooqCsv(await res.text());
    const row = rows.find((r) => r.symbol === symbol.toUpperCase()) ?? rows[0];
    if (!row || !(row.close > 0)) return null;
    const quote: WorldQuote = {
      symbol,
      name: null,
      currency: null,
      exchange: null,
      sector: null,
      industry: null,
      ltp: row.close,
      previousClose: row.previousClose,
      percentChange: row.previousClose > 0 ? ((row.close - row.previousClose) / row.previousClose) * 100 : 0,
      dayHigh: null,
      dayLow: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      volume: 0,
      asOf: null,
      sessionStart: null,
      sessionEnd: null,
      listedSince: null,
      source: "stooq",
      stale: false,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { value: quote, expires: now + TTL_QUOTE });
    return quote;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live quote with fallback: Yahoo → Finnhub (keyed, US) → Stooq. Null = uncovered (incl. NEPSE tickers). */
export async function worldQuote(symbol: string): Promise<WorldQuote | null> {
  const upper = symbol.toUpperCase();
  const parsed = await yahooDocument(upper, "1M");
  if (parsed) return yahooQuoteFrom(upper, parsed);
  const finnhub = await finnhubQuote(upper);
  if (finnhub) return finnhub;
  return stooqQuote(upper);
}

/** Bars with fallback: Yahoo full history, else Finnhub daily (keyed), else empty. */
export async function worldHistory(
  symbol: string,
  range: WorldRange,
): Promise<{ bars: WorldBar[]; source: WorldSource | null }> {
  const upper = symbol.toUpperCase();
  const parsed = await yahooDocument(upper, range);
  if (parsed) return { bars: parsed.bars, source: "yahoo" };
  if (WORLD_API_KEY) {
    const months: Record<WorldRange, number> = {
      "1D": 1,
      "1W": 1,
      "1M": 1,
      "3M": 3,
      "6M": 6,
      "1Y": 12,
      "2Y": 24,
      "5Y": 60,
      MAX: 120,
    };
    const to = Math.floor(Date.now() / 1000);
    const from = to - months[range] * 30 * 86400;
    const key = `world:finnhub-h:${upper}:${range}`;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(upper)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(WORLD_API_KEY)}`;
    const { data } = await cachedJson<{
      s?: string;
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
    }>(key, url, TTL_HISTORY);
    if (data?.s === "ok" && Array.isArray(data.t) && Array.isArray(data.c)) {
      const bars: WorldBar[] = [];
      for (let i = 0; i < data.t.length; i += 1) {
        const close = num(data.c[i]);
        if (!(close > 0)) continue;
        const t = num(data.t[i]);
        const d = new Date(t * 1000);
        bars.push({
          date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
          open: num(data.o?.[i]) || close,
          high: num(data.h?.[i]) || close,
          low: num(data.l?.[i]) || close,
          close,
          volume: num(data.v?.[i]),
        });
      }
      if (bars.length > 0) return { bars, source: "finnhub" };
    }
  }
  return { bars: [], source: null };
}

/** Clear the world-feed cache (tests / manual refresh). */
export function clearWorldCache(): void {
  cache.clear();
}

/** One intraday print, epoch seconds. Same-day moves don't need splits math. */
export interface WorldTick {
  t: number;
  close: number;
  /** Session volume at this tick (0 when the feed omits it, e.g. FX). */
  volume: number;
  open: number;
  high: number;
  low: number;
}

/**
 * Today's session as time-aware ticks (Yahoo 1D at 5m or 15m — 5m only
 * answers US listings, everything else needs 15m). Unlike worldHistory,
 * the clock survives — callers stitch these into 24h book lines. 5-min cache.
 */
export async function worldIntraday(
  symbol: string,
  interval: "5m" | "15m" = "15m",
): Promise<{ ticks: WorldTick[]; source: WorldSource | null }> {
  const upper = symbol.toUpperCase();
  const key = `world:yahoo-intraday:${interval}:${upper}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(upper)}?range=1D&interval=${interval}&events=div%2Csplits`;
  const { data } = await cachedJson<unknown>(key, url, TTL_INTRADAY);
  if (data == null) return { ticks: [], source: null };
  const chart = (data as YahooChart)?.chart;
  const result = chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const ticks: WorldTick[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < ts.length; i += 1) {
    const close = num(quote.close?.[i]);
    const t = num(ts[i]);
    if (!(close > 0) || !(t > 0) || seen.has(t)) continue;
    seen.add(t);
    ticks.push({
      t,
      close,
      volume: Math.max(0, num(quote.volume?.[i])),
      open: num(quote.open?.[i]) || close,
      high: num(quote.high?.[i]) || close,
      low: num(quote.low?.[i]) || close,
    });
  }
  ticks.sort((a, b) => a.t - b.t);
  return { ticks, source: ticks.length > 0 ? "yahoo" : null };
}

export interface GlobalHistoryPoint {
  time: number;
  /** Portfolio value in NPR (current FX per symbol). */
  value: number;
  /** Cost basis in NPR (current FX per symbol). Profit = value − cost. */
  cost: number;
}

/**
 * Merge per-symbol daily bars into one portfolio series that follows actual
 * positions: each symbol contributes only from its first buy (units walk
 * forward through dated BUY/SELL lots, floored at zero). Amounts arrive in
 * native currency and leave in NPR via the per-symbol rate, so mixed books
 * never sum dollars with pence. Days before any holding are skipped, so
 * short-held books never render fabricated history. Pure — unit-tested.
 */
export function mergeGlobalHistory(
  input: {
    symbol: string;
    /** NPR per 1 native unit (current FX); null prices the symbol out. */
    rate: number | null;
    lots: { date: string; side: string; qty: number; price: number }[];
    bars: { date: string; close: number }[];
  }[],
): { points: GlobalHistoryPoint[]; failed: string[] } {
  const failed: string[] = [];
  const bySymbol = new Map<string, Map<string, number>>();
  const dates = new Set<string>();
  for (const { symbol, rate, bars } of input) {
    if (!(rate != null && rate > 0)) {
      failed.push(symbol);
      continue;
    }
    const m = new Map<string, number>();
    for (const b of bars) {
      if (b.close > 0 && b.date) {
        m.set(b.date, b.close * (rate as number));
        dates.add(b.date);
      }
    }
    if (m.size === 0) {
      failed.push(symbol);
      continue;
    }
    bySymbol.set(symbol, m);
  }
  const sorted = [...dates].sort();
  const orderedLots = new Map<string, { date: string; side: string; qty: number; price: number }[]>();
  for (const { symbol, lots } of input) {
    orderedLots.set(
      symbol,
      [...lots].sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  const points: GlobalHistoryPoint[] = [];
  for (const date of sorted) {
    let value = 0;
    let cost = 0;
    let covered = 0;
    for (const { symbol, rate } of input) {
      const m = bySymbol.get(symbol);
      if (!m || !(rate != null && rate > 0)) continue;
      // Position + cost basis walked to this date (average-cost pools).
      let units = 0;
      let pool = 0;
      for (const lot of orderedLots.get(symbol) ?? []) {
        if (lot.date > date) break;
        if (lot.side === "BUY" && lot.qty > 0 && lot.price >= 0) {
          units += lot.qty;
          pool += lot.qty * lot.price;
        } else if (lot.side === "SELL" && lot.qty > 0 && units > 0) {
          const take = Math.min(lot.qty, units);
          const avg = pool / units;
          units -= take;
          pool = Math.max(0, pool - avg * take);
          if (units <= 0) {
            units = 0;
            pool = 0;
          }
        }
      }
      if (!(units > 0)) continue;
      const close = m.get(date);
      if (close != null) m.set(`__last:${symbol}`, close);
      const last = close ?? m.get(`__last:${symbol}`);
      if (last != null) {
        value += units * last;
        cost += pool * (rate as number);
        covered += 1;
      }
    }
    if (covered > 0) {
      points.push({
        time: Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000),
        value,
        cost,
      });
    }
  }
  return { points, failed };
}

export interface WorldCompany {
  symbol: string;
  name: string;
  country: string | null;
  currency: string | null;
  exchange: string | null;
  ipo: string | null;
  /** Native units (millions from Finnhub converted). */
  marketCap: number | null;
  sharesOut: number | null;
  website: string | null;
  industry: string | null;
  beta: number | null;
  peTtm: number | null;
  epsTtm: number | null;
  divYieldPct: number | null;
  roeTtmPct: number | null;
  netMarginPct: number | null;
  weekHigh: number | null;
  weekLow: number | null;
}

/**
 * Company profile + key fundamentals (Finnhub, keyed). US coverage on free;
 * NSE tickers are entitlement-blocked and return null — Yahoo quotes stay
 * the fallback for prices. Cached daily.
 */
export async function finnhubCompany(symbol: string): Promise<WorldCompany | null> {
  if (!WORLD_API_KEY) return null;
  const upper = symbol.toUpperCase();
  const key = `world:company:${upper}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as WorldCompany | null;
  const enc = `symbol=${encodeURIComponent(upper)}&token=${encodeURIComponent(WORLD_API_KEY)}`;
  const [profileRes, metricRes] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/stock/profile2?${enc}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?${enc}&metric=all`),
  ]);
  const profile = (profileRes ?? {}) as Record<string, unknown>;
  const metric = ((metricRes as Record<string, unknown> | null)?.["metric"] ?? {}) as Record<string, unknown>;
  const name =
    typeof profile["name"] === "string" && (profile["name"] as string).trim() !== ""
      ? (profile["name"] as string)
      : null;
  if (!name) return null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
  const company: WorldCompany = {
    symbol: upper,
    name,
    country: str(profile["country"]),
    currency: str(profile["currency"]),
    exchange: str(profile["exchange"]),
    ipo: str(profile["ipo"]),
    marketCap:
      num(metric["marketCapitalization"]) > 0
        ? num(metric["marketCapitalization"]) * 1_000_000
        : num(profile["marketCapitalization"]) > 0
          ? num(profile["marketCapitalization"]) * 1_000_000
          : null,
    sharesOut: num(profile["shareOutstanding"]) > 0 ? num(profile["shareOutstanding"]) * 1_000_000 : null,
    website: str(profile["weburl"]),
    industry: str(profile["finnhubIndustry"]) ?? str(profile["industry"]),
    beta: num(metric["beta"]) || null,
    peTtm: num(metric["peTTM"]) > 0 ? num(metric["peTTM"]) : null,
    epsTtm: num(metric["epsTTM"]) !== 0 ? num(metric["epsTTM"]) : null,
    divYieldPct: num(metric["dividendYieldIndicatedAnnual"]) || null,
    roeTtmPct: num(metric["roeTTM"]) || null,
    netMarginPct: num(metric["netProfitMarginTTM"]) || null,
    weekHigh: num(metric["52WeekHigh"]) > 0 ? num(metric["52WeekHigh"]) : null,
    weekLow: num(metric["52WeekLow"]) > 0 ? num(metric["52WeekLow"]) : null,
  };
  cache.set(key, { value: company, expires: now + 24 * 60 * 60_000 });
  return company;
}

export interface WorldSearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector: string | null;
  industry: string | null;
}

/**
 * Company-name search (Yahoo v1): resolves "Standard Life" → SDLF.L etc.
 * Cached hourly; empty on failure.
 */
export async function worldSearch(query: string): Promise<WorldSearchHit[]> {
  const term = query.trim();
  if (!term) return [];
  const key = `world:search:${term.toLowerCase()}`;
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=8&newsCount=0`;
  const { data } = await cachedJson<{
    quotes?: {
      symbol?: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
      exchDisp?: string;
      quoteType?: string;
      sector?: string;
      industry?: string;
    }[];
  }>(key, url, 60 * 60_000);
  return (data?.quotes ?? [])
    .filter((q) => typeof q.symbol === "string" && q.symbol.trim() !== "")
    .slice(0, 8)
    .map((q) => ({
      symbol: String(q.symbol),
      name: String(q.longname ?? q.shortname ?? q.symbol),
      exchange: String(q.exchDisp ?? q.exchange ?? ""),
      type: String(q.quoteType ?? ""),
      sector: typeof q.sector === "string" ? q.sector : null,
      industry: typeof q.industry === "string" ? q.industry : null,
    }));
}
