import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Calculator,
  Calendar,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  GitCompareArrows,
  History,
  Landmark,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart } from "@/components/market/area-chart";
import { TimeMachineTerminalChart } from "@/components/tools/time-machine-terminal-chart";
import { TimeMachineCompareChart } from "@/components/tools/time-machine-compare-chart";
import { DeltaPill } from "@/components/stat-card";
import { LoadingBlock, EmptyBlock } from "@/components/states";
import {
  dividendsQuery,
  marketSnapshotQuery,
  scripFullHistoryQuery,
  mfSchemesQuery,
  mfSchemeQuery,
} from "@/lib/queries";
import { formatDate, formatNpr, formatPercent, formatQty } from "@/lib/format";
import { sectorOf } from "@/lib/nepse/sectors";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { LivePrice, PricePoint } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/time-machine")({
  head: () => ({
    meta: [
      { title: "Time Machine | MeroShare Console" },
      {
        name: "description",
        content:
          "What if you had invested then? Backtest SIP DCA, bonus shares, cash dividends, and compare against Bank FD.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/time-machine")],
  }),
  component: TimeMachinePage,
});

type Freq = "once" | "monthly" | "quarterly" | "yearly";
type RangePreset = "1Y" | "3Y" | "5Y" | "max" | "custom";

const AMOUNT_PRESETS = [2500, 5000, 10000, 25000, 50000, 100000];

function isMutualFund(
  symbol: string,
  sector?: string | null,
  schemes?: { symbol: string }[]
): boolean {
  const sym = symbol.toUpperCase();
  if (sector && /mutual fund/i.test(sector)) return true;
  if (schemes?.some((s) => s.symbol.toUpperCase() === sym)) return true;
  return false;
}

function faceOf(
  sector: string | null | undefined,
  symbol: string,
  schemes?: { symbol: string }[]
): number {
  const s = sector ?? sectorOf(symbol) ?? "";
  return isMutualFund(symbol, s, schemes) ? 10 : 100;
}

// XIRR Calculation using Newton-Raphson method
function calculateXirr(cashFlows: { date: string; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null;
  const hasNegative = cashFlows.some((c) => c.amount < 0);
  const hasPositive = cashFlows.some((c) => c.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const t0 = new Date(cashFlows[0]!.date).getTime();
  const flows = cashFlows.map((c) => ({
    amount: c.amount,
    years: (new Date(c.date).getTime() - t0) / (365.25 * 86400000),
  }));

  let rate = 0.12; // Initial guess 12%
  for (let iter = 0; iter < 80; iter++) {
    let fValue = 0;
    let fDerivative = 0;
    for (const { amount, years } of flows) {
      const factor = Math.pow(1 + rate, years);
      if (!Number.isFinite(factor) || factor === 0) continue;
      fValue += amount / factor;
      fDerivative -= (years * amount) / (factor * (1 + rate));
    }

    if (Math.abs(fDerivative) < 1e-10) break;
    const newRate = rate - fValue / fDerivative;
    if (Math.abs(newRate - rate) < 1e-6) {
      return Number.isFinite(newRate) ? newRate * 100 : null;
    }
    rate = newRate;
    if (rate < -0.99) rate = -0.99;
  }

  return Number.isFinite(rate) ? rate * 100 : null;
}

export interface DayDetail {
  time: number;
  date: string;
  value: number;
  invested: number;
  price: number;
  units: number;
  event?: {
    bonusPct: number;
    cashPct: number;
    bonusUnits: number;
    cashAmount: number;
  };
}

export interface BacktestArgs {
  symbol: string;
  amount: number;
  freq: Freq;
  from: string;
  to: string;
  reinvest: boolean;
  fdRate: number;
  history: { date: string; close: number }[];
  dividends: {
    symbol: string;
    bonusShare: number;
    cashDividend: number;
    bookCloseDate: string | null;
    announcementDate: string | null;
    fiscalYear: string | null;
  }[];
  liveLtp: number | null;
  face: number;
}

export interface BacktestResult {
  symbol: string;
  held: number;
  invested: number;
  cashPile: number;
  cashReceived: number;
  bonusUnits: number;
  reinvestedUnits: number;
  totalBought: number;
  firstPrice: number | null;
  firstDate: string | null;
  lastPrice: number;
  finalValue: number;
  totalGain: number;
  totalGainPct: number;
  xirr: number | null;
  cagr: number | null;
  annualizedReturn: number | null;
  shareMultiplier: number;
  avgCostPerShare: number;
  chartPoints: PricePoint[];
  dayDetailsMap: Map<number, DayDetail>;
  terminalPoints: {
    date: string;
    value: number;
    invested: number;
    price: number;
    units: number;
    event?: DayDetail["event"];
  }[];
  buyLedger: {
    date: string;
    price: number;
    amount: number;
    units: number;
    cumulativeUnits: number;
    cumulativeInvested: number;
  }[];
  corporateActionsLedger: {
    date: string;
    fiscalYear: string;
    bonusPct: number;
    cashPct: number;
    heldBefore: number;
    bonusGot: number;
    cashGot: number;
    reinvestedShares: number;
  }[];
  yearlyBreakdown: {
    year: string;
    buysCount: number;
    invested: number;
    bonusPct: number;
    cashPct: number;
    bonusUnits: number;
    cashReceived: number;
    yearEndUnits: number;
    yearEndPrice: number;
    yearEndValue: number;
  }[];
  totalFdValue: number;
  fdTotalGain: number;
  fdTotalGainPct: number;
  alpha: number;
  alphaPct: number;
  from: string;
  to: string;
}

function runBacktest(args: BacktestArgs): BacktestResult | null {
    const { symbol, amount, freq, from, to, reinvest, fdRate, history, dividends, liveLtp, face } = args;
    if (!symbol || !history.length || amount <= 0) return null;

    const fromTs = new Date(from).getTime();
    const toTs = new Date(to).getTime();
    if (Number.isNaN(fromTs) || Number.isNaN(toTs) || fromTs >= toTs) return null;

    // Filter and sort historical daily bars
    const bars = history
      .filter((b) => {
        const t = new Date(b.date).getTime();
        return t >= fromTs && t <= toTs;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (bars.length === 0) return null;

    // Generate schedule of buy dates
    const buyScheduleDates = new Set<string>();
    if (freq === "once") {
      buyScheduleDates.add(from);
    } else {
      const cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        buyScheduleDates.add(cur.toISOString().slice(0, 10));
        if (freq === "monthly") cur.setMonth(cur.getMonth() + 1);
        else if (freq === "quarterly") cur.setMonth(cur.getMonth() + 3);
        else if (freq === "yearly") cur.setFullYear(cur.getFullYear() + 1);
      }
    }

    // Map schedule dates to actual market trading bar dates
    const executedBuys: { date: string; price: number; targetDate: string }[] = [];
    for (const d of Array.from(buyScheduleDates).sort()) {
      const bar = bars.find((b) => b.date >= d) ?? bars[bars.length - 1];
      if (bar) {
        executedBuys.push({ date: bar.date, price: bar.close, targetDate: d });
      }
    }

    // Prepare dividends for this symbol in range
    const divs = dividends
      .filter((d) => d.symbol.toUpperCase() === symbol.toUpperCase())
      .map((d) => ({
        date: d.bookCloseDate || d.announcementDate || "",
        fiscalYear: d.fiscalYear ?? "-",
        bonus: d.bonusShare,
        cash: d.cashDividend,
      }))
      .filter((d) => d.date >= from && d.date <= to && d.date !== "")
      .sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate dividends by fiscal year and date
    const uniqueDivs = divs.filter(
      (d, idx, arr) =>
        idx === arr.findIndex((t) => t.fiscalYear === d.fiscalYear && t.date === d.date)
    );

    // Track running portfolio state
    let held = 0;
    let invested = 0;
    let cashPile = 0;
    let bonusUnits = 0;
    let cashReceived = 0;
    let reinvestedUnits = 0;
    let totalBought = 0;
    let firstPrice: number | null = null;
    let firstDate: string | null = null;

    const buyLedger: {
      date: string;
      price: number;
      amount: number;
      units: number;
      cumulativeUnits: number;
      cumulativeInvested: number;
    }[] = [];

    const corporateActionsLedger: {
      date: string;
      fiscalYear: string;
      bonusPct: number;
      cashPct: number;
      heldBefore: number;
      bonusGot: number;
      cashGot: number;
      reinvestedShares: number;
    }[] = [];

    // Cash flows for XIRR
    const cashFlows: { date: string; amount: number }[] = [];

    // Map events by date
    const buysByDate = new Map<string, { price: number; date: string }[]>();
    for (const b of executedBuys) {
      const arr = buysByDate.get(b.date) ?? [];
      arr.push(b);
      buysByDate.set(b.date, arr);
    }

    const divsByDate = new Map<string, typeof uniqueDivs>();
    for (const d of uniqueDivs) {
      const arr = divsByDate.get(d.date) ?? [];
      arr.push(d);
      divsByDate.set(d.date, arr);
    }

    // Continuous daily timeline points for AreaChart
    const chartPoints: PricePoint[] = [];
    const dayDetailsMap = new Map<number, DayDetail>();

    // Walk through each market bar chronologically
    for (const bar of bars) {
      // 1. Check if there are buys on this date
      const scheduledBuys = buysByDate.get(bar.date);
      if (scheduledBuys) {
        for (const b of scheduledBuys) {
          const buyPrice = b.price > 0 ? b.price : bar.close;
          const qty = buyPrice > 0 ? Math.floor(amount / buyPrice) : 0;
          if (qty > 0) {
            held += qty;
            totalBought += qty;
            invested += amount;
            if (firstPrice === null) {
              firstPrice = buyPrice;
              firstDate = bar.date;
            }
            buyLedger.push({
              date: bar.date,
              price: buyPrice,
              amount,
              units: qty,
              cumulativeUnits: held,
              cumulativeInvested: invested,
            });
            cashFlows.push({ date: bar.date, amount: -amount });
          }
        }
      }

      // 2. Check if there are dividend events on this date
      const barDivs = divsByDate.get(bar.date);
      let dayEvent: DayDetail["event"] | undefined;

      if (barDivs) {
        for (const div of barDivs) {
          const heldBefore = held;
          const bUnits = Math.floor(heldBefore * (div.bonus / 100));
          const cashDivAmount = heldBefore * (div.cash / 100) * face;

          held += bUnits;
          bonusUnits += bUnits;
          cashReceived += cashDivAmount;

          let addedFromReinvest = 0;
          if (reinvest && cashDivAmount > 0 && bar.close > 0) {
            addedFromReinvest = Math.floor(cashDivAmount / bar.close);
            if (addedFromReinvest > 0) {
              held += addedFromReinvest;
              reinvestedUnits += addedFromReinvest;
              cashPile += cashDivAmount - addedFromReinvest * bar.close;
            } else {
              cashPile += cashDivAmount;
            }
          } else {
            cashPile += cashDivAmount;
            if (!reinvest && cashDivAmount > 0) {
              cashFlows.push({ date: bar.date, amount: cashDivAmount });
            }
          }

          corporateActionsLedger.push({
            date: bar.date,
            fiscalYear: div.fiscalYear,
            bonusPct: div.bonus,
            cashPct: div.cash,
            heldBefore,
            bonusGot: bUnits,
            cashGot: cashDivAmount,
            reinvestedShares: addedFromReinvest,
          });

          dayEvent = {
            bonusPct: div.bonus,
            cashPct: div.cash,
            bonusUnits: bUnits,
            cashAmount: cashDivAmount,
          };
        }
      }

      // Current portfolio valuation for this trading day
      const curValue = held * bar.close + cashPile;
      const unixSec = Math.floor(new Date(bar.date).getTime() / 1000);

      chartPoints.push({
        time: unixSec,
        value: curValue,
      });

      dayDetailsMap.set(unixSec, {
        time: unixSec,
        date: bar.date,
        value: curValue,
        invested,
        price: bar.close,
        units: held,
        ...(dayEvent ? { event: dayEvent } : {}),
      });
    }

    // Final valuation
    const lastBar = bars[bars.length - 1]!;
    const lastPrice = liveLtp ?? lastBar.close;
    const finalValue = held * lastPrice + cashPile;
    const totalGain = finalValue - invested;
    const totalGainPct = invested > 0 ? (totalGain / invested) * 100 : 0;

    // Push terminal cash flow for XIRR
    cashFlows.push({ date: lastBar.date, amount: finalValue });
    const xirr = calculateXirr(cashFlows);

    // Calculate CAGR for duration
    const totalYears =
      (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400000);
    const cagr =
      totalYears >= 0.5 && invested > 0 && finalValue > 0
        ? (Math.pow(finalValue / invested, 1 / totalYears) - 1) * 100
        : null;

    // Fixed Deposit (FD) Benchmark Comparison (compounded yearly at fdRate% p.a.)
    const annualFdRate = Math.max(0.01, (fdRate || 7.5) / 100);
    let totalFdValue = 0;
    for (const b of executedBuys) {
      const buyTs = new Date(b.date).getTime();
      const yearsHeld = Math.max(0, (toTs - buyTs) / (365.25 * 86400000));
      // Yearly compounding basis: A = P * (1 + r)^yearsHeld
      totalFdValue += amount * Math.pow(1 + annualFdRate, yearsHeld);
    }
    const fdTotalGain = totalFdValue - invested;
    const fdTotalGainPct = invested > 0 ? (fdTotalGain / invested) * 100 : 0;
    const alpha = finalValue - totalFdValue;
    const alphaPct = totalGainPct - fdTotalGainPct;

    // Share Multiplier
    const shareMultiplier = totalBought > 0 ? held / totalBought : 1;

    // Average cost per share (WACC basis)
    const avgCostPerShare = held > 0 ? invested / held : 0;

    // Yearly Breakdown aggregation
    const years = Array.from(new Set(bars.map((b) => b.date.slice(0, 4)))).sort();
    const yearlyBreakdown = years.map((yr) => {
      const yrBars = bars.filter((b) => b.date.startsWith(yr));
      const yrLastBar = yrBars[yrBars.length - 1];
      const yrEndPt = chartPoints.find(
        (p) => p.time === Math.floor(new Date(yrLastBar?.date ?? "").getTime() / 1000)
      );

      const yrBuys = executedBuys.filter((b) => b.date.startsWith(yr));
      const yrInvested = yrBuys.length * amount;

      const yrDivs = uniqueDivs.filter((d) => d.date.startsWith(yr));
      const bonusPctSum = yrDivs.reduce((s, d) => s + d.bonus, 0);
      const cashPctSum = yrDivs.reduce((s, d) => s + d.cash, 0);

      const yrCorp = corporateActionsLedger.filter((c) => c.date.startsWith(yr));
      const bonusUnitsYear = yrCorp.reduce((s, c) => s + c.bonusGot, 0);
      const cashAmountYear = yrCorp.reduce((s, c) => s + c.cashGot, 0);

      const endDetail = yrEndPt ? dayDetailsMap.get(yrEndPt.time) : undefined;

      return {
        year: yr,
        buysCount: yrBuys.length,
        invested: yrInvested,
        bonusPct: bonusPctSum,
        cashPct: cashPctSum,
        bonusUnits: bonusUnitsYear,
        cashReceived: cashAmountYear,
        yearEndUnits: endDetail?.units ?? 0,
        yearEndPrice: yrLastBar?.close ?? 0,
        yearEndValue: yrEndPt?.value ?? 0,
      };
    });

    const terminalPoints = bars.map((bar) => {
      const unixSec = Math.floor(new Date(bar.date).getTime() / 1000);
      const detail = dayDetailsMap.get(unixSec);
      return {
        date: bar.date,
        value: detail?.value ?? 0,
        invested: detail?.invested ?? 0,
        price: bar.close,
        units: detail?.units ?? 0,
        ...(detail?.event ? { event: detail.event } : {}),
      };
    });

    return {
      held,
      invested,
      cashPile,
      cashReceived,
      bonusUnits,
      reinvestedUnits,
      totalBought,
      firstPrice,
      firstDate,
      lastPrice,
      finalValue,
      totalGain,
      totalGainPct,
      xirr,
      cagr,
      annualizedReturn: xirr ?? cagr,
      shareMultiplier,
      avgCostPerShare,
      chartPoints,
      dayDetailsMap,
      terminalPoints,
      buyLedger,
      corporateActionsLedger,
      yearlyBreakdown,
      totalFdValue,
      fdTotalGain,
      fdTotalGainPct,
      alpha,
      alphaPct,
      from,
      to,
    };
}

const COMPARE_COLORS = [
  "#10b981", // Emerald
  "#38bdf8", // Sky
  "#f59e0b", // Amber
  "#a855f7", // Violet
  "#f43f5e", // Rose
];

const COMPARE_PRESETS: { label: string; symbols: string[] }[] = [
  { label: "Banks", symbols: ["NABIL", "NICA", "GBIME", "ADBL", "SCB"] },
  { label: "Hydropower", symbols: ["CHCL", "SJCL", "SHPC", "UPPER", "AHPC"] },
  { label: "Insurance", symbols: ["NLIC", "LICN", "NLICL", "ILI", "HLI"] },
  { label: "Top 5", symbols: ["NABIL", "CHCL", "NTC", "SHIVM", "HRL"] },
];

export interface UnifiedSearchAsset {
  symbol: string;
  name: string;
  category: "equity" | "mutual_fund" | "open_end_mf";
  sector: string;
  face: number;
  ltp: number | null;
  changePct: number | null;
}

function TimeMachinePage() {
  const [mode, setMode] = useState<"single" | "compare">("single");

  // Single mode state
  const [symbol, setSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Compare mode state (up to 5 symbols)
  // Starts empty — user builds the list manually then presses "Compare"
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [compareSearch, setCompareSearch] = useState("");
  const [compareIsReady, setCompareIsReady] = useState(false); // gates results view
  const [showAddCompare, setShowAddCompare] = useState(false);

  // Single-view inline compare: add another symbol without leaving single view
  const [singleCompareSearch, setSingleCompareSearch] = useState("");
  const [showSingleCompareAdd, setShowSingleCompareAdd] = useState(false);

  // Shared backtest parameters
  const [amount, setAmount] = useState(10000);
  const [freq, setFreq] = useState<Freq>("monthly");

  // Date range & preset: default to 3 Years, custom date inputs hidden by default
  const [rangePreset, setRangePreset] = useState<RangePreset>("3Y");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [reinvest, setReinvest] = useState(true);
  // Default Nepal commercial bank FD rate (~7.5% per annum, compounded yearly)
  const [fdRate, setFdRate] = useState(7.5);

  // Queries for single mode
  const historyQ = useQuery(scripFullHistoryQuery(mode === "single" && symbol ? symbol : null));
  const mfDetailQ = useQuery(mfSchemeQuery(mode === "single" && symbol ? symbol : null));
  const divQ = useQuery(dividendsQuery());
  const snapQ = useQuery(marketSnapshotQuery());
  const mfSchemesQ = useQuery(mfSchemesQuery());

  // Queries for compare mode
  const compareHistoryQueries = useQueries({
    queries: compareSymbols.map((sym) => scripFullHistoryQuery(sym)),
  });

  const compareMfQueries = useQueries({
    queries: compareSymbols.map((sym) => mfSchemeQuery(sym)),
  });

  const prices = snapQ.data?.prices ?? [];

  // Unified Search Asset Database (Equities, Closed-end funds, Open-ended mutual funds)
  const searchDatabase = useMemo<UnifiedSearchAsset[]>(() => {
    const list: UnifiedSearchAsset[] = [];
    const seen = new Set<string>();

    for (const p of prices) {
      const sym = p.symbol.toUpperCase();
      seen.add(sym);
      const isMf = /mutual fund/i.test(p.sector) || p.asset_type === "open_ended_mutual_fund";
      const isOpen = p.asset_type === "open_ended_mutual_fund";
      list.push({
        symbol: sym,
        name: p.name,
        category: isOpen ? "open_end_mf" : isMf ? "mutual_fund" : "equity",
        sector: p.sector || (isOpen ? "Open-Ended Mutual Fund" : isMf ? "Mutual Fund" : "Equity"),
        face: isMf ? 10 : 100,
        ltp: p.ltp,
        changePct: p.percentChange,
      });
    }

    for (const s of mfSchemesQ.data ?? []) {
      const sym = s.symbol.toUpperCase();
      if (!seen.has(sym)) {
        seen.add(sym);
        const isOpen = s.fundType === "open_end";
        list.push({
          symbol: sym,
          name: s.name,
          category: isOpen ? "open_end_mf" : "mutual_fund",
          sector: isOpen ? "Open-Ended Mutual Fund" : "Mutual Fund",
          face: s.faceValue ?? 10,
          ltp: null,
          changePct: null,
        });
      }
    }

    return list;
  }, [prices, mfSchemesQ.data]);

  // Filtered search results for single mode search
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchDatabase.slice(0, 30);
    return searchDatabase
      .filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sector.toLowerCase().includes(q)
      )
      .slice(0, 35);
  }, [searchDatabase, searchQuery]);

  // Filtered search results for adding in compare mode
  const compareSearchResults = useMemo(() => {
    const q = compareSearch.trim().toLowerCase();
    const available = searchDatabase.filter(
      (a) => !compareSymbols.some((s) => s.toUpperCase() === a.symbol.toUpperCase())
    );
    if (!q) return available.slice(0, 15);
    return available
      .filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sector.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [searchDatabase, compareSearch, compareSymbols]);

  // Filtered search for single-view "compare with another" — excludes current symbol
  const singleCompareResults = useMemo(() => {
    const q = singleCompareSearch.trim().toLowerCase();
    const cur = symbol.toUpperCase();
    const available = searchDatabase.filter((a) => a.symbol.toUpperCase() !== cur);
    if (!q) return available.slice(0, 12);
    return available
      .filter(
        (p) =>
          p.symbol.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.sector.toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [searchDatabase, singleCompareSearch, symbol]);

  const handleCompareFromSingle = (other: string) => {
    const o = other.toUpperCase().trim();
    if (!o || o === symbol.toUpperCase()) return;
    const next = [symbol.toUpperCase(), o].slice(0, 5);
    // Avoid duplicates if user had prior compare list
    const merged = Array.from(new Set(next));
    setCompareSymbols(merged);
    setCompareSearch("");
    setSingleCompareSearch("");
    setShowSingleCompareAdd(false);
    setShowAddCompare(false);
    setCompareIsReady(true);
    setMode("compare");
  };

  // Single mode calculation
  const live = prices.find((p) => p.symbol === symbol.toUpperCase());
  const mfScheme = mfSchemesQ.data?.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
  const isMf = isMutualFund(symbol, live?.sector, mfSchemesQ.data);
  const face = isMf ? 10 : 100;
  const sector =
    live?.sector ??
    (isMf
      ? mfScheme?.fundType === "open_end"
        ? "Open-End MF"
        : "Mutual Fund"
      : symbol
        ? sectorOf(symbol)
        : null);

  const scripBars = (historyQ.data ?? []).map((b) => ({ date: b.date, close: b.close }));
  const mfBars = (mfDetailQ.data?.nav ?? [])
    .filter((n) => n.date && (n.nav > 0 || n.adjNav > 0))
    .map((n) => ({ date: n.date, close: n.adjNav > 0 ? n.adjNav : n.nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const historyBars = scripBars.length >= 5 ? scripBars : mfBars;
  const liveLtp = live?.ltp ?? (mfBars.length > 0 ? mfBars[mfBars.length - 1]?.close : null);

  const result = useMemo(() => {
    if (!symbol) return null;
    return runBacktest({
      symbol,
      amount,
      freq,
      from,
      to,
      reinvest,
      fdRate,
      history: historyBars,
      dividends: (divQ.data ?? []).map((d) => ({
        symbol: d.symbol,
        bonusShare: d.bonusShare,
        cashDividend: d.cashDividend,
        bookCloseDate: d.bookCloseDate,
        announcementDate: d.announcementDate,
        fiscalYear: d.fiscalYear,
      })),
      liveLtp,
      face,
    });
  }, [symbol, amount, freq, from, to, reinvest, fdRate, historyBars, divQ.data, liveLtp, face]);

  // Compare mode calculation for each asset
  const compareResults = useMemo(() => {
    return compareSymbols.map((sym, idx) => {
      const histData = compareHistoryQueries[idx]?.data ?? [];
      const mfNavData = compareMfQueries[idx]?.data?.nav ?? [];
      const scripB = histData.map((b) => ({ date: b.date, close: b.close }));
      const mfB = mfNavData
        .filter((n) => n.date && (n.nav > 0 || n.adjNav > 0))
        .map((n) => ({ date: n.date, close: n.adjNav > 0 ? n.adjNav : n.nav }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const bars = scripB.length >= 5 ? scripB : mfB;

      const liveItem = prices.find((p) => p.symbol === sym.toUpperCase());
      const scheme = mfSchemesQ.data?.find((s) => s.symbol.toUpperCase() === sym.toUpperCase());
      const isFund = isMutualFund(sym, liveItem?.sector, mfSchemesQ.data);
      const faceVal = isFund ? 10 : 100;
      const curLtp = liveItem?.ltp ?? (mfB.length > 0 ? mfB[mfB.length - 1]?.close : null);
      const name = liveItem?.name ?? scheme?.name ?? sym;
      const itemSector =
        liveItem?.sector ??
        (isFund
          ? scheme?.fundType === "open_end"
            ? "Open-End MF"
            : "Mutual Fund"
          : sectorOf(sym) ?? "Equity");

      const res = runBacktest({
        symbol: sym,
        amount,
        freq,
        from,
        to,
        reinvest,
        fdRate,
        history: bars,
        dividends: (divQ.data ?? []).map((d) => ({
          symbol: d.symbol,
          bonusShare: d.bonusShare,
          cashDividend: d.cashDividend,
          bookCloseDate: d.bookCloseDate,
          announcementDate: d.announcementDate,
          fiscalYear: d.fiscalYear,
        })),
        liveLtp: curLtp,
        face: faceVal,
      });

      const color = COMPARE_COLORS[idx % COMPARE_COLORS.length]!;

      return {
        symbol: sym,
        name,
        color,
        isMf: isFund,
        sector: itemSector,
        barsCount: bars.length,
        result: res,
      };
    });
  }, [
    compareSymbols,
    compareHistoryQueries,
    compareMfQueries,
    prices,
    mfSchemesQ.data,
    amount,
    freq,
    from,
    to,
    reinvest,
    fdRate,
    divQ.data,
  ]);

  // Series format for lightweight-charts
  const compareSeries = useMemo(() => {
    return compareResults
      .filter(
        (c): c is typeof c & { result: NonNullable<typeof c.result> } =>
          Boolean(c.result && c.result.terminalPoints.length > 0)
      )
      .map((c) => ({
        symbol: c.symbol,
        name: c.name,
        color: c.color,
        points: c.result.terminalPoints.map((p) => ({ date: p.date, value: p.value })),
        finalValue: c.result.finalValue,
        totalGainPct: c.result.totalGainPct,
      }));
  }, [compareResults]);

  // Ranked results for leaderboard
  const rankedCompareResults = useMemo(() => {
    return [...compareResults]
      .filter(
        (c): c is typeof c & { result: NonNullable<typeof c.result> } => Boolean(c.result)
      )
      .sort((a, b) => b.result.finalValue - a.result.finalValue);
  }, [compareResults]);

  // Preset Date Range buttons handler
  const handlePresetChange = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === "custom") return;

    const today = new Date().toISOString().slice(0, 10);
    setTo(today);

    if (preset === "1Y") {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      setFrom(d.toISOString().slice(0, 10));
    } else if (preset === "3Y") {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 3);
      setFrom(d.toISOString().slice(0, 10));
    } else if (preset === "5Y") {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 5);
      setFrom(d.toISOString().slice(0, 10));
    } else if (preset === "max") {
      if (mode === "single") {
        const earliest = historyBars[0]?.date;
        setFrom(earliest || "2016-01-01");
      } else {
        let earliest = "2099-12-31";
        for (const c of compareResults) {
          const first = c.result?.terminalPoints[0]?.date;
          if (first && first < earliest) earliest = first;
        }
        setFrom(earliest !== "2099-12-31" ? earliest : "2016-01-01");
      }
    }
  };

  // Compare mode add/remove helpers
  const handleAddCompareSymbol = (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (!s || compareSymbols.includes(s) || compareSymbols.length >= 5) return;
    setCompareSymbols([...compareSymbols, s]);
    setCompareSearch("");
    // If results were already visible, keep them visible (live-update)
    // If not yet ready (still building list), don't auto-trigger
  };

  const handleRemoveCompareSymbol = (sym: string) => {
    const next = compareSymbols.filter((s) => s !== sym);
    setCompareSymbols(next);
    // If we go below 2, hide results so user must re-run
    if (next.length < 2) setCompareIsReady(false);
  };

  const handleApplyPreset = (symbols: string[]) => {
    const next = symbols.map((s) => s.toUpperCase().trim()).filter(Boolean).slice(0, 5);
    setCompareSymbols(next);
    setCompareSearch("");
    setShowAddCompare(false);
    setCompareIsReady(next.length >= 2);
  };


  // Copy share story summary to clipboard for single backtest
  const handleCopyStory = () => {
    if (!result || !symbol) return;
    const freqLabel =
      freq === "once"
        ? "One-time Lumpsum"
        : freq === "monthly"
          ? "Monthly SIP"
          : freq === "quarterly"
            ? "Quarterly SIP"
            : "Yearly SIP";

    const text = `🚀 NEPSE Time Machine Backtest: ${symbol}
📅 Period: ${formatDate(result.from)} – ${formatDate(result.to)} (${freqLabel}: ${formatNpr(amount)})
💰 Total Invested: ${formatNpr(result.invested)}
📈 Current Value: ${formatNpr(result.finalValue)} (${formatPercent(result.totalGainPct)})
✨ Net P&L: ${result.totalGain >= 0 ? "+" : ""}${formatNpr(result.totalGain)}
📊 Annualized Return: ${result.annualizedReturn ? `${result.annualizedReturn.toFixed(1)}% p.a.` : "-"}
🎁 Bonus Shares: +${result.bonusUnits.toLocaleString()} units (${result.shareMultiplier.toFixed(1)}x share count expansion)
💵 Cash Dividends: ${formatNpr(result.cashReceived)}
🏦 vs ${fdRate}% Bank Fixed Deposit (Yearly): ${result.alpha >= 0 ? "Outperformed FD by +" : "Underperformed FD by "}${formatNpr(result.alpha)}

Backtested with MeroShare Console 🇳🇵`;

    navigator.clipboard.writeText(text);
    toast.success("Backtest story copied to clipboard!");
  };

  // Copy comparison summary to clipboard
  const handleCopyCompareStory = () => {
    if (rankedCompareResults.length === 0) return;
    const freqLabel =
      freq === "once"
        ? "One-time Lumpsum"
        : freq === "monthly"
          ? "Monthly SIP"
          : freq === "quarterly"
            ? "Quarterly SIP"
            : "Yearly SIP";

    const lines = [
      `🚀 NEPSE Time Machine: ${rankedCompareResults.length}-Asset Comparison`,
      `📅 Period: ${formatDate(from)} – ${formatDate(to)} (${freqLabel}: ${formatNpr(amount)})`,
      `🏦 Benchmark: ${fdRate}% Bank FD (${formatNpr(rankedCompareResults[0]?.result.totalFdValue ?? 0)})`,
      ``,
      `🏆 Leaderboard Rankings:`,
    ];

    rankedCompareResults.forEach((item, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
      lines.push(
        `${medal} ${item.symbol}: ${formatNpr(item.result.finalValue)} (${formatPercent(item.result.totalGainPct)}, ${item.result.annualizedReturn ? `${item.result.annualizedReturn.toFixed(1)}% p.a.` : "-"}) · Units: ${item.result.held.toLocaleString()} (+${item.result.bonusUnits} bonus)`
      );
    });

    lines.push(``);
    lines.push(`Backtested with MeroShare Console 🇳🇵`);

    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Comparison summary copied to clipboard!");
  };

  /* =========================================================================
   * VIEW 1: SEARCH-ONLY VIEW (Single mode, no stock selected yet)
   * User must first search/pick a stock or mutual fund.
   * ========================================================================= */
  if (mode === "single" && !symbol) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-16 pt-4">
        {/* Top Mode Switcher */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center rounded-2xl bg-muted/60 p-1 border border-border/70 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("single")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-card text-foreground shadow-sm"
            >
              <Clock className="size-3.5 text-primary" />
              <span>Single Asset</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <GitCompareArrows className="size-3.5 text-muted-foreground" />
              <span>Compare</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[0.65rem] font-bold text-primary">
                Up to 5
              </span>
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm">
            <Clock className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
            Time Machine
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            What if you had invested then? Backtest historical SIP, bonus share compounding, and
            dividends against any NEPSE stock or Mutual Fund.
          </p>
        </div>

        {/* Dedicated Search Panel */}
        <Panel className="border-border/70 bg-card p-4 sm:p-6 shadow-sm space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company name, symbol, or mutual fund (e.g. NABIL, NIBLSTBF, CIT, SHIVM)..."
              className="h-12 pl-10 pr-4 text-sm rounded-xl font-medium border-border/80 focus:border-primary"
              autoFocus
            />
          </div>

          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {searchQuery ? "Search Matches" : "Stocks & Mutual Funds"}
            </p>

            <div className="divide-y divide-border/40 max-h-96 overflow-y-auto rounded-xl border border-border/60 bg-muted/10">
              {searchResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No asset found matching "{searchQuery}".
                </div>
              ) : (
                searchResults.map((p) => (
                  <button
                    key={p.symbol}
                    type="button"
                    onClick={() => {
                      setSymbol(p.symbol);
                      setSearchQuery("");
                    }}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-surface border border-border/60 font-mono font-bold text-xs text-foreground group-hover:text-primary transition-colors">
                        {p.symbol.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-foreground">
                            {p.symbol}
                          </span>
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                            {p.sector}
                          </span>
                          {p.category === "open_end_mf" && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
                              Open-End NAV
                            </span>
                          )}
                          {p.face === 10 && (
                            <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[0.62rem] font-mono text-muted-foreground">
                              Face 10
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-sm">
                          {p.name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <p className="font-semibold text-foreground">
                        {p.ltp ? formatNpr(p.ltp) : `Face ${formatNpr(p.face)}`}
                      </p>
                      {p.changePct !== null && (
                        <p
                          className={cn(
                            "text-[0.7rem] font-medium",
                            p.changePct >= 0 ? "text-gain" : "text-loss"
                          )}
                        >
                          {formatPercent(p.changePct)}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  /* =========================================================================
   * VIEW 2: COMPARE VIEW (Up to 5 stocks / mutual funds)
   * ========================================================================= */
  if (mode === "compare") {
    const winner = rankedCompareResults[0];
    const runnerUp = rankedCompareResults[1];
    const third = rankedCompareResults[2];

    return (
      <div className="space-y-6 pb-12">
        {/* Top Navigation & Mode Switcher Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Switcher */}
            <div className="inline-flex items-center rounded-2xl bg-muted/60 p-1 border border-border/70 shadow-sm">
              <button
                type="button"
                onClick={() => setMode("single")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Clock className="size-3.5 text-muted-foreground" />
                <span>Single Asset</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("compare")}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-card text-foreground shadow-sm"
              >
                <GitCompareArrows className="size-3.5 text-primary" />
                <span>Compare</span>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[0.65rem] font-bold text-primary">
                  {compareSymbols.length}/5
                </span>
              </button>
            </div>

            <div className="h-4 w-px bg-border/60" />

            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Compare Returns
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Simulate and compare up to 5 stocks or mutual funds under the same investment schedule
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCompareStory}
              disabled={rankedCompareResults.length === 0}
              className="h-9 gap-1.5 rounded-xl border-border/70 hover:bg-primary/5 hover:text-primary text-xs"
            >
              <Share2 className="size-3.5" />
              <span>Share Summary</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAmount(10000);
                setFreq("monthly");
                handlePresetChange("3Y");
                setReinvest(true);
                setFdRate(7.5);
              }}
              className="h-9 text-muted-foreground hover:text-foreground"
              title="Reset parameters to defaults"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Selected Compare Assets Manager Bar */}
        <Panel className="border-border/70 bg-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Comparing Assets ({compareSymbols.length}/5)
                </span>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[0.68rem] text-muted-foreground font-mono">
                  Max 5
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each asset receives the exact same {freq === "once" ? "lumpsum" : `${freq} installment`} of {formatNpr(amount)}.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.68rem] text-muted-foreground font-medium mr-1">Presets:</span>
              {COMPARE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset.symbols)}
                  className="rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/70 px-2 py-1 text-[0.68rem] font-medium text-foreground transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {compareResults.map((item) => (
              <div
                key={item.symbol}
                className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-3 py-1.5 shadow-sm text-xs font-mono"
              >
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-bold text-foreground">{item.symbol}</span>
                <span className="text-[0.68rem] text-muted-foreground font-sans truncate max-w-[110px]">
                  {item.sector}
                </span>
                {item.isMf && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[0.62rem] font-sans font-semibold text-primary">
                    MF (10)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveCompareSymbol(item.symbol)}
                  className="ml-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/60 p-0.5 transition-colors cursor-pointer"
                  title={`Remove ${item.symbol}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            {/* Add Asset Button / Inline Search */}
            {compareSymbols.length < 5 && (
              <div className="relative">
                {!showAddCompare ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddCompare(true)}
                    className="h-8 gap-1.5 rounded-xl border-dashed border-border/90 hover:border-primary text-xs"
                  >
                    <Plus className="size-3.5 text-primary" />
                    <span>Add Stock / Fund</span>
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        value={compareSearch}
                        onChange={(e) => setCompareSearch(e.target.value)}
                        placeholder="Search stock or mutual fund..."
                        className="h-8 pl-8 pr-7 text-xs rounded-xl font-medium"
                        autoFocus
                      />
                      {compareSearch && (
                        <button
                          type="button"
                          onClick={() => setCompareSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddCompare(false);
                        setCompareSearch("");
                      }}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {/* Dropdown list when searching in compare */}
                {showAddCompare && (
                  <div className="absolute left-0 top-10 z-50 w-80 max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-popover shadow-xl p-1 divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-150">
                    {compareSearchResults.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No matches found.
                      </div>
                    ) : (
                      compareSearchResults.map((asset) => (
                        <button
                          key={asset.symbol}
                          type="button"
                          onClick={() => handleAddCompareSymbol(asset.symbol)}
                          className="flex w-full items-center justify-between p-2 text-left hover:bg-muted/40 rounded-lg transition-colors cursor-pointer group text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-foreground group-hover:text-primary">
                                {asset.symbol}
                              </span>
                              <span className="rounded bg-muted/60 px-1 py-0.2 text-[0.62rem] text-muted-foreground">
                                {asset.sector}
                              </span>
                              {asset.category === "open_end_mf" && (
                                <span className="rounded bg-primary/10 px-1 py-0.2 text-[0.62rem] font-semibold text-primary">
                                  Open-End NAV
                                </span>
                              )}
                            </div>
                            <p className="text-[0.68rem] text-muted-foreground truncate max-w-[180px]">
                              {asset.name}
                            </p>
                          </div>
                          <span className="font-mono text-[0.72rem] text-muted-foreground">
                            {asset.ltp ? formatNpr(asset.ltp) : `Face ${formatNpr(asset.face)}`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* Control Deck (Tweaks) */}
        <Panel className="space-y-5 p-4 sm:p-6 border-border/70 bg-card">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Frequency Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="tm-compare-freq" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Frequency
              </Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
                <SelectTrigger id="tm-compare-freq" className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly SIP</SelectItem>
                  <SelectItem value="quarterly">Quarterly SIP</SelectItem>
                  <SelectItem value="yearly">Yearly SIP</SelectItem>
                  <SelectItem value="once">One-time Lumpsum</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[0.68rem] text-muted-foreground">
                {freq === "once" ? "Single upfront lump-sum buy" : `Regular ${freq} installments`}
              </p>
            </div>

            {/* 2. Amount per buy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tm-compare-amount" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {freq === "once" ? "Lumpsum Amount" : "Installment Amount"}
                </Label>
                <span className="font-mono text-xs font-semibold text-primary">
                  {formatNpr(amount)}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  रू
                </span>
                <Input
                  id="tm-compare-amount"
                  inputMode="numeric"
                  value={String(amount)}
                  onChange={(e) =>
                    setAmount(
                      Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 9)) || 0)
                    )
                  }
                  className="h-10 pl-8 font-mono font-medium rounded-xl"
                />
              </div>
              {/* Quick Amount Chips */}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {AMOUNT_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[0.65rem] font-mono transition-all",
                      amount === amt
                        ? "bg-primary/20 text-primary font-bold"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {amt >= 100000 ? `${amt / 100000}L` : `${amt / 1000}k`}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Reinvestment switch */}
            <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">Reinvest Cash Dividends</p>
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground leading-snug">
                    Automatically buy more shares/units at next available price
                  </p>
                </div>
                <Switch checked={reinvest} onCheckedChange={setReinvest} aria-label="reinvest" />
              </div>
              <div className="mt-2 text-[0.68rem] font-medium text-primary flex items-center gap-1">
                <Gift className="size-3" />
                <span>{reinvest ? "Compounding enabled" : "Cash held separately"}</span>
              </div>
            </div>

            {/* 4. Bank FD Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tm-compare-fd-rate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Bank FD Rate (% p.a.)
                </Label>
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  Yearly basis
                </span>
              </div>
              <div className="relative">
                <Input
                  id="tm-compare-fd-rate"
                  type="number"
                  step="0.1"
                  min="1"
                  max="25"
                  value={fdRate}
                  onChange={(e) => setFdRate(Math.max(1, Math.min(25, Number(e.target.value) || 0)))}
                  className="h-10 font-mono text-xs rounded-xl"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                  %
                </span>
              </div>
              <p className="text-[0.68rem] text-muted-foreground">
                Benchmark commercial bank deposit compounding annually
              </p>
            </div>
          </div>

          {/* Time Horizon Presets */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Time Horizon
              </Label>
              <span className="text-[0.72rem] text-muted-foreground font-mono">
                {formatDate(from)} to {formatDate(to)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <Button
                variant={rangePreset === "1Y" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs rounded-xl"
                onClick={() => handlePresetChange("1Y")}
              >
                1 Year
              </Button>
              <Button
                variant={rangePreset === "3Y" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs rounded-xl"
                onClick={() => handlePresetChange("3Y")}
              >
                3 Years
              </Button>
              <Button
                variant={rangePreset === "5Y" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs rounded-xl"
                onClick={() => handlePresetChange("5Y")}
              >
                5 Years
              </Button>
              <Button
                variant={rangePreset === "max" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs rounded-xl"
                onClick={() => handlePresetChange("max")}
              >
                Max All
              </Button>
              <Button
                variant={rangePreset === "custom" ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs rounded-xl"
                onClick={() => handlePresetChange("custom")}
              >
                Custom Range…
              </Button>
            </div>

            {/* Custom Date Pickers */}
            {rangePreset === "custom" && (
              <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t border-border/40 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <Label htmlFor="tm-compare-from" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="size-3 text-primary" /> Start Date (From)
                  </Label>
                  <Input
                    id="tm-compare-from"
                    type="date"
                    value={from}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFrom(v);
                      if (v) setTo((t) => t || new Date().toISOString().slice(0, 10));
                    }}
                    className="h-9 font-mono text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tm-compare-to" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="size-3 text-primary" /> End Date (To)
                  </Label>
                  <Input
                    id="tm-compare-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 font-mono text-xs rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Compare Chart & Analytics */}
        {compareSymbols.length < 2 ? (
          <EmptyBlock
            title="Add More Assets to Compare"
            description="Select at least 2 stocks or mutual funds from the selector above to compare their performance side-by-side."
          />
        ) : compareSeries.length === 0 ? (
          <LoadingBlock label="Calculating backtest timeline & cross-comparing performance…" />
        ) : (
          <>
            {/* Lightweight-Charts Multi-Line Compare Chart */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-display flex items-center gap-2 text-sm font-bold text-foreground">
                  <TrendingUp className="size-4 text-primary" /> Wealth Growth Comparison
                </h2>
                <span className="text-xs font-mono text-muted-foreground">
                  {compareSeries.length} assets plotted
                </span>
              </div>
              <TimeMachineCompareChart series={compareSeries} height={420} />
            </div>

            {/* Winner Podium & Ranking Cards */}
            {winner && (
              <div className="grid gap-4 md:grid-cols-3">
                {/* 1st Place Winner Card */}
                <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-500/10 via-card to-card p-5 shadow-sm md:col-span-1">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-500 flex items-center gap-1">
                      🥇 Rank #1 Winner
                    </span>
                    <span className="text-xs font-mono font-bold text-muted-foreground">
                      {winner.sector}
                    </span>
                  </div>

                  <div className="mt-3">
                    <h3 className="font-display text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                      {winner.symbol}
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{ backgroundColor: winner.color }}
                      />
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{winner.name}</p>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-border/40 pt-3 font-mono text-xs">
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">Final Value:</span>
                      <span className="text-lg font-bold text-foreground">
                        {formatNpr(winner.result.finalValue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">Total Return:</span>
                      <span className="font-bold text-gain">
                        {formatPercent(winner.result.totalGainPct)} (+{formatNpr(winner.result.totalGain)})
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">Annualized Return:</span>
                      <span className="font-bold text-primary">
                        {winner.result.annualizedReturn ? `${winner.result.annualizedReturn.toFixed(1)}% p.a.` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-muted-foreground">Bonus Expansion:</span>
                      <span className="text-foreground">
                        {winner.result.shareMultiplier.toFixed(2)}x (+{winner.result.bonusUnits} units)
                      </span>
                    </div>
                  </div>

                  {runnerUp && (
                    <div className="mt-4 rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Beat runner-up ({runnerUp.symbol}) by +{formatNpr(winner.result.finalValue - runnerUp.result.finalValue)} (+{(winner.result.totalGainPct - runnerUp.result.totalGainPct).toFixed(1)}% higher gain)
                    </div>
                  )}
                </div>

                {/* 2nd & 3rd Place Cards */}
                <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
                  {runnerUp && (
                    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          🥈 Rank #2 Runner Up
                        </span>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: runnerUp.color }}
                        />
                      </div>
                      <div>
                        <h4 className="font-display text-xl font-bold text-foreground">
                          {runnerUp.symbol}
                        </h4>
                        <p className="text-xs text-muted-foreground truncate">{runnerUp.name}</p>
                      </div>
                      <div className="space-y-1 font-mono text-xs border-t border-border/40 pt-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Value:</span>
                          <span className="font-bold text-foreground">{formatNpr(runnerUp.result.finalValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Return:</span>
                          <span className="font-semibold text-gain">{formatPercent(runnerUp.result.totalGainPct)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annualized:</span>
                          <span className="text-primary">{runnerUp.result.annualizedReturn ? `${runnerUp.result.annualizedReturn.toFixed(1)}%` : "-"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {third && (
                    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          🥉 Rank #3
                        </span>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: third.color }}
                        />
                      </div>
                      <div>
                        <h4 className="font-display text-xl font-bold text-foreground">
                          {third.symbol}
                        </h4>
                        <p className="text-xs text-muted-foreground truncate">{third.name}</p>
                      </div>
                      <div className="space-y-1 font-mono text-xs border-t border-border/40 pt-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Value:</span>
                          <span className="font-bold text-foreground">{formatNpr(third.result.finalValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Return:</span>
                          <span className="font-semibold text-gain">{formatPercent(third.result.totalGainPct)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Annualized:</span>
                          <span className="text-primary">{third.result.annualizedReturn ? `${third.result.annualizedReturn.toFixed(1)}%` : "-"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Benchmark Comparison Card */}
                  <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-3 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <Landmark className="size-3.5" /> Benchmark Standard
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{fdRate}% Bank FD</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <p className="text-muted-foreground text-[0.68rem]">FD Final Value</p>
                        <p className="font-bold text-base text-foreground mt-0.5">
                          {formatNpr(winner.result.totalFdValue)}
                        </p>
                        <p className="text-[0.68rem] text-muted-foreground">
                          {formatPercent(winner.result.fdTotalGainPct)} guaranteed return
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-[0.68rem]">Top Alpha Created</p>
                        <p className="font-bold text-base text-gain mt-0.5">
                          +{formatNpr(winner.result.alpha)}
                        </p>
                        <p className="text-[0.68rem] text-muted-foreground">
                          +{winner.result.alphaPct.toFixed(1)}% extra return above FD
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Side-by-Side Comparison Matrix Table */}
            <Panel className="p-4 sm:p-6 border-border/70">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-foreground">
                    Side-by-Side Performance Matrix
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Direct comparison of capital invested, final value, returns, corporate actions, and alpha
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="py-2.5 px-3 text-left font-semibold">Rank</th>
                      <th className="py-2.5 px-3 text-left font-semibold">Asset</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Invested</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Final Value</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Total Gain</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Annualized (XIRR)</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Units Held</th>
                      <th className="py-2.5 px-3 text-right font-semibold">Cash Div</th>
                      <th className="py-2.5 px-3 text-right font-semibold">vs Bank FD</th>
                      <th className="py-2.5 px-3 text-center font-semibold">Deep Dive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-mono">
                    {rankedCompareResults.map((item, idx) => {
                      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
                      const isTop = idx === 0;

                      return (
                        <tr
                          key={item.symbol}
                          className={cn(
                            "hover:bg-muted/20 transition-colors",
                            isTop ? "bg-amber-500/5 font-medium" : ""
                          )}
                        >
                          <td className="py-3 px-3 font-bold text-foreground text-sm">
                            {medal}
                          </td>
                          <td className="py-3 px-3 font-sans">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-foreground">
                                    {item.symbol}
                                  </span>
                                  <span className="rounded bg-muted/60 px-1 py-0.2 text-[0.62rem] text-muted-foreground font-sans">
                                    {item.sector}
                                  </span>
                                </div>
                                <p className="text-[0.68rem] text-muted-foreground truncate max-w-[150px]">
                                  {item.name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {formatNpr(item.result.invested)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-foreground text-sm">
                            {formatNpr(item.result.finalValue)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={cn(
                                "font-semibold",
                                item.result.totalGain >= 0 ? "text-gain" : "text-loss"
                              )}
                            >
                              {formatPercent(item.result.totalGainPct)}
                            </span>
                            <div className="text-[0.68rem] text-muted-foreground">
                              {item.result.totalGain >= 0 ? "+" : ""}
                              {formatNpr(item.result.totalGain)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-primary font-semibold">
                            {item.result.annualizedReturn !== null
                              ? `${item.result.annualizedReturn.toFixed(1)}%`
                              : "-"}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span>{item.result.held.toLocaleString()}</span>
                            <div className="text-[0.68rem] text-gain">
                              {item.result.shareMultiplier.toFixed(2)}x (+{item.result.bonusUnits} bonus)
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {formatNpr(item.result.cashReceived)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={cn(
                                "font-semibold",
                                item.result.alpha >= 0 ? "text-gain" : "text-loss"
                              )}
                            >
                              {item.result.alpha >= 0 ? "+" : ""}
                              {formatNpr(item.result.alpha)}
                            </span>
                            <div className="text-[0.68rem] text-muted-foreground">
                              {item.result.alphaPct >= 0 ? "+" : ""}
                              {item.result.alphaPct.toFixed(1)}%
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSymbol(item.symbol);
                                setMode("single");
                              }}
                              className="h-7 px-2 text-[0.7rem] rounded-lg text-primary hover:text-primary hover:bg-primary/10 gap-1 font-sans"
                            >
                              <span>Inspect</span>
                              <ExternalLink className="size-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    );
  }

  /* =========================================================================
   * VIEW 3: ACTIVE BACKTEST VIEW (Single mode, stock is selected)
   * ========================================================================= */
  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation & Profile Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSymbol("")}
            className="h-9 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Search Another</span>
          </Button>

          <div className="h-4 w-px bg-border/60" />

          {/* Mode Switcher */}
          <div className="inline-flex items-center rounded-2xl bg-muted/60 p-1 border border-border/70 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("single")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer bg-card text-foreground shadow-sm"
            >
              <Clock className="size-3.5 text-primary" />
              <span>Single Asset</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <GitCompareArrows className="size-3.5 text-muted-foreground" />
              <span>Compare</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[0.65rem] font-bold text-primary">
                Up to 5
              </span>
            </button>
          </div>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {symbol}
            </h1>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Backtest
            </span>
            {isMf && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                Mutual Fund (Face 10)
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyStory}
            disabled={!result}
            className="h-9 gap-1.5 rounded-xl border-border/70 hover:bg-primary/5 hover:text-primary text-xs"
          >
            <Share2 className="size-3.5" />
            <span>Share Story</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAmount(10000);
              setFreq("monthly");
              handlePresetChange("3Y");
              setReinvest(true);
              setFdRate(7.5);
            }}
            className="h-9 text-muted-foreground hover:text-foreground"
            title="Reset options to defaults"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Selected Stock Profile Card */}
      <Panel className="border-border/70 bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-surface shadow-sm font-mono font-bold text-lg text-primary">
              {symbol.slice(0, 4)}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                  {symbol}
                </h2>
                <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                  {sector ?? "Equities"}
                </span>
                <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[0.68rem] font-mono text-muted-foreground">
                  Face {formatNpr(face)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {live?.name ?? "Nepal Stock Exchange Listed Entity"}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Live LTP:</span>
                <span className="font-mono font-semibold text-foreground">
                  {liveLtp ? formatNpr(liveLtp) : "-"}
                </span>
                {live && live.percentChange !== 0 && (
                  <span
                    className={cn(
                      "font-mono font-medium text-[0.72rem]",
                      live.percentChange > 0 ? "text-gain" : "text-loss"
                    )}
                  >
                    ({formatPercent(live.percentChange)})
                  </span>
                )}
                <span className="text-muted-foreground/50">·</span>
                <span className="text-[0.7rem] text-muted-foreground">
                  {historyQ.data?.length ?? 0} closes recorded
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Compare with another — jump to compare mode prefilled with current symbol + picked one */}
            <div className="relative">
              {!showSingleCompareAdd ? (
                <Button
                  variant="outline"
                  onClick={() => setShowSingleCompareAdd(true)}
                  className="h-9 gap-2 rounded-xl border-primary/25 bg-primary/5 hover:bg-primary/10 text-xs text-primary"
                >
                  <GitCompareArrows className="size-3.5" />
                  <span>Compare +</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative w-56 sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={singleCompareSearch}
                      onChange={(e) => setSingleCompareSearch(e.target.value)}
                      placeholder="Add stock / fund to compare…"
                      className="h-9 pl-8 pr-7 text-xs rounded-xl font-medium"
                      autoFocus
                    />
                    {singleCompareSearch && (
                      <button
                        type="button"
                        onClick={() => setSingleCompareSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowSingleCompareAdd(false);
                      setSingleCompareSearch("");
                    }}
                    className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {showSingleCompareAdd && (
                <div className="absolute right-0 top-10 z-50 w-80 max-h-72 overflow-y-auto rounded-xl border border-border/80 bg-popover shadow-xl p-1 divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-150">
                  {singleCompareResults.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">No matches.</div>
                  ) : (
                    singleCompareResults.map((asset) => (
                      <button
                        key={asset.symbol}
                        type="button"
                        onClick={() => handleCompareFromSingle(asset.symbol)}
                        className="flex w-full items-center justify-between p-2 text-left hover:bg-muted/40 rounded-lg transition-colors cursor-pointer group text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-foreground group-hover:text-primary">
                              {asset.symbol}
                            </span>
                            <span className="rounded bg-muted/60 px-1 py-0.2 text-[0.62rem] text-muted-foreground">
                              {asset.sector}
                            </span>
                            {asset.category === "open_end_mf" && (
                              <span className="rounded bg-primary/10 px-1 py-0.2 text-[0.62rem] font-semibold text-primary">
                                Open-End NAV
                              </span>
                            )}
                          </div>
                          <p className="text-[0.68rem] text-muted-foreground truncate max-w-[180px]">
                            {asset.name}
                          </p>
                        </div>
                        <span className="font-mono text-[0.72rem] text-muted-foreground">
                          {asset.ltp ? formatNpr(asset.ltp) : `Face ${formatNpr(asset.face)}`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setSymbol("")}
              className="h-9 gap-2 rounded-xl border-border/80 text-xs"
            >
              <Search className="size-3.5" />
              <span>Switch Stock</span>
            </Button>
          </div>
        </div>
      </Panel>

      {/* Control Deck (Tweaks) */}
      <Panel className="space-y-5 p-4 sm:p-6 border-border/70 bg-card">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Frequency Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="tm-freq" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Frequency
            </Label>
            <Select value={freq} onValueChange={(v) => setFreq(v as Freq)}>
              <SelectTrigger id="tm-freq" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly SIP</SelectItem>
                <SelectItem value="quarterly">Quarterly SIP</SelectItem>
                <SelectItem value="yearly">Yearly SIP</SelectItem>
                <SelectItem value="once">One-time Lumpsum</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[0.68rem] text-muted-foreground">
              {freq === "once" ? "Single upfront lump-sum buy" : `Regular ${freq} installments`}
            </p>
          </div>

          {/* 2. Amount per buy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tm-amount" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {freq === "once" ? "Lumpsum Amount" : "Installment Amount"}
              </Label>
              <span className="font-mono text-xs font-semibold text-primary">
                {formatNpr(amount)}
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                रू
              </span>
              <Input
                id="tm-amount"
                inputMode="numeric"
                value={String(amount)}
                onChange={(e) =>
                  setAmount(
                    Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 9)) || 0)
                  )
                }
                className="h-10 pl-8 font-mono font-medium rounded-xl"
              />
            </div>
            {/* Quick Amount Chips */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {AMOUNT_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmount(amt)}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[0.65rem] font-mono transition-all",
                    amount === amt
                      ? "bg-primary/20 text-primary font-bold"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {amt >= 100000 ? `${amt / 100000}L` : `${amt / 1000}k`}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Reinvestment switch */}
          <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Reinvest Cash Dividends</p>
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground leading-snug">
                  Automatically buy more shares at next close after book-close
                </p>
              </div>
              <Switch checked={reinvest} onCheckedChange={setReinvest} aria-label="reinvest" />
            </div>
            <div className="mt-2 text-[0.68rem] font-medium text-primary flex items-center gap-1">
              <Gift className="size-3" />
              <span>{reinvest ? "Compounding enabled" : "Holding cash dividends as cash"}</span>
            </div>
          </div>

          {/* 4. Bank FD Rate (Adjustable & Yearly) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tm-fd-rate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Bank FD Rate (% p.a.)
              </Label>
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                Yearly basis
              </span>
            </div>
            <div className="relative">
              <Input
                id="tm-fd-rate"
                type="number"
                step="0.1"
                min="1"
                max="25"
                value={fdRate}
                onChange={(e) => setFdRate(Math.max(1, Math.min(25, Number(e.target.value) || 0)))}
                className="h-10 font-mono text-xs rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                %
              </span>
            </div>
            <p className="text-[0.68rem] text-muted-foreground">
              Average Nepal commercial bank FD return (compounded annually)
            </p>
          </div>
        </div>

        {/* Date Presets (Custom Range hidden by default unless clicked) */}
        <div className="space-y-3 pt-2 border-t border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Time Horizon
            </Label>
            <span className="text-[0.72rem] text-muted-foreground font-mono">
              {formatDate(from)} to {formatDate(to)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            <Button
              variant={rangePreset === "1Y" ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs rounded-xl"
              onClick={() => handlePresetChange("1Y")}
            >
              1 Year
            </Button>
            <Button
              variant={rangePreset === "3Y" ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs rounded-xl"
              onClick={() => handlePresetChange("3Y")}
            >
              3 Years
            </Button>
            <Button
              variant={rangePreset === "5Y" ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs rounded-xl"
              onClick={() => handlePresetChange("5Y")}
            >
              5 Years
            </Button>
            <Button
              variant={rangePreset === "max" ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs rounded-xl"
              onClick={() => handlePresetChange("max")}
            >
              Max All
            </Button>
            <Button
              variant={rangePreset === "custom" ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs rounded-xl"
              onClick={() => handlePresetChange("custom")}
            >
              Custom Range…
            </Button>
          </div>

          {/* Custom Date Pickers: Only rendered when user explicitly chooses 'custom' */}
          {rangePreset === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t border-border/40 animate-in fade-in duration-200">
              <div className="space-y-1.5">
                <Label htmlFor="tm-from" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3 text-primary" /> Start Date (From)
                </Label>
                <Input
                  id="tm-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 font-mono text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm-to" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3 text-primary" /> End Date (To)
                </Label>
                <Input
                  id="tm-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 font-mono text-xs rounded-lg"
                />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Main Backtest View */}
      {historyQ.isLoading || divQ.isLoading ? (
        <LoadingBlock label="Calculating backtest timeline & corporate actions…" />
      ) : !result ? (
        <EmptyBlock
          title="No Backtest Data"
          description={`No daily closing prices found for ${symbol} within ${formatDate(from)} and ${formatDate(to)}.`}
        />
      ) : (
        <>
          {/* Key Metric Highlights Grid */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Total Invested */}
            <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Invested
                </p>
                <span className="rounded-lg bg-muted/60 p-1.5 text-muted-foreground">
                  <Calculator className="size-4" />
                </span>
              </div>
              <p className="num mt-2 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {formatNpr(result.invested)}
              </p>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <p>
                  {freq === "once"
                    ? "Single lumpsum purchase"
                    : `${result.buyLedger.length} scheduled installments`}
                </p>
                <p className="num font-mono text-[0.72rem]">
                  Purchased {formatQty(result.totalBought)} base units
                  {result.firstPrice && ` (first @ ${formatNpr(result.firstPrice)})`}
                </p>
              </div>
            </div>

            {/* 2. Current Portfolio Value */}
            <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Portfolio Value
                </p>
                <DeltaPill value={result.totalGainPct}>
                  {formatPercent(result.totalGainPct)}
                </DeltaPill>
              </div>
              <p className="num mt-2 font-mono text-2xl sm:text-3xl font-bold text-foreground">
                {formatNpr(result.finalValue)}
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                <p
                  className={cn(
                    "num font-semibold text-sm",
                    result.totalGain >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {result.totalGain >= 0 ? "+" : ""}
                  {formatNpr(result.totalGain)} Net Gain
                </p>
                <p className="text-[0.7rem]">
                  Holding {result.held.toLocaleString()} units @ {formatNpr(result.lastPrice)}
                </p>
              </div>
            </div>

            {/* 3. Annualized Return & FD Benchmark */}
            <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Annualized Return
                </p>
                <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
                  <TrendingUp className="size-4" />
                </span>
              </div>
              <p className="num mt-2 font-mono text-2xl sm:text-3xl font-bold text-primary">
                {result.annualizedReturn !== null
                  ? `${result.annualizedReturn.toFixed(2)}%`
                  : "-"}
                <span className="text-xs font-normal text-muted-foreground ml-1">p.a.</span>
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium">
                  <Landmark className="size-3.5 text-muted-foreground" />
                  <span
                    className={cn(
                      result.alpha >= 0 ? "text-gain font-semibold" : "text-loss font-semibold"
                    )}
                  >
                    {result.alpha >= 0 ? "+" : ""}
                    {formatNpr(result.alpha)}
                  </span>
                  <span>vs {fdRate}% Bank FD</span>
                </div>
                <p className="text-[0.68rem] text-muted-foreground/80 mt-0.5">
                  FD would be worth {formatNpr(result.totalFdValue)}
                </p>
              </div>
            </div>

            {/* 4. Bonus Shares Compounding */}
            <div className="rounded-2xl border border-gain/25 bg-gradient-to-br from-gain/10 via-card to-card p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Share Capital Expansion
                </p>
                <span className="rounded-lg bg-gain/15 p-1.5 text-gain">
                  <Coins className="size-4" />
                </span>
              </div>
              <p className="num mt-2 font-mono text-2xl sm:text-3xl font-bold text-gain">
                {result.shareMultiplier.toFixed(2)}x
                <span className="text-xs font-normal text-muted-foreground ml-1">shares</span>
              </p>
              <div className="mt-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  +{formatQty(result.bonusUnits)} Bonus Units Credited
                </p>
                <p className="text-[0.68rem]">
                  {reinvest && result.reinvestedUnits > 0
                    ? `+${result.reinvestedUnits} units from reinvested cash · `
                    : ""}
                  {formatNpr(result.cashReceived)} total cash paid
                </p>
              </div>
            </div>
          </div>

          {/* Lightweight-Charts Terminal Panel */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display flex items-center gap-2 text-sm font-bold text-foreground">
                <TrendingUp className="size-4 text-primary" /> Portfolio Valuation Curve
              </h2>
              <span className="text-xs font-mono text-muted-foreground">
                {result.terminalPoints.length} trading days
              </span>
            </div>
            <TimeMachineTerminalChart
              points={result.terminalPoints}
              height={380}
            />
          </div>

          {/* Deep Analytics & Tabbed Ledger Section */}
          <Tabs defaultValue="breakdown" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-11 p-1 bg-muted/40 rounded-xl border border-border/50">
              <TabsTrigger value="breakdown" className="text-xs font-semibold gap-1.5 rounded-lg">
                <Layers className="size-3.5" /> Yearly Return
              </TabsTrigger>
              <TabsTrigger value="dividends" className="text-xs font-semibold gap-1.5 rounded-lg">
                <Gift className="size-3.5" /> Dividends & Bonus ({result.corporateActionsLedger.length})
              </TabsTrigger>
              <TabsTrigger value="benchmark" className="text-xs font-semibold gap-1.5 rounded-lg">
                <Landmark className="size-3.5" /> Stock vs Bank FD
              </TabsTrigger>
              <TabsTrigger value="buys" className="text-xs font-semibold gap-1.5 rounded-lg">
                <History className="size-3.5" /> SIP Ledger ({result.buyLedger.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Yearly Breakdown */}
            <TabsContent value="breakdown" className="mt-4">
              <Panel className="p-4 sm:p-6 border-border/70">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      Yearly Performance & Compounding Breakdown
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Capital invested, bonus/cash declared, and year-end valuation for each calendar year
                    </p>
                  </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground border-b border-border/60">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-semibold">Year</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Buys</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Invested</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Bonus %</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Cash %</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Bonus Units</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Year-End Units</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Year-End Close</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Year-End Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {result.yearlyBreakdown.map((row) => (
                        <tr key={row.year} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-foreground">{row.year}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">{row.buysCount}</td>
                          <td className="py-2.5 px-3 text-right">{formatNpr(row.invested)}</td>
                          <td className="py-2.5 px-3 text-right">
                            {row.bonusPct > 0 ? (
                              <span className="text-gain font-semibold">+{row.bonusPct}%</span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {row.cashPct > 0 ? `${row.cashPct}%` : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gain">
                            {row.bonusUnits > 0 ? `+${row.bonusUnits}` : "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold">
                            {row.yearEndUnits.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground">
                            {formatNpr(row.yearEndPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-foreground">
                            {formatNpr(row.yearEndValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="space-y-3 sm:hidden font-mono">
                  {result.yearlyBreakdown.map((row) => (
                    <div
                      key={row.year}
                      className="rounded-xl border border-border/60 bg-surface p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="text-sm font-bold text-foreground">{row.year}</span>
                        <span className="font-bold text-primary">{formatNpr(row.yearEndValue)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[0.72rem]">
                        <div>
                          <span className="text-muted-foreground">Invested: </span>
                          <span>{formatNpr(row.invested)} ({row.buysCount} buys)</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Holdings: </span>
                          <span>{row.yearEndUnits.toLocaleString()} units</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Dividends: </span>
                          <span className={cn(row.bonusPct ? "text-gain font-bold" : "")}>
                            {row.bonusPct ? `${row.bonusPct}% bonus` : "-"} · {row.cashPct ? `${row.cashPct}% cash` : "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Close Price: </span>
                          <span>{formatNpr(row.yearEndPrice)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </TabsContent>

            {/* TAB 2: Dividends & Corporate Actions Journey */}
            <TabsContent value="dividends" className="mt-4">
              <Panel className="p-4 sm:p-6 border-border/70">
                <div className="mb-4">
                  <h3 className="font-display text-base font-bold text-foreground">
                    Corporate Actions & Dividend History
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Every dividend distributed by {symbol} during your holding period and how it amplified your portfolio
                  </p>
                </div>

                {result.corporateActionsLedger.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No dividends recorded for {symbol} within this date range.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.corporateActionsLedger.map((action, i) => (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border/60 bg-muted/15 p-3.5 gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                            <Gift className="size-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">
                                FY {action.fiscalYear}
                              </span>
                              <span className="text-[0.68rem] text-muted-foreground">
                                Book Close: {formatDate(action.date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs mt-0.5">
                              {action.bonusPct > 0 && (
                                <span className="text-gain font-semibold">
                                  +{action.bonusPct}% Bonus Share
                                </span>
                              )}
                              {action.bonusPct > 0 && action.cashPct > 0 && <span>·</span>}
                              {action.cashPct > 0 && (
                                <span className="text-muted-foreground">
                                  {action.cashPct}% Cash Dividend
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40 font-mono text-xs text-right">
                          <div>
                            <p className="text-muted-foreground text-[0.68rem]">Bonus Credited</p>
                            <p className="font-bold text-gain">+{action.bonusGot.toLocaleString()} shares</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[0.68rem]">Cash Payout</p>
                            <p className="font-bold text-foreground">{formatNpr(action.cashGot)}</p>
                          </div>
                          {reinvest && action.reinvestedShares > 0 && (
                            <div className="hidden sm:block">
                              <p className="text-muted-foreground text-[0.68rem]">Reinvested</p>
                              <p className="font-semibold text-primary">+{action.reinvestedShares} shares</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* TAB 3: Stock vs Bank FD Benchmark */}
            <TabsContent value="benchmark" className="mt-4">
              <Panel className="p-4 sm:p-6 border-border/70">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-foreground">
                      Head-to-Head: {symbol} vs Bank Fixed Deposit
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Comparing against a commercial bank FD compounded yearly at {fdRate}% p.a.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">FD Rate:</span>
                    <span className="font-bold text-foreground bg-muted px-2 py-1 rounded-md">
                      {fdRate}% p.a. (Yearly)
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Stock Card */}
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="size-5 text-primary" />
                        <h4 className="font-bold text-foreground">{symbol} Equity Investment</h4>
                      </div>
                      <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        Stock
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Final Value:</span>
                        <span className="font-mono text-xl font-bold text-foreground">
                          {formatNpr(result.finalValue)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Total Return:</span>
                        <span className="font-mono text-sm font-bold text-gain">
                          {formatPercent(result.totalGainPct)} ({result.totalGain >= 0 ? "+" : ""}{formatNpr(result.totalGain)})
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Annualized (XIRR/CAGR):</span>
                        <span className="font-mono text-sm font-bold text-primary">
                          {result.annualizedReturn ? `${result.annualizedReturn.toFixed(2)}% p.a.` : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bank FD Card */}
                  <div className="rounded-2xl border border-border/70 bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Landmark className="size-5 text-muted-foreground" />
                        <h4 className="font-bold text-foreground">Bank Fixed Deposit (FD)</h4>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {fdRate}% p.a. (Yearly)
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Final Value:</span>
                        <span className="font-mono text-xl font-bold text-foreground">
                          {formatNpr(result.totalFdValue)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Total Return:</span>
                        <span className="font-mono text-sm font-semibold text-muted-foreground">
                          {formatPercent(result.fdTotalGainPct)} (+{formatNpr(result.fdTotalGain)})
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">Compounding:</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          Yearly guaranteed basis
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alpha Verdict Banner */}
                <div
                  className={cn(
                    "mt-5 rounded-2xl border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3",
                    result.alpha >= 0
                      ? "border-gain/30 bg-gain/10 text-gain"
                      : "border-loss/30 bg-loss/10 text-loss"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-background/80 p-2 shadow-sm">
                      {result.alpha >= 0 ? (
                        <ArrowUpRight className="size-5 text-gain" />
                      ) : (
                        <ArrowDownRight className="size-5 text-loss" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-sm">
                        {result.alpha >= 0 ? "Stock Beat Fixed Deposit" : "Fixed Deposit Won"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.alpha >= 0
                          ? `Generated ${formatNpr(result.alpha)} more wealth than a ${fdRate}% bank fixed deposit over this period.`
                          : `FD produced ${formatNpr(Math.abs(result.alpha))} more value than investing in ${symbol}.`}
                      </p>
                    </div>
                  </div>

                  <div className="font-mono font-bold text-lg self-end sm:self-auto">
                    {result.alpha >= 0 ? "+" : ""}
                    {formatNpr(result.alpha)} Alpha
                  </div>
                </div>
              </Panel>
            </TabsContent>

            {/* TAB 4: SIP Purchase Ledger */}
            <TabsContent value="buys" className="mt-4">
              <Panel className="p-4 sm:p-6 border-border/70">
                <div className="mb-4">
                  <h3 className="font-display text-base font-bold text-foreground">
                    SIP Execution & Purchase Ledger
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Chronological record of every installment executed, buy price, and cumulative holding
                  </p>
                </div>

                <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface text-muted-foreground border-b border-border/60">
                      <tr>
                        <th className="py-2.5 px-3 text-left font-semibold">#</th>
                        <th className="py-2.5 px-3 text-left font-semibold">Date</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Buy Price</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Units Bought</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Cumulative Units</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Cumulative Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {result.buyLedger.map((buy, idx) => (
                        <tr key={idx} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2 px-3 text-muted-foreground text-[0.7rem]">{idx + 1}</td>
                          <td className="py-2 px-3 font-medium text-foreground">{formatDate(buy.date)}</td>
                          <td className="py-2 px-3 text-right">{formatNpr(buy.price)}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{formatNpr(buy.amount)}</td>
                          <td className="py-2 px-3 text-right font-semibold text-foreground">+{buy.units}</td>
                          <td className="py-2 px-3 text-right font-bold text-primary">{buy.cumulativeUnits.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-muted-foreground">{formatNpr(buy.cumulativeInvested)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
