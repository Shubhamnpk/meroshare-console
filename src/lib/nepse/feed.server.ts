// Server-only NEPSE market data feed.
// Sources:
//  - BITNEPAL: live NEPSE API mirror (prices, indices, movers, summary, status).
//  - YONEPSE: static JSON mirror (proposed dividends, IPO archive) that also
//    mirrors the whole live-market surface; used as the automatic fallback
//    whenever BITNEPAL fails or answers empty.
// Everything is fetched server-side and cached in-memory so the browser never
// hits a third party and each provider can be swapped without touching the UI.
import type {
  ChartBar,
  ChartRange,
  ChartSeries,
  DailyBar,
  DividendRow,
  ExchangeMessageRow,
  FinancialReport,
  IpoArchiveRow,
  LivePrice,
  MarketIndex,
  MarketStatus,
  MarketSummaryRow,
  MoverRow,
  PortfolioGranularity,
  PortfolioHistoryPoint,
  PricePoint,
  SectorIndex,
  ScripDetail,
  ScripFinancials,
  ScripOverview,
  TopStocks,
} from "./types";
import { monthKeyFromEpoch, monthStartEpoch, unitsHeldAt, type UnitSnapshot } from "./timeline";

const BITNEPAL_BASE = "https://nepse.bitnepal.net/api/v1";
const YONEPSE_BASE = "https://shubhamnpk.github.io/yonepse";

export const FEED_ATTRIBUTION =
  "Live NEPSE mirror + community YONEPSE feed (indicative, unofficial data).";

interface CacheEntry {
  value: unknown;
  expires: number;
  fetchedAt: number;
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

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Fetch a JSON document with a TTL cache.
 * On failure the last good value is served (marked stale); if nothing was ever
 * cached the caller receives `null` and renders a degraded state.
 */
export async function feedJson<T>(
  url: string,
  ttlMs: number,
): Promise<{ data: T | null; stale: boolean }> {
  const key = url;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return { data: hit.value as T, stale: false };

  try {
    // Give the upstream 8s; slower than that and it counts as failed so the
    // fallback source (or stale cache) takes over instead of hanging the page.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const data = (await res.json()) as T;
      cache.set(key, { value: data, expires: now + ttlMs, fetchedAt: now });
      return { data, stale: false };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    if (hit) return { data: hit.value as T, stale: true };
    return { data: null, stale: true };
  }
}

/** bitnepal wraps every response in { success, data, error }. */
async function bitnepalJson<T>(
  path: string,
  ttlMs: number,
): Promise<{ data: T | null; stale: boolean }> {
  const { data, stale } = await feedJson<{ success: boolean; data: T | null }>(
    `${BITNEPAL_BASE}${path}`,
    ttlMs,
  );
  return { data: data?.data ?? null, stale };
}

function isMissing<T>(data: T | null): boolean {
  return data == null || (Array.isArray(data) && data.length === 0);
}

/**
 * Try the primary source; when it comes back empty or unreachable (no cache to
 * serve), fall back to YONEPSE so the market pages keep working during a
 * BITNEPAL outage. A stale cached primary value still wins over a fresher fallback
 * data never overrides it.
 */
async function withFallback<T>(
  primary: Promise<{ data: T | null; stale: boolean }>,
  makeFallback: () => Promise<{ data: T | null; stale: boolean }>,
): Promise<{ data: T | null; stale: boolean }> {
  const result = await primary;
  if (!isMissing(result.data)) return result;
  const fallback = await makeFallback();
  if (isMissing(fallback.data)) return result;
  return fallback;
}

/** One movers list out of the YONEPSE combined top-stocks file (cached per URL). */
async function yonepseTopStocks(key: string): Promise<{ data: Rec[] | null; stale: boolean }> {
  const { data, stale } = await feedJson<Rec>(
    `${YONEPSE_BASE}/data/market/top_stocks.json`,
    TTL.fast,
  );
  const rows = Array.isArray(data?.[key]) ? (data![key] as unknown as Rec[]) : null;
  return { data: rows ?? null, stale };
}

const TTL = {
  fast: 60_000,
  medium: 5 * 60_000,
  slow: 30 * 60_000,
  daily: 6 * 60 * 60_000,
} as const;

type Rec = Record<string, unknown>;

let sectorLookup: { map: Map<string, string>; expires: number } | null = null;

async function getSectorMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (sectorLookup && sectorLookup.expires > now) return sectorLookup.map;
  const { data } = await bitnepalJson<Record<string, string[]>>("/securities/sectors", TTL.daily);
  const map = new Map<string, string>();
  for (const [sector, symbols] of Object.entries(data ?? {})) {
    for (const symbol of symbols ?? []) map.set(symbol.toUpperCase(), sector);
  }
  // Only cache when the source actually answered. A transient fetch failure or
  // an empty payload must not lock in an empty sector map for hours.
  if (data && map.size > 0) sectorLookup = { map, expires: now + TTL.daily };
  if (map.size > 0) return map;
  // bitnepal's sector endpoint is unavailable, fall back to the static
  // YONEPSE sector codes so portfolio sector allocation keeps working.
  return getYonepseSectorMap();
}

export async function getLivePrices(): Promise<{ prices: LivePrice[]; stale: boolean }> {
  const [primary, yonepseFile, sectors] = await Promise.all([
    bitnepalJson<Rec[]>("/prices/today", TTL.fast),
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/market/live.json`, TTL.fast),
    getSectorMap(),
  ]);
  // Accept both shapes: bitnepal (lastUpdatedPrice/…) and YONEPSE (ltp/…).
  const parse = (rows: Rec[]): LivePrice[] =>
    rows.flatMap((row): LivePrice[] => {
      const symbol = str(row["symbol"]);
      if (!symbol) return [];
      const ltp = num(row["lastUpdatedPrice"]) || num(row["closePrice"]) || num(row["ltp"]);
      const previousClose = num(row["previousDayClosePrice"]) || num(row["previous_close"]);
      return [
        {
          symbol: symbol.toUpperCase(),
          name: str(row["securityName"]) ?? str(row["name"]) ?? symbol,
          ltp,
          previousClose,
          change: num(row["change"]) || ltp - previousClose,
          percentChange:
            num(row["percentChange"]) ||
            num(row["percent_change"]) ||
            (previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0),
          high: num(row["highPrice"]) || num(row["high"]),
          low: num(row["lowPrice"]) || num(row["low"]),
          volume: num(row["totalTradedQuantity"]) || num(row["volume"]),
          turnover: num(row["totalTradedValue"]) || num(row["turnover"]),
          trades: num(row["totalTrades"]) || num(row["trades"]),
          lastUpdated: str(row["lastUpdatedTime"]) ?? str(row["last_updated"]),
          sector: sectors.get(symbol.toUpperCase()) ?? null,
          fiftyTwoWeekHigh: row["fiftyTwoWeekHigh"] == null ? null : num(row["fiftyTwoWeekHigh"]),
          fiftyTwoWeekLow: row["fiftyTwoWeekLow"] == null ? null : num(row["fiftyTwoWeekLow"]),
          assetType: str(row["asset_type"]),
        },
      ];
    });
  const prices = parse(primary.data ?? yonepseFile.data ?? []);
  const stale = primary.data ? primary.stale : yonepseFile.stale;
  // Open-end mutual fund rows live in the same file carrying their daily NAV
  // (ltp), previous NAV and day change — overlay them so they win even when
  // the primary mirror is serving.
  if (yonepseFile.data) {
    const bySymbol = new Map(prices.map((p) => [p.symbol, p]));
    for (const row of parse(
      yonepseFile.data.filter((r) => str(r["asset_type"]) === "open_ended_mutual_fund"),
    )) {
      bySymbol.set(row.symbol, row);
    }
    return { prices: [...bySymbol.values()], stale };
  }
  return { prices, stale };
}

export async function getPriceMap(): Promise<{ map: Map<string, LivePrice>; stale: boolean }> {
  const { prices, stale } = await getLivePrices();
  const map = new Map<string, LivePrice>();
  for (const price of prices) map.set(price.symbol, price);
  return { map, stale };
}

export async function getMarketStatus(): Promise<MarketStatus> {
  const { data } = await withFallback(bitnepalJson<Rec>("/market/status", TTL.fast), () =>
    feedJson<Rec>(`${YONEPSE_BASE}/data/market/status.json`, TTL.fast),
  );
  return {
    isOpen: data?.["isOpen"] === "OPEN" || data?.["is_open"] === true,
    lastChecked: str(data?.["asOf"]) ?? str(data?.["last_checked"]),
  };
}

export async function getIndices(): Promise<MarketIndex[]> {
  const { data } = await withFallback(bitnepalJson<Rec[]>("/indices/nepse", TTL.fast), () =>
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/market/indices.json`, TTL.fast),
  );
  return (data ?? []).map((row) => ({
    name: str(row["index"]) ?? "Index",
    close: num(row["close"]),
    high: num(row["high"]),
    low: num(row["low"]),
    previousClose: num(row["previousClose"]),
    change: num(row["change"]),
    percentChange: num(row["perChange"]),
    fiftyTwoWeekHigh: row["fiftyTwoWeekHigh"] == null ? null : num(row["fiftyTwoWeekHigh"]),
    fiftyTwoWeekLow: row["fiftyTwoWeekLow"] == null ? null : num(row["fiftyTwoWeekLow"]),
    generatedTime: str(row["generatedTime"]),
  }));
}

export async function getSectorIndices(): Promise<SectorIndex[]> {
  const { data } = await bitnepalJson<Rec[]>("/indices/subindices", TTL.medium);
  return (data ?? []).map((row) => {
    const name = str(row["index"]) ?? "Sector";
    return {
      code: name,
      name,
      sector: name.replace(/\s*Index$/i, ""),
      close: row["currentValue"] == null ? null : num(row["currentValue"]),
      change: row["change"] == null ? null : num(row["change"]),
      percentChange: row["perChange"] == null ? null : num(row["perChange"]),
    };
  });
}

export async function getMarketSummary(): Promise<MarketSummaryRow[]> {
  const { data } = await withFallback(bitnepalJson<Rec[]>("/market/summary", TTL.fast), () =>
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/market/summary.json`, TTL.fast),
  );
  return (data ?? []).map((row) => ({
    detail: str(row["detail"]) ?? "",
    value: num(row["value"]),
  }));
}

function movers(rows: Rec[] | undefined, valueKey: string, label: string): MoverRow[] {
  return (rows ?? []).flatMap((row): MoverRow[] => {
    const symbol = str(row["symbol"]);
    if (!symbol) return [];
    return [
      {
        symbol: symbol.toUpperCase(),
        name: str(row["securityName"]) ?? symbol,
        value: num(row[valueKey]),
        label,
      },
    ];
  });
}

export async function getTopStocks(): Promise<TopStocks> {
  const [gainers, losers, turnover, volume, transactions] = await Promise.all([
    withFallback(bitnepalJson<Rec[]>("/prices/top/gainers", TTL.fast), () =>
      yonepseTopStocks("top_gainer"),
    ),
    withFallback(bitnepalJson<Rec[]>("/prices/top/losers", TTL.fast), () =>
      yonepseTopStocks("top_loser"),
    ),
    withFallback(bitnepalJson<Rec[]>("/prices/top/turnover", TTL.fast), () =>
      yonepseTopStocks("top_turnover"),
    ),
    withFallback(bitnepalJson<Rec[]>("/prices/top/trade", TTL.fast), () =>
      yonepseTopStocks("top_trade"),
    ),
    withFallback(bitnepalJson<Rec[]>("/prices/top/transaction", TTL.fast), () =>
      yonepseTopStocks("top_transaction"),
    ),
  ]);
  return {
    gainers: movers(gainers.data ?? [], "percentageChange", "%").slice(0, 15),
    losers: movers(losers.data ?? [], "percentageChange", "%").slice(0, 15),
    turnover: movers(turnover.data ?? [], "turnover", "npr").slice(0, 15),
    volume: movers(volume.data ?? [], "shareTraded", "qty").slice(0, 15),
    transactions: movers(transactions.data ?? [], "totalTrades", "qty").slice(0, 15),
  };
}

export async function getDividends(): Promise<DividendRow[]> {
  const { data } = await feedJson<Rec[]>(
    `${YONEPSE_BASE}/data/proposed_dividend/history_all_years.json`,
    TTL.slow,
  );
  return (data ?? []).flatMap((row): DividendRow[] => {
    const symbol = str(row["symbol"]);
    if (!symbol) return [];
    return [
      {
        symbol: symbol.toUpperCase(),
        bonusShare: num(row["bonus_share"]),
        cashDividend: num(row["cash_dividend"]),
        totalDividend: num(row["total_dividend"]),
        announcementDate: str(row["announcement_date"]),
        bookCloseDate: str(row["bookclose_date"]),
        fiscalYear: str(row["fiscal_year"]),
      },
    ];
  });
}

export async function getExchangeMessages(): Promise<ExchangeMessageRow[]> {
  const { data } = await feedJson<Rec[]>(`${YONEPSE_BASE}/data/exchange_messages.json`, TTL.daily);
  return (data ?? [])
    .flatMap((row): ExchangeMessageRow[] => {
      const title = str(row["title"]);
      if (!title) return [];
      const id = typeof row["id"] === "number" ? row["id"] : 0;
      return [
        {
          id,
          symbol: str(row["symbol"]),
          title,
          body: str(row["body"]),
          publishedAt: str(row["publishedAt"]),
          fileUrl: str(row["fileUrl"]),
        },
      ];
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/**
 * Portfolio valuation history from the YONEPSE LTP archive. Each scrip's units
 * come from your demat movement history (carry-forward from the last
 * credited/debited balance), so a stock you bought in 2021 only appears from
 * 2021 onward, no back-projection.
 *
 * `granularity` picks the resolution:
 *  - `day`: one point per trading day, from the daily archive for recent days
 *    and from the intra-month rows of the monthly archive for older months.
 *  - `month`: one point per month-end close.
 *  - `year`: one point per year (the last month-end close of each year).
 *
 * `months` bounds the trailing window; 0 means "everything up to 120 points".
 */
export async function getPortfolioHistory(
  timelines: { symbol: string; snapshots: UnitSnapshot[] }[],
  granularity: PortfolioGranularity,
  months = 0,
): Promise<PortfolioHistoryPoint[]> {
  const unitsBySymbol = new Map<string, UnitSnapshot[]>();
  let firstTime = Infinity;
  for (const t of timelines) {
    const snaps = [...t.snapshots].sort((a, b) => a.time - b.time);
    unitsBySymbol.set(t.symbol, snaps);
    for (const s of snaps) if (s.time < firstTime) firstTime = s.time;
  }
  if (timelines.length === 0 || !Number.isFinite(firstTime)) return [];

  const { data: manifest } = await feedJson<Rec>(
    `${YONEPSE_BASE}/data/ltp/manifest.json`,
    TTL.daily,
  );
  const availableMonths: string[] = (manifest?.["availableMonths"] ?? []) as string[];
  const availableDays: string[] = (manifest?.["availableDays"] ?? []) as string[];
  const startKey = monthKeyFromEpoch(firstTime);
  const now = Math.floor(Date.now() / 1000);
  const tailStart = months > 0 ? now - Math.round(months * 30.44 * 86400) : 0;
  const tailMonthKey = monthKeyFromEpoch(Math.max(firstTime, tailStart));

  if (granularity === "day") {
    const dayWindow = availableDays.filter(
      (d) => d >= dateKeyFromEpoch(Math.max(firstTime, tailStart)) && d <= dateKeyFromEpoch(now),
    );
    const daily = await scoreDays(unitsBySymbol, dayWindow);
    if (daily.length === 0) {
      // No daily archive at all yet, fall back to month-end points.
      const monthWindow = availableMonths.filter((m) => m >= startKey && m >= tailMonthKey);
      return scoreMonths(unitsBySymbol, monthWindow);
    }
    const coverageStart = monthKeyFromEpoch(
      dayWindow[0] ? Date.parse(dayWindow[0] + "T00:00:00+05:45") / 1000 : tailStart,
    );
    const monthWindow = availableMonths.filter(
      (m) => m >= startKey && m >= tailMonthKey && m < coverageStart,
    );
    // Monthly files carry every trading day of the month, so the pre-daily-
    // feed window still gets one point per trading day, not just month ends.
    return [...(await scoreMonthDays(unitsBySymbol, monthWindow)), ...daily].sort(
      (a, b) => a.time - b.time,
    );
  }

  const monthWindow = availableMonths.filter((m) => m >= startKey && m >= tailMonthKey);
  const scored = await scoreMonths(unitsBySymbol, monthWindow);
  if (granularity !== "year") return scored;

  const byYear = new Map<string, PortfolioHistoryPoint>();
  for (const p of scored) byYear.set(String(new Date(p.time * 1000).getUTCFullYear()), p);
  return [...byYear.values()];
}

function dateKeyFromEpoch(epoch: number): string {
  const dt = new Date((epoch + 20700) * 1000);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * One point per trading day out of the monthly LTP files (oldest first, capped
 * to 120 months). Monthly documents are date-major - `dates` lists every
 * trading day and each symbol row is `[dateIndex, ltp, volume]` - so this walks
 * the dates once, advancing a per-symbol pointer to carry closes forward for
 * scrips that didn't trade on a given day.
 */
async function scoreMonthDays(
  unitsBySymbol: Map<string, UnitSnapshot[]>,
  months: string[],
): Promise<PortfolioHistoryPoint[]> {
  if (months.length === 0) return [];
  const capped = months.length > 120 ? months.slice(-120) : months;
  const files = await Promise.all(
    capped.map(async (month) => {
      const { data } = await feedJson<Rec>(
        `${YONEPSE_BASE}/data/ltp/monthly/${month}.json`,
        TTL.daily,
      );
      return {
        month,
        dates: (data?.["dates"] ?? []) as string[],
        series: (data?.["series"] ?? {}) as Record<string, unknown[]>,
      };
    }),
  );

  // Per-symbol ascending [dateIndex, close] rows, plus a cursor that only ever
  // moves forward while walking the month's dates in order.
  type Rows = { idx: number[]; close: number[] };
  const lastClose = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];

  for (const { dates, series } of files) {
    const rowsBySymbol = new Map<string, Rows>();
    for (const symbol of unitsBySymbol.keys()) {
      const rows = Array.isArray(series[symbol]) ? (series[symbol] as unknown[][]) : [];
      const parsed: Rows = { idx: [], close: [] };
      for (const row of rows) {
        const index = num(row?.[0]);
        const close = num(row?.[1]);
        if (Number.isInteger(index) && close > 0) {
          parsed.idx.push(index);
          parsed.close.push(close);
        }
      }
      if (parsed.idx.length > 0) rowsBySymbol.set(symbol, parsed);
    }

    const cursor = new Map<string, number>();
    for (let j = 0; j < dates.length; j++) {
      const cutoff = Date.parse(`${dates[j]}T23:59:59+05:45`) / 1000;
      if (!Number.isFinite(cutoff)) continue;
      const breakdown: PortfolioHistoryPoint["breakdown"] = [];
      for (const [symbol, rows] of rowsBySymbol) {
        let at = cursor.get(symbol) ?? -1;
        while (at + 1 < rows.idx.length && rows.idx[at + 1]! <= j) at++;
        cursor.set(symbol, at);
        const carried = lastClose.get(symbol) ?? 0;
        const close = at >= 0 ? rows.close[at]! : carried;
        if (close <= 0) continue;
        lastClose.set(symbol, close);
        const units = unitsHeldAt(unitsBySymbol.get(symbol) ?? [], cutoff);
        if (units > 0) breakdown.push({ symbol, units, close, value: units * close });
      }
      if (breakdown.length === 0) continue;
      points.push({
        time: cutoff,
        value: breakdown.reduce((sum, b) => sum + b.value, 0),
        breakdown,
      });
    }
  }
  return points;
}

/** Score a list of month-end files (oldest first, capped to 120). */
async function scoreMonths(
  unitsBySymbol: Map<string, UnitSnapshot[]>,
  months: string[],
): Promise<PortfolioHistoryPoint[]> {
  if (months.length === 0) return [];
  const capped = months.length > 120 ? months.slice(-120) : months;
  const files = await Promise.all(
    capped.map(async (month) => {
      const { data } = await feedJson<Rec>(
        `${YONEPSE_BASE}/data/ltp/monthly/${month}.json`,
        TTL.daily,
      );
      const series = (data?.["series"] ?? {}) as Record<string, unknown[]>;
      const dates = (data?.["dates"] ?? []) as string[];
      return { month, series, lastDate: dates[dates.length - 1] ?? "" };
    }),
  );
  const lastClose = new Map<string, number>();
  return files.flatMap(({ month, series, lastDate }): PortfolioHistoryPoint[] => {
    const cutoff =
      (Date.parse(`${lastDate}T23:59:59+05:45`) || Date.parse(`${month}-28T23:59:59+05:45`)) / 1000;
    const p = evaluateSnapshot(unitsBySymbol, series, cutoff, monthStartEpoch(month), lastClose);
    return p ? [p] : [];
  });
}

/** Score one point per trading day from the daily LTP files (oldest first, capped to 300). */
async function scoreDays(
  unitsBySymbol: Map<string, UnitSnapshot[]>,
  days: string[],
): Promise<PortfolioHistoryPoint[]> {
  if (days.length === 0) return [];
  const capped = days.length > 300 ? days.slice(-300) : days;
  const files = await Promise.all(
    capped.map(async (day) => {
      const { data } = await feedJson<Rec>(`${YONEPSE_BASE}/data/ltp/daily/${day}.json`, TTL.daily);
      return { day, series: (data?.["series"] ?? {}) as Record<string, unknown[]> };
    }),
  );
  const lastClose = new Map<string, number>();
  return files.flatMap(({ day, series }): PortfolioHistoryPoint[] => {
    const cutoff = Date.parse(`${day}T23:59:59+05:45`) / 1000;
    const p = evaluateSnapshot(unitsBySymbol, series, cutoff, cutoff, lastClose);
    return p ? [p] : [];
  });
}

/**
 * Value the holdings at `cutoff` using the month/day `series` rows
 * (`[timeIndex, ltp, ...]`), carrying each scrip's latest seen close forward.
 */
function evaluateSnapshot(
  unitsBySymbol: Map<string, UnitSnapshot[]>,
  series: Record<string, unknown[]>,
  cutoff: number,
  time: number,
  lastClose: Map<string, number>,
): PortfolioHistoryPoint | null {
  const breakdown: PortfolioHistoryPoint["breakdown"] = [];
  for (const symbol of unitsBySymbol.keys()) {
    const units = unitsHeldAt(unitsBySymbol.get(symbol) ?? [], cutoff);
    if (units <= 0) continue;
    let close = lastClose.get(symbol) ?? 0;
    const rows = Array.isArray(series[symbol]) ? (series[symbol] as unknown[][]) : [];
    if (rows.length > 0) {
      const c = num(rows[rows.length - 1]?.[1]);
      if (c > 0) {
        close = c;
        lastClose.set(symbol, c);
      }
    }
    if (close > 0) breakdown.push({ symbol, units, close, value: units * close });
  }
  if (breakdown.length === 0) return null;
  return { time, value: breakdown.reduce((sum, b) => sum + b.value, 0), breakdown };
}

function ipoRows(rows: Rec[] | undefined): IpoArchiveRow[] {
  return (rows ?? []).flatMap((row): IpoArchiveRow[] => {
    const company = str(row["company"]);
    if (!company) return [];
    return [
      {
        company,
        units: str(row["units"]),
        dateRange: str(row["date_range"]),
        announcementDate: str(row["announcement_date"]),
        url: str(row["url"]),
      },
    ];
  });
}

/**
 * Face (par) value per scrip, derived from its sector. Cash dividends in Nepal
 * are paid as a percentage of face value; equities are Rs 100, mutual fund
 * units Rs 10. Sector comes from the YONEPSE static `sector_codes.json`.
 */
let sectorCodeLookup: { map: Map<string, string>; expires: number } | null = null;

async function getYonepseSectorMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (sectorCodeLookup && sectorCodeLookup.expires > now) return sectorCodeLookup.map;
  const { data } = await feedJson<Record<string, { symbol: string; name: string }[]>>(
    `${YONEPSE_BASE}/data/other/sector_codes.json`,
    TTL.daily,
  );
  const map = new Map<string, string>();
  for (const [sector, scrips] of Object.entries(data ?? {})) {
    for (const scrip of scrips ?? []) {
      const symbol = str(scrip?.["symbol"]);
      if (symbol) map.set(symbol.toUpperCase(), sector);
    }
  }
  // Never cache an empty map; a failed fetch should be retried next time.
  if (data && map.size > 0) sectorCodeLookup = { map, expires: now + TTL.daily };
  return map;
}

export async function getFaceValues(symbols: string[]): Promise<Record<string, number>> {
  const sectors = await getYonepseSectorMap();
  const out: Record<string, number> = {};
  for (const raw of new Set(symbols)) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol) continue;
    const sector = sectors.get(symbol) ?? "";
    out[symbol] = /mutual fund/i.test(sector) ? 10 : 100;
  }
  return out;
}

export async function getIpoArchive(): Promise<{
  upcoming: IpoArchiveRow[];
  past: IpoArchiveRow[];
}> {
  const [upcoming, past] = await Promise.all([
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/ipo/upcoming.json`, TTL.slow),
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/ipo/old.json`, TTL.daily),
  ]);
  return {
    upcoming: ipoRows(upcoming.data ?? []).slice(0, 60),
    past: ipoRows(past.data ?? []).slice(0, 120),
  };
}

/** Index value history for a mini-chart, e.g. "NEPSE" or "Sensitive". Points are [unixSeconds, value]. */
export async function getIndexHistory(indexName: string): Promise<PricePoint[]> {
  const { data } = await bitnepalJson<unknown[][]>(
    `/indices/graph/${encodeURIComponent(indexName)}`,
    TTL.medium,
  );
  return (data ?? []).flatMap((point): PricePoint[] => {
    const time = num(point?.[0]);
    const value = num(point?.[1]);
    if (!time || !value) return [];
    return [{ time, value }];
  });
}

/**
 * Multi-day price history for one scrip from the YONEPSE LTP archive: one point
 * per trading day where daily files exist, filled with month-end closes for the
 * older months that predate the daily feed. Ascending by date. Empty when the
 * scrip isn't in the archive (then callers fall back to another source).
 */
export async function getYonepseHistory(symbol: string, limitDays = 264): Promise<DailyBar[]> {
  const upper = symbol.toUpperCase();
  const { data: manifest } = await feedJson<Rec>(
    `${YONEPSE_BASE}/data/ltp/manifest.json`,
    TTL.daily,
  );
  const availableDays: string[] = [...((manifest?.["availableDays"] ?? []) as string[])].sort(
    (a, b) => b.localeCompare(a),
  );
  const availableMonths: string[] = [...((manifest?.["availableMonths"] ?? []) as string[])].sort(
    (a, b) => b.localeCompare(a),
  );

  const days = availableDays.slice(0, Math.min(availableDays.length, limitDays));
  const dayFiles = await Promise.all(
    days.map(async (day) => {
      const { data } = await feedJson<Rec>(`${YONEPSE_BASE}/data/ltp/daily/${day}.json`, TTL.daily);
      return { day, series: (data?.["series"] ?? {}) as Record<string, unknown[]> };
    }),
  );

  const bars: DailyBar[] = [];
  for (const { day, series } of dayFiles) {
    const rows = Array.isArray(series[upper]) ? (series[upper] as unknown[][]) : [];
    const close = rows.length > 0 ? num(rows[rows.length - 1]?.[1]) : 0;
    const volume = rows.length > 0 ? num(rows[rows.length - 1]?.[2]) : 0;
    if (close > 0) bars.push({ date: day, close, high: close, low: close, volume });
  }

  const now = Math.floor(Date.now() / 1000);
  const tailMonth = monthKeyFromEpoch(now - limitDays * 86400);
  const firstDay = days[days.length - 1];
  const dailyStartMonth = firstDay ? firstDay.slice(0, 7) : "9999-99";
  const monthList = availableMonths
    .filter((m) => m >= tailMonth && m < dailyStartMonth)
    .slice(0, 18);
  const monthFiles = await Promise.all(
    monthList.map(async (month) => {
      const { data } = await feedJson<Rec>(
        `${YONEPSE_BASE}/data/ltp/monthly/${month}.json`,
        TTL.daily,
      );
      return {
        month,
        series: (data?.["series"] ?? {}) as Record<string, unknown[]>,
        dates: (data?.["dates"] ?? []) as string[],
      };
    }),
  );
  for (const { month, series, dates } of monthFiles) {
    const rows = Array.isArray(series[upper]) ? (series[upper] as unknown[][]) : [];
    const close = rows.length > 0 ? num(rows[rows.length - 1]?.[1]) : 0;
    if (close > 0) {
      const date = dates[dates.length - 1] ?? `${month}-28`;
      bars.push({ date, close, high: close, low: close, volume: 0 });
    }
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getScripDetail(symbol: string): Promise<ScripDetail> {
  const upper = symbol.toUpperCase();
  const [detail, history, intraday, dividends, yonepse] = await Promise.all([
    bitnepalJson<Rec>(`/securities/${encodeURIComponent(upper)}`, TTL.medium),
    bitnepalJson<Rec[]>(`/securities/${encodeURIComponent(upper)}/history`, TTL.medium),
    bitnepalJson<Rec[]>(`/securities/${encodeURIComponent(upper)}/graph`, TTL.fast),
    getDividends(),
    getYonepseHistory(upper),
  ]);

  const daily = (detail?.data?.["securityDailyTradeDto"] ?? {}) as Rec;
  const security = (detail?.data?.["security"] ?? {}) as Rec;
  const company = (security["companyId"] ?? {}) as Rec;
  const sector = (company["sectorMaster"] ?? {}) as Rec;
  const instrument = (security["instrumentType"] ?? {}) as Rec;

  const overview: ScripOverview | null =
    security["symbol"] || company["companyName"]
      ? {
          symbol: upper,
          name: str(company["companyName"]) ?? str(security["securityName"]) ?? upper,
          sector: str(sector["sectorDescription"]),
          instrumentType: str(instrument["description"]),
          isin: str(security["isin"]),
          faceValue: security["faceValue"] == null ? null : num(security["faceValue"]),
          listingDate: str(security["listingDate"]),
          paidUpCapital:
            detail?.data?.["paidUpCapital"] == null ? null : num(detail.data["paidUpCapital"]),
          marketCapitalization:
            detail?.data?.["marketCapitalization"] == null
              ? null
              : num(detail.data["marketCapitalization"]),
          publicShares:
            detail?.data?.["publicShares"] == null ? null : num(detail.data["publicShares"]),
          publicPercentage:
            detail?.data?.["publicPercentage"] == null
              ? null
              : num(detail.data["publicPercentage"]),
          promoterPercentage:
            detail?.data?.["promoterPercentage"] == null
              ? null
              : num(detail.data["promoterPercentage"]),
          totalShares:
            detail?.data?.["stockListedShares"] == null
              ? null
              : num(detail.data["stockListedShares"]),
          website: str(company["companyWebsite"]),
          email: str(company["email"]),
          contactPerson: str(company["companyContactPerson"]),
          lastUpdated: str(daily["lastUpdatedDateTime"]),
        }
      : null;

  const bitnepalBars: DailyBar[] = (history.data ?? []).flatMap((row): DailyBar[] => {
    const date = str(row["businessDate"]);
    if (!date) return [];
    return [
      {
        date,
        close: num(row["closePrice"]),
        high: num(row["highPrice"]),
        low: num(row["lowPrice"]),
        volume: num(row["totalTradedQuantity"]),
      },
    ];
  });

  // Multi-day ranges use the YONEPSE LTP archive; the bitnepal mirror is the
  // fallback for scrips the community feed hasn't archived yet.
  const bars = yonepse.length > 0 ? yonepse : bitnepalBars;

  const points: PricePoint[] = (intraday.data ?? []).flatMap((row): PricePoint[] => {
    const time = num(row["time"]);
    const value = num(row["contractRate"]);
    if (!time || !value) return [];
    const volume =
      num(row["totalTradedQuantity"]) || num(row["volume"]) || num(row["shareTraded"]) || undefined;
    return [{ time, value, volume }];
  });

  const latest = [...dividends]
    .filter((d) => d.symbol === upper)
    .sort((a, b) => (b.announcementDate ?? "").localeCompare(a.announcementDate ?? ""))[0];
  const dividend = latest ?? null;

  return { overview, history: bars, intraday: points, dividend };
}

/**
 * Structured financial history (EPS, P/E, profit, net worth, paid-up capital)
 * per reported period for one scrip, from the YONEPSE company financials feed.
 * Sorted newest-first by submission date. Reports without a document carry a
 * null URL; the rest link to the NEPSE source PDF.
 */
export async function getScripFinancials(symbol: string): Promise<ScripFinancials | null> {
  const upper = symbol.toUpperCase();
  const [financials, metadata] = await Promise.all([
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/company/financials.json`, TTL.slow),
    feedJson<Rec>(`${YONEPSE_BASE}/data/company/metadata.json`, TTL.slow),
  ]);

  const baseUrl = str(metadata.data?.["document_base_url"]);
  const row = (financials.data ?? []).find((r) => (str(r["symbol"]) ?? "").toUpperCase() === upper);
  const rawReports = Array.isArray(row?.["reports"]) ? (row["reports"] as unknown[]) : [];

  const reports: FinancialReport[] = rawReports
    .flatMap((raw): FinancialReport[] => {
      const rec = raw as Rec;
      const doc = Array.isArray(rec["documents"])
        ? ((rec["documents"] as unknown[])[0] as Rec)
        : null;
      const path = str(doc?.["path"]);
      return [
        {
          type: str(rec["type"]) ?? "Report",
          fy: str(rec["fy"]),
          fyNepali: str(rec["fy_nepali"]),
          quarter: str(rec["quarter"]),
          pe: num(rec["pe"]) || null,
          eps: num(rec["eps"]) || null,
          paidUpCapital: num(rec["paid_up_capital"]) || null,
          profit: num(rec["profit"]) || null,
          netWorthPerShare: num(rec["net_worth_per_share"]) || null,
          roe: null,
          npl: null,
          car: null,
          operatingMargin: null,
          submittedDate: str(doc?.["submitted_date"]),
          documentUrl: path && baseUrl ? `${baseUrl}${encodeURIComponent(path)}` : null,
        },
      ];
    })
    .sort((a, b) => (b.submittedDate ?? "").localeCompare(a.submittedDate ?? ""));

  if (reports.length === 0) return null;

  return {
    symbol: upper,
    reports,
    updatedAt: str(metadata.data?.["last_updated"]),
  };
}

/**
 * Fetch financials for ALL symbols at once from the cached financials.json.
 * Returns a map of symbol → FinancialReport[] (sorted by submitted date, newest first).
 * Much more efficient than calling getScripFinancials() per symbol.
 */
export async function getAllFinancials(): Promise<Map<string, FinancialReport[]>> {
  const [financials, metadata] = await Promise.all([
    feedJson<Rec[]>(`${YONEPSE_BASE}/data/company/financials.json`, TTL.slow),
    feedJson<Rec>(`${YONEPSE_BASE}/data/company/metadata.json`, TTL.slow),
  ]);

  const baseUrl = str(metadata.data?.["document_base_url"]);
  const result = new Map<string, FinancialReport[]>();

  for (const row of financials.data ?? []) {
    const symbol = str(row["symbol"]);
    if (!symbol) continue;
    const upper = symbol.toUpperCase();
    const rawReports = Array.isArray(row?.["reports"]) ? (row["reports"] as unknown[]) : [];

    const reports: FinancialReport[] = rawReports
      .flatMap((raw): FinancialReport[] => {
        const rec = raw as Rec;
        const doc = Array.isArray(rec["documents"])
          ? ((rec["documents"] as unknown[])[0] as Rec)
          : null;
        const path = str(doc?.["path"]);
        return [
          {
            type: str(rec["type"]) ?? "Report",
            fy: str(rec["fy"]),
            fyNepali: str(rec["fy_nepali"]),
            quarter: str(rec["quarter"]),
            pe: num(rec["pe"]) || null,
            eps: num(rec["eps"]) || null,
            paidUpCapital: num(rec["paid_up_capital"]) || null,
            profit: num(rec["profit"]) || null,
            netWorthPerShare: num(rec["net_worth_per_share"]) || null,
            roe: null,
            npl: null,
            car: null,
            operatingMargin: null,
            submittedDate: str(doc?.["submitted_date"]),
            documentUrl: path && baseUrl ? `${baseUrl}${encodeURIComponent(path)}` : null,
          },
        ];
      })
      .sort((a, b) => (b.submittedDate ?? "").localeCompare(a.submittedDate ?? ""));

    if (reports.length > 0) result.set(upper, reports);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Trading terminal chart series
// ---------------------------------------------------------------------------

/** How far back each range button reaches, in calendar months. */
const RANGE_MONTHS: Record<ChartRange, number> = {
  "1D": 1,
  "1W": 1,
  "1M": 2,
  "3M": 4,
  "6M": 7,
  "1Y": 13,
  "3Y": 37,
  "5Y": 61,
  MAX: 180,
};

/** Approximate trading days kept per range once the bars are merged. */
const RANGE_BARS: Record<ChartRange, number> = {
  "1D": 2,
  "1W": 6,
  "1M": 23,
  "3M": 68,
  "6M": 134,
  "1Y": 265,
  "3Y": 790,
  "5Y": 1310,
  MAX: 5000,
};

/**
 * Daily closes for one scrip out of the YONEPSE monthly archive (2012 →
 * today). The monthly files are date-major and cover every scrip, so only the
 * extracted per-symbol slice is cached; the 300 KB source document is parsed
 * and dropped, keeping the worker's memory flat.
 */
async function archiveMonthBars(symbol: string, month: string): Promise<DailyBar[]> {
  const key = `arch:${symbol}:${month}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value as DailyBar[];

  let bars: DailyBar[] = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${YONEPSE_BASE}/data/ltp/monthly/${month}.json`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`archive ${res.status}`);
    const doc = (await res.json()) as Rec;
    const dates = (doc["dates"] ?? []) as string[];
    const series = (doc["series"] ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(series[symbol]) ? (series[symbol] as unknown[][]) : [];
    bars = rows.flatMap((row): DailyBar[] => {
      const date = dates[num(row?.[0])];
      const close = num(row?.[1]);
      if (!date || close <= 0) return [];
      return [{ date, close, high: close, low: close, volume: num(row?.[2]) }];
    });
  } catch {
    if (hit) return hit.value as DailyBar[];
    return [];
  }
  // Finished months never change; the running month refreshes hourly.
  const finished = month < monthKeyFromEpoch(Math.floor(now / 1000));
  cache.set(key, {
    value: bars,
    expires: now + (finished ? 30 * TTL.daily : 60 * 60_000),
    fetchedAt: now,
  });
  return bars;
}

/** Run `worker` over `items` with bounded concurrency. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length) as R[];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return out;
}

/** Deep daily-close history from the archive, oldest → newest. */
async function getArchiveBars(symbol: string, months: number): Promise<DailyBar[]> {
  const { data: manifest } = await feedJson<Rec>(
    `${YONEPSE_BASE}/data/ltp/manifest.json`,
    TTL.daily,
  );
  const available = [...((manifest?.["availableMonths"] ?? []) as string[])].sort();
  const wanted = available.slice(Math.max(0, available.length - months));
  const chunks = await mapLimit(wanted, 8, (month) => archiveMonthBars(symbol, month));
  return chunks.flat();
}

/**
 * Whole LTP history for one scrip from the YONEPSE monthly archive (2012 →
 * today), oldest → newest. Finished months are cached server-side, so repeat
 * views are cheap; the first load fans out over the archive.
 */
export async function getScripFullHistory(symbol: string): Promise<DailyBar[]> {
  const bars = await getArchiveBars(symbol.toUpperCase(), 1200);
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Everything the trading terminal draws for one symbol.
 *
 * Two free sources are merged:
 *  - bitnepal's NEPSE mirror: reported high/low/close and volume for roughly
 *    the last year, plus today's tick series;
 *  - the YONEPSE monthly archive: daily closes back to 2012 for the long
 *    ranges, where high/low are unavailable and the candle body is derived
 *    from the previous close (flagged as `synthetic`).
 */
export async function getChartSeries(symbol: string, range: ChartRange): Promise<ChartSeries> {
  const upper = symbol.toUpperCase();
  const months = RANGE_MONTHS[range];
  const needsArchive = months > 11;

  const [history, intradayRaw, archive, live] = await Promise.all([
    bitnepalJson<Rec[]>(`/securities/${encodeURIComponent(upper)}/history`, TTL.medium),
    range === "1D"
      ? bitnepalJson<Rec[]>(`/securities/${encodeURIComponent(upper)}/graph`, TTL.fast)
      : Promise.resolve({ data: null as Rec[] | null, stale: false }),
    needsArchive ? getArchiveBars(upper, months) : Promise.resolve<DailyBar[]>([]),
    getLivePrices(),
  ]);

  const byDate = new Map<string, DailyBar & { reported: boolean }>();
  for (const bar of archive) byDate.set(bar.date, { ...bar, reported: false });
  for (const row of history.data ?? []) {
    const date = str(row["businessDate"]);
    const close = num(row["closePrice"]);
    if (!date || close <= 0) continue;
    byDate.set(date, {
      date,
      close,
      high: num(row["highPrice"]) || close,
      low: num(row["lowPrice"]) || close,
      volume: num(row["totalTradedQuantity"]),
      reported: true,
    });
  }

  const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const bars: ChartBar[] = [];
  let previousClose = ordered[0]?.close ?? 0;
  for (const bar of ordered) {
    const open = previousClose > 0 ? previousClose : bar.close;
    bars.push({
      date: bar.date,
      open,
      high: Math.max(bar.high, open, bar.close),
      low: Math.min(bar.low || bar.close, open, bar.close),
      close: bar.close,
      volume: bar.volume,
      synthetic: !bar.reported,
    });
    previousClose = bar.close;
  }

  const sliced = bars.slice(Math.max(0, bars.length - RANGE_BARS[range]));

  const intraday: PricePoint[] = (intradayRaw.data ?? []).flatMap((row): PricePoint[] => {
    const time = num(row["time"]);
    const value = num(row["contractRate"]);
    if (!time || !value) return [];
    const volume =
      num(row["totalTradedQuantity"]) || num(row["volume"]) || num(row["shareTraded"]) || undefined;
    return [{ time, value, volume }];
  });

  const quote = live.prices.find((p) => p.symbol === upper);

  // A 1D view is a tick chart; daily candles would collapse to a single bar.
  const useIntraday = range === "1D" && intraday.length > 1;

  return {
    symbol: upper,
    name: quote?.name ?? null,
    range,
    bars: useIntraday ? [] : sliced,
    intraday,
    hasSynthetic: !useIntraday && sliced.some((b) => b.synthetic),
    source: FEED_ATTRIBUTION,
    fetchedAt: new Date().toISOString(),
  };
}
