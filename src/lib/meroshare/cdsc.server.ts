// Server-only HTTP client for the CDSC / MeroShare backend.
// The browser can never talk to this API directly (CORS + credential exposure),
// so every call is proxied through the app server.
import { SessionExpiredError } from "./session.server";

export const CDSC_BASE = "https://webbackend.cdsc.com.np";
export const IPO_RESULT_BASE = "https://iporesult.cdsc.com.np";

export const CDSC_URLS = {
  login: `${CDSC_BASE}/api/meroShare/auth/`,
  logout: `${CDSC_BASE}/api/meroShare/auth/logout/`,
  capitals: `${CDSC_BASE}/api/meroShare/capital/`,
  ownDetail: `${CDSC_BASE}/api/meroShare/ownDetail/`,
  myDetail: (boid: string) => `${CDSC_BASE}/api/meroShareView/myDetail/${boid}`,
  bankRequest: (bankCode: string) => `${CDSC_BASE}/api/bankRequest/${bankCode}`,
  bankList: `${CDSC_BASE}/api/meroShare/bank/`,
  bankDetail: (bankId: number | string) => `${CDSC_BASE}/api/meroShare/bank/${bankId}`,
  activityLog: `${CDSC_BASE}/api/meroShare/activityLog/search/`,
  holdingSymbols: `${CDSC_BASE}/api/myPurchase/myShare/`,
  applicableIssues: `${CDSC_BASE}/api/meroShare/companyShare/applicableIssue/`,
  currentIssues: `${CDSC_BASE}/api/meroShare/companyShare/currentIssue`,

  canApply: (companyShareId: number | string, demat: string) =>
    `${CDSC_BASE}/api/meroShare/applicantForm/customerType/${companyShareId}/${demat}`,
  applyShare: `${CDSC_BASE}/api/meroShare/applicantForm/share/apply`,
  applicationReports: `${CDSC_BASE}/api/meroShare/applicantForm/active/search/`,
  oldApplicationReports: `${CDSC_BASE}/api/meroShare/migrated/applicantForm/search/`,
  issueManagerDetail: (companyShareId: number | string) =>
    `${CDSC_BASE}/api/meroShare/active/${companyShareId}`,
  appliedDetail: (formId: number | string) =>
    `${CDSC_BASE}/api/meroShare/applicantForm/report/detail/${formId}`,
  oldAppliedDetail: (formId: number | string) =>
    `${CDSC_BASE}/api/meroShare/migrated/applicantForm/report/${formId}`,
  changePassword: `${CDSC_BASE}/api/meroShare/changePassword/`,
  changePin: `${CDSC_BASE}/api/meroShare/changeTransactionPIN/`,
  myShares: `${CDSC_BASE}/api/meroShareView/myShare/`,
  myPortfolio: `${CDSC_BASE}/api/meroShareView/myPortfolio/`,
  transactions: `${CDSC_BASE}/api/meroShareView/myTransaction/`,
  waccPending: `${CDSC_BASE}/api/myPurchase/search/wacc/`,
  waccCalculated: `${CDSC_BASE}/api/myPurchase/view/`,
  waccSubmit: `${CDSC_BASE}/api/myPurchase/upload/`,
  ipoResultCompanies: `${IPO_RESULT_BASE}/result/companyShares/fileUploaded`,
  ipoResultCheck: `${IPO_RESULT_BASE}/result/result/check`,
} as const;

const BASE_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Connection: "keep-alive",
  Origin: "https://meroshare.cdsc.com.np",
  Referer: "https://meroshare.cdsc.com.np/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

export class CdscError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CdscError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
  raw?: boolean;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && /^\s*</.test(text)) {
    throw new CdscError(
      "MeroShare returned a non-JSON response, possibly blocked by a security filter. Please try again.",
      403,
      text.slice(0, 200),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    for (const key of ["message", "error", "errorMessage", "detail"]) {
      const value = rec[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  if (typeof payload === "string" && payload.trim() && payload.length < 300) return payload;
  return fallback;
}

export async function cdscRequest<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (token) headers["Authorization"] = token;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new CdscError("Could not reach MeroShare. Please try again in a moment.", 503);
  }

  const payload = await parseBody(res);

  if (res.status === 401 || res.status === 403) {
    throw new SessionExpiredError();
  }

  if (!res.ok) {
    throw new CdscError(
      messageFrom(payload, `MeroShare request failed (${res.status})`),
      res.status,
      payload,
    );
  }

  return payload as T;
}

export async function cdscRequestWithHeaders<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<{ data: T; headers: Headers; status: number }> {
  const { method = "GET", token, body } = options;
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (token) headers["Authorization"] = token;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new CdscError("Could not reach MeroShare. Please try again in a moment.", 503);
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    throw new CdscError(
      messageFrom(payload, `MeroShare request failed (${res.status})`),
      res.status,
      payload,
    );
  }
  return { data: payload as T, headers: res.headers, status: res.status };
}
