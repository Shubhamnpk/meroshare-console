// Server-only MeroShare operations. Every function here talks to CDSC with the
// caller's own bearer token, taken from the encrypted session cookie.
import { CDSC_URLS, cdscRequest } from "./cdsc.server";
import { requireAuth, type AuthContext } from "./session.server";
import type {
  ActivityLogItem,
  ApplicableIssue,
  ApplicationReportItem,
  BankDetail,
  BankListItem,
  Capital,
  IpoResultCompany,
  MyShareItem,
  OwnDetail,
  Paged,
  PortfolioResponse,
  PurchaseSourceItem,
  TransactionItem,
  JsonRecord,
  WaccSearchResponse,
} from "./types";
export async function fetchCapitals(): Promise<Capital[]> {
  return cdscRequest<Capital[]>(CDSC_URLS.capitals);
}

export async function fetchOwnDetail(auth: AuthContext): Promise<OwnDetail> {
  return cdscRequest<OwnDetail>(CDSC_URLS.ownDetail, { token: auth.token });
}

export async function fetchMyDetail(auth: AuthContext): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.myDetail(auth.demat), { token: auth.token });
}

export async function fetchBankList(auth: AuthContext): Promise<BankListItem[]> {
  return cdscRequest<BankListItem[]>(CDSC_URLS.bankList, { token: auth.token });
}

export async function fetchBankDetail(
  auth: AuthContext,
  bankId: number | string,
): Promise<BankDetail> {
  return cdscRequest<BankDetail>(CDSC_URLS.bankDetail(bankId), { token: auth.token });
}

export async function fetchHoldingSymbols(auth: AuthContext): Promise<unknown> {
  return cdscRequest<unknown>(CDSC_URLS.holdingSymbols, { token: auth.token });
}

export async function fetchPortfolio(auth: AuthContext): Promise<PortfolioResponse> {
  return cdscRequest<PortfolioResponse>(CDSC_URLS.myPortfolio, {
    method: "POST",
    token: auth.token,
    body: {
      sortBy: "script",
      demat: [String(auth.demat)],
      clientCode: auth.clientCode,
      page: 1,
      size: 500,
      sortAsc: true,
    },
  });
}

export async function fetchTransactions(
  auth: AuthContext,
  input: { symbol?: string | null | undefined; page?: number | undefined; size?: number | undefined },
): Promise<{ transactionView?: TransactionItem[]; totalItems?: number }> {
  const symbol = input.symbol ?? null;
  return cdscRequest<JsonRecord>(CDSC_URLS.transactions, {
    method: "POST",
    token: auth.token,
    body: {
      boid: String(auth.demat),
      clientCode: String(auth.clientCode),
      script: symbol,
      fromDate: null,
      toDate: null,
      requestTypeScript: symbol !== null,
      page: input.page ?? 1,
      size: input.size ?? 200,
    },
  });
}

export async function fetchApplicableIssues(
  auth: AuthContext,
): Promise<Paged<ApplicableIssue>> {
  return cdscRequest<Paged<ApplicableIssue>>(CDSC_URLS.applicableIssues, {
    method: "POST",
    token: auth.token,
    body: {
      filterFieldParams: [
        { key: "companyIssue.companyISIN.script", alias: "Scrip" },
        { key: "companyIssue.companyISIN.company.name", alias: "Company Name" },
        { key: "companyIssue.assignedToClient.name", value: "", alias: "Issue Manager" },
      ],
      page: 1,
      size: 50,
      searchRoleViewConstants: "VIEW_APPLICABLE_SHARE",
      filterDateParams: [
        { key: "minIssueOpenDate", condition: "", alias: "", value: "" },
        { key: "maxIssueCloseDate", condition: "", alias: "", value: "" },
      ],
    },
  });
}

export async function checkCanApply(
  auth: AuthContext,
  companyShareId: number,
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.canApply(companyShareId, auth.demat), { token: auth.token });
}

export async function fetchApplicationReports(
  auth: AuthContext,
  input: { page?: number | undefined; size?: number | undefined } = {},
): Promise<Paged<ApplicationReportItem>> {
  return cdscRequest<Paged<ApplicationReportItem>>(CDSC_URLS.applicationReports, {
    method: "POST",
    token: auth.token,
    body: {
      filterFieldParams: [
        { key: "companyShare.companyIssue.companyISIN.script", alias: "Scrip" },
        { key: "companyShare.companyIssue.companyISIN.company.name", alias: "Company Name" },
      ],
      page: input.page ?? 1,
      size: input.size ?? 200,
      searchRoleViewConstants: "VIEW_APPLICANT_FORM_COMPLETE",
      filterDateParams: [
        { key: "appliedDate", condition: "", alias: "", value: "" },
        { key: "appliedDate", condition: "", alias: "", value: "" },
      ],
    },
  });
}

export async function fetchOldApplicationReports(
  auth: AuthContext,
  input: { page?: number | undefined; size?: number | undefined } = {},
): Promise<Paged<ApplicationReportItem>> {
  return cdscRequest<Paged<ApplicationReportItem>>(CDSC_URLS.oldApplicationReports, {
    method: "POST",
    token: auth.token,
    body: {
      filterFieldParams: [
        { key: "companyShare.companyIssue.companyISIN.script", alias: "Scrip" },
        { key: "companyShare.companyIssue.companyISIN.company.name", alias: "Company Name" },
      ],
      page: input.page ?? 1,
      size: input.size ?? 200,
      searchRoleViewConstants: "VIEW",
      filterDateParams: [
        { key: "appliedDate", condition: "", alias: "", value: "" },
        { key: "appliedDate", condition: "", alias: "", value: "" },
      ],
    },
  });
}

export async function fetchIssueManagerDetail(
  auth: AuthContext,
  companyShareId: number,
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.issueManagerDetail(companyShareId), { token: auth.token });
}

export async function fetchAppliedDetail(
  auth: AuthContext,
  formId: number,
  old = false,
): Promise<JsonRecord> {
  const url = old ? CDSC_URLS.oldAppliedDetail(formId) : CDSC_URLS.appliedDetail(formId);
  return cdscRequest<JsonRecord>(url, { token: auth.token });
}

export interface ApplyIpoInput {
  companyShareId: number;
  appliedKitta: number;
  bankId: number;
  accountBranchId: number;
  accountNumber: string;
  customerId: number;
  crnNumber: string;
  transactionPIN: string;
}

export async function submitIpoApplication(auth: AuthContext, input: ApplyIpoInput): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.applyShare, {
    method: "POST",
    token: auth.token,
    body: {
      accountBranchId: input.accountBranchId,
      accountNumber: input.accountNumber,
      appliedKitta: String(input.appliedKitta),
      bankId: input.bankId,
      boid: auth.boid,
      companyShareId: String(input.companyShareId),
      crnNumber: input.crnNumber,
      customerId: input.customerId,
      demat: auth.demat,
      transactionPIN: input.transactionPIN,
    },
  });
}

export async function editIpoApplication(
  auth: AuthContext,
  input: ApplyIpoInput & { applicantFormId: number },
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.applyShare, {
    method: "PUT",
    token: auth.token,
    body: {
      applicantFormId: input.applicantFormId,
      accountBranchId: input.accountBranchId,
      accountNumber: input.accountNumber,
      appliedKitta: String(input.appliedKitta),
      bankId: input.bankId,
      boid: auth.boid,
      companyShareId: String(input.companyShareId),
      crnNumber: input.crnNumber,
      customerId: input.customerId,
      demat: auth.demat,
      transactionPIN: input.transactionPIN,
    },
  });
}

export async function deleteIpoApplication(
  auth: AuthContext,
  input: { applicantFormId: number; companyShareId: number; transactionPIN: string },
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.applyShare, {
    method: "DELETE",
    token: auth.token,
    body: {
      applicantFormId: input.applicantFormId,
      companyShareId: String(input.companyShareId),
      demat: auth.demat,
      boid: auth.boid,
      transactionPIN: input.transactionPIN,
    },
  });
}

export async function fetchActivityLog(
  auth: AuthContext,
  input: { startDate: string; endDate: string; page?: number | undefined; size?: number | undefined },
): Promise<Paged<ActivityLogItem>> {
  return cdscRequest<Paged<ActivityLogItem>>(CDSC_URLS.activityLog, {
    method: "POST",
    token: auth.token,
    body: {
      filterFieldParams: [{ key: "browserName" }],
      page: input.page ?? 1,
      size: input.size ?? 100,
      searchRoleViewConstants: "VIEW",
      filterDateParams: [
        {
          key: "recordedDate",
          condition: "",
          alias: "",
          value: `BETWEEN '${input.startDate}' AND '${input.endDate} 23:59:59'`,
        },
        { key: "recordedDate", condition: "", alias: "", value: "" },
      ],
    },
  });
}

export async function fetchWaccPending(
  auth: AuthContext,
  scrip: string,
): Promise<WaccSearchResponse> {
  return cdscRequest<WaccSearchResponse>(CDSC_URLS.waccPending, {
    method: "POST",
    token: auth.token,
    body: { demat: auth.demat, scrip: scrip.toUpperCase() },
  });
}

export async function fetchWaccCalculated(
  auth: AuthContext,
  scrip: string,
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.waccCalculated, {
    method: "POST",
    token: auth.token,
    body: { demat: auth.demat, scrip: scrip.toUpperCase() },
  });
}

export async function submitWacc(auth: AuthContext, rows: PurchaseSourceItem[]): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.waccSubmit, {
    method: "POST",
    token: auth.token,
    body: rows,
  });
}

export async function fetchIpoResultCompanies(): Promise<{ body?: IpoResultCompany[] }> {
  return cdscRequest<{ body?: IpoResultCompany[] }>(CDSC_URLS.ipoResultCompanies);
}

export async function checkIpoResult(demat: string, companyShareId: number): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.ipoResultCheck, {
    method: "POST",
    body: { companyShareId, boid: demat },
  });
}

export async function changePassword(
  auth: AuthContext,
  input: { oldPassword: string; newPassword: string },
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.changePassword, {
    method: "POST",
    token: auth.token,
    body: {
      oldPassword: input.oldPassword,
      newPassword: input.newPassword,
      confirmPassword: input.newPassword,
    },
  });
}

export async function changePin(
  auth: AuthContext,
  input: { oldPin: string; newPin: string },
): Promise<JsonRecord> {
  return cdscRequest<JsonRecord>(CDSC_URLS.changePin, {
    method: "POST",
    token: auth.token,
    body: {
      oldTransactionPIN: input.oldPin,
      newTransactionPIN: input.newPin,
      confirmTransactionPIN: input.newPin,
    },
  });
}

export async function logoutCdsc(auth: AuthContext) {
  try {
    await cdscRequest(CDSC_URLS.logout, { token: auth.token });
  } catch {
    // logging out locally is what matters
  }
}

export { requireAuth };
