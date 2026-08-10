// Server-only NEPSE market data feed.
// Source: YONEPSE static JSON API (community mirror of public NEPSE data).
// Everything is fetched server-side and cached in-memory so the browser never
// hits a third party and the provider can be swapped without touching the UI.
import type {
  BrokerRow,
  DividendRow,
  IpoArchiveRow,
  LivePrice,
  MarketIndex,
  MarketStatus,
  MarketSummaryRow,
  MoverRow,
  MutualFundRow,
  SectorIndex,
  TopStocks,
} from "./types";

const FEED_BASE = "https://shubhamnpk.github.io/yonepse";

export const FEED_ATTRIBUTION = "Community NEPSE feed (YONEPSE) — indicative, unofficial data.";

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
 * Fetch a JSON document from the feed with a TTL cache.
 * On failure the last good value is served (marked stale); if nothing was ever
 * cached the caller receives `null` and renders a degraded state.
 */
async function feedJson<T>(path: string, ttlMs: number): Promise<{ data: T | null; stale: boolean }> {
  const key = path;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return { data: hit.value as T, stale: false };

  try {
    const res = await fetch(`${FEED_BASE}${path}`, {
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
  const { data } = await feedJson<Record<string, { symbol?: string }[]>>(
    "/data/other/sector_codes.json",
    TTL.daily,
  );
  const map = new Map<string, string>();
  for (const [sector, rows] of Object.entries(data ?? {})) {
    for (const row of rows ?? []) {
      const symbol = str(row?.symbol);
      if (symbol) map.set(symbol.toUpperCase(), sector);
    }
  }
  sectorLookup = { map, expires: now + TTL.daily };
  return map;
}

export async function getLivePrices(): Promise<{ prices: LivePrice[]; stale: boolean }> {
  const [{ data, stale }, sectors] = await Promise.all([
    feedJson<Rec[]>("/data/nepse_data.json", TTL.fast),
    getSectorMap(),
  ]);
  const prices = (data ?? []).flatMap((row): LivePrice[] => {
    const symbol = str(row["symbol"]);
    if (!symbol) return [];
    const ltp = num(row["ltp"]);
    const previousClose = num(row["previous_close"]);
    return [
      {
        symbol: symbol.toUpperCase(),
        name: str(row["name"]) ?? symbol,
        ltp,
        previousClose,
        change: num(row["change"]),
        percentChange: num(row["percent_change"]),
        high: num(row["high"]),
        low: num(row["low"]),
        volume: num(row["volume"]),
        turnover: num(row["turnover"]),
        trades: num(row["trades"]),
        lastUpdated: str(row["last_updated"]),
        sector: sectors.get(symbol.toUpperCase()) ?? null,
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
  const { data } = await feedJson<Rec>("/data/market/status.json", TTL.fast);
  return {
    isOpen: data?.["is_open"] === true,
    lastChecked: str(data?.["last_checked"]),
  };
}

export async function getIndices(): Promise<MarketIndex[]> {
  const { data } = await feedJson<Rec[]>("/data/market/indices.json", TTL.fast);
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
  const { data } = await feedJson<Rec[]>("/data/market/sector_indices.json", TTL.medium);
  return (data ?? []).map((row) => {
    const sectorMaster = (row["sectorMaster"] ?? {}) as Rec;
    return {
      code: str(row["indexCode"]) ?? "",
      name: str(row["indexName"]) ?? str(row["indexCode"]) ?? "Sector",
      sector: str(sectorMaster["sectorDescription"]),
      close: row["close"] == null ? null : num(row["close"]),
      change: row["change"] == null ? null : num(row["change"]),
      percentChange: row["perChange"] == null ? null : num(row["perChange"]),
    };
  });
}

export async function getMarketSummary(): Promise<MarketSummaryRow[]> {
  const { data } = await feedJson<Rec[]>("/data/market/summary.json", TTL.fast);
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
  const { data } = await feedJson<Record<string, Rec[]>>("/data/market/top_stocks.json", TTL.fast);
  return {
    gainers: movers(data?.["top_gainer"], "percentageChange", "%").slice(0, 15),
    losers: movers(data?.["top_loser"], "percentageChange", "%").slice(0, 15),
    turnover: movers(data?.["top_turnover"], "turnover", "npr").slice(0, 15),
    volume: movers(data?.["top_trade"], "shareTraded", "qty").slice(0, 15),
    transactions: movers(data?.["top_transaction"], "totalTrades", "qty").slice(0, 15),
  };
}

export async function getDividends(): Promise<DividendRow[]> {
  const { data } = await feedJson<Rec[]>("/data/proposed_dividend/latest_1y.json", TTL.slow);
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

export async function getMutualFunds(): Promise<MutualFundRow[]> {
  const { data } = await feedJson<Rec[]>("/data/OMF.json", TTL.slow);
  return (data ?? []).flatMap((row): MutualFundRow[] => {
    const symbol = str(row["symbol"]);
    if (!symbol) return [];
    return [
      {
        symbol: symbol.toUpperCase(),
        fundName: str(row["fund_name"]) ?? symbol,
        fundSize: num(row["fund_size"]),
        dailyNav: num(row["daily_nav"]),
        dailyNavDate: str(row["daily_nav_date"]),
        weeklyNav: num(row["weekly_nav"]),
        monthlyNav: num(row["monthly_nav"]),
      },
    ];
  });
}

export async function getBrokers(): Promise<BrokerRow[]> {
  const { data } = await feedJson<Rec[]>("/data/other/brokers.json", TTL.daily);
  return (data ?? []).map((row, index) => ({
    id: typeof row["id"] === "number" ? row["id"] : index,
    memberCode: (row["memberCode"] as number | string | undefined) ?? "",
    memberName: str(row["memberName"]) ?? "Broker",
    membershipType: str(row["membershipType"]),
    phone: str(row["phone"]),
    districts: Array.isArray(row["districts"])
      ? (row["districts"] as unknown[]).filter((d): d is string => typeof d === "string")
      : [],
    tmsLink: str(row["tmsLink"]),
    branchCount: row["branchCount"] == null ? null : num(row["branchCount"]),
  }));
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

export async function getIpoArchive(): Promise<{ upcoming: IpoArchiveRow[]; past: IpoArchiveRow[] }> {
  const [upcoming, past] = await Promise.all([
    feedJson<Rec[]>("/data/ipo/upcoming.json", TTL.slow),
    feedJson<Rec[]>("/data/ipo/old.json", TTL.daily),
  ]);
  return {
    upcoming: ipoRows(upcoming.data ?? []).slice(0, 60),
    past: ipoRows(past.data ?? []).slice(0, 120),
  };
}
