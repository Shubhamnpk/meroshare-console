import { queryOptions } from "@tanstack/react-query";
import { getCurrentUser } from "./meroshare/auth.functions";
import {
  getEnrichedPortfolio,
  getHoldingSymbols,
  getOwnDetail,
  getPortfolio,
  getTransactions,
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
  getIndexGraph,
  getIpoArchiveList,
  getMarketMovers,
  getMarketSectors,
  getMarketSnapshot,
  getNews,
  getPortfolioHistorySeries,
  getProposedDividends,
  getScripDetail,
  getScripFaceValues,
} from "./nepse/market.functions";
import type { PortfolioGranularity } from "./nepse/types";
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
