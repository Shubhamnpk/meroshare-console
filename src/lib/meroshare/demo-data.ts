/**
 * Demo mode mock data.  Used when the user enters the app via "Try Demo Mode"
 * instead of a real CDSC login.  Market data (live prices, indices, news etc.)
 * stays real — only user-specific CDSC data is mocked.
 */

import type {
  OwnDetail,
  PortfolioItem,
  PortfolioResponse,
  TransactionItem,
  MyShareItem,
  ApplicationReportItem,
  ActivityLogItem,
  BankListItem,
  BankDetail,
  WaccReport,
  PurchaseSourceItem,
} from "./types";

export const DEMO_USER: OwnDetail = {
  id: 100001,
  boid: "NP0000000000000001",
  demat: "12345678",
  clientCode: "DEMO001",
  email: "demo@example.com",
  meroShareEmail: "demo@example.com",
  contact: "9841000001",
  name: "Demo User",
  gender: "Male",
  address: "Kathmandu, Nepal",
  customerTypeCode: "I",
  createdApproveDateStr: "2024-01-15",
  dematExpiryDate: "2030-12-31",
};

const HELD: Record<string, number> = {
  NABIL: 50,
  NICA: 100,
  NPRD: 200,
  NMB: 75,
  SANIMA: 40,
  SBL: 150,
  HDFC: 60,
  KPCL: 80,
  NTC: 30,
  PUBJKBLI: 25,
};

const BUY_RATES: Record<string, number> = {
  NABIL: 1280,
  NICA: 430,
  NPRD: 270,
  NMB: 385,
  SANIMA: 620,
  SBL: 310,
  HDFC: 240,
  KPCL: 540,
  NTC: 1150,
  PUBJKBLI: 185,
};

export const DEMO_PORTFOLIO: PortfolioResponse = {
  meroShareMyPortfolio: Object.entries(HELD).map(([scrip, qty]) => ({
    scrip,
    script: scrip,
    scriptDesc: scrip,
    currentBalance: qty,
    lastTransactionPrice: String(BUY_RATES[scrip] ?? 500),
    previousClosingPrice: String((BUY_RATES[scrip] ?? 500) - 10),
    valueAsOfLastTransactionPrice: String(qty * (BUY_RATES[scrip] ?? 500)),
    valueAsOfPreviousClosingPrice: String(qty * ((BUY_RATES[scrip] ?? 500) - 10)),
    valueOfLastTransPrice: String(qty * (BUY_RATES[scrip] ?? 500)),
    valueOfPrevClosingPrice: String(qty * ((BUY_RATES[scrip] ?? 500) - 10)),
  })),
  totalItems: Object.keys(HELD).length,
  totalValueAsOfLastTransactionPrice: Object.entries(HELD).reduce(
    (s, [k, q]) => s + q * (BUY_RATES[k] ?? 500),
    0,
  ),
  totalValueAsOfPreviousClosingPrice: Object.entries(HELD).reduce(
    (s, [k, q]) => s + q * ((BUY_RATES[k] ?? 500) - 10),
    0,
  ),
};

export const DEMO_SHARES: MyShareItem[] = Object.entries(HELD).map(([scrip, qty]) => ({
  script: scrip,
  scriptDesc: scrip,
  currentBalance: qty,
  freeBalance: qty,
  pledgedBalance: 0,
  lockInBalance: 0,
  lastTransactionPrice: String(BUY_RATES[scrip] ?? 500),
  previousClosingPrice: String((BUY_RATES[scrip] ?? 500) - 10),
  valueAsOfLastTransactionPrice: String(qty * (BUY_RATES[scrip] ?? 500)),
  valueAsOfPreviousClosingPrice: String(qty * ((BUY_RATES[scrip] ?? 500) - 10)),
  valueOfLastTransPrice: String(qty * (BUY_RATES[scrip] ?? 500)),
  valueOfPrevClosingPrice: String(qty * ((BUY_RATES[scrip] ?? 500) - 10)),
}));

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const DEMO_TRANSACTIONS: TransactionItem[] = [
  {
    script: "NABIL",
    transactionDate: daysAgo(30),
    historyDescription: "Buy",
    debitQuantity: 50,
    creditQuantity: 0,
    balanceAfterTransaction: 50,
  },
  {
    script: "NICA",
    transactionDate: daysAgo(25),
    historyDescription: "Buy",
    debitQuantity: 100,
    creditQuantity: 0,
    balanceAfterTransaction: 100,
  },
  {
    script: "NPRD",
    transactionDate: daysAgo(20),
    historyDescription: "Buy",
    debitQuantity: 200,
    creditQuantity: 0,
    balanceAfterTransaction: 200,
  },
  {
    script: "NMB",
    transactionDate: daysAgo(18),
    historyDescription: "Buy",
    debitQuantity: 75,
    creditQuantity: 0,
    balanceAfterTransaction: 75,
  },
  {
    script: "SANIMA",
    transactionDate: daysAgo(15),
    historyDescription: "Buy",
    debitQuantity: 40,
    creditQuantity: 0,
    balanceAfterTransaction: 40,
  },
  {
    script: "SBL",
    transactionDate: daysAgo(12),
    historyDescription: "Buy",
    debitQuantity: 150,
    creditQuantity: 0,
    balanceAfterTransaction: 150,
  },
  {
    script: "HDFC",
    transactionDate: daysAgo(10),
    historyDescription: "Buy",
    debitQuantity: 60,
    creditQuantity: 0,
    balanceAfterTransaction: 60,
  },
  {
    script: "KPCL",
    transactionDate: daysAgo(8),
    historyDescription: "Buy",
    debitQuantity: 80,
    creditQuantity: 0,
    balanceAfterTransaction: 80,
  },
  {
    script: "NTC",
    transactionDate: daysAgo(5),
    historyDescription: "Buy",
    debitQuantity: 30,
    creditQuantity: 0,
    balanceAfterTransaction: 30,
  },
  {
    script: "PUBJKBLI",
    transactionDate: daysAgo(3),
    historyDescription: "Buy",
    debitQuantity: 25,
    creditQuantity: 0,
    balanceAfterTransaction: 25,
  },
  {
    script: "NABIL",
    transactionDate: daysAgo(2),
    historyDescription: "Bonus",
    creditQuantity: 5,
    debitQuantity: 0,
    balanceAfterTransaction: 55,
  },
  {
    script: "NICA",
    transactionDate: daysAgo(1),
    historyDescription: "Buy",
    debitQuantity: 50,
    creditQuantity: 0,
    balanceAfterTransaction: 150,
  },
];

export const DEMO_APPLICATIONS: ApplicationReportItem[] = [
  {
    companyShareId: 9001,
    scrip: "NIFRA",
    companyName: "Nepal Infrastructure Bank Ltd.",
    shareTypeName: "IPO",
    shareGroupName: "Ordinary Share",
    statusName: "Applied",
    subGroup: "Commercial Bank",
  },
  {
    companyShareId: 9002,
    scrip: "HURI",
    companyName: "Hurasahar Laghubitta Bittiya Sanstha Ltd.",
    shareTypeName: "FPO",
    shareGroupName: "Ordinary Share",
    statusName: "Allotted",
    subGroup: "Microfinance",
  },
  {
    companyShareId: 9003,
    scrip: "UPPER",
    companyName: "Upper Tamakoshi Hydropower Ltd.",
    shareTypeName: "Right Share",
    shareGroupName: "Ordinary Share",
    statusName: "Applied",
    subGroup: "Hydropower",
  },
];

export const DEMO_ACTIVITY_LOG: ActivityLogItem[] = [
  {
    activityType: "Login",
    recordedDate: daysAgo(0) + "T10:30:00",
    browserName: "Chrome",
    broswerVersion: "124.0",
    osName: "Windows",
    ipAddress: "103.175.180.10",
    description: "Login successfully",
  },
  {
    activityType: "Password Change",
    recordedDate: daysAgo(15) + "T14:22:00",
    browserName: "Chrome",
    broswerVersion: "124.0",
    osName: "Windows",
    ipAddress: "103.175.180.10",
    description: "Password updated",
  },
  {
    activityType: "Login",
    recordedDate: daysAgo(1) + "T09:15:00",
    browserName: "Chrome",
    broswerVersion: "124.0",
    osName: "—",
    ipAddress: "3.81.116.5",
    description: "Login successfully",
  },
  {
    activityType: "IPO Apply",
    recordedDate: daysAgo(3) + "T11:45:00",
    browserName: "Chrome",
    broswerVersion: "120",
    osName: "Windows",
    ipAddress: "192.168.1.100",
    description: "Applied for NIFRA IPO",
  },
  {
    activityType: "Login",
    recordedDate: daysAgo(5) + "T08:00:00",
    browserName: "Firefox",
    broswerVersion: "119",
    osName: "Linux",
    ipAddress: "10.0.0.50",
    description: "Successful login",
  },
];

export const DEMO_BANKS: BankListItem[] = [
  { id: 1, code: "NABIL", name: "Nabil Bank Ltd." },
  { id: 2, code: "SANIMA", name: "Sanima Bank Ltd." },
];

export const DEMO_BANK_DETAIL: BankDetail = {
  id: 1,
  accountNumber: "01234567890123",
  branchId: 101,
  branchName: "Kathmandu Main",
  bankId: 1,
  bankName: "Nabil Bank Ltd.",
  crnNumber: "CRN12345678",
};

export const DEMO_WACC_REPORT: WaccReport = {
  isWaccPending: false,
  viewWaccSummaryReport: true,
  message: "WACC report available",
  waccReportResponse: Object.entries(HELD).map(([scrip, qty]) => ({
    scrip,
    totalQuantity: qty,
    averageBuyRate: BUY_RATES[scrip] ?? 500,
    totalCost: qty * (BUY_RATES[scrip] ?? 500),
    lastModifiedDate: daysAgo(1),
  })),
};

export const DEMO_PURCHASE_SOURCES: PurchaseSourceItem[] = Object.entries(HELD).map(
  ([scrip, qty]) => ({
    scrip,
    quantity: qty,
    rate: BUY_RATES[scrip] ?? 500,
    amount: qty * (BUY_RATES[scrip] ?? 500),
    transactionDate: daysAgo(30),
    source: "Secondary Market",
    purchaseSource: "Secondary Market",
    purchasePrice: BUY_RATES[scrip] ?? 500,
    transactionQuantity: qty,
    userPrice: BUY_RATES[scrip] ?? 500,
    userCost: qty * (BUY_RATES[scrip] ?? 500),
    remarks: "Demo purchase",
    postDate: daysAgo(30),
    updatedDate: daysAgo(1),
  }),
);
