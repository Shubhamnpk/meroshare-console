import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchHoldingSymbols,
  fetchMyShares,
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
} from "./types";

export const getOwnDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnDetail> => fetchOwnDetail(await requireAuth()),
);

export const getPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioResponse> => fetchPortfolio(await requireAuth()),
);

export const getMyShares = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyShareItem[]> => {
    const res = await fetchMyShares(await requireAuth());
    return res.meroShareMyShare ?? [];
  },
);

export const getHoldingSymbols = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => fetchHoldingSymbols(await requireAuth()),
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
    return { items: res.meroShareMyTransaction ?? [], total: res.totalItems ?? 0 };
  });

export const getWaccPending = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scrip: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<PurchaseSourceItem[]> =>
    fetchWaccPending(await requireAuth(), data.scrip),
  );

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
