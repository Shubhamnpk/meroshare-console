import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "../meroshare/api.server";
import {
  MF_ATTRIBUTION,
  getMfApprovals,
  getMfDebentureHighlights,
  getMfDebentureList,
  getMfFeedHealth,
  getMfManagerDetail,
  getMfManagerFacts,
  getMfManagerHoldings,
  getMfManagerProduct,
  getMfManagers,
  getMfMarketHoldings,
  getMfPerformance,
  getMfPipeline,
  getMfPipelineOverview,
  getMfProducts,
  getMfSchemeBundle,
  getMfSchemes,
} from "./funds.server";
import type {
  MfApproval,
  MfDebentureList,
  MfDebentureSummary,
  MfFeedHealth,
  MfHoldingsMap,
  MfManager,
  MfManagerDetail,
  MfManagerFacts,
  MfManagerProductDetail,
  MfPerformance,
  MfPipeline,
  MfPipelineOverview,
  MfPipelineType,
  MfProduct,
  MfScheme,
  MfSchemeBundle,
} from "./types";

export const MF_ATTRIBUTION_TEXT = MF_ATTRIBUTION;

const pipelineTypeSchema = z.enum(["ipo", "right", "fpo", "debenture", "mfs"]);

export const getMfFeedHealthData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfFeedHealth | null> => {
    await requireAuth();
    return getMfFeedHealth();
  },
);

export const getMfManagerList = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfManager[]> => {
    await requireAuth();
    return getMfManagers();
  },
);

export const getMfSchemeList = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfScheme[]> => {
    await requireAuth();
    return getMfSchemes();
  },
);

export const getMfPerformanceData = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        symbols: z.array(z.string().trim().min(1).max(24)).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MfPerformance[]> => {
    await requireAuth();
    return getMfPerformance(data.symbols);
  });

export const getMfSchemeDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ symbol: z.string().trim().min(1).max(24) }).parse(input),
  )
  .handler(async ({ data }): Promise<MfSchemeBundle> => {
    await requireAuth();
    return getMfSchemeBundle(data.symbol);
  });

export const getMfPipelineData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfPipeline> => {
    await requireAuth();
    return getMfPipeline("mfs");
  },
);

export const getMfPipelineByType = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ type: pipelineTypeSchema }).parse(input))
  .handler(async ({ data }): Promise<MfPipeline> => {
    await requireAuth();
    return getMfPipeline(data.type as MfPipelineType);
  });

export const getMfPipelineOverviewData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfPipelineOverview | null> => {
    await requireAuth();
    return getMfPipelineOverview();
  },
);

export const getMfApprovalList = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfApproval[]> => {
    await requireAuth();
    return getMfApprovals();
  },
);

export const getMfDebentureData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfDebentureSummary> => {
    await requireAuth();
    return getMfDebentureHighlights();
  },
);

export const getMfDebentureListData = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfDebentureList> => {
    await requireAuth();
    return getMfDebentureList();
  },
);

export const getMfProductCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, MfProduct[]>> => {
    await requireAuth();
    return getMfProducts();
  },
);

export const getMfManagerFactSheet = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(48) }).parse(input))
  .handler(async ({ data }): Promise<MfManagerFacts | null> => {
    await requireAuth();
    return getMfManagerFacts(data.slug);
  });

export const getMfManagerDetailData = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(48) }).parse(input))
  .handler(async ({ data }): Promise<MfManagerDetail | null> => {
    await requireAuth();
    return getMfManagerDetail(data.slug);
  });

export const getMfManagerHoldingsMap = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(48) }).parse(input))
  .handler(async ({ data }): Promise<MfHoldingsMap> => {
    await requireAuth();
    return getMfManagerHoldings(data.slug);
  });

export const getMfMarketHoldingsMap = createServerFn({ method: "GET" }).handler(
  async (): Promise<MfHoldingsMap> => {
    await requireAuth();
    return getMfMarketHoldings();
  },
);

export const getMfManagerProductData = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ slug: z.string().trim().min(1).max(48) }).parse(input))
  .handler(async ({ data }): Promise<MfManagerProductDetail | null> => {
    await requireAuth();
    return getMfManagerProduct(data.slug);
  });
