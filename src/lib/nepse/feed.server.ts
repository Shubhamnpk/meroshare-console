// Server-only NEPSE market data feed.
// Sources:
//  - BITNEPAL: live NEPSE API mirror (prices, indices, movers, summary, status).
//  - YONEPSE: static JSON mirror (proposed dividends, IPO archive).
// Everything is fetched server-side and cached in-memory so the browser never
// hits a third party and each provider can be swapped without touching the UI.
import type {
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
  "Live NEPSE mirror (bitnepal.net) + community YONEPSE feed — indicative, unofficial data.";

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
async function feedJson<T>(
  url: string,
  ttlMs: number,
): Promise<{ data: T | null; stale: boolean }> {
  const key = url;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return { data: hit.value as T, stale: false };

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const data = (await res.json()) as T;
    cache.set(key, { value: data, expires: now + ttlMs, fetchedAt: now });
    return { data, stale: false };
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
  // bitnepal's sector endpoint is unavailable — fall back to the static
  // YONEPSE sector codes so portfolio sector allocation keeps working.
  return getYonepseSectorMap();
}

export async function getLivePrices(): Promise<{ prices: LivePrice[]; stale: boolean }> {
  const [{ data, stale }, sectors] = await Promise.all([
    bitnepalJson<Rec[]>("/prices/today", TTL.fast),
    getSectorMap(),
  ]);
  const prices = (data ?? []).flatMap((row): LivePrice[] => {
    const symbol = str(row["symbol"]);
    if (!symbol) return [];
    const ltp = num(row["lastUpdatedPrice"]) || num(row["closePrice"]);
    const previousClose = num(row["previousDayClosePrice"]);
    return [
      {
        symbol: symbol.toUpperCase(),
        name: str(row["securityName"]) ?? symbol,
        ltp,
        previousClose,
        change: ltp - previousClose,
        percentChange: previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0,
        high: num(row["highPrice"]),
        low: num(row["lowPrice"]),
        volume: num(row["totalTradedQuantity"]),
        turnover: num(row["totalTradedValue"]),
        trades: num(row["totalTrades"]),
        lastUpdated: str(row["lastUpdatedTime"]),
        sector: sectors.get(symbol.toUpperCase()) ?? null,
        fiftyTwoWeekHigh: row["fiftyTwoWeekHigh"] == null ? null : num(row["fiftyTwoWeekHigh"]),
        fiftyTwoWeekLow: row["fiftyTwoWeekLow"] == null ? null : num(row["fiftyTwoWeekLow"]),
      },
    ];
  });
  return { prices, stale };
}

export async function getPriceMap(): Promise<{ map: Map<string, LivePrice>; stale: boolean }> {
  const { prices, stale } = await getLivePrices();
  const map = new Map<string, LivePrice>();
  for (const price of prices) map.set(price.symbol, price);
  return { map, stale };
}

export async function getMarketStatus(): Promise<MarketStatus> {
  const { data } = await bitnepalJson<Rec>("/market/status", TTL.fast);
  return {
    isOpen: data?.["isOpen"] === "OPEN",
    lastChecked: str(data?.["asOf"]),
  };
}

export async function getIndices(): Promise<MarketIndex[]> {
  const { data } = await bitnepalJson<Rec[]>("/indices/nepse", TTL.fast);
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
  const { data } = await bitnepalJson<Rec[]>("/market/summary", TTL.fast);
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
    bitnepalJson<Rec[]>("/prices/top/gainers", TTL.fast),
    bitnepalJson<Rec[]>("/prices/top/losers", TTL.fast),
    bitnepalJson<Rec[]>("/prices/top/turnover", TTL.fast),
    bitnepalJson<Rec[]>("/prices/top/trade", TTL.fast),
    bitnepalJson<Rec[]>("/prices/top/transaction", TTL.fast),
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
 * 2021 onward — no back-projection.
 *
 * `granularity` picks the resolution:
 *  - `day` — one point per trading day from the daily archive, with monthly
 *    month-end points filling in the older months that predate the daily feed.
 *  - `month` — one point per month-end close.
 *  - `year` — one point per year (the last month-end close of each year).
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
      // No daily archive at all yet — fall back to month-end points.
      const monthWindow = availableMonths.filter((m) => m >= startKey && m >= tailMonthKey);
      return scoreMonths(unitsBySymbol, monthWindow);
    }
    const coverageStart = monthKeyFromEpoch(
      dayWindow[0] ? Date.parse(dayWindow[0] + "T00:00:00+05:45") / 1000 : tailStart,
    );
    const monthWindow = availableMonths.filter(
      (m) => m >= startKey && m >= tailMonthKey && m < coverageStart,
    );
    return [...(await scoreMonths(unitsBySymbol, monthWindow)), ...daily].sort(
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
 * are paid as a percentage of face value — equities are Rs 100, mutual fund
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
  // Never cache an empty map — a failed fetch should be retried next time.
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
    return [{ time, value }];
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
