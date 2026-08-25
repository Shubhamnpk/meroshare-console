// Client-safe shared types for the MeroShare (CDSC) integration.

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export interface Capital {
  id: number;
  code: string;
  name: string;
}

export interface SessionUser {
  name: string;
  username: string;
  demat: string;
  boid: string;
  clientCode: string;
  capitalId: number;
  accountNumber: string;
  renderDashboard: boolean;
  passwordExpiryDate: string | null;
  expiresAt: number;
}

export interface OwnDetail {
  address?: string;
  boid?: string;
  clientCode?: string;
  contact?: string;
  createdApproveDateStr?: string;
  customerTypeCode?: string;
  demat?: string;
  dematExpiryDate?: string;
  email?: string;
  expiredDate?: string;
  expiredDateStr?: string;
  gender?: string;
  id?: number;
  imagePath?: string;
  meroShareEmail?: string;
  name?: string;
  passwordChangeDateStr?: string;
  passwordExpiryDateStr?: string;
  profileName?: string;
  renderDashboard?: boolean;
  renewedDate?: string;
  renewedDateStr?: string;
  username?: string;
  accountNumber?: string;
  capital?: string;
  panNumber?: string;
  [key: string]: JsonValue;
}

export interface PortfolioItem {
  currentBalance?: number;
  lastTransactionPrice?: string;
  previousClosingPrice?: string;
  scrip?: string;
  script?: string;
  scriptDesc?: string;
  valueAsOfLastTransactionPrice?: string;
  valueAsOfPreviousClosingPrice?: string;
  valueOfLastTransPrice?: string | number;
  valueOfPrevClosingPrice?: string | number;
  [key: string]: JsonValue;
}

export interface PortfolioResponse {
  meroShareMyPortfolio: PortfolioItem[];
  totalItems: number;
  totalValueAsOfLastTransactionPrice: string | number | null;
  totalValueAsOfPreviousClosingPrice: string | number | null;
}

export interface MyShareItem {
  script?: string;
  scriptDesc?: string;
  currentBalance?: number;
  freeBalance?: number;
  pledgedBalance?: number;
  lockInBalance?: number;
  lastTransactionPrice?: string | number;
  previousClosingPrice?: string | number;
  valueAsOfLastTransactionPrice?: string | number;
  valueAsOfPreviousClosingPrice?: string | number;
  valueOfLastTransPrice?: string | number;
  valueOfPrevClosingPrice?: string | number;
  [key: string]: JsonValue;
}

export interface TransactionItem {
  script?: string;
  transactionDate?: string;
  historyDescription?: string;
  creditQuantity?: number;
  debitQuantity?: number;
  balanceAfterTransaction?: number;
  [key: string]: JsonValue;
}

export interface ApplicableIssue {
  companyShareId: number;
  subGroup?: string;
  scrip?: string;
  companyName?: string;
  shareTypeName?: string;
  shareGroupName?: string;
  statusName?: string;
  issueOpenDate?: string;
  issueCloseDate?: string;
  sharePerUnit?: number | string;
  minUnit?: number;
  maxUnit?: number;
  action?: string;
  [key: string]: JsonValue;
}

export interface ApplicationReportItem {
  companyShareId: number;
  applicantFormId?: number;
  scrip?: string;
  companyName?: string;
  subGroup?: string;
  shareTypeName?: string;
  shareGroupName?: string;
  statusName?: string;
  reapplied?: boolean | number;
  action?: string;
  [key: string]: JsonValue;
}

export interface BankListItem {
  id: number;
  code: string;
  name: string;
  [key: string]: JsonValue;
}

export interface BankDetail {
  id?: number;
  accountNumber?: string;
  branchId?: number;
  branchName?: string;
  bankId?: number;
  bankName?: string;
  crnNumber?: string;
  [key: string]: JsonValue;
}

export interface ActivityLogItem {
  browserName?: string;
  broswerVersion?: string;
  ipAddress?: string;
  recordedDate?: string;
  activityType?: string;
  osName?: string;
  description?: string;
  [key: string]: JsonValue;
}

export interface PurchaseSourceItem {
  id?: number;
  scrip?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  transactionDate?: string;
  source?: string;
  purchaseSource?: string;
  purchasePrice?: number;
  transactionQuantity?: number;
  userPrice?: number;
  userCost?: number;
  remarks?: string;
  postDate?: string;
  updatedDate?: string;
  isEdit?: boolean;
  contractId?: number | string;
  demat?: string;
  [key: string]: JsonValue;
}

export interface WaccSearchResponse {
  waccUpdateResponse?: PurchaseSourceItem[];
  waccSummaryResponse?: PurchaseSourceItem[];
  viewSummary?: boolean;
  success?: boolean;
  message?: string;
}

/** One scrip returned by myPurchase/share as having a pending WACC calculation. */
export interface WaccPendingScrip {
  demat?: string;
  scrip?: string;
  [key: string]: JsonValue;
}

/** One calculated WACC row from the account-wide waccReport. */
export interface WaccReportItem {
  id?: number;
  scrip?: string;
  totalQuantity?: number;
  averageBuyRate?: number;
  totalCost?: number;
  lastModifiedDate?: string;
  [key: string]: JsonValue;
}

export interface WaccReport {
  isWaccPending?: boolean;
  viewWaccSummaryReport?: boolean;
  message?: string;
  waccReportResponse?: WaccReportItem[];
}

export interface Paged<T> {
  object: T[];
  totalCount: number;
  totalPage?: number;
}

/** One linked ASBA bank, merged from bankList + bankDetail + bankRequest. */
export interface AccountBank {
  id: number;
  code: string;
  name: string;
  accountNumber?: string;
  branchName?: string;
  crnNumber?: string;
  accountStatus?: string;
  kycStatus?: string;
  raw: JsonRecord;
}

/** Everything MeroShare knows about the signed-in user, in one payload. */
export interface AccountProfile {
  own: OwnDetail;
  detail: JsonRecord;
  banks: AccountBank[];
  session: {
    username: string;
    demat: string;
    boid: string;
    clientCode: string;
    accountNumber: string;
    expiresAt: number | null;
  };
}
