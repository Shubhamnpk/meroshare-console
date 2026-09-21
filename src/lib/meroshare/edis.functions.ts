import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./api.server";
import {
  checkEdisPoolAccount,
  checkEdisTransfer,
  checkEdisWaccLeft,
  fetchEdisDisclaimer,
  fetchEdisNodel,
  fetchEdisStatuses,
  fetchEdisTransferActive,
  fetchEdisTransferDetail,
  submitEdisTransfer,
} from "./api.server";
import type {
  EdisNodelItem,
  EdisStatusItem,
  EdisTransferDetail,
  EdisTransferItem,
  JsonRecord,
} from "./types";

export const getEdisTransferActive = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(200).optional(),
        size: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ items: EdisTransferItem[]; total: number }> => {
    const auth = await requireAuth();
    if (auth.demo) return { items: [], total: 0 };
    const opts: { page?: number; size?: number } = {};
    if (data.page !== undefined) opts.page = data.page;
    if (data.size !== undefined) opts.size = data.size;
    const res = await fetchEdisTransferActive(auth, opts);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const getEdisTransferDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ transferId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }): Promise<EdisTransferDetail> => {
    const auth = await requireAuth();
    if (auth.demo) throw new Error("EDIS detail is not available in demo mode.");
    return fetchEdisTransferDetail(auth, data.transferId);
  });

export const getEdisNodel = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(200).optional(),
        size: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ items: EdisNodelItem[]; total: number }> => {
    const auth = await requireAuth();
    if (auth.demo) return { items: [], total: 0 };
    const opts: { page?: number; size?: number } = {};
    if (data.page !== undefined) opts.page = data.page;
    if (data.size !== undefined) opts.size = data.size;
    const res = await fetchEdisNodel(auth, opts);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const getEdisStatuses = createServerFn({ method: "GET" }).handler(
  async (): Promise<EdisStatusItem[]> => {
    const auth = await requireAuth();
    if (auth.demo) return [];
    return fetchEdisStatuses(auth);
  },
);

export const getEdisDisclaimer = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    const auth = await requireAuth();
    if (auth.demo) return "EDIS is not available in demo mode.";
    return fetchEdisDisclaimer(auth);
  },
);

export const checkEdisPoolAccountFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    const auth = await requireAuth();
    if (auth.demo) return false;
    return checkEdisPoolAccount(auth);
  },
);

export const checkEdisWaccLeftFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    const auth = await requireAuth();
    if (auth.demo) return false;
    return checkEdisWaccLeft(auth);
  },
);

export const checkEdisTransferFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        requests: z.array(z.record(z.unknown())).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord[]> => {
    const auth = await requireAuth();
    if (auth.demo) throw new Error("EDIS check is not available in demo mode.");
    return checkEdisTransfer(auth, data.requests);
  });

export const submitEdisTransferFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        requests: z.array(z.record(z.unknown())).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => {
    const auth = await requireAuth();
    if (auth.demo) throw new Error("EDIS submit is not available in demo mode.");
    return submitEdisTransfer(auth, data.requests);
  });
