import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  checkCanApply,
  checkIpoResult,
  deleteIpoApplication,
  editIpoApplication,
  fetchApplicableIssues,
  fetchAppliedDetail,
  fetchApplicationReports,
  fetchIpoResultCompanies,
  fetchIssueManagerDetail,
  fetchOldApplicationReports,
  requireAuth,
  submitIpoApplication,
} from "./api.server";
import type {
  ApplicableIssue,
  ApplicationReportItem,
  IpoResultCompany,
  JsonRecord,
} from "./types";

export const getApplicableIssues = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicableIssue[]> => {
    const res = await fetchApplicableIssues(await requireAuth());
    return res.object ?? [];
  },
);

export const getApplicationReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicationReportItem[]> => {
    const res = await fetchApplicationReports(await requireAuth());
    return res.object ?? [];
  },
);

export const getOldApplicationReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicationReportItem[]> => {
    const res = await fetchOldApplicationReports(await requireAuth());
    return res.object ?? [];
  },
);

export const getIssueDetail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ companyShareId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    fetchIssueManagerDetail(await requireAuth(), data.companyShareId),
  );

export const getAppliedDetail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        formId: z.number().int().positive(),
        old: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    fetchAppliedDetail(await requireAuth(), data.formId, data.old === true),
  );

export const canApplyToIssue = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ companyShareId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    checkCanApply(await requireAuth(), data.companyShareId),
  );

const applySchema = z.object({
  companyShareId: z.number().int().positive(),
  appliedKitta: z.number().int().min(1).max(1000000),
  bankId: z.number().int().positive(),
  accountBranchId: z.number().int().positive(),
  accountNumber: z.string().trim().min(1).max(40),
  customerId: z.number().int().positive(),
  crnNumber: z.string().trim().min(1).max(40),
  transactionPIN: z.string().trim().min(4).max(8),
});

export const applyForIpo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => applySchema.parse(input))
  .handler(async ({ data }): Promise<JsonRecord> =>
    submitIpoApplication(await requireAuth(), data),
  );

export const editIpoApply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    applySchema.extend({ applicantFormId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    editIpoApplication(await requireAuth(), data),
  );

export const deleteIpoApply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        applicantFormId: z.number().int().positive(),
        companyShareId: z.number().int().positive(),
        transactionPIN: z.string().trim().min(4).max(8),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    deleteIpoApplication(await requireAuth(), data),
  );

export const getIpoResultCompanies = createServerFn({ method: "GET" }).handler(
  async (): Promise<IpoResultCompany[]> => {
    await requireAuth();
    const res = await fetchIpoResultCompanies();
    return res.body ?? [];
  },
);

export const getIpoResult = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ companyShareId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => {
    const auth = await requireAuth();
    return checkIpoResult(auth.demat, data.companyShareId);
  });
