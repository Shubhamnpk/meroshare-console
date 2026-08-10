import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchHoldingSymbols,
  fetchOwnDetail,
  fetchPortfolio,
  fetchTransactions,
  fetchWaccCalculated,
  fetchWaccPending,
  requireAuth,
  submitWacc,
} from "./api.server";
import { getMarketStatus, getPriceMap } from "../nepse/feed.server";
import type { EnrichedHolding, EnrichedPortfolio } from "../nepse/types";
import type {
  MyShareItem,
  OwnDetail,
  PortfolioResponse,
  PurchaseSourceItem,
  TransactionItem,
  JsonRecord,
  WaccSearchResponse,
} from "./types";

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export const getOwnDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnDetail> => fetchOwnDetail(await requireAuth()),
);

export const getPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioResponse> => fetchPortfolio(await requireAuth()),
);

/**
 * MeroShare holdings joined to live NEPSE prices on the server, so the client
 * receives one already-valued list. Scrips the feed doesn't know keep the
 * price MeroShare itself returned.
 */
export const getEnrichedPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<EnrichedPortfolio> => {
    const auth = await requireAuth();
    const [portfolio, prices, status] = await Promise.all([
      fetchPortfolio(auth),
      getPriceMap(),
      getMarketStatus(),
    ]);

    const holdings: EnrichedHolding[] = (portfolio.meroShareMyPortfolio ?? []).map((item) => {
      const scrip = String(item.script ?? item.scrip ?? "").toUpperCase();
      const units = Math.max(0, toNum(item.currentBalance));
      const live = prices.map.get(scrip);
      const fallbackLtp = toNum(item.lastTransactionPrice);
      const fallbackPrev = toNum(item.previousClosingPrice);
      const ltp = live && live.ltp > 0 ? live.ltp : fallbackLtp;
      const previousClose = live && live.previousClose > 0 ? live.previousClose : fallbackPrev;
      const value = ltp * units;
      const previousValue = previousClose * units;
      return {
        scrip,
        description: String(item["scriptDesc"] ?? ""),
        units,
        ltp,
        previousClose,
        change: ltp - previousClose,
        percentChange: previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0,
        value,
        previousValue,
        dayChange: value - previousValue,
        high: live?.high ?? 0,
        low: live?.low ?? 0,
        volume: live?.volume ?? 0,
        sector: live?.sector ?? null,
        name: live?.name ?? String(item["scriptDesc"] ?? scrip),
        live: Boolean(live),
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const totalPreviousValue = holdings.reduce((sum, h) => sum + h.previousValue, 0);
    const bySector = new Map<string, number>();
    for (const h of holdings) {
      const key = h.sector ?? "Unclassified";
      bySector.set(key, (bySector.get(key) ?? 0) + h.value);
    }

    return {
      holdings,
      totalValue,
      totalPreviousValue,
      dayChange: totalValue - totalPreviousValue,
      dayChangePercent:
        totalPreviousValue > 0 ? ((totalValue - totalPreviousValue) / totalPreviousValue) * 100 : 0,
      totalUnits: holdings.reduce((sum, h) => sum + h.units, 0),
      liveCount: holdings.filter((h) => h.live).length,
      marketStale: prices.stale,
      status,
      sectors: [...bySector.entries()]
        .map(([sector, value]) => ({
          sector,
          value,
          weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value),
    };
  },
);


export const getMyShares = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyShareItem[]> => {
    const auth = await requireAuth();
    const res = await fetchPortfolio(auth);
    return (res.meroShareMyPortfolio ?? []).map(
      (p) =>
        ({
          script: p.script ?? p.scrip,
          scriptDesc: p["scriptDesc"],
          currentBalance: p.currentBalance,
          lastTransactionPrice: p["lastTransactionPrice"],
          previousClosingPrice: p["previousClosingPrice"],
          valueAsOfLastTransactionPrice: p["valueAsOfLastTransactionPrice"],
          valueAsOfPreviousClosingPrice: p["valueAsOfPreviousClosingPrice"],
          valueOfLastTransPrice: p["valueOfLastTransPrice"],
          valueOfPrevClosingPrice: p["valueOfPrevClosingPrice"],
        }) as MyShareItem,
    );
  },
);

export const getHoldingSymbols = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const auth = await requireAuth();
    const raw = await fetchHoldingSymbols(auth);
    if (Array.isArray(raw)) {
      const symbols = raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (symbols.length > 0) return symbols;
    }
    const portfolio = await fetchPortfolio(auth);
    return (portfolio.meroShareMyPortfolio ?? [])
      .map((p) => p.script ?? p.scrip)
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  },
);

export const getTransactions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        symbol: z.string().trim().max(24).nullable().optional(),
        page: z.number().int().min(1).max(500).optional(),
        size: z.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: TransactionItem[]; total: number }> => {
    const res = await fetchTransactions(await requireAuth(), data);
    const items: TransactionItem[] = (res.transactionView ?? []).map(
      (t) =>
        ({
          script: t.script,
          transactionDate: t.transactionDate,
          historyDescription: t.historyDescription ?? t["historyDesc"],
          creditQuantity: t.creditQuantity ?? t["creditQty"],
          debitQuantity: t.debitQuantity ?? t["debitQty"],
          balanceAfterTransaction: t.balanceAfterTransaction ?? t["balAfterTrans"],
        }) as TransactionItem,
    );
    return { items, total: res.totalItems ?? 0 };
  });

export const getWaccPending = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scrip: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<WaccSearchResponse> => {
    const res = await fetchWaccPending(await requireAuth(), data.scrip);
    return {
      waccUpdateResponse: Array.isArray(res.waccUpdateResponse) ? res.waccUpdateResponse : [],
      waccSummaryResponse: Array.isArray(res.waccSummaryResponse) ? res.waccSummaryResponse : [],
      viewSummary: res.viewSummary === true,
      ...(res.success !== undefined ? { success: res.success } : {}),
      ...(res.message !== undefined ? { message: res.message } : {}),
    };
  });

export const getWaccCalculated = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scrip: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    fetchWaccCalculated(await requireAuth(), data.scrip),
  );

export const calculateWacc = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ rows: z.array(z.record(z.unknown())).min(1) }).parse(input),
  )
  .handler(async ({ data }) => submitWacc(await requireAuth(), data.rows as PurchaseSourceItem[]));
