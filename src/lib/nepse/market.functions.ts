import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTransactions, requireAuth } from "../meroshare/api.server";
import type { AuthContext } from "../meroshare/session.server";
import type { TransactionItem } from "../meroshare/types";
import { toNumber } from "../format";
import {
  FEED_ATTRIBUTION,
  getChartSeries as fetchChartSeries,
  getDividends,
  getExchangeMessages,
  getFaceValues as fetchFaceValues,
  getIndexHistory,
  getIndices,
  getIpoArchive,
  getLivePrices,
  getMarketStatus,
  getMarketSummary,
  getPortfolioHistory,
  getScripDetail as fetchScripDetail,
  getScripFinancials as fetchScripFinancials,
  getSectorIndices,
  getTopStocks,
} from "./feed.server";
import { parseNptEpoch, type UnitSnapshot } from "./timeline";
import type {
  ChartSeries,
  DividendRow,
  ExchangeMessageRow,
  IpoArchiveRow,
  LivePrice,
  MarketSnapshot,
  PortfolioHistoryPoint,
  PricePoint,
  SectorIndex,
  ScripDetail,
  ScripFinancials,
  TopStocks,
} from "./types";

export interface PortfolioTimeline {
  points: PortfolioHistoryPoint[];
  snapshots: Record<string, UnitSnapshot[]>;
  /**
   * Scrips whose demat history could not be fetched from CDSC. These are
   * missing from the chart/list even though you hold them; surfaced here so
   * the UI can show it instead of silently producing an incomplete picture.
   */
  failed: { symbol: string; message: string }[];
}

export const MARKET_ATTRIBUTION = FEED_ATTRIBUTION;

export const getMarketSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketSnapshot> => {
    await requireAuth();
    const [status, indices, summary, live] = await Promise.all([
      getMarketStatus(),
      getIndices(),
      getMarketSummary(),
      getLivePrices(),
    ]);
    return {
      status,
      indices,
      summary,
      prices: live.prices,
      stale: live.stale,
      fetchedAt: new Date().toISOString(),
    };
  },
);

export const getMarketMovers = createServerFn({ method: "GET" }).handler(
  async (): Promise<TopStocks> => {
    await requireAuth();
    return getTopStocks();
  },
);

export const getMarketSectors = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorIndex[]> => {
    await requireAuth();
    return getSectorIndices();
  },
);

export const getScrip = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ symbol: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<LivePrice | null> => {
    await requireAuth();
    const { prices } = await getLivePrices();
    const symbol = data.symbol.toUpperCase();
    return prices.find((p) => p.symbol === symbol) ?? null;
  });

export const getProposedDividends = createServerFn({ method: "GET" }).handler(
  async (): Promise<DividendRow[]> => {
    await requireAuth();
    return getDividends();
  },
);

export const getIpoArchiveList = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ upcoming: IpoArchiveRow[]; past: IpoArchiveRow[] }> => {
    await requireAuth();
    return getIpoArchive();
  },
);

export const getIndexGraph = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ indexName: z.string().trim().min(1).max(48) }).parse(input),
  )
  .handler(async ({ data }): Promise<PricePoint[]> => {
    await requireAuth();
    return getIndexHistory(data.indexName);
  });

export const getScripDetail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ symbol: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<ScripDetail | null> => {
    await requireAuth();
    return fetchScripDetail(data.symbol);
  });

export const getScripFinancials = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ symbol: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<ScripFinancials | null> => {
    await requireAuth();
    return fetchScripFinancials(data.symbol);
  });

export const getScripFaceValues = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ symbols: z.array(z.string().trim().min(1).max(24)).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<Record<string, number>> => {
    await requireAuth();
    return fetchFaceValues(data.symbols);
  });

export const getNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExchangeMessageRow[]> => {
    await requireAuth();
    return getExchangeMessages();
  },
);

export const getPortfolioHistorySeries = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        holdings: z
          .array(z.object({ scrip: z.string().trim().min(1).max(24), units: z.number().min(0) }))
          .max(200),
        months: z.number().int().min(0).max(120),
        granularity: z.enum(["day", "month", "year"]).default("day"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<PortfolioTimeline> => {
    const auth = await requireAuth();
    const wanted = new Set(data.holdings.map((h) => h.scrip.toUpperCase()));

    // One paged dump of the whole demat movement history (CDSC is rate-limit
    // sensitive, so a single stream beats one call per scrip). Retry once.
    let all: TransactionItem[] = [];
    let truncated = false;
    let fetchError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchAllTransactions(auth);
        all = res.rows;
        truncated = res.truncated;
        fetchError = null;
        break;
      } catch (err) {
        fetchError = err;
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    if (fetchError) {
      const message = errorMessageOf(fetchError);
      return {
        points: [],
        snapshots: {},
        failed: [...wanted].map((symbol) => ({ symbol, message })),
      };
    }

    // Slice the dump into ascending carry-forward timelines per held scrip.
    const snapshotsBySymbol = new Map<string, UnitSnapshot[]>();
    for (const t of all) {
      const key = String(t.script ?? "").toUpperCase();
      if (!wanted.has(key)) continue;
      const time = parseNptEpoch(t.transactionDate);
      if (time == null) continue;
      const snap: UnitSnapshot = {
        time,
        units: Math.max(0, toNumber(t.balanceAfterTransaction ?? t["balAfterTrans"])),
      };
      const arr = snapshotsBySymbol.get(key);
      if (arr) arr.push(snap);
      else snapshotsBySymbol.set(key, [snap]);
    }
    for (const arr of snapshotsBySymbol.values()) arr.sort((a, b) => a.time - b.time);

    const timelines = [...snapshotsBySymbol.entries()].map(([symbol, snapshots]) => ({
      symbol,
      snapshots,
    }));
    const failed = [...wanted]
      .filter((s) => !snapshotsBySymbol.has(s))
      .map((symbol) => ({
        symbol,
        message: truncated
          ? "Not enough transaction history fetched to reach this scrip."
          : "No transactions found for this scrip in your demat history.",
      }));

    const points = await getPortfolioHistory(timelines, data.granularity, data.months);
    return {
      points,
      snapshots: Object.fromEntries(timelines.map((t) => [t.symbol, t.snapshots])),
      failed,
    };
  });

const TRANSACTION_PAGE_SIZE = 500;
const MAX_TRANSACTION_PAGES = 12;

/** Page through the full demat movement history (newest-first), bounded. */
async function fetchAllTransactions(auth: AuthContext): Promise<{
  rows: TransactionItem[];
  truncated: boolean;
}> {
  const first = await fetchTransactions(auth, {
    symbol: null,
    page: 1,
    size: TRANSACTION_PAGE_SIZE,
  });
  const rows = [...(first.transactionView ?? [])];
  const total = first.totalItems ?? rows.length;
  const pages = Math.min(
    MAX_TRANSACTION_PAGES,
    Math.max(1, Math.ceil(total / TRANSACTION_PAGE_SIZE)),
  );
  for (let page = 2; page <= pages; page++) {
    const next = await fetchTransactions(auth, { symbol: null, page, size: TRANSACTION_PAGE_SIZE });
    rows.push(...(next.transactionView ?? []));
  }
  return { rows, truncated: rows.length < total };
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : typeof err === "string" && err.trim()
      ? err
      : "Request failed";
}

export const getChartData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z.string().trim().min(1).max(24),
        range: z
          .enum(["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"])
          .default("1Y"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ChartSeries> => {
    await requireAuth();
    return fetchChartSeries(data.symbol, data.range);
  });
