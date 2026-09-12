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
    const opts: { page?: number; size?: number } = {};
    if (data.page !== undefined) opts.page = data.page;
    if (data.size !== undefined) opts.size = data.size;
    const res = await fetchEdisTransferActive(await requireAuth(), opts);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const getEdisTransferDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ transferId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }): Promise<EdisTransferDetail> => {
    return fetchEdisTransferDetail(await requireAuth(), data.transferId);
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
    const opts: { page?: number; size?: number } = {};
    if (data.page !== undefined) opts.page = data.page;
    if (data.size !== undefined) opts.size = data.size;
    const res = await fetchEdisNodel(await requireAuth(), opts);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const getEdisStatuses = createServerFn({ method: "GET" }).handler(
  async (): Promise<EdisStatusItem[]> => {
    return fetchEdisStatuses(await requireAuth());
  },
);

export const getEdisDisclaimer = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    return fetchEdisDisclaimer(await requireAuth());
  },
);

export const checkEdisPoolAccountFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    return checkEdisPoolAccount(await requireAuth());
  },
);

export const checkEdisWaccLeftFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<boolean> => {
    return checkEdisWaccLeft(await requireAuth());
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
    return checkEdisTransfer(await requireAuth(), data.requests);
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
    return submitEdisTransfer(await requireAuth(), data.requests);
  });
