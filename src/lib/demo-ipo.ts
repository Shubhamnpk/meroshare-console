/**
 * Demo-mode IPO playground store (localStorage, this device only). Lets demo
 * users run the full apply → edit → withdraw flow against fake issues without
 * touching CDSC. Synthetic form ids are negative so they can never collide
 * with real CDSC applicantFormIds.
 */

import type { ApplicationReportItem, JsonRecord } from "./meroshare/types";

export interface DemoApplication {
  formId: number;
  companyShareId: number;
  scrip?: string;
  companyName?: string;
  shareTypeName?: string;
  shareGroupName?: string;
  appliedKitta: number;
  bankId?: number;
  accountNumber?: string;
  crnNumber?: string;
  statusName: string;
  appliedDate: string;
  amount: number;
}

const STORAGE_KEY = "ms-demo-ipo.v1";

/**
 * Synthetic demo ids live in 9000–9999 (see DEMO_APPLICABLE_ISSUES and
 * DEMO_APPLICATIONS), far from real CDSC companyShareIds.
 */
export function isDemoIssueId(companyShareId: number | null | undefined): boolean {
  return (
    typeof companyShareId === "number" && companyShareId >= 9000 && companyShareId < 10000
  );
}

export function loadDemoApplications(): DemoApplication[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<DemoApplication>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => typeof a?.companyShareId === "number" && typeof a?.formId === "number")
      .map((a): DemoApplication => {
        const app: DemoApplication = {
          formId: a.formId as number,
          companyShareId: a.companyShareId as number,
          appliedKitta: typeof a.appliedKitta === "number" ? a.appliedKitta : 10,
          statusName: typeof a.statusName === "string" ? a.statusName : "Applied",
          appliedDate:
            typeof a.appliedDate === "string" ? a.appliedDate : new Date().toISOString().slice(0, 10),
          amount: typeof a.amount === "number" ? a.amount : 0,
        };
        if (typeof a.scrip === "string") app.scrip = a.scrip;
        if (typeof a.companyName === "string") app.companyName = a.companyName;
        if (typeof a.shareTypeName === "string") app.shareTypeName = a.shareTypeName;
        if (typeof a.shareGroupName === "string") app.shareGroupName = a.shareGroupName;
        if (typeof a.bankId === "number") app.bankId = a.bankId;
        if (typeof a.accountNumber === "string") app.accountNumber = a.accountNumber;
        if (typeof a.crnNumber === "string") app.crnNumber = a.crnNumber;
        return app;
      });
  } catch {
    return [];
  }
}

function persist(apps: DemoApplication[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  } catch {
    // storage unavailable - demo flow still previews, just not remembered
  }
}

/** Record a new demo application (replaces any existing one for the issue). */
export function recordDemoApplication(input: {
  companyShareId: number;
  scrip?: string | undefined;
  companyName?: string | undefined;
  shareTypeName?: string | undefined;
  shareGroupName?: string | undefined;
  appliedKitta: number;
  bankId?: number | undefined;
  accountNumber?: string | undefined;
  crnNumber?: string | undefined;
  amount?: number | undefined;
}): DemoApplication {
  const apps = loadDemoApplications().filter((a) => a.companyShareId !== input.companyShareId);
  const app: DemoApplication = {
    formId: -Math.floor(Date.now() / 1000),
    companyShareId: input.companyShareId,
    appliedKitta: input.appliedKitta,
    statusName: "Applied",
    appliedDate: new Date().toISOString().slice(0, 10),
    amount: input.amount ?? 0,
  };
  if (input.scrip) app.scrip = input.scrip;
  if (input.companyName) app.companyName = input.companyName;
  if (input.shareTypeName) app.shareTypeName = input.shareTypeName;
  if (input.shareGroupName) app.shareGroupName = input.shareGroupName;
  if (input.bankId != null) app.bankId = input.bankId;
  if (input.accountNumber) app.accountNumber = input.accountNumber;
  if (input.crnNumber) app.crnNumber = input.crnNumber;
  apps.unshift(app);
  persist(apps);
  return app;
}

/** Patch a demo application (edit flow). Returns false when not found. */
export function updateDemoApplication(
  formId: number,
  patch: Partial<Pick<DemoApplication, "appliedKitta" | "bankId" | "accountNumber" | "crnNumber" | "amount">>,
): boolean {
  const apps = loadDemoApplications();
  const idx = apps.findIndex((a) => a.formId === formId);
  if (idx < 0) return false;
  apps[idx] = { ...apps[idx]!, ...patch };
  persist(apps);
  return true;
}

/** Withdraw a demo application. Returns false when not found. */
export function removeDemoApplication(formId: number): boolean {
  const apps = loadDemoApplications();
  const next = apps.filter((a) => a.formId !== formId);
  if (next.length === apps.length) return false;
  persist(next);
  return true;
}

export function toReportItem(app: DemoApplication): ApplicationReportItem {
  const item: ApplicationReportItem = {
    companyShareId: app.companyShareId,
    applicantFormId: app.formId,
    statusName: app.statusName,
  };
  if (app.scrip) item.scrip = app.scrip;
  if (app.companyName) item.companyName = app.companyName;
  if (app.shareTypeName) item.shareTypeName = app.shareTypeName;
  if (app.shareGroupName) item.shareGroupName = app.shareGroupName;
  return item;
}

/** Synthetic detail record shaped like a CDSC applied-detail row. */
export function toDetailRecord(app: DemoApplication): JsonRecord {
  return {
    applicantFormId: app.formId,
    companyShareId: app.companyShareId,
    appliedKitta: app.appliedKitta,
    receivedKitta: 0,
    amount: app.amount,
    bankId: app.bankId ?? null,
    accountNumber: app.accountNumber ?? "",
    crnNumber: app.crnNumber ?? "",
    statusName: app.statusName,
    appliedDate: app.appliedDate,
  } as unknown as JsonRecord;
}
