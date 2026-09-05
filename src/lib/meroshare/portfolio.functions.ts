import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchHoldingSymbols,
  fetchOwnDetail,
  fetchPortfolio,
  fetchTransactions,
  fetchWaccCalculated,
  fetchWaccPending,
  fetchWaccPendingScrips,
  fetchWaccReport,
  requireAuth,
  submitWacc,
} from "./api.server";
import { getMarketStatus, getPriceMap } from "../nepse/feed.server";
import {
  DEMO_USER,
  DEMO_PORTFOLIO,
  DEMO_SHARES,
  DEMO_TRANSACTIONS,
  DEMO_WACC_REPORT,
  DEMO_PURCHASE_SOURCES,
} from "./demo-data";
import type { EnrichedHolding, EnrichedPortfolio } from "../nepse/types";
import type {
  InvestmentSummary,
  InvestmentScripSummary,
  MyShareItem,
  OwnDetail,
  PortfolioResponse,
  PurchaseSourceItem,
  TransactionItem,
  JsonRecord,
  WaccReport,
  WaccScripsResult,
  WaccSearchResponse,
} from "./types";

/** CDSC appends/prepends "Ordinary Share" to company names; drop it for display. */
function cleanDescription(raw: string): string {
  return raw
    .replace(/\(?\s*ordinary\s+shares?\s*(bonus\s+rights?\s+shares?)?\s*\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–—,]+$/g, "")
    .trim();
}

function toNum(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export const getOwnDetail = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnDetail> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_USER;
    return fetchOwnDetail(auth);
  },
);

export const getPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioResponse> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_PORTFOLIO;
    return fetchPortfolio(auth);
  },
);

/**
 * MeroShare holdings joined to live NEPSE prices on the server, so the client
 * receives one already-valued list. Scrips the feed doesn't know keep the
 * price MeroShare itself returned.
 */
export const getEnrichedPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<EnrichedPortfolio> => {
    const auth = await requireAuth();
    const [portfolio, prices, status] = await Promise.all([
      fetchPortfolio(auth),
      getPriceMap(),
      getMarketStatus(),
    ]);

    const holdings: EnrichedHolding[] = (portfolio.meroShareMyPortfolio ?? []).map((item) => {
      const scrip = String(item.script ?? item.scrip ?? "").toUpperCase();
      const units = Math.max(0, toNum(item.currentBalance));
      const live = prices.map.get(scrip);
      const fallbackLtp = toNum(item.lastTransactionPrice);
      const fallbackPrev = toNum(item.previousClosingPrice);
      const ltp = live && live.ltp > 0 ? live.ltp : fallbackLtp;
      const previousClose = live && live.previousClose > 0 ? live.previousClose : fallbackPrev;
      const value = ltp * units;
      const previousValue = previousClose * units;
      return {
        scrip,
        description: cleanDescription(String(item["scriptDesc"] ?? "")),
        units,
        ltp,
        previousClose,
        change: ltp - previousClose,
        percentChange: previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0,
        value,
        previousValue,
        dayChange: value - previousValue,
        high: live?.high ?? 0,
        low: live?.low ?? 0,
        volume: live?.volume ?? 0,
        sector: live?.sector ?? null,
        name: live?.name ?? cleanDescription(String(item["scriptDesc"] ?? scrip)),
        live: Boolean(live),
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    const totalPreviousValue = holdings.reduce((sum, h) => sum + h.previousValue, 0);
    const bySector = new Map<string, number>();
    for (const h of holdings) {
      const key = h.sector ?? "Unclassified";
      bySector.set(key, (bySector.get(key) ?? 0) + h.value);
    }

    return {
      holdings,
      totalValue,
      totalPreviousValue,
      dayChange: totalValue - totalPreviousValue,
      dayChangePercent:
        totalPreviousValue > 0 ? ((totalValue - totalPreviousValue) / totalPreviousValue) * 100 : 0,
      totalUnits: holdings.reduce((sum, h) => sum + h.units, 0),
      liveCount: holdings.filter((h) => h.live).length,
      marketStale: prices.stale,
      status,
      sectors: [...bySector.entries()]
        .map(([sector, value]) => ({
          sector,
          value,
          weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value),
    };
  },
);

export const getMyShares = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyShareItem[]> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_SHARES;
    const res = await fetchPortfolio(auth);
    return (res.meroShareMyPortfolio ?? []).map(
      (p) =>
        ({
          script: p.script ?? p.scrip,
          scriptDesc: p["scriptDesc"],
          currentBalance: p.currentBalance,
          lastTransactionPrice: p["lastTransactionPrice"],
          previousClosingPrice: p["previousClosingPrice"],
          valueAsOfLastTransactionPrice: p["valueAsOfLastTransactionPrice"],
          valueAsOfPreviousClosingPrice: p["valueAsOfPreviousClosingPrice"],
          valueOfLastTransPrice: p["valueOfLastTransPrice"],
          valueOfPrevClosingPrice: p["valueOfPrevClosingPrice"],
        }) as MyShareItem,
    );
  },
);

export const getHoldingSymbols = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const auth = await requireAuth();
    if (auth.demo) {
      return [
        ...new Set(
          DEMO_PORTFOLIO.meroShareMyPortfolio
            .map((p) => String(p.scrip ?? "").toUpperCase())
            .filter(Boolean),
        ),
      ];
    }
    const raw = await fetchHoldingSymbols(auth);
    if (Array.isArray(raw)) {
      const symbols = raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (symbols.length > 0) return symbols;
    }
    const portfolio = await fetchPortfolio(auth);
    return (portfolio.meroShareMyPortfolio ?? [])
      .map((p) => p.script ?? p.scrip)
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  },
);

export const getTransactions = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        symbol: z.string().trim().max(24).nullable().optional(),
        page: z.number().int().min(1).max(500).optional(),
        size: z.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<{ items: TransactionItem[]; total: number }> => {
    const auth = await requireAuth();
    if (auth.demo) {
      let items = DEMO_TRANSACTIONS;
      if (data.symbol) {
        const upper = data.symbol.toUpperCase();
        items = items.filter((t) => (t.script ?? "").toUpperCase() === upper);
      }
      return { items, total: items.length };
    }
    const res = await fetchTransactions(auth, data);
    const items: TransactionItem[] = (res.transactionView ?? []).map(
      (t) =>
        ({
          script: t.script,
          transactionDate: t.transactionDate,
          historyDescription: t.historyDescription ?? t["historyDesc"],
          creditQuantity: t.creditQuantity ?? t["creditQty"],
          debitQuantity: t.debitQuantity ?? t["debitQty"],
          balanceAfterTransaction: t.balanceAfterTransaction ?? t["balAfterTrans"],
        }) as TransactionItem,
    );
    return { items, total: res.totalItems ?? 0 };
  });

export const getWaccPending = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ scrip: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data }): Promise<WaccSearchResponse> => {
    const res = await fetchWaccPending(await requireAuth(), data.scrip);
    return {
      waccUpdateResponse: Array.isArray(res.waccUpdateResponse) ? res.waccUpdateResponse : [],
      waccSummaryResponse: Array.isArray(res.waccSummaryResponse) ? res.waccSummaryResponse : [],
      viewSummary: res.viewSummary === true,
      ...(res.success !== undefined ? { success: res.success } : {}),
      ...(res.message !== undefined ? { message: res.message } : {}),
    };
  });

export const getWaccCalculated = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ scrip: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data }): Promise<JsonRecord> =>
    fetchWaccCalculated(await requireAuth(), data.scrip),
  );

export const getWaccScrips = createServerFn({ method: "POST" }).handler(
  async (): Promise<WaccScripsResult> => {
    const auth = await requireAuth();
    if (auth.demo) {
      const scrips = (DEMO_WACC_REPORT.waccReportResponse ?? [])
        .map((r) => String(r.scrip ?? "").toUpperCase())
        .filter(Boolean);
      return { scrips, failed: false };
    }
    try {
      const rows = await fetchWaccPendingScrips(auth);
      return {
        scrips: rows
          .map((r) => String(typeof r === "string" ? r : (r.scrip ?? "")).toUpperCase())
          .filter((s): s is string => Boolean(s)),
        failed: false,
      };
    } catch (error) {
      // myPurchase/share/ is frequently blocked by CDSC's security filter
      // (HTML page instead of JSON). Non-fatal: the page falls back to the
      // normal holdings list so per-scrip WACC stays possible.
      console.error("[wacc] pending scrips unavailable, using holdings fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      return { scrips: [], failed: true };
    }
  },
);

export const getWaccReport = createServerFn({ method: "POST" }).handler(
  async (): Promise<WaccReport> => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_WACC_REPORT;
    return fetchWaccReport(auth);
  },
);

/**
 * Account-wide cost basis: the `waccReport` (single call, CDSC-calculated)
 * seeded first, with per-scrip Purchase Source (`myPurchase/search/wacc/`)
 * filling only the gaps.
 *
 * Why hybrid? The report alone misses pending-WACC scrips; the purchase
 * source alone fails when CDSC's security filter blocks `search/wacc/`
 * (HTML page instead of JSON). Seeding from the report keeps the total
 * correct in both cases. The purchase source returns both:
 * - `waccSummaryResponse` (calculated rows, each with `userCost`), and
 * - `waccUpdateResponse` (pending rows: qty x rate/purchasePrice estimate).
 *
 * Requests run server-side in small batches to avoid tripping CDSC rate
 * limits; a failed scrip degrades to `missing` rather than failing the whole
 * summary.
 */
export const getInvestmentSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<InvestmentSummary> => {
    const auth = await requireAuth();
    if (auth.demo) {
      const scrips: InvestmentScripSummary[] = DEMO_PURCHASE_SOURCES.map((r) => {
        const units = Math.max(0, toNum(r.quantity ?? r.transactionQuantity));
        const price = toNum(r.userPrice ?? r.rate ?? r.purchasePrice);
        const cost = Math.max(0, toNum(r.userCost)) || units * price;
        return {
          scrip: String(r.scrip ?? "").toUpperCase(),
          units,
          cost,
          waccRate: units > 0 ? cost / units : 0,
          status: "calculated" as const,
        };
      });
      const demoInvestment = scrips.reduce((s, r) => s + r.cost, 0);
      const demoUnits = scrips.reduce((s, r) => s + r.units, 0);
      return {
        totalInvestment: demoInvestment,
        totalUnits: demoUnits,
        avgWacc: demoUnits > 0 ? demoInvestment / demoUnits : 0,
        calculatedCount: scrips.length,
        pendingCount: 0,
        missingCount: 0,
        scrips,
      };
    }

    // Portfolio + account-wide WACC report in parallel. The report is the
    // primary cost basis (single call, CDSC-calculated); per-scrip purchase
    // source fills only the gaps (pending/missing scrips). Either may fail
    // independently (CDSC security filter blocks some myPurchase/* calls
    // while others work), so each degrades separately.
    const [portfolioRes, reportRes] = await Promise.allSettled([
      fetchPortfolio(auth),
      fetchWaccReport(auth),
    ]);
    const portfolio = portfolioRes.status === "fulfilled" ? portfolioRes.value : null;
    const report = reportRes.status === "fulfilled" ? reportRes.value : null;

    const held = new Map<string, number>();
    for (const item of portfolio?.meroShareMyPortfolio ?? []) {
      const scrip = String(item.script ?? item.scrip ?? "").toUpperCase();
      if (!scrip) continue;
      held.set(scrip, Math.max(0, toNum(item.currentBalance)));
    }

    const byScrip = new Map<string, InvestmentScripSummary>();
    for (const r of report?.waccReportResponse ?? []) {
      const scrip = String(r.scrip ?? "").toUpperCase();
      if (!scrip || byScrip.has(scrip)) continue;
      const cost = Math.max(0, toNum(r.totalCost));
      const units = Math.max(0, toNum(r.totalQuantity)) || held.get(scrip) || 0;
      if (cost <= 0 && units <= 0) continue;
      const rate = toNum(r.averageBuyRate);
      byScrip.set(scrip, {
        scrip,
        units,
        cost,
        waccRate: rate > 0 ? rate : units > 0 ? cost / units : 0,
        status: "calculated",
      });
    }

    // Scrips not covered by the report (pending WACC, report rows without
    // cost, or a blocked/failed report call) fall through to per-scrip
    // purchase source.
    const symbols = [...held.keys()].filter((s) => !byScrip.has(s));

    const BATCH = 5;
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map((s) => fetchWaccPending(auth, s)));
      settled.forEach((result, idx) => {
        const scrip = batch[idx] as string;
        if (result.status === "rejected") {
          byScrip.set(scrip, {
            scrip,
            units: held.get(scrip) ?? 0,
            cost: 0,
            waccRate: 0,
            status: "missing",
          });
          return;
        }
        const res = result.value as WaccSearchResponse;
        const summary = Array.isArray(res.waccSummaryResponse) ? res.waccSummaryResponse : [];
        const pending = Array.isArray(res.waccUpdateResponse) ? res.waccUpdateResponse : [];
        const qtyOf = (r: PurchaseSourceItem) =>
          Math.max(0, toNum(r.quantity ?? r.transactionQuantity));
        const priceOf = (r: PurchaseSourceItem) => toNum(r.userPrice ?? r.rate ?? r.purchasePrice);
        if (summary.length > 0) {
          let units = 0;
          let cost = 0;
          for (const r of summary) {
            const q = qtyOf(r);
            units += q;
            cost += Math.max(0, toNum(r.userCost)) || q * priceOf(r);
          }
          const safeCost = Math.max(0, cost);
          byScrip.set(scrip, {
            scrip,
            units,
            cost: safeCost,
            waccRate: units > 0 ? safeCost / units : 0,
            status: "calculated",
          });
        } else if (pending.length > 0) {
          let units = 0;
          let cost = 0;
          for (const r of pending) {
            const q = qtyOf(r);
            units += q;
            cost += q * priceOf(r);
          }
          const safeCost = Math.max(0, cost);
          byScrip.set(scrip, {
            scrip,
            units,
            cost: safeCost,
            waccRate: units > 0 ? safeCost / units : 0,
            status: "pending",
          });
        } else {
          byScrip.set(scrip, {
            scrip,
            units: held.get(scrip) ?? 0,
            cost: 0,
            waccRate: 0,
            status: "missing",
          });
        }
      });
    }

    const scrips = [...byScrip.values()];
    const totalInvestment = scrips.reduce((s, r) => s + r.cost, 0);
    const totalUnits = scrips.reduce((s, r) => s + r.units, 0);
    return {
      totalInvestment,
      totalUnits,
      avgWacc: totalUnits > 0 ? totalInvestment / totalUnits : 0,
      calculatedCount: scrips.filter((r) => r.status === "calculated").length,
      pendingCount: scrips.filter((r) => r.status === "pending").length,
      missingCount: scrips.filter((r) => r.status === "missing").length,
      scrips,
    };
  },
);

export const calculateWacc = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        scrip: z.string().trim().min(1).max(24),
        rows: z.array(z.record(z.unknown())).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return submitWacc(auth, data.rows as PurchaseSourceItem[]);
  });
