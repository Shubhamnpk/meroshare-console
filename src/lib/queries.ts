import { queryOptions } from "@tanstack/react-query";
import { getCurrentUser } from "./meroshare/auth.functions";
import {
  getEnrichedPortfolio,
  getHoldingSymbols,
  getInvestmentSummary,
  getOwnDetail,
  getPortfolio,
  getTransactions,
  getWaccPending,
  getWaccReport,
  getWaccScrips,
} from "./meroshare/portfolio.functions";
import {
  getApplicableIssues,
  getApplicationDetails,
  getApplicationReports,
  getCurrentIssues,
  getOldApplicationReports,
} from "./meroshare/ipo.functions";
import {
  getAccountProfile,
  getActivityLog,
  getBanks,
  getMyDetail,
} from "./meroshare/account.functions";
import {
  getChartData,
  getIndexGraph,
  getIpoArchiveList,
  getMarketMovers,
  getMarketSectors,
  getMarketSnapshot,
  getNews,
  getPortfolioHistorySeries,
  getProposedDividends,
  getScripBarsBatch,
  getScripDetail,
  getScripFaceValues,
  getScripFinancials,
  getScripFullHistory,
  getScreenerData,
} from "./nepse/market.functions";
import type { ChartRange, PortfolioGranularity } from "./nepse/types";
import type { MfPipelineType } from "./mutual-funds/types";
import {
  getMfApprovalList,
  getMfDebentureData,
  getMfDebentureListData,
  getMfFeedHealthData,
  getMfManagerDetailData,
  getMfManagerFactSheet,
  getMfManagerHoldingsMap,
  getMfManagerList,
  getMfManagerProductData,
  getMfMarketHoldingsMap,
  getMfPerformanceData,
  getMfPipelineByType,
  getMfPipelineData,
  getMfPipelineOverviewData,
  getMfProductCatalog,
  getMfSchemeDetail,
  getMfSchemeList,
} from "./mutual-funds/funds.functions";
import { isoDate } from "./format";

export const marketSnapshotQuery = () =>
  queryOptions({
    queryKey: ["market-snapshot"],
    queryFn: () => getMarketSnapshot(),
    staleTime: 60_000,
  });

export const marketMoversQuery = () =>
  queryOptions({
    queryKey: ["market-movers"],
    queryFn: () => getMarketMovers(),
    staleTime: 60_000,
  });

export const marketSectorsQuery = () =>
  queryOptions({
    queryKey: ["market-sectors"],
    queryFn: () => getMarketSectors(),
    staleTime: 5 * 60_000,
  });

export const dividendsQuery = () =>
  queryOptions({
    queryKey: ["dividends"],
    queryFn: () => getProposedDividends(),
    staleTime: 30 * 60_000,
  });

export const ipoArchiveQuery = () =>
  queryOptions({
    queryKey: ["ipo-archive"],
    queryFn: () => getIpoArchiveList(),
    staleTime: 30 * 60_000,
  });

export const indexGraphQuery = (indexName: string) =>
  queryOptions({
    queryKey: ["index-graph", indexName],
    queryFn: () => getIndexGraph({ data: { indexName } }),
    staleTime: 5 * 60_000,
  });

export const scripDetailQuery = (symbol: string | null) =>
  queryOptions({
    queryKey: ["scrip-detail", symbol],
    queryFn: () => getScripDetail({ data: { symbol: symbol ?? "" } }),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });

export const scripFinancialsQuery = (symbol: string | null) =>
  queryOptions({
    queryKey: ["scrip-financials", symbol],
    queryFn: () => getScripFinancials({ data: { symbol: symbol ?? "" } }),
    enabled: Boolean(symbol),
    staleTime: 30 * 60_000,
  });

export const scripFullHistoryQuery = (symbol: string | null) =>
  queryOptions({
    queryKey: ["scrip-full-history", symbol],
    queryFn: () => getScripFullHistory({ data: { symbol: symbol ?? "" } }),
    enabled: Boolean(symbol),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

export const faceValuesQuery = (symbols: string[]) =>
  queryOptions({
    queryKey: ["face-values", JSON.stringify([...symbols].sort())],
    queryFn: () => getScripFaceValues({ data: { symbols } }),
    enabled: symbols.length > 0,
    staleTime: 30 * 60_000,
  });

export const exchangeMessagesQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["exchange-messages"],
    queryFn: () => getNews(),
    enabled,
    staleTime: 30 * 60_000,
  });

export const portfolioHistoryQuery = (
  holdings: { scrip: string; units: number }[],
  months: number,
  granularity: PortfolioGranularity,
  enabled = true,
) =>
  queryOptions({
    queryKey: [
      "portfolio-history",
      months,
      granularity,
      JSON.stringify(holdings.map((h) => h.scrip)),
    ],
    queryFn: () => getPortfolioHistorySeries({ data: { holdings, months, granularity } }),
    enabled: enabled && holdings.length > 0,
    staleTime: 30 * 60_000,
  });

export const enrichedPortfolioQuery = () =>
  queryOptions({
    queryKey: ["enriched-portfolio"],
    queryFn: () => getEnrichedPortfolio(),
    staleTime: 30_000,
  });

export const currentIssuesQuery = () =>
  queryOptions({
    queryKey: ["current-issues"],
    queryFn: () => getCurrentIssues(),
    staleTime: 5 * 60_000,
  });

export const sessionQuery = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: () => getCurrentUser(),
    staleTime: 60_000,
  });

export const ownDetailQuery = () =>
  queryOptions({
    queryKey: ["own-detail"],
    queryFn: () => getOwnDetail(),
    staleTime: 5 * 60_000,
  });

export const portfolioQuery = () =>
  queryOptions({
    queryKey: ["portfolio"],
    queryFn: () => getPortfolio(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

export const holdingSymbolsQuery = () =>
  queryOptions({
    queryKey: ["holding-symbols"],
    queryFn: () => getHoldingSymbols(),
    staleTime: 5 * 60_000,
  });

export const waccScripsQuery = () =>
  queryOptions({
    queryKey: ["wacc-scrips"],
    queryFn: () => getWaccScrips(),
    staleTime: 30_000,
  });

export const waccSearchQuery = (scrip: string | null) =>
  queryOptions({
    queryKey: ["wacc-search", scrip],
    queryFn: () => getWaccPending({ data: { scrip: scrip ?? "" } }),
    enabled: Boolean(scrip),
    staleTime: 15_000,
  });

export const waccReportQuery = () =>
  queryOptions({
    queryKey: ["wacc-report"],
    queryFn: () => getWaccReport(),
    staleTime: 30_000,
  });

export const investmentSummaryQuery = () =>
  queryOptions({
    queryKey: ["investment-summary"],
    queryFn: () => getInvestmentSummary(),
    staleTime: 60_000,
  });

export const transactionsQuery = (symbol: string | null) =>
  queryOptions({
    queryKey: ["transactions", symbol],
    queryFn: () => getTransactions({ data: { symbol, page: 1, size: 200 } }),
    staleTime: 60_000,
  });

export const applicableIssuesQuery = () =>
  queryOptions({
    queryKey: ["applicable-issues"],
    queryFn: () => getApplicableIssues(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

export const applicationReportsQuery = () =>
  queryOptions({
    queryKey: ["application-reports"],
    queryFn: () => getApplicationReports(),
    staleTime: 60_000,
  });

export const oldApplicationReportsQuery = () =>
  queryOptions({
    queryKey: ["old-application-reports"],
    queryFn: () => getOldApplicationReports(),
    staleTime: 5 * 60_000,
  });

export const applicationDetailsQuery = (items: { formId: number; old?: boolean }[]) =>
  queryOptions({
    queryKey: ["application-details", JSON.stringify(items)],
    queryFn: () => getApplicationDetails({ data: { items } }),
    staleTime: 60_000,
  });

export const banksQuery = () =>
  queryOptions({
    queryKey: ["banks"],
    queryFn: () => getBanks(),
    staleTime: 10 * 60_000,
  });

export const accountProfileQuery = () =>
  queryOptions({
    queryKey: ["account-profile"],
    queryFn: () => getAccountProfile(),
    staleTime: 5 * 60_000,
  });

export const myDetailQuery = () =>
  queryOptions({
    queryKey: ["my-detail"],
    queryFn: () => getMyDetail(),
    staleTime: 10 * 60_000,
  });

export const activityLogQuery = (startDate: string, endDate: string) =>
  queryOptions({
    queryKey: ["activity-log", startDate, endDate],
    queryFn: () => getActivityLog({ data: { startDate, endDate, page: 1, size: 100 } }),
    staleTime: 60_000,
  });

export function defaultActivityRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export const chartSeriesQuery = (symbol: string, range: ChartRange) =>
  queryOptions({
    queryKey: ["chart-series", symbol, range],
    queryFn: () => getChartData({ data: { symbol, range } }),
    enabled: Boolean(symbol),
    staleTime: range === "1D" ? 60_000 : 10 * 60_000,
  });

// ---------------------------------------------------------------------------
// Screener queries
// ---------------------------------------------------------------------------

export const screenerDataQuery = () =>
  queryOptions({
    queryKey: ["screener-data"],
    queryFn: () => getScreenerData(),
    staleTime: 5 * 60_000,
  });

export const scripBarsQuery = (symbols: string[]) =>
  queryOptions({
    queryKey: ["screener-bars", JSON.stringify([...symbols].sort())],
    queryFn: () => getScripBarsBatch({ data: { symbols } }),
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------
// Mutual fund queries (community nepsetrading.com feed)
// ---------------------------------------------------------------------------

export const mfManagersQuery = () =>
  queryOptions({
    queryKey: ["mf-managers"],
    queryFn: () => getMfManagerList(),
    staleTime: 30 * 60_000,
  });

export const mfSchemesQuery = () =>
  queryOptions({
    queryKey: ["mf-schemes"],
    queryFn: () => getMfSchemeList(),
    staleTime: 30 * 60_000,
  });

export const mfPerformanceQuery = (symbols?: string[]) =>
  queryOptions({
    queryKey: ["mf-performance", symbols ? JSON.stringify([...symbols].sort()) : "all"],
    queryFn: () => getMfPerformanceData({ data: { symbols } }),
    staleTime: 30 * 60_000,
  });

export const mfSchemeQuery = (symbol: string | null) =>
  queryOptions({
    queryKey: ["mf-scheme", symbol],
    queryFn: () => getMfSchemeDetail({ data: { symbol: symbol ?? "" } }),
    enabled: Boolean(symbol),
    staleTime: 30 * 60_000,
  });

export const mfPipelineQuery = () =>
  queryOptions({
    queryKey: ["mf-pipeline"],
    queryFn: () => getMfPipelineData(),
    staleTime: 30 * 60_000,
  });

export const mfPipelineByTypeQuery = (type: MfPipelineType) =>
  queryOptions({
    queryKey: ["mf-pipeline", type],
    queryFn: () => getMfPipelineByType({ data: { type } }),
    staleTime: 30 * 60_000,
  });

export const mfPipelineOverviewQuery = () =>
  queryOptions({
    queryKey: ["mf-pipeline-overview"],
    queryFn: () => getMfPipelineOverviewData(),
    staleTime: 30 * 60_000,
  });

export const mfFeedHealthQuery = () =>
  queryOptions({
    queryKey: ["mf-feed-health"],
    queryFn: () => getMfFeedHealthData(),
    staleTime: 30 * 60_000,
  });

export const mfApprovalsQuery = () =>
  queryOptions({
    queryKey: ["mf-approvals"],
    queryFn: () => getMfApprovalList(),
    staleTime: 30 * 60_000,
  });

export const mfDebenturesQuery = () =>
  queryOptions({
    queryKey: ["mf-debentures"],
    queryFn: () => getMfDebentureData(),
    staleTime: 30 * 60_000,
  });

export const mfDebentureListQuery = () =>
  queryOptions({
    queryKey: ["mf-debenture-list"],
    queryFn: () => getMfDebentureListData(),
    staleTime: 30 * 60_000,
  });

export const mfProductsQuery = () =>
  queryOptions({
    queryKey: ["mf-products"],
    queryFn: () => getMfProductCatalog(),
    staleTime: 30 * 60_000,
  });

export const mfManagerFactsQuery = (slug: string | null) =>
  queryOptions({
    queryKey: ["mf-manager-facts", slug],
    queryFn: () => getMfManagerFactSheet({ data: { slug: slug ?? "" } }),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });

export const mfManagerDetailQuery = (slug: string | null) =>
  queryOptions({
    queryKey: ["mf-manager-detail", slug],
    queryFn: () => getMfManagerDetailData({ data: { slug: slug ?? "" } }),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });

export const mfManagerProductQuery = (slug: string | null) =>
  queryOptions({
    queryKey: ["mf-manager-product", slug],
    queryFn: () => getMfManagerProductData({ data: { slug: slug ?? "" } }),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });

export const mfManagerHoldingsQuery = (slug: string | null) =>
  queryOptions({
    queryKey: ["mf-manager-holdings", slug],
    queryFn: () => getMfManagerHoldingsMap({ data: { slug: slug ?? "" } }),
    enabled: Boolean(slug),
    staleTime: 30 * 60_000,
  });

export const mfMarketHoldingsQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["mf-market-holdings"],
    queryFn: () => getMfMarketHoldingsMap(),
    enabled,
    staleTime: 30 * 60_000,
  });
