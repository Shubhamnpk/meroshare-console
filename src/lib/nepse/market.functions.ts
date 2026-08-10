import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "../meroshare/api.server";
import {
  FEED_ATTRIBUTION,
  getBrokers,
  getDividends,
  getIndices,
  getIpoArchive,
  getLivePrices,
  getMarketStatus,
  getMarketSummary,
  getMutualFunds,
  getSectorIndices,
  getTopStocks,
} from "./feed.server";
import type {
  BrokerRow,
  DividendRow,
  IpoArchiveRow,
  LivePrice,
  MarketSnapshot,
  MutualFundRow,
  SectorIndex,
  TopStocks,
} from "./types";

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

export const getFunds = createServerFn({ method: "GET" }).handler(
  async (): Promise<MutualFundRow[]> => {
    await requireAuth();
    return getMutualFunds();
  },
);

export const getBrokerDirectory = createServerFn({ method: "GET" }).handler(
  async (): Promise<BrokerRow[]> => {
    await requireAuth();
    return getBrokers();
  },
);

export const getIpoArchiveList = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ upcoming: IpoArchiveRow[]; past: IpoArchiveRow[] }> => {
    await requireAuth();
    return getIpoArchive();
  },
);
