// Server-only NEPSE broker directory + floor sheet aggregation, powered by the
// community YONEPSE feed. Floor sheet shards are compact per-transaction arrays
// ([contractId, stockId, buyer, seller, qty, rate, amount, time]); everything
// heavy — joining lookups, per-broker/per-scrip tallies, hourly buckets — is
// computed here and cached, so the browser only ever receives small summaries
// plus a capped trade trail.
import { feedJson } from "./feed.server";
import type {
  BrokerDayStat,
  BrokerRow,
  FloorSheetDay,
  FloorSheetManifest,
  FloorSheetTrade,
  FloorSheetTrail,
  HourPoint,
  SymbolDayStat,
} from "./types";

const TTL = {
  fast: 60_000,
  medium: 5 * 60_000,
  slow: 30 * 60_000,
  daily: 6 * 60 * 60_000,
} as const;

const YONEPSE_BASE = "https://shubhamnpk.github.io/yonepse";

type Rec = Record<string, unknown>;

const BROKERS_URL = "/data/other/brokers.json";
const FLOOR_SHEET_MANIFEST_URL = "/data/floor_sheet/manifest.json";
const FLOOR_SHEET_DAILY_URL = (date: string) => `/data/floor_sheet/daily/${date}.json`;
const STOCKS_LOOKUP_URL = "/data/floor_sheet/lookups/stocks.json";
const BROKERS_LOOKUP_URL = "/data/floor_sheet/lookups/brokers.json";

/** One compact floor-sheet transaction row. */
type TxRow = [string | number, number, number, number, number, number, number, string | number];

interface DailySheet {
  date: string;
  totalAmount: number;
  totalQty: number;
  totalTrades: number;
  transactions: TxRow[];
}

interface StockLookupEntry {
  symbol: string;
  name: string;
}

type StockLookup = Record<string, StockLookupEntry>;
type BrokerLookup = Record<string, string>;

/** The latest date the floor sheet knows about (cheap, cached 60s). */
export async function getFloorSheetDates(): Promise<FloorSheetManifest> {
  const { data } = await feedJson<Rec>(`${YONEPSE_BASE}${FLOOR_SHEET_MANIFEST_URL}`, TTL.fast);
  const dates = Array.isArray(data?.["availableDates"])
    ? (data!["availableDates"] as unknown[]).map(String).sort()
    : [];
  return {
    latestDate: data?.["latestDate"] ? String(data["latestDate"]) : (dates.at(-1) ?? null),
    dates,
  };
}

/** Full NEPSE member broker directory with today's stats (cached 30 min). */
export async function getBrokers(): Promise<BrokerRow[]> {
  // The "other" directory is the enriched variant: today buy/sell stats,
  // trailing turnover and community ratings included.
  const { data } = await feedJson<Rec[]>(`${YONEPSE_BASE}${BROKERS_URL}`, TTL.slow);
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row): BrokerRow[] => {
    const code = Math.round(Number(row["memberCode"]));
    const name = typeof row["memberName"] === "string" ? row["memberName"].trim() : "";
    if (!Number.isFinite(code) || code <= 0 || !name) return [];

    const rawProvinces = row["provinces"];
    const provinces = Array.isArray(rawProvinces)
      ? rawProvinces.map(String)
      : typeof rawProvinces === "string" && rawProvinces.trim()
        ? [rawProvinces.trim()]
        : [];

    const rawRating = row["rating"];
    const rating =
      rawRating && typeof rawRating === "object"
        ? {
            averageRating: Number((rawRating as Rec)["averageRating"]) || 0,
            totalRatings: Number((rawRating as Rec)["totalRatings"]) || 0,
            averageShareTransferDays: Number((rawRating as Rec)["averageShareTransferDays"]) || 0,
            averageCashDepositDays: Number((rawRating as Rec)["averageCashDepositDays"]) || 0,
          }
        : null;

    const rawToday = row["todayStats"];
    const rawTopStock =
      rawToday && typeof rawToday === "object" ? (rawToday as Rec)["topStock"] : null;
    const topStock =
      rawTopStock && typeof rawTopStock === "object"
        ? {
            symbol: String((rawTopStock as Rec)["symbol"] ?? ""),
            name: String((rawTopStock as Rec)["name"] ?? ""),
            totalAmount: Number((rawTopStock as Rec)["totalAmount"]) || 0,
            buyAmount: Number((rawTopStock as Rec)["buyAmount"]) || 0,
            sellAmount: Number((rawTopStock as Rec)["sellAmount"]) || 0,
          }
        : null;
    const todayStats =
      rawToday && typeof rawToday === "object"
        ? {
            totalAmount: Number((rawToday as Rec)["totalAmount"]) || 0,
            buyAmount: Number((rawToday as Rec)["buyAmount"]) || 0,
            sellAmount: Number((rawToday as Rec)["sellAmount"]) || 0,
            topStock,
          }
        : null;

    return [
      {
        code,
        name,
        membershipType:
          typeof row["membershipType"] === "string" ? row["membershipType"] : "Unknown",
        phone: typeof row["phone"] === "string" && row["phone"].trim() ? row["phone"].trim() : null,
        tmsLink:
          typeof row["tmsLink"] === "string" && row["tmsLink"].trim()
            ? row["tmsLink"].trim()
            : null,
        branchCount: Math.max(0, Number(row["branchCount"]) || 0),
        provinces,
        districts: Array.isArray(row["districts"]) ? row["districts"].map(String) : [],
        isDealer: row["isDealer"] === "Y",
        active: row["activeStatus"] !== "I",
        logoUrl:
          typeof row["imageUrl"] === "string" && row["imageUrl"].trim() ? row["imageUrl"] : null,
        rating,
        thirtyDaysTurnover: Math.max(0, Number(row["thirtyDaysTurnover"]) || 0),
        latestTurnover: Math.max(0, Number(row["latestTurnover"]) || 0),
        todayStats,
      },
    ];
  });
}

interface Lookups {
  stocks: StockLookup;
  brokers: BrokerLookup;
}

/** Stock + broker id → name lookups for the floor sheet (cached daily). */
async function getFloorSheetLookups(): Promise<Lookups> {
  const [stocks, brokers] = await Promise.all([
    feedJson<StockLookup>(`${YONEPSE_BASE}${STOCKS_LOOKUP_URL}`, TTL.daily),
    feedJson<BrokerLookup>(`${YONEPSE_BASE}${BROKERS_LOOKUP_URL}`, TTL.daily),
  ]);
  return {
    stocks: stocks.data ?? {},
    brokers: brokers.data ?? {},
  };
}

/**
 * The raw daily shard for one date. The running (latest) day refreshes fast,
 * finished days are effectively immutable so they cache for hours.
 */
async function getDailySheet(date: string): Promise<{ sheet: DailySheet | null; stale: boolean }> {
  const manifest = await getFloorSheetDates();
  const isLatest = date === manifest.latestDate;
  const { data, stale } = await feedJson<DailySheet>(
    `${YONEPSE_BASE}${FLOOR_SHEET_DAILY_URL(date)}`,
    isLatest ? TTL.fast : TTL.daily,
  );
  if (!data || !Array.isArray(data.transactions)) return { sheet: null, stale: true };
  return { sheet: data, stale };
}

function hourBucket(time: TxRow[7]): string {
  if (typeof time === "string") {
    const match = /^(\d{1,2}):/.exec(time.trim());
    if (match) return `${match[1]!.padStart(2, "0")}:00`;
    return "-";
  }
  if (typeof time === "number" && Number.isFinite(time)) {
    // Fall back to treating numeric times as compact HHMMSS (e.g. 123045).
    const hour = Math.floor(time / 10_000);
    return hour >= 0 && hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : "-";
  }
  return "-";
}

function tradeTime(time: TxRow[7]): string | null {
  if (typeof time === "string" && time.trim()) return time.trim();
  if (typeof time === "number" && Number.isFinite(time)) {
    const hh = Math.floor(time / 10_000) % 24;
    const mm = Math.floor(time / 100) % 100;
    const ss = time % 100;
    return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
  }
  return null;
}

function brokerOf(id: number, brokers: BrokerLookup): FloorSheetTrade["buyer"] {
  if (!id || id === 0) return null;
  const code = String(id);
  return { code, name: brokers[code] ?? `Broker ${code}` };
}

function reconstruct(tx: TxRow, lookups: Lookups): FloorSheetTrade {
  const [contractId, stockId, buyerId, sellerId, qty, rate, amount, time] = tx;
  const stock = lookups.stocks[String(stockId)];
  return {
    contractId: String(contractId),
    symbol: stock?.symbol ?? `#${stockId}`,
    buyer: brokerOf(Number(buyerId), lookups.brokers),
    seller: brokerOf(Number(sellerId), lookups.brokers),
    quantity: Math.max(0, Number(qty) || 0),
    rate: Math.max(0, Number(rate) || 0),
    amount: Math.max(0, Number(amount) || 0),
    time: tradeTime(time),
  };
}

/** Per-hour, per-broker and per-scrip tallies while a day shard is scanned. */
interface BrokerAcc {
  name: string;
  trades: number;
  buyAmount: number;
  sellAmount: number;
  buyVolume: number;
  sellVolume: number;
  symbols: Map<string, { amount: number; trades: number }>;
}

interface SymbolAcc {
  name: string;
  trades: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  brokers: Set<string>;
}

function ensureBrokerAcc(map: Map<string, BrokerAcc>, id: number, lookups: Lookups): BrokerAcc {
  const code = String(id);
  let entry = map.get(code);
  if (!entry) {
    entry = {
      name: lookups.brokers[code] ?? `Broker ${code}`,
      trades: 0,
      buyAmount: 0,
      sellAmount: 0,
      buyVolume: 0,
      sellVolume: 0,
      symbols: new Map(),
    };
    map.set(code, entry);
  }
  return entry;
}

function ingest(
  hourly: Map<string, HourPoint>,
  brokerStats: Map<string, BrokerAcc>,
  symbolStats: Map<string, SymbolAcc>,
  tx: TxRow,
  lookups: Lookups,
  biggest: { top: { tx: TxRow; value: number }[] },
): void {
  const [, stockId, buyerId, sellerId, qty, rate, amount, time] = tx;
  const quantity = Math.max(0, Number(qty) || 0);
  const value = Math.max(0, Number(amount) || 0);
  if (quantity <= 0 && value <= 0) return;

  const hour = hourBucket(time);
  const hourEntry = hourly.get(hour) ?? { hour, trades: 0, amount: 0 };
  hourEntry.trades += 1;
  hourEntry.amount += value;
  hourly.set(hour, hourEntry);

  const stock = lookups.stocks[String(stockId)];
  const symbol = stock?.symbol ?? `#${stockId}`;
  const symbolEntry = symbolStats.get(symbol) ?? {
    name: stock?.name ?? "",
    trades: 0,
    volume: 0,
    amount: 0,
    high: 0,
    low: Number.POSITIVE_INFINITY,
    brokers: new Set<string>(),
  };
  symbolEntry.trades += 1;
  symbolEntry.volume += quantity;
  symbolEntry.amount += value;
  const rateNum = Number(rate) || 0;
  if (rateNum > symbolEntry.high) symbolEntry.high = rateNum;
  if (rateNum > 0 && rateNum < symbolEntry.low) symbolEntry.low = rateNum;
  if (buyerId) symbolEntry.brokers.add(String(buyerId));
  if (sellerId) symbolEntry.brokers.add(String(sellerId));
  symbolStats.set(symbol, symbolEntry);

  if (buyerId && buyerId !== 0) {
    const buyer = ensureBrokerAcc(brokerStats, Number(buyerId), lookups);
    buyer.trades += 1;
    buyer.buyAmount += value;
    buyer.buyVolume += quantity;
    const sym = buyer.symbols.get(symbol) ?? { amount: 0, trades: 0 };
    sym.amount += value;
    sym.trades += 1;
    buyer.symbols.set(symbol, sym);
  }
  if (sellerId && sellerId !== 0) {
    const seller = ensureBrokerAcc(brokerStats, Number(sellerId), lookups);
    seller.trades += 1;
    seller.sellAmount += value;
    seller.sellVolume += quantity;
    const sym = seller.symbols.get(symbol) ?? { amount: 0, trades: 0 };
    sym.amount += value;
    sym.trades += 1;
    seller.symbols.set(symbol, sym);
  }

  if (value > 0) {
    // Keep the 10 largest trades by amount; raw rows are reconstructed once
    // at the end so the hot loop stays allocation-light.
    const top = biggest.top;
    if (top.length < 10 || value > (top[top.length - 1]?.value ?? 0)) {
      top.push({ tx, value });
      top.sort((a, b) => b.value - a.value);
      if (top.length > 10) top.length = 10;
    }
  }
}

/**
 * Aggregate one trading day of floor-sheet data: market totals, hourly
 * activity, broker leaderboard (buy/sell/net turnover + top scrips) and scrip
 * leaderboard. Everything is computed server-side over the raw shard, which
 * can hold hundreds of thousands of transactions.
 */
export async function getFloorSheetDay(date: string): Promise<FloorSheetDay | null> {
  const [{ sheet, stale }, lookups] = await Promise.all([
    getDailySheet(date),
    getFloorSheetLookups(),
  ]);
  if (!sheet) return null;

  const hourly = new Map<string, HourPoint>();
  const brokerStats = new Map<string, BrokerAcc>();
  const symbolStats = new Map<string, SymbolAcc>();
  const biggest = { top: [] as { tx: TxRow; value: number }[] };
  for (const tx of sheet.transactions as TxRow[]) {
    ingest(hourly, brokerStats, symbolStats, tx, lookups, biggest);
  }

  const brokerLeaderboard: BrokerDayStat[] = [...brokerStats.entries()]
    .map(([code, entry]) => {
      const topSymbols = [...entry.symbols.entries()]
        .map(([sym, s]) => ({ symbol: sym, amount: s.amount, trades: s.trades }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);
      return {
        code,
        name: entry.name,
        trades: entry.trades,
        buyAmount: entry.buyAmount,
        sellAmount: entry.sellAmount,
        totalAmount: entry.buyAmount + entry.sellAmount,
        buyVolume: entry.buyVolume,
        sellVolume: entry.sellVolume,
        netAmount: entry.sellAmount - entry.buyAmount,
        topSymbols,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const symbolLeaderboard: SymbolDayStat[] = [...symbolStats.entries()]
    .map(([symbol, entry]) => ({
      symbol,
      name: entry.name,
      trades: entry.trades,
      volume: entry.volume,
      amount: entry.amount,
      avgPrice: entry.volume > 0 ? entry.amount / entry.volume : 0,
      high: entry.high,
      low: Number.isFinite(entry.low) ? entry.low : 0,
      brokers: entry.brokers.size,
    }))
    .sort((a, b) => b.amount - a.amount);

  const biggestTrades = biggest.top.map(({ tx }) => reconstruct(tx, lookups));

  return {
    date: sheet.date ?? date,
    dateTo: null,
    sessions: 1,
    stale,
    totalTrades: symbolLeaderboard.reduce((sum, s) => sum + s.trades, 0),
    totalVolume: symbolLeaderboard.reduce((sum, s) => sum + s.volume, 0),
    totalAmount: symbolLeaderboard.reduce((sum, s) => sum + s.amount, 0),
    scripsTraded: symbolLeaderboard.length,
    brokersActive: brokerLeaderboard.length,
    biggestTrade: biggestTrades[0] ?? null,
    biggestTrades,
    hourly: [...hourly.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    brokerLeaderboard,
    symbolLeaderboard,
  };
}

/** Small in-memory cache for range aggregates (day shards stay in feedJson's cache). */
const rangeCache = new Map<string, { value: FloorSheetDay; expires: number }>();
const RANGE_CACHE_TTL = 5 * 60_000;

/**
 * Aggregate a whole date range with one shared pass: the same maps accumulate
 * every day, so leaderboards, money flow, hourly buckets and biggest trades
 * all reflect the combined range — not just a single session.
 */
export async function getFloorSheetRange(from: string, to: string): Promise<FloorSheetDay | null> {
  const manifest = await getFloorSheetDates();
  const days = manifest.dates.filter((d) => d >= from && d <= to).slice(0, TRAIL_MAX_DAYS);
  if (days.length === 0) return null;

  const cacheKey = `range:${days[0]}:${days[days.length - 1]}`;
  const now = Date.now();
  const hit = rangeCache.get(cacheKey);
  if (hit && hit.expires > now) return hit.value;

  const lookups = await getFloorSheetLookups();
  const hourly = new Map<string, HourPoint>();
  const brokerStats = new Map<string, BrokerAcc>();
  const symbolStats = new Map<string, SymbolAcc>();
  const biggest = { top: [] as { tx: TxRow; value: number }[] };
  let stale = false;
  let scanned = 0;
  // Sequential days: each shard is scanned then dropped, memory stays flat.
  for (const day of days) {
    const { sheet, stale: dayStale } = await getDailySheet(day);
    stale = stale || dayStale;
    if (!sheet) continue;
    scanned += 1;
    for (const tx of sheet.transactions as TxRow[]) {
      ingest(hourly, brokerStats, symbolStats, tx, lookups, biggest);
    }
  }
  if (scanned === 0) return null;

  const brokerLeaderboard: BrokerDayStat[] = [...brokerStats.entries()]
    .map(([code, entry]) => {
      const topSymbols = [...entry.symbols.entries()]
        .map(([sym, s]) => ({ symbol: sym, amount: s.amount, trades: s.trades }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);
      return {
        code,
        name: entry.name,
        trades: entry.trades,
        buyAmount: entry.buyAmount,
        sellAmount: entry.sellAmount,
        totalAmount: entry.buyAmount + entry.sellAmount,
        buyVolume: entry.buyVolume,
        sellVolume: entry.sellVolume,
        netAmount: entry.sellAmount - entry.buyAmount,
        topSymbols,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const symbolLeaderboard: SymbolDayStat[] = [...symbolStats.entries()]
    .map(([symbol, entry]) => ({
      symbol,
      name: entry.name,
      trades: entry.trades,
      volume: entry.volume,
      amount: entry.amount,
      avgPrice: entry.volume > 0 ? entry.amount / entry.volume : 0,
      high: entry.high,
      low: Number.isFinite(entry.low) ? entry.low : 0,
      brokers: entry.brokers.size,
    }))
    .sort((a, b) => b.amount - a.amount);

  const biggestTrades = biggest.top.map(({ tx }) => reconstruct(tx, lookups));

  const value: FloorSheetDay = {
    date: days[0]!,
    dateTo: days.length > 1 ? days[days.length - 1]! : null,
    sessions: scanned,
    stale,
    totalTrades: symbolLeaderboard.reduce((sum, s) => sum + s.trades, 0),
    totalVolume: symbolLeaderboard.reduce((sum, s) => sum + s.volume, 0),
    totalAmount: symbolLeaderboard.reduce((sum, s) => sum + s.amount, 0),
    scripsTraded: symbolLeaderboard.length,
    brokersActive: brokerLeaderboard.length,
    biggestTrade: biggestTrades[0] ?? null,
    biggestTrades,
    hourly: [...hourly.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
    brokerLeaderboard,
    symbolLeaderboard,
  };
  rangeCache.set(cacheKey, { value, expires: now + RANGE_CACHE_TTL });
  return value;
}

/** Response cap for a trade trail so no response ever carries the whole day. */
const TRAIL_LIMIT = 250;
/** Hard cap on trail date ranges so one lookup can't fan out over the archive. */
const TRAIL_MAX_DAYS = 93;

/**
 * The trade trail for one broker (as buyer or seller), one scrip and/or one
 * contract across a date range — newest first, capped with the true totals
 * included. Days are scanned sequentially and dropped so memory stays flat no
 * matter how wide the range is.
 */
export async function getFloorSheetTrail(
  date: string,
  filter: {
    brokerCode?: string | null;
    symbol?: string | null;
    contractId?: string | null;
    dateTo?: string | null;
  },
  limit = TRAIL_LIMIT,
): Promise<FloorSheetTrail | null> {
  const manifest = await getFloorSheetDates();
  const available = manifest.dates.filter(
    (d) => d >= date && (!filter.dateTo || d <= filter.dateTo),
  );
  const days = available.slice(0, TRAIL_MAX_DAYS);
  if (days.length === 0) return null;
  const lookups = await getFloorSheetLookups();

  const brokerCode = filter.brokerCode ? String(filter.brokerCode) : null;
  const symbol = filter.symbol ? filter.symbol.toUpperCase() : null;
  const contractId = filter.contractId ? filter.contractId.trim() : null;
  const trades: FloorSheetTrade[] = [];
  const buyers = new Map<string, { name: string; amount: number; trades: number }>();
  const sellers = new Map<string, { name: string; amount: number; trades: number }>();
  let totalTrades = 0;
  let totalAmount = 0;
  let stale = false;

  // Newest day first so the kept slice is the most recent trading.
  for (let di = days.length - 1; di >= 0; di--) {
    const day = days[di]!;
    const { sheet, stale: dayStale } = await getDailySheet(day);
    stale = stale || dayStale;
    if (!sheet) continue;
    for (let i = sheet.transactions.length - 1; i >= 0; i--) {
      const tx = sheet.transactions[i]! as TxRow;
      const [, stockId, buyerId, sellerId, , , amount] = tx;
      if (brokerCode) {
        const isParty = String(buyerId) === brokerCode || String(sellerId) === brokerCode;
        if (!isParty) continue;
      }
      const stock = lookups.stocks[String(stockId)];
      if (symbol && (!stock || stock.symbol.toUpperCase() !== symbol)) continue;
      if (contractId && String(tx[0]).trim() !== contractId) continue;
      totalTrades += 1;
      const value = Math.max(0, Number(amount) || 0);
      totalAmount += value;
      if (symbol) {
        const buyer = brokerOf(Number(buyerId), lookups.brokers);
        const seller = brokerOf(Number(sellerId), lookups.brokers);
        if (buyer) {
          const e = buyers.get(buyer.code) ?? { name: buyer.name, amount: 0, trades: 0 };
          e.amount += value;
          e.trades += 1;
          buyers.set(buyer.code, e);
        }
        if (seller) {
          const e = sellers.get(seller.code) ?? { name: seller.name, amount: 0, trades: 0 };
          e.amount += value;
          e.trades += 1;
          sellers.set(seller.code, e);
        }
      }
      if (trades.length < limit)
        trades.push({ ...reconstruct(tx, lookups), date: sheet.date ?? day });
    }
  }

  const rank = (m: Map<string, { name: string; amount: number; trades: number }>) =>
    [...m.entries()]
      .map(([code, e]) => ({ code, ...e }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

  return {
    date: days[0]!,
    dateTo: days.length > 1 ? days[days.length - 1]! : null,
    stale,
    totalTrades,
    totalAmount,
    truncated: totalTrades > trades.length,
    trades,
    topBuyers: symbol ? rank(buyers) : [],
    topSellers: symbol ? rank(sellers) : [],
  };
}
