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
import { DEMO_USER, DEMO_BANKS, DEMO_BANK_DETAIL, DEMO_ACTIVITY_LOG } from "./demo-data";
import type {
  AccountBank,
  AccountProfile,
  ActivityLogItem,
  BankDetail,
  BankListItem,
  JsonRecord,
  OwnDetail,
} from "./types";
import { pick } from "./profile.server";

export const getMyDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<JsonRecord> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_USER as unknown as JsonRecord;
    return fetchMyDetail(auth);
  },
);

export const getBanks = createServerFn({ method: "GET" }).handler(
  async (): Promise<BankListItem[]> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_BANKS;
    return fetchBankList(auth);
  },
);

export const getBankDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ bankId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }): Promise<BankDetail> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_BANK_DETAIL;
    return fetchBankDetail(auth, data.bankId);
  });

/**
 * ASBA bank request detail (CRN, branch, KYC state) used to prefill the apply
 * form. Falls back to an empty record when the bank has no linked request.
 */
export const getBankRequest = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
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
  .validator((input: unknown) =>
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
    const auth = await requireAuth();
    if (auth.demo) return { items: DEMO_ACTIVITY_LOG, total: DEMO_ACTIVITY_LOG.length };
    const res = await fetchActivityLog(auth, data);
    return { items: res.object ?? [], total: res.totalCount ?? 0 };
  });

export const updatePassword = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        oldPassword: z.string().min(1).max(128),
        newPassword: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => changePassword(await requireAuth(), data));

export const updatePin = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        oldPin: z.string().trim().min(4).max(8),
        newPin: z
          .string()
          .trim()
          .regex(/^\d{4}$/),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => changePin(await requireAuth(), data));

/**
 * One round-trip snapshot of everything MeroShare exposes about the account:
 * ownDetail, the DP-side myDetail record, and every linked ASBA bank enriched
 * with its account/CRN/KYC state.
 */
export const getAccountProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccountProfile> => {
    const auth = await requireAuth();
    const session = await readSession();

    if (auth.demo) {
      return {
        own: DEMO_USER,
        detail: DEMO_USER as unknown as JsonRecord,
        banks: DEMO_BANKS.map((b) => {
          const bank: AccountBank = {
            id: b.id,
            code: b.code,
            name: b.name,
            raw: DEMO_BANK_DETAIL as unknown as JsonRecord,
            accountStatus: "Active",
            kycStatus: "Approved",
          };
          if (DEMO_BANK_DETAIL.accountNumber) bank.accountNumber = DEMO_BANK_DETAIL.accountNumber;
          if (DEMO_BANK_DETAIL.branchName) bank.branchName = DEMO_BANK_DETAIL.branchName;
          if (DEMO_BANK_DETAIL.crnNumber) bank.crnNumber = DEMO_BANK_DETAIL.crnNumber;
          return bank;
        }),
        session: {
          username: auth.username,
          demat: auth.demat,
          boid: auth.boid,
          clientCode: auth.clientCode,
          accountNumber: auth.accountNumber,
          expiresAt: session.expiresAt ?? null,
        },
      };
    }

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
