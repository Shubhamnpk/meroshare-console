import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  changePassword,
  changePin,
  fetchActivityLog,
  fetchBankDetail,
  fetchBankList,
  fetchBankRequest,
  fetchMyDetail,
  fetchOwnDetail,
  readSession,
  requireAuth,
} from "./api.server";
import type {
  AccountBank,
  AccountProfile,
  ActivityLogItem,
  BankDetail,
  BankListItem,
  JsonRecord,
  OwnDetail,
} from "./types";

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

/**
 * ASBA bank request detail (CRN, branch, KYC state) used to prefill the apply
 * form. Falls back to an empty record when the bank has no linked request.
 */
export const getBankRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ bankCode: z.string().trim().min(1).max(32) }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => {
    try {
      return await fetchBankRequest(await requireAuth(), data.bankCode);
    } catch {
      return {};
    }
  });


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

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function pick(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(record[key]);
    if (value) return value;
  }
  return undefined;
}

/**
 * One round-trip snapshot of everything MeroShare exposes about the account:
 * ownDetail, the DP-side myDetail record, and every linked ASBA bank enriched
 * with its account/CRN/KYC state.
 */
export const getAccountProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccountProfile> => {
    const auth = await requireAuth();
    const session = await readSession();

    const [own, detail, bankList] = await Promise.all([
      fetchOwnDetail(auth).catch(() => ({}) as OwnDetail),
      fetchMyDetail(auth).catch(() => ({}) as JsonRecord),
      fetchBankList(auth).catch(() => [] as BankListItem[]),
    ]);

    const banks: AccountBank[] = await Promise.all(
      bankList.slice(0, 12).map(async (bank): Promise<AccountBank> => {
        const [bankDetail, bankRequest] = await Promise.all([
          fetchBankDetail(auth, bank.id).catch(() => ({}) as BankDetail),
          bank.code
            ? fetchBankRequest(auth, bank.code).catch(() => ({}) as JsonRecord)
            : Promise.resolve({} as JsonRecord),
        ]);
        const merged: JsonRecord = { ...bankRequest, ...(bankDetail as JsonRecord) };
        const out: AccountBank = {
          id: bank.id,
          code: bank.code ?? "",
          name: bank.name ?? "",
          raw: merged,
        };
        const accountNumber = pick(merged, ["accountNumber", "bankAccountNumber"]);
        if (accountNumber) out.accountNumber = accountNumber;
        const branchName = pick(merged, ["branchName", "branch"]);
        if (branchName) out.branchName = branchName;
        const crnNumber = pick(merged, ["crnNumber", "crn"]);
        if (crnNumber) out.crnNumber = crnNumber;
        const accountStatus = pick(merged, ["accountStatus", "statusName", "status"]);
        if (accountStatus) out.accountStatus = accountStatus;
        const kycStatus = pick(merged, ["kycStatus", "kycStatusName", "isKycApproved"]);
        if (kycStatus) out.kycStatus = kycStatus;
        return out;
      }),
    );

    return {
      own,
      detail,
      banks,
      session: {
        username: auth.username,
        demat: auth.demat,
        boid: auth.boid,
        clientCode: auth.clientCode,
        accountNumber: auth.accountNumber,
        expiresAt: session.expiresAt ?? null,
      },
    };
  },
);
