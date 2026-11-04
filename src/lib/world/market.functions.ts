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
  type WorldTick,
} from "./feed.server";
import { normalizeWorldSymbol, worldCandidates } from "./symbols";
import { convertCurrency, toNpr } from "./fx";
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

/**
 * Per-unit rates from each source currency into one display currency, using
 * the same server-side FX the valuation already trusts. Browsers can block
 * direct Yahoo calls, so client math (earned chips, converted totals) reads
 * rates from here instead of fetching them itself.
 */
export const getFxRates = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        sources: z.array(z.string().trim().max(8)).max(20),
        to: z.string().trim().max(8).default("NPR"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ rates: Record<string, number> }> => {
    await requireAuth();
    const rates: Record<string, number> = {};
    await Promise.all(
      data.sources.map(async (s) => {
        try {
          const r = await convertCurrency(1, s === "" ? "NPR" : s, data.to);
          if (r != null && r > 0) rates[s] = r;
        } catch {
          // skip — the caller shows placeholders, never mixed sums.
        }
      }),
    );
    return { rates };
  });

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
        range: z.enum(WORLD_RANGES),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ points: import("./feed.server").GlobalHistoryPoint[]; failed: string[] }> => {
    await requireAuth();
    const { toNpr } = await import("./fx");
    const series = await Promise.all(
      data.holdings.map(async (h) => {
        const base = normalizeWorldSymbol(h.symbol);
        const rate = h.currency ? await toNpr(1, h.currency).catch(() => null) : null;
        if (!base) return { symbol: h.symbol, currency: h.currency, rate, lots: [], bars: [] };
        const first = yahooSymbolFor(base, h.currency);
        const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
        for (const candidate of candidates) {
          const { bars } = await worldHistory(candidate, data.range);
          if (bars.length > 0) return { symbol: base, currency: h.currency, rate, lots: h.lots, bars };
        }
        return { symbol: base, currency: h.currency, rate, lots: h.lots, bars: [] };
      }),
    );
    return mergeGlobalHistory(series);
  });

/**
 * One stock's today as time-aware ticks in native currency: Yahoo 15m
 * session bars with the live quote pinned on the tail. Feeds the 24H pill
 * in the position sheet — same ticks the 24H book line is built from.
 */
export const getWorldIntraday = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        symbol: z.string().trim().min(1).max(24),
        currency: z.string().trim().max(8).optional(),
        interval: z.enum(["5m", "15m"]).default("15m"),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ticks: WorldTick[];
      live: number | null;
      interval: "5m" | "15m";
    }> => {
      await requireAuth();
      const { worldIntraday } = await import("./feed.server");
      const base = normalizeWorldSymbol(data.symbol);
      if (!base) throw new Error("Invalid stock symbol.");
      const first = data.currency ? yahooSymbolFor(base, data.currency) : base;
      const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
      // 5m only answers US listings — empty there falls back to 15m per
      // candidate, and the serving interval is reported back for the label.
      const wanted: ("5m" | "15m")[] = data.interval === "5m" ? ["5m", "15m"] : ["15m"];
      let ticks: WorldTick[] = [];
      let used: "5m" | "15m" = "15m";
      for (const candidate of candidates) {
        for (const res of wanted) {
          const r = await worldIntraday(candidate, res);
          if (r.ticks.length > 0) {
            ticks = r.ticks;
            used = res;
            break;
          }
        }
        if (ticks.length > 0) break;
      }
      let live: number | null = null;
      try {
        const quote = await worldQuote(candidates[0]!);
        if (quote && quote.ltp > 0) {
          live = quote.ltp;
          const now = Math.floor(Date.now() / 1000);
          if (ticks.length === 0 || ticks[ticks.length - 1]!.t < now - 60) {
            ticks = [
              ...ticks,
              { t: now, close: quote.ltp, volume: 0, open: quote.ltp, high: quote.ltp, low: quote.ltp },
            ];
          }
        }
      } catch {
        // quote failure just skips the live tail
      }
      return { ticks, live, interval: used };
    },
  );

/**
 * Global book's last 24 hours as one NPR line: each holding's Yahoo 15m
 * session ticks (live quote pinned on the tail), converted at current FX and
 * forward-filled across the union of timestamps. Units are today's — day
 * trades in foreign books are rare enough to document, not model.
 */
export const getGlobalDaySeries = createServerFn({ method: "POST" })
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
  .handler(async ({ data }): Promise<{ points: import("./feed.server").GlobalHistoryPoint[]; failed: string[]; cost: number }> => {
    await requireAuth();
    const { toNpr } = await import("./fx");
    const { worldIntraday } = await import("./feed.server");
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 24 * 3600;
    const failed: string[] = [];
    let cost = 0;
    const legs: {
      symbol: string;
      currency?: string;
      times: number[];
      closes: number[];
      rate: number;
      qty: number;
      cost: number;
    }[] = [];
    await Promise.all(
      data.holdings.map(async (h) => {
        if (!(h.qty > 0)) return;
        const base = normalizeWorldSymbol(h.symbol);
        const rate = h.currency ? await toNpr(1, h.currency).catch(() => null) : null;
        if (!base || !(rate != null && rate > 0)) {
          failed.push(h.symbol);
          return;
        }
        // Today's cost basis in NPR — the Profit/Total toggle's anchor.
        const avgBuyNpr = await toNpr(h.avgPrice, h.currency).catch(() => null);
        const legCost = avgBuyNpr != null ? h.qty * avgBuyNpr : 0;
        cost += legCost;
        const first = yahooSymbolFor(base, h.currency);
        const candidates = [first, ...worldCandidates(base)].filter((c, i, arr) => arr.indexOf(c) === i);
        let ticks: WorldTick[] = [];
        for (const candidate of candidates) {
          const r = await worldIntraday(candidate);
          if (r.ticks.length > 0) {
            ticks = r.ticks;
            break;
          }
        }
        // Pin the live quote on the tail if the market traded recently (within 2 hours)
        const latestTick = ticks.length > 0 ? ticks[ticks.length - 1]!.t : 0;
        try {
          const quote = await worldQuote(candidates[0]!);
          if (quote && quote.ltp > 0 && latestTick > 0 && now - latestTick < 2 * 3600 && latestTick < now - 60) {
            ticks = [
              ...ticks,
              { t: now, close: quote.ltp, volume: 0, open: quote.ltp, high: quote.ltp, low: quote.ltp },
            ];
          }
        } catch {
          // quote failure just skips the live tail
        }
        // Anchor cutoff to the latest available tick's session so weekend/closed market sessions render
        const effectiveLatest = ticks.length > 0 ? ticks[ticks.length - 1]!.t : 0;
        const cutoff = effectiveLatest > 0 ? effectiveLatest - 24 * 3600 : now - 24 * 3600;
        const inWindow = ticks.filter((tk) => tk.t >= cutoff);
        if (inWindow.length === 0) {
          failed.push(base);
          return;
        }
        legs.push({
          symbol: base,
          currency: h.currency,
          times: inWindow.map((tk) => tk.t),
          closes: inWindow.map((tk) => tk.close * (rate as number)),
          rate: rate as number,
          qty: h.qty,
          cost: legCost,
        });
      }),
    );
    const stamps = [...new Set(legs.flatMap((l) => l.times))].sort((a, b) => a - b);
    const points = stamps.map((t) => {
      let value = 0;
      const breakdown: import("./feed.server").GlobalHistoryBreakdownItem[] = [];
      for (const leg of legs) {
        let last = 0;
        for (let i = 0; i < leg.times.length; i += 1) {
          if (leg.times[i]! <= t) last = leg.closes[i]!;
          else break;
        }
        // Before a leg's first print, hold it flat at that first print.
        if (last === 0 && leg.closes.length > 0) last = leg.closes[0]!;
        const itemVal = leg.qty * last;
        value += itemVal;
        breakdown.push({
          symbol: leg.symbol,
          units: leg.qty,
          close: leg.rate > 0 ? last / leg.rate : last,
          currency: leg.currency,
          value: itemVal,
          cost: leg.cost,
        });
      }
      return { time: t, value, cost, breakdown };
    });
    // Thin to ~300 points for the wire; shape survives, payload doesn't bloat.
    const thin = points.length > 300 ? points.filter((_, i) => i % Math.ceil(points.length / 300) === 0) : points;
    // The live edge always survives thinning.
    if (thin.length > 0 && thin[thin.length - 1]!.time !== points[points.length - 1]!.time) {
      thin.push(points[points.length - 1]!);
    }
    return { points: thin, failed, cost };
  });
