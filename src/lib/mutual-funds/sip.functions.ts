// SIP landscape and simulation, server-side. The NAV histories are heavy
// (years of daily points per fund), so the simulations run here and the browser
// receives compact results. The math lives in src/lib/calc/sip.ts; this file
// only wires data to it.
//
// NAV source: the open nepal-market-data dataset (see nav-history.server.ts),
// with the live capitals feed as the fallback for funds it does not cover yet.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "../meroshare/api.server";
import { getIndexDailyBars } from "../nepse/feed.server";
import { indexToPoints, rdSeries } from "../calc/benchmarks";
import { simulateSip, type SipNavPoint } from "../calc/sip";
import { xirrPercent, type CashFlow } from "../calc/xirr";
import { inflationFactor, realValue } from "../market/inflation";
import { getMfNavHistory, getMfSchemes } from "./funds.server";
import { getSipNavHistory } from "./nav-history.server";
import type { MfScheme } from "./types";

const inputSchema = z.object({
  /** First installment month, YYYY-MM. Installments land on the 1st. */
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().min(100).max(1_000_000),
  rdRate: z.number().min(0).max(30),
  fees: z.boolean().optional(),
});

/** A fund may miss the exact start day; 45 days is one missed month, not a shorter run. */
const RANK_GRACE_DAYS = 45;
const DAY_MS = 86_400_000;

function dayMs(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

interface FundSeries {
  scheme: MfScheme;
  nav: SipNavPoint[];
}

async function openEndFunds(): Promise<MfScheme[]> {
  const schemes = await getMfSchemes();
  return schemes
    .filter((s) => s.fundType === "open_end" && s.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function fundSeries(scheme: MfScheme): Promise<FundSeries | null> {
  let points = await getSipNavHistory(scheme.symbol);
  if (!points?.length) {
    // Not in the open dataset: the live feed still has the last few months.
    const live = await getMfNavHistory(scheme.symbol).catch(() => []);
    points = live.filter((p) => p.date && p.nav > 0);
  }
  const usable = (points ?? []).filter((p) => p.date && p.nav > 0);
  if (usable.length < 2) return null;
  return {
    scheme,
    nav: usable.map((p) => ({ date: p.date, nav: p.nav })),
  };
}

/** NEPSE daily closes for the trailing window the SIPs need, oldest first. */
async function nepsePoints(fromIso: string): Promise<SipNavPoint[] | null> {
  const days = Math.ceil((Date.now() - dayMs(fromIso)) / DAY_MS) + 40;
  if (!Number.isFinite(days) || days <= 0) return null;
  try {
    // One monthly file per ~30 days; lift the default 64-file cap so a
    // five-year SIP still gets a benchmark.
    const bars = await getIndexDailyBars("NEPSE", days, 160);
    const points = indexToPoints(bars);
    return points.length >= 2 ? points : null;
  } catch {
    // Benchmark is optional: the page must work when the archive is down.
    return null;
  }
}

function toIso(startMonth: string): string {
  return `${startMonth}-01`;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * The ranking table: every open-end fund run through the same SIP, from the
 * same month, with the same fees, valued on the same day. Funds that did not
 * exist when the window opened are shown but not ranked, because a shorter run
 * is not a better fund.
 */
export const getSipLandscape = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<SipLandscape> => {
    await requireAuth();
    const startIso = toIso(data.startMonth);
    const [funds, index] = await Promise.all([openEndFunds(), nepsePoints(startIso)]);
    const series = (await Promise.all(funds.map((f) => fundSeries(f)))).filter((s): s is FundSeries => s !== null);

    const startMs = dayMs(startIso);
    const eligible = series.filter((f) => dayMs(f.nav[0]!.date) <= startMs + RANK_GRACE_DAYS * DAY_MS);

    // One valuation day for every ranked fund: the earliest "latest NAV" among
    // them. Valuing each fund on its own last NAV lets a one-day publication lag
    // decide the ranking.
    const commonEnd = eligible.length
      ? [...eligible].map((f) => f.nav[f.nav.length - 1]!.date).sort()[0]!
      : null;

    const opts = { amount: data.amount, startIso, fees: data.fees };
    const endOpts = commonEnd ? { ...opts, endIso: commonEnd } : opts;
    const nepseSim = index && commonEnd ? simulateSip(index, [], endOpts) : null;
    const nepseXirr = round2(nepseSim?.xirr ?? null);

    const rows: SipFundRow[] = [];
    for (const f of series) {
      const ranked = commonEnd != null && eligible.includes(f);
      const sim = simulateSip(f.nav, [], ranked ? endOpts : opts);
      if (!sim) continue;
      const rd = rdSeries(sim.buys.map((b) => b.date), data.amount, data.rdRate, 6, sim.lastNavDate);
      const xirr = round2(sim.xirr);
      rows.push({
        symbol: f.scheme.symbol,
        name: f.scheme.name,
        manager: f.scheme.manager,
        since: f.nav[0]!.date,
        navNow: f.nav[f.nav.length - 1]!.nav,
        navDate: sim.lastNavDate,
        ranked,
        beatsNepse: ranked && xirr != null && nepseXirr != null ? xirr > nepseXirr : null,
        installments: sim.installments,
        paid: Math.round(sim.paid),
        value: Math.round(sim.value),
        profit: Math.round(sim.profit),
        totalReturnPct: Math.round(sim.totalReturnPct * 100) / 100,
        xirr,
        // Only a ranked fund can be compared: same window, same valuation day.
        nepseXirr: ranked ? nepseXirr : null,
        nepseValue: ranked && nepseSim ? Math.round(nepseSim.value) : 0,
        rdValue: Math.round(rd.value),
      });
    }

    const rankedRows = rows.filter((r) => r.ranked);
    const xirrs = rankedRows.flatMap((r) => (r.xirr == null ? [] : [r.xirr])).sort((a, b) => a - b);
    const mid = Math.floor(xirrs.length / 2);
    const medianXirr =
      xirrs.length === 0 ? null : xirrs.length % 2 === 0 ? round2((xirrs[mid - 1]! + xirrs[mid]!) / 2) : xirrs[mid]!;
    const best = [...rankedRows].sort((a, b) => (b.xirr ?? -99) - (a.xirr ?? -99))[0] ?? null;
    const earliest = series.length ? series.map((f) => f.nav[0]!.date).sort()[0]! : null;

    // Earliest month with at least three funds alive. A "widest window" that
    // ranks a single debt fund is not a ranking, it is a data gap.
    const byMonth = new Map<string, number>();
    for (const f of series) byMonth.set(monthOf(f.nav[0]!.date), (byMonth.get(monthOf(f.nav[0]!.date)) ?? 0) + 1);
    let alive = 0;
    let widest: string | null = null;
    for (const [month, born] of [...byMonth.entries()].sort()) {
      alive += born;
      if (alive >= 3) {
        widest = month;
        break;
      }
    }

    return {
      startIso,
      amount: data.amount,
      rdRate: data.rdRate,
      asOf: commonEnd,
      earliestStart: earliest ? monthOf(earliest) : null,
      widestStart: widest ?? (earliest ? monthOf(earliest) : null),
      fundCount: rows.length,
      rankedCount: rankedRows.length,
      beatCount: rankedRows.filter((r) => r.beatsNepse === true).length,
      medianXirr,
      best: best ? { symbol: best.symbol, name: best.name, xirr: best.xirr, value: best.value } : null,
      rows,
      nepse: nepseSim
        ? { xirr: nepseXirr, value: Math.round(nepseSim.value), installments: nepseSim.installments }
        : null,
      benchmarkNote: index
        ? "NEPSE price index, no dividends: the weaker version of the index."
        : "NEPSE benchmark unavailable right now.",
    };
  });

/**
 * One fund in full: simulation series for the chart, NEPSE and bank RD on the
 * same dates, and the inflation deflation of the final value.
 */
export const getSipSimulation = createServerFn({ method: "POST" })
  .validator((input: unknown) => inputSchema.extend({ symbol: z.string().trim().min(1).max(24) }).parse(input))
  .handler(async ({ data }): Promise<SipSimulation | null> => {
    await requireAuth();
    const startIso = toIso(data.startMonth);
    const [schemes, index] = await Promise.all([openEndFunds(), nepsePoints(startIso)]);
    const scheme = schemes.find((s) => s.symbol === data.symbol.toUpperCase());
    if (!scheme) return null;
    const f = await fundSeries(scheme);
    if (!f) return null;

    const opts = { amount: data.amount, startIso, fees: data.fees };
    const sim = simulateSip(f.nav, [], opts);
    if (!sim) return null;

    const rd = rdSeries(sim.buys.map((b) => b.date), data.amount, data.rdRate, 6, sim.lastNavDate);
    const nepseSim = index ? simulateSip(index, [], { ...opts, endIso: sim.lastNavDate }) : null;

    // Real XIRR: same flows, final value deflated back to start-month money.
    const factor = inflationFactor(sim.firstInstallment ?? startIso, sim.lastNavDate);
    const deflated: CashFlow[] = sim.flows.map((flow, i) =>
      i === sim.flows.length - 1 ? { date: flow.date, amount: flow.amount / factor } : flow,
    );
    const realXirr = xirrPercent(deflated);

    return {
      fund: {
        symbol: scheme.symbol,
        name: scheme.name,
        manager: scheme.manager,
        since: f.nav[0]!.date,
        navNow: f.nav[f.nav.length - 1]!.nav,
        navDate: sim.lastNavDate,
      },
      installments: sim.installments,
      paid: Math.round(sim.paid),
      invested: Math.round(sim.invested),
      units: Math.round(sim.units * 100) / 100,
      avgBuyNav: Math.round(sim.avgBuyNav * 100) / 100,
      value: Math.round(sim.value),
      profit: Math.round(sim.profit),
      totalReturnPct: Math.round(sim.totalReturnPct * 100) / 100,
      xirr: round2(sim.xirr),
      startMoved: sim.startMoved,
      firstInstallment: sim.firstInstallment,
      navDate: sim.lastNavDate,
      buys: sim.buys.map((b) => ({
        date: b.date,
        nav: Math.round(b.nav * 100) / 100,
        units: Math.round(b.units * 100) / 100,
      })),
      series: sim.series.map((p) => ({ date: p.date, paid: Math.round(p.paid), value: Math.round(p.value) })),
      nepse: nepseSim
        ? {
            xirr: round2(nepseSim.xirr),
            value: Math.round(nepseSim.value),
            series: nepseSim.series.map((p) => ({ date: p.date, value: Math.round(p.value) })),
          }
        : null,
      rd: { value: Math.round(rd.value), series: rd.series.map((p) => ({ date: p.date, value: Math.round(p.value) })) },
      inflation: {
        factorPct: Math.round((factor - 1) * 1000) / 10,
        realValue: Math.round(realValue(sim.value, sim.firstInstallment ?? startIso, sim.lastNavDate)),
        realXirr: round2(realXirr),
      },
    };
  });

function round2(v: number | null): number | null {
  return v == null ? null : Math.round(v * 100) / 100;
}

export interface SipFundRow {
  symbol: string;
  name: string;
  manager: string;
  /** First NAV date in the feed: where the simulation can start at the earliest. */
  since: string;
  navNow: number;
  navDate: string;
  /** True when the fund existed at the chosen start month, so it is in the ranking. */
  ranked: boolean;
  /** XIRR above the NEPSE run on the identical dates. Null when not comparable. */
  beatsNepse: boolean | null;
  installments: number;
  paid: number;
  value: number;
  profit: number;
  totalReturnPct: number;
  /** Annual rate of the cash-flow stream on NAV alone. Dividends are not in the feed. */
  xirr: number | null;
  nepseXirr: number | null;
  nepseValue: number;
  rdValue: number;
}

export interface SipLandscape {
  startIso: string;
  amount: number;
  rdRate: number;
  /** The single day every ranked fund is valued on. */
  asOf: string | null;
  /** Earliest month the NAV dataset covers, YYYY-MM. */
  earliestStart: string | null;
  /** Earliest month with at least three funds alive, the widest useful window. */
  widestStart: string | null;
  fundCount: number;
  /** Funds that existed at the start month and are being ranked. */
  rankedCount: number;
  /** How many ranked funds beat NEPSE on identical dates. */
  beatCount: number;
  medianXirr: number | null;
  best: { symbol: string; name: string; xirr: number | null; value: number } | null;
  rows: SipFundRow[];
  nepse: { xirr: number | null; value: number; installments: number } | null;
  benchmarkNote: string;
}

export interface SipSimulation {
  fund: { symbol: string; name: string; manager: string; since: string; navNow: number; navDate: string };
  installments: number;
  paid: number;
  invested: number;
  units: number;
  avgBuyNav: number;
  value: number;
  profit: number;
  totalReturnPct: number;
  xirr: number | null;
  startMoved: boolean;
  firstInstallment: string | null;
  navDate: string;
  buys?: { date: string; nav: number; units: number }[];
  series: { date: string; paid: number; value: number }[];
  nepse: { xirr: number | null; value: number; series: { date: string; value: number }[] } | null;
  rd: { value: number; series: { date: string; value: number }[] };
  inflation: { factorPct: number; realValue: number; realXirr: number | null };
}
