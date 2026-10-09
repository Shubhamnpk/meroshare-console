import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "../meroshare/api.server";
import {
  finnhubCompany,
  mergeGlobalHistory,
  worldHistory,
  worldQuote,
  worldSearch,
  type WorldBar,
  type WorldCompany,
  type WorldQuote,
  type WorldRange,
  type WorldSearchHit,
  type WorldSource,
} from "./feed.server";
import { normalizeWorldSymbol, worldCandidates } from "./symbols";
import { toNpr } from "./fx";
import { yahooSymbolFor } from "./import";
const WORLD_RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "2Y", "5Y", "MAX"] as const;

async function resolveSymbol(raw: string, currency?: string): Promise<{ symbol: string; quote: WorldQuote } | null> {
  const base = normalizeWorldSymbol(raw);
  if (!base) throw new Error("Invalid stock symbol.");
  // Currency-aware first guess (GBX → .L), then the generic suffix ladder.
  const first = currency ? yahooSymbolFor(base, currency) : base;
  const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
  for (const candidate of candidates) {
    const quote = await worldQuote(candidate);
    if (quote) return { symbol: candidate, quote };
  }
  return null;
}

export const getWorldQuote = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ symbol: z.string().trim().min(1).max(24), currency: z.string().trim().max(8).optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<WorldQuote | null> => {
    await requireAuth();
    const resolved = await resolveSymbol(data.symbol, data.currency);
    return resolved?.quote ?? null;
  });

export const getWorldHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        symbol: z.string().trim().min(1).max(24),
        currency: z.string().trim().max(8).optional(),
        range: z.enum(WORLD_RANGES),
      })
      .parse(input),
  )
  .handler(
    async ({ data }): Promise<{ symbol: string; bars: WorldBar[]; source: WorldSource | null; range: WorldRange }> => {
      await requireAuth();
      const base = normalizeWorldSymbol(data.symbol);
      if (!base) throw new Error("Invalid stock symbol.");
      const first = data.currency ? yahooSymbolFor(base, data.currency) : base;
      const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
      for (const candidate of candidates) {
        const { bars, source } = await worldHistory(candidate, data.range);
        if (bars.length > 0) return { symbol: candidate, bars, source, range: data.range };
      }
      return { symbol: base, bars: [], source: null, range: data.range };
    },
  );

export interface GlobalValuationRow {
  symbol: string;
  name: string;
  currency: string;
  qty: number;
  avgBuyNpr: number;
  ltpNpr: number;
  prevNpr: number;
  valueNpr: number;
  prevValueNpr: number;
  dayChangeNpr: number;
  pct: number;
  /** Live price in its native currency (for native display). */
  ltpNative: number;
  /** Native currency of the live price. */
  liveCcy: string;
  /** Previous close in native currency (for native day-change display). */
  prevNative: number;
  source: WorldSource | null;
  /** Yahoo sector/industry when the quote meta carries it (often US-only). */
  sector: string | null;
  /** False when the quote or an FX leg was unavailable. */
  ok: boolean;
}

/**
 * Whole Global book valued in NPR in one round trip: live quotes plus FX,
 * all server-side and cached. Rows that cannot be priced return ok:false.
 */
export const getGlobalValuation = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        holdings: z
          .array(
            z.object({
              symbol: z.string().trim().min(1).max(24),
              qty: z.number().min(0),
              avgPrice: z.number().min(0),
              currency: z.string().trim().max(8),
            }),
          )
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ rows: GlobalValuationRow[] }> => {
    await requireAuth();
    const rows: GlobalValuationRow[] = [];
    for (const h of data.holdings) {
      const base = normalizeWorldSymbol(h.symbol);
      if (!base || !(h.qty > 0)) continue;
      const candidates = worldCandidates(yahooSymbolFor(base, h.currency));
      let quote: WorldQuote | null = null;
      for (const candidate of candidates) {
        quote = await worldQuote(candidate);
        if (quote) break;
      }
      if (!quote) {
        rows.push({
          symbol: base,
          name: "",
          currency: h.currency.toUpperCase(),
          qty: h.qty,
          avgBuyNpr: 0,
          ltpNpr: 0,
          prevNpr: 0,
          valueNpr: 0,
          prevValueNpr: 0,
          dayChangeNpr: 0,
          pct: 0,
          ltpNative: 0,
          prevNative: 0,
          liveCcy: h.currency.toUpperCase(),
          source: null,
          sector: null,
          ok: false,
        });
        continue;
      }
      // Native pools: statement Totals occasionally disagree with qty×price
      // (corporate-action adjustments), while native pools always reconcile
      // with the live native price on screen. P/L must agree with the
      // displayed average, so price the basis natively too.
      const avgBuyNpr = await toNpr(h.avgPrice, h.currency);
      const ltpNpr = await toNpr(quote.ltp, quote.currency);
      const prevNpr = await toNpr(quote.previousClose, quote.currency);
      if (avgBuyNpr == null || ltpNpr == null || prevNpr == null) {
        rows.push({
          symbol: base,
          name: quote.name ?? "",
          currency: h.currency.toUpperCase(),
          qty: h.qty,
          avgBuyNpr: 0,
          ltpNpr: 0,
          prevNpr: 0,
          valueNpr: 0,
          prevValueNpr: 0,
          dayChangeNpr: 0,
          pct: 0,
          ltpNative: quote.ltp,
          prevNative: quote.previousClose,
          liveCcy: quote.currency ?? h.currency.toUpperCase(),
          source: quote.source,
          sector: quote.sector ?? quote.industry ?? null,
          ok: false,
        });
        continue;
      }
      const valueNpr = h.qty * ltpNpr;
      const prevValueNpr = h.qty * prevNpr;
      // Day % shares the amount's base (previous close), never the feed's
      // session figure — amount and percent can never disagree in sign again.
      const dayPct = prevNpr > 0 ? ((ltpNpr - prevNpr) / prevNpr) * 100 : 0;
      // Yahoo meta often lacks sector/industry (notably non-US listings);
      // Finnhub industry fills the gap so allocation rarely says Unclassified.
      const sector = quote.sector ?? quote.industry ?? (await finnhubCompany(base))?.industry ?? null;
      rows.push({
        symbol: base,
        name: quote.name ?? "",
        currency: h.currency.toUpperCase(),
        qty: h.qty,
        avgBuyNpr,
        ltpNpr,
        prevNpr,
        valueNpr,
        prevValueNpr,
        dayChangeNpr: valueNpr - prevValueNpr,
        pct: dayPct,
        ltpNative: quote.ltp,
        prevNative: quote.previousClose,
        liveCcy: quote.currency ?? h.currency.toUpperCase(),
        source: quote.source,
        sector,
        ok: true,
      });
    }
    return { rows };
  });

export const getWorldSearch = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ query: z.string().trim().min(1).max(48) }).parse(input))
  .handler(async ({ data }): Promise<{ hits: WorldSearchHit[] }> => {
    await requireAuth();
    return { hits: await worldSearch(data.query) };
  });

export const getWorldCompany = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ symbol: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data }): Promise<{ company: WorldCompany | null }> => {
    await requireAuth();
    const base = normalizeWorldSymbol(data.symbol);
    if (!base) throw new Error("Invalid stock symbol.");
    return { company: await finnhubCompany(base) };
  });

export const getGlobalHistory = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        holdings: z
          .array(
            z.object({
              symbol: z.string().trim().min(1).max(24),
              currency: z.string().trim().max(8),
              lots: z
                .array(
                  z.object({
                    date: z.string().min(1).max(32),
                    side: z.string().min(1).max(16),
                    qty: z.number().min(0),
                    price: z.number().min(0),
                  }),
                )
                .max(500),
            }),
          )
          .max(200),
        range: z.enum(["1M", "3M", "6M", "1Y", "MAX"] as const),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ points: { time: number; value: number; cost: number }[]; failed: string[] }> => {
    await requireAuth();
    const { toNpr } = await import("./fx");
    const series = await Promise.all(
      data.holdings.map(async (h) => {
        const base = normalizeWorldSymbol(h.symbol);
        const rate = h.currency ? await toNpr(1, h.currency).catch(() => null) : null;
        if (!base) return { symbol: h.symbol, rate, lots: [], bars: [] };
        const first = yahooSymbolFor(base, h.currency);
        const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
        for (const candidate of candidates) {
          const { bars } = await worldHistory(candidate, data.range);
          if (bars.length > 0) return { symbol: base, rate, lots: h.lots, bars };
        }
        return { symbol: base, rate, lots: h.lots, bars: [] };
      }),
    );
    return mergeGlobalHistory(series);
  });
