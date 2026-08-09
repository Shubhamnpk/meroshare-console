import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  changePassword,
  changePin,
  fetchActivityLog,
  fetchBankDetail,
  fetchBankList,
  fetchMyDetail,
  requireAuth,
} from "./api.server";
import type { ActivityLogItem, BankDetail, BankListItem, JsonRecord } from "./types";

export const getMyDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<JsonRecord> => fetchMyDetail(await requireAuth()),
);

export const getBanks = createServerFn({ method: "GET" }).handler(
  async (): Promise<BankListItem[]> => fetchBankList(await requireAuth()),
);

export const getBankDetail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ bankId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<BankDetail> =>
    fetchBankDetail(await requireAuth(), data.bankId),
  );

export const getActivityLog = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        page: z.number().int().min(1).max(200).optional(),
        size: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ items: ActivityLogItem[]; total: number }> => {
    const res = await fetchActivityLog(await requireAuth(), data);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        oldPassword: z.string().min(1).max(128),
        newPassword: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    changePassword(await requireAuth(), data),
  );

export const updatePin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        oldPin: z.string().trim().min(4).max(8),
        newPin: z.string().trim().regex(/^\d{4}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => changePin(await requireAuth(), data));
