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
import type {
  MyShareItem,
  OwnDetail,
  PortfolioResponse,
  PurchaseSourceItem,
  TransactionItem,
  JsonRecord,
  WaccSearchResponse,
} from "./types";

export const getOwnDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnDetail> => fetchOwnDetail(await requireAuth()),
);

export const getPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioResponse> => fetchPortfolio(await requireAuth()),
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
