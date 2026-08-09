import { queryOptions } from "@tanstack/react-query";
import { getCurrentUser } from "./meroshare/auth.functions";
import {
  getHoldingSymbols,
  getMyShares,
  getOwnDetail,
  getPortfolio,
  getTransactions,
} from "./meroshare/portfolio.functions";
import {
  getApplicableIssues,
  getApplicationReports,
  getIpoResultCompanies,
  getOldApplicationReports,
} from "./meroshare/ipo.functions";
import { getActivityLog, getBanks, getMyDetail } from "./meroshare/account.functions";
import { isoDate } from "./format";

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

export const mySharesQuery = () =>
  queryOptions({
    queryKey: ["my-shares"],
    queryFn: () => getMyShares(),
    staleTime: 60_000,
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

export const ipoResultCompaniesQuery = () =>
  queryOptions({
    queryKey: ["ipo-result-companies"],
    queryFn: () => getIpoResultCompanies(),
    staleTime: 5 * 60_000,
  });

export const banksQuery = () =>
  queryOptions({
    queryKey: ["banks"],
    queryFn: () => getBanks(),
    staleTime: 10 * 60_000,
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
