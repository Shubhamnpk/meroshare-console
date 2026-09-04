import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  checkCanApply,
  deleteIpoApplication,
  editIpoApplication,
  fetchApplicableIssues,
  fetchAppliedDetail,
  fetchApplicationReports,
  fetchCurrentIssues,
  fetchIssueManagerDetail,
  fetchOldApplicationReports,
  requireAuth,
  submitIpoApplication,
} from "./api.server";
import { DEMO_APPLICATIONS } from "./demo-data";
import type { ApplicableIssue, ApplicationReportItem, JsonRecord } from "./types";

export const getApplicableIssues = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicableIssue[]> => {
    const auth = await requireAuth();
    if (auth.demo) return [];
    const res = await fetchApplicableIssues(auth);
    return res.object ?? [];
  },
);

export const getCurrentIssues = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicableIssue[]> => {
    const auth = await requireAuth();
    if (auth.demo) return [];
    try {
      const res = await fetchCurrentIssues(auth);
      if (res.object?.length) return res.object;
    } catch {
      // fall through to the applicable list
    }
    const fallback = await fetchApplicableIssues(auth);
    return fallback.object ?? [];
  },
);

export const getApplicationReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicationReportItem[]> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_APPLICATIONS;
    const res = await fetchApplicationReports(auth);
    return res.object ?? [];
  },
);

export const getOldApplicationReports = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApplicationReportItem[]> => {
    const auth = await requireAuth();
    if (auth.demo) return [];
    const res = await fetchOldApplicationReports(auth);
    return res.object ?? [];
  },
);

export const getIssueDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ companyShareId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> =>
    fetchIssueManagerDetail(await requireAuth(), data.companyShareId),
  );

export const getAppliedDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
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

export const getApplicationDetails = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        items: z
          .array(z.object({ formId: z.number().int().positive(), old: z.boolean().optional() }))
          .min(1)
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<(JsonRecord | null)[]> => {
    const auth = await requireAuth();
    // CDSC rate-limits aggressively; fetch in small chunks with a pause so a
    // burst of detail calls can't 429 the whole batch (and stall every row).
    const results: (JsonRecord | null)[] = [];
    const chunkSize = 6;
    for (let i = 0; i < data.items.length; i += chunkSize) {
      const chunk = data.items.slice(i, i + chunkSize);
      const settled = await Promise.allSettled(
        chunk.map((it) => fetchAppliedDetail(auth, it.formId, it.old === true)),
      );
      results.push(...settled.map((r) => (r.status === "fulfilled" ? r.value : null)));
      if (i + chunkSize < data.items.length) await new Promise((r) => setTimeout(r, 250));
    }
    return results;
  });

export const canApplyToIssue = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
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
  .validator((input: unknown) => applySchema.parse(input))
  .handler(async ({ data }): Promise<JsonRecord> =>
    submitIpoApplication(await requireAuth(), data),
  );

export const editIpoApply = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    applySchema.extend({ applicantFormId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data }): Promise<JsonRecord> => editIpoApplication(await requireAuth(), data));

export const deleteIpoApply = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
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
