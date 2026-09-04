/** Mutual fund data from the capitals.nepsetrading.com community API. */

export interface MfManager {
  slug: string;
  name: string;
  website: string | null;
  implemented: boolean;
  schemeCount: number;
  reportsUrl: string | null;
  navUrl: string | null;
}

export type MfFundType = "close_end" | "open_end" | string;

export interface MfScheme {
  symbol: string;
  name: string;
  fundType: MfFundType;
  manager: string;
  managerSlug: string | null;
  units: number | null;
  paidUp: number | null;
  faceValue: number | null;
  allotmentDate: string | null;
  maturityDate: string | null;
  aliases: string[];
}

export interface MfNavPoint {
  date: string;
  nav: number;
  adjNav: number;
}

export interface MfPerformance {
  symbol: string;
  name: string;
  fundType: MfFundType;
  manager: string;
  totalPaidUp: number | null;
  maturityDate: string | null;
  timeToMature: string | null;
  weeklyNav: number | null;
  monthlyNav: number | null;
  ltp: number | null;
  /** (LTP − NAV) / NAV * 100. Negative = trading at a discount. */
  ltpVsNavPct: number | null;
  holdingsCount: number | null;
  capitalMarketPct: number | null;
  fixedIncomePct: number | null;
  cashPct: number | null;
  expectedDividendPct: number | null;
  dataStatus: string | null;
}

export interface MfHolding {
  stockSymbol: string;
  quantity: number | null;
  ltp: number | null;
  marketValue: number | null;
}

export interface MfReturnPeriod {
  period: string;
  available: boolean;
  returnPct: number | null;
  annualized: boolean;
  startDate: string | null;
  startNav: number | null;
}

export interface MfReturns {
  available: boolean;
  points: number;
  startDate: string | null;
  asOf: string | null;
  latestNav: number | null;
  periods: MfReturnPeriod[];
  sinceInception: {
    available: boolean;
    returnPct: number | null;
    annualized: boolean;
    startDate: string | null;
    spanYears: number | null;
  } | null;
  basis: string | null;
}

/** Everything the detail view needs, fetched in parallel server-side. */
export interface MfSchemeBundle {
  symbol: string;
  scheme: MfScheme | null;
  nav: MfNavPoint[];
  holdings: MfHolding[];
  returns: MfReturns | null;
  performance: MfPerformance | null;
}

/** One upcoming scheme sitting in the SEBON approval pipeline. */
export type MfPipelineType = "ipo" | "right" | "fpo" | "debenture" | "mfs";

export const MF_PIPELINE_TYPES: MfPipelineType[] = ["ipo", "right", "fpo", "debenture", "mfs"];

export interface MfPipelineItem {
  company: string;
  fundName: string | null;
  status: string | null;
  units: number | null;
  amount: number | null;
  issueManager: string | null;
  appliedDate: string | null;
  /** SEBON sector grouping (IPO records). */
  sector: string | null;
  /** e.g. "IPO (For General Public)", "Right Share". */
  issueType: string | null;
  remarks: string | null;
}

export interface MfPipeline {
  type: MfPipelineType;
  label: string | null;
  count: number;
  totalAmount: number | null;
  asOfBs: string | null;
  fiscalYear: string | null;
  sourcePdf: string | null;
  items: MfPipelineItem[];
}

/** Index of all SEBON application pipelines (`/applications`). */
export interface MfPipelineOverview {
  types: MfPipelineType[];
  labels: Record<string, string>;
  counts: Record<string, number>;
  total: number;
  totalAmount: number | null;
  totals: Record<string, number>;
  top: Record<string, { company: string | null; amount: number | null }>;
}

/** Upstream feed liveness (`/health`). */
export interface MfFeedHealth {
  status: string | null;
  schemes: number;
  managers: number;
  adaptersImplemented: string[];
  snapshotLoaded: boolean;
  snapshotAsOf: string | null;
  dbReady: boolean;
  servingFrom: string | null;
}

/** A SEBON circular approving a mutual-fund issue, with the official PDF. */
export interface MfApproval {
  title: string;
  bsDate: string | null;
  adDate: string | null;
  pdfUrl: string | null;
}

export interface MfDebenture {
  issuer: string;
  instrument: string;
  couponPct: number | null;
  tenorYears: number | null;
  maturityBs: string | null;
  sector: string | null;
  units: number | null;
  faceValue: number | null;
  amountRegistered: number | null;
  publicIssueAmount: number | null;
  privatePlacementAmount: number | null;
  issueManager: string | null;
  dateBs: string | null;
  fiscalYear: string | null;
}

export interface MfDebentureSummary {
  count: number;
  issuers: number;
  couponMin: number | null;
  couponMax: number | null;
  top: MfDebenture[];
}

/** Full debenture universe for the explorer tool. */
export interface MfDebentureList {
  debentures: MfDebenture[];
  summary: Omit<MfDebentureSummary, "top">;
}

export interface MfProduct {
  type: string;
  label: string;
  description: string | null;
  url: string | null;
}

/** Per-manager product dossier: documents, SIP info, portals, scheme facts. */
export interface MfProductDocument {
  title: string;
  category: string | null;
  url: string | null;
  scheme: string | null;
  date: string | null;
}

export interface MfManagerProductDetail {
  slug: string;
  name: string | null;
  website: string | null;
  sipOffered: boolean;
  sipDetail: string | null;
  portals: { label: string; url: string }[];
  documents: MfProductDocument[];
  schemesDetail: { scheme: string; facts: { label: string; value: string }[] }[];
}

export interface MfManagerFacts {
  slug: string;
  capital: string | null;
  facts: { label: string; value: string }[];
  variants: { name: string; description: string | null }[];
}

/** Rich per-house product detail (`/products/{slug}`). */
export interface MfProductDetail extends MfProduct {
  overview: string | null;
  facts: { label: string; value: string }[];
  features: string[];
  variants: { name: string; description: string | null }[];
  howToApply: string | null;
}

export interface MfPortal {
  label: string;
  url: string;
}

export interface MfDocument {
  title: string;
  category: string | null;
  url: string | null;
  scheme: string | null;
  date: string | null;
}

export interface MfSchemeFacts {
  scheme: string;
  facts: { label: string; value: string }[];
}

export interface MfManagerDetail {
  slug: string;
  name: string | null;
  website: string | null;
  confidence: string | null;
  sipOffered: boolean;
  sipDetail: string | null;
  offers: Record<string, boolean>;
  factsVerified: {
    date: string | null;
    checked: number | null;
    confirmed: number | null;
  };
  products: MfProductDetail[];
  portals: MfPortal[];
  documents: MfDocument[];
  schemesDetail: MfSchemeFacts[];
}

/** One stock aggregated across many schemes' disclosed holdings. */
export interface MfStockSlice {
  stockSymbol: string;
  marketValue: number;
  weightPct: number;
  schemes: number;
}

export interface MfHoldingsMap {
  totalMarketValue: number;
  /** Schemes that actually disclosed holdings vs schemes considered. */
  coverage: string;
  slices: MfStockSlice[];
}
