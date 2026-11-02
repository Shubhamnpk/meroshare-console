import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Coins,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  HelpCircle,
  Info,
  Layers,
  Minus,
  PieChart as PieChartIcon,
  Repeat,
  RotateCcw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorBlock, SkeletonCards } from "@/components/states";
import { StatCard } from "@/components/stat-card";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { enrichedPortfolioQuery, mfSchemeQuery, sipLandscapeQuery, sipSimulationQuery } from "@/lib/queries";
import { formatNpr, formatNumber, formatPercent, formatQty, formatSignedNpr, toNumber } from "@/lib/format";
import { MACRO_SOURCE } from "@/lib/market/inflation";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { SipFundRow, SipSimulation } from "@/lib/mutual-funds/sip.functions";

export const Route = createFileRoute("/_dash/sip")({
  head: () => ({
    meta: [
      { title: "SIP Investor Studio | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Nepali Open-End Mutual Fund SIP Studio: XIRR, bank RD after tax, NEPSE benchmark, all 14 open-end schemes report card, and wealth planners.",
      },
      { property: "og:title", content: "SIP Investor Studio | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "SIP XIRR vs bank RD, NEPSE and inflation for every open-end fund with interactive planners.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/sip")],
  }),
  component: SipPage,
});

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DEFAULT_START = monthsAgo(36);

const PRESETS: { label: string; months: number }[] = [
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "3Y", months: 36 },
  { label: "5Y", months: 60 },
];

const AMOUNT_PRESETS = [1000, 2500, 5000, 10000, 25000];

const MONTHS = [
  { val: "01", name: "Jan" },
  { val: "02", name: "Feb" },
  { val: "03", name: "Mar" },
  { val: "04", name: "Apr" },
  { val: "05", name: "May" },
  { val: "06", name: "Jun" },
  { val: "07", name: "Jul" },
  { val: "08", name: "Aug" },
  { val: "09", name: "Sep" },
  { val: "10", name: "Oct" },
  { val: "11", name: "Nov" },
  { val: "12", name: "Dec" },
];

function monthLabel(iso: string): string {
  if (!iso) return "-";
  const d = new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function longDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function axisRs(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)} cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_00_000).toFixed(1)} L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return formatNpr(value, { compact: true }).replace("रु ", "");
}

interface ChartPoint {
  date: string;
  paid?: number;
  value?: number;
  rd?: number;
  nepse?: number;
}

function mergeChart(sim: SipSimulation | null): ChartPoint[] {
  if (!sim) return [];
  const byDate = new Map<string, ChartPoint>();
  for (const p of sim.series) byDate.set(p.date, { date: p.date, paid: p.paid, value: p.value });
  for (const p of sim.rd.series) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row.rd = p.value;
    byDate.set(p.date, row);
  }
  if (sim.nepse) {
    for (const p of sim.nepse.series) {
      const row = byDate.get(p.date) ?? { date: p.date };
      row.nepse = p.value;
      byDate.set(p.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

const AMC_PORTALS: Record<string, { name: string; url: string; portalName: string; guideNote: string }> = {
  NIBL: {
    name: "NIMB Ace Capital",
    url: "https://niblcapital.com/",
    portalName: "NIMB Ace Online SIP Portal",
    guideNote: "Offers online SIP registration for NIBL Sahabhagita Fund with ConnectIPS and eSewa payment integration.",
  },
  NIBSF: {
    name: "NIMB Ace Capital",
    url: "https://niblcapital.com/",
    portalName: "NIMB Ace Online SIP Portal",
    guideNote: "Offers online SIP registration for NIBL Sahabhagita Fund with ConnectIPS and eSewa payment integration.",
  },
  SSIS: {
    name: "Siddhartha Capital",
    url: "https://siddharthacapital.com/",
    portalName: "Siddhartha Capital SIP Portal",
    guideNote: "Register online for Siddhartha Systematic Investment Scheme (SSIS) with digital mandate.",
  },
  NFBF: {
    name: "Nabil Investment Banking",
    url: "https://nabilinvest.com.np/",
    portalName: "Nabil SIP Investor Portal",
    guideNote: "Apply for Nabil Flexi Cap Fund SIP directly via online KYC and auto-debit mandate.",
  },
  KSY: {
    name: "Kumari Capital",
    url: "https://kumaricapital.com/",
    portalName: "Kumari Sunaulo Yojana Portal",
    guideNote: "Open-ended SIP registration available online for Kumari Sunaulo Yojana with e-banking.",
  },
  NICBF: {
    name: "NIC Asia Capital",
    url: "https://nicasiacapital.com/",
    portalName: "NIC Asia SIP Portal",
    guideNote: "Invest in NIC Asia Dynamic Debt Fund or open-end schemes via direct ConnectIPS portal.",
  },
  SDDF: {
    name: "Sanima Capital",
    url: "https://sanima.capital/",
    portalName: "Sanima Mutual Fund Portal",
    guideNote: "Sanima Dynamic Debt Fund online subscription and SIP facility for retail investors.",
  },
};

function Verdict({ ok, text, title }: { ok: boolean; text: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        ok ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss",
      )}
    >
      {ok ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {text}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: number | string; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const names: Record<string, string> = {
    paid: "Paid In (Capital)",
    value: "Fund Value Today",
    rd: "Bank RD (After 6% Tax)",
    nepse: "NEPSE Index (Same Dates)",
  };

  const fundVal = toNumber(payload.find((p) => p.dataKey === "value")?.value);
  const paidVal = toNumber(payload.find((p) => p.dataKey === "paid")?.value);
  const profit = fundVal && paidVal ? fundVal - paidVal : 0;
  const returnPct = paidVal > 0 ? (profit / paidVal) * 100 : 0;

  return (
    <div className="min-w-56 rounded-xl border border-border/80 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between border-b border-border/60 pb-1.5">
        <span className="font-semibold text-foreground">{monthLabel(String(label))}</span>
        {paidVal > 0 ? (
          <span className={cn("font-medium", profit >= 0 ? "text-gain" : "text-loss")}>
            {profit >= 0 ? "+" : ""}
            {formatPercent(returnPct)}
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="num flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-medium" style={{ color: p.color }}>
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {names[String(p.dataKey)] ?? String(p.dataKey)}
            </span>
            <span className="font-semibold text-foreground">{formatNpr(toNumber(p.value))}</span>
          </div>
        ))}
      </div>
      {paidVal > 0 ? (
        <div className="mt-2 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground flex justify-between">
          <span>Net Profit/Loss:</span>
          <span className={cn("font-semibold", profit >= 0 ? "text-gain" : "text-loss")}>
            {formatSignedNpr(profit)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SipChart({
  points,
  visibleSeries,
}: {
  points: ChartPoint[];
  visibleSeries: { value: boolean; paid: boolean; rd: boolean; nepse: boolean };
}) {
  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
          <defs>
            <linearGradient id="sipValueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.12} />
              <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.7} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={monthLabel}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={35}
          />
          <YAxis
            tickFormatter={axisRs}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={60}
            domain={[0, "auto"]}
          />
          <Tooltip content={<ChartTooltip />} />

          {visibleSeries.paid ? (
            <Area
              type="monotone"
              dataKey="paid"
              name="paid"
              stroke="var(--muted-foreground)"
              strokeDasharray="4 3"
              fill="url(#paidGrad)"
              strokeWidth={1.5}
              dot={false}
            />
          ) : null}

          {visibleSeries.value ? (
            <Area
              type="monotone"
              dataKey="value"
              name="value"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#sipValueGrad)"
              dot={false}
              connectNulls
            />
          ) : null}

          {visibleSeries.rd ? (
            <Line
              type="monotone"
              dataKey="rd"
              name="rd"
              stroke="#60a5fa"
              strokeWidth={1.8}
              dot={false}
              connectNulls
            />
          ) : null}

          {visibleSeries.nepse ? (
            <Line
              type="monotone"
              dataKey="nepse"
              name="nepse"
              stroke="#eab308"
              strokeWidth={1.8}
              strokeDasharray="6 3"
              dot={false}
              connectNulls
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function IndicatorToggle({
  color,
  label,
  dashed,
  active,
  onClick,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all select-none cursor-pointer",
        active
          ? "border-border bg-card text-foreground shadow-xs hover:border-primary/50"
          : "border-transparent bg-muted/40 text-muted-foreground opacity-50 line-through hover:opacity-80",
      )}
      title={active ? `Click to hide ${label}` : `Click to show ${label}`}
    >
      {active ? <Eye className="size-3 text-muted-foreground" /> : <EyeOff className="size-3 text-muted-foreground" />}
      {dashed ? (
        <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}

function RankBadge({ position, ranked, since }: { position: number | null; ranked: boolean; since: string }) {
  if (!ranked) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
        title={`Started later in ${monthLabel(since)}`}
      >
        New
      </span>
    );
  }
  if (position === 1) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 font-bold text-xs ring-1 ring-amber-500/40">
        🥇
      </span>
    );
  }
  if (position === 2) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400/20 text-slate-300 font-bold text-xs ring-1 ring-slate-400/40">
        🥈
      </span>
    );
  }
  if (position === 3) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-700/20 text-amber-600 font-bold text-xs ring-1 ring-amber-700/40">
        🥉
      </span>
    );
  }
  return (
    <span className="num inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {position}
    </span>
  );
}

function BeatCell({ beats, ranked }: { beats: boolean | null; ranked: boolean }) {
  if (!ranked || beats == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Fund started after window opening">
        <Minus className="size-3.5" /> Launch NAV
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        beats ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss",
      )}
    >
      {beats ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {beats ? "Beats NEPSE" : "Missed NEPSE"}
    </span>
  );
}

function exportSipCsv(sim: SipSimulation, symbol: string) {
  if (!sim.buys?.length) {
    toast.error("No installment history available to export");
    return;
  }
  const headers = ["Installment #", "Date", "Paid In (NPR)", "NAV (NPR)", "Units Bought", "Cumulative Units"];
  let cumUnits = 0;
  const perInstallment = sim.paid / sim.installments;
  const rows = sim.buys.map((b, i) => {
    cumUnits += b.units;
    return [
      i + 1,
      b.date,
      perInstallment.toFixed(2),
      b.nav.toFixed(2),
      b.units.toFixed(2),
      cumUnits.toFixed(2),
    ];
  });
  const csvContent =
    "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${symbol}-SIP-Schedule-${sim.installments}M.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast.success(`Exported ${sim.installments} installments for ${symbol} to CSV!`);
}

function copyXirrFormula(sim: SipSimulation) {
  if (!sim.buys?.length) {
    toast.error("No cash flow data available");
    return;
  }
  const lines: string[] = ["Date\tCashFlow"];
  const perOutflow = -(sim.paid / sim.installments);
  for (const b of sim.buys) {
    lines.push(`${b.date}\t${perOutflow.toFixed(2)}`);
  }
  lines.push(`${sim.navDate}\t${sim.value.toFixed(2)}`);
  const text = lines.join("\n");
  navigator.clipboard.writeText(text);
  toast.success("Cash flow statement copied to clipboard!", {
    description: `Paste into Excel/Sheets starting at A1. In cell C1 write =XIRR(B2:B${sim.buys.length + 2}, A2:A${sim.buys.length + 2})`,
  });
}

function SipPage() {
  const [startMonth, setStartMonth] = useState(DEFAULT_START);
  const [amountText, setAmountText] = useState("1000");
  const [amount, setAmount] = useState(1000);
  const [rdRate, setRdRate] = useState(6);
  const [fees, setFees] = useState(true);
  const [symbol, setSymbol] = useState("");

  const currentYearNum = new Date().getFullYear();
  const YEARS = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYearNum; y >= 2017; y--) {
      list.push(y);
    }
    return list;
  }, [currentYearNum]);

  const [selectedYear, selectedMonth] = useMemo(() => {
    const parts = startMonth.split("-");
    return [parts[0] || String(currentYearNum), parts[1] || "01"];
  }, [startMonth, currentYearNum]);

  const handleYearChange = (year: string) => {
    const newDate = `${year}-${selectedMonth}`;
    const maxMonth = monthsAgo(0);
    setStartMonth(newDate > maxMonth ? maxMonth : newDate);
  };

  const handleMonthChange = (month: string) => {
    const newDate = `${selectedYear}-${month}`;
    const maxMonth = monthsAgo(0);
    setStartMonth(newDate > maxMonth ? maxMonth : newDate);
  };

  // Chart indicator lines on/off toggles
  const [visibleSeries, setVisibleSeries] = useState({
    value: true,
    paid: true,
    rd: true,
    nepse: true,
  });

  // Leaderboard filters
  const [tableSearch, setTableSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"all" | "ranked_only" | "beat_nepse" | "beat_rd">("all");

  // Secondary Tools Tab state
  const [toolsTab, setToolsTab] = useState<"calculators" | "ledger" | "deepdive" | "guide">("calculators");

  // Interactive Calculators state
  const [calcTab, setCalcTab] = useState<"compound" | "stepup" | "goal" | "delay">("compound");
  const [calcAmount, setCalcAmount] = useState(5000);
  const [calcReturnRate, setCalcReturnRate] = useState(12);
  const [calcYears, setCalcYears] = useState(10);
  const [stepUpPct, setStepUpPct] = useState(10);
  const [goalTarget, setGoalTarget] = useState(50_00_000); // Rs 50 Lakhs
  const [delayMonths, setDelayMonths] = useState(24); // 2 years delay

  // Portfolio user check
  const portfolioQ = useQuery(enrichedPortfolioQuery());
  const userHoldings = useMemo(() => portfolioQ.data?.holdings ?? [], [portfolioQ.data]);

  // Amount debounce
  useEffect(() => {
    const t = setTimeout(() => {
      const n = Math.round(toNumber(amountText));
      setAmount(Number.isFinite(n) ? Math.min(1_000_000, Math.max(100, n)) : 1000);
    }, 400);
    return () => clearTimeout(t);
  }, [amountText]);

  const landscape = useQuery(sipLandscapeQuery(startMonth, amount, rdRate, fees));
  const rows = landscape.data?.rows ?? [];
  const earliestStart = landscape.data?.earliestStart ?? null;
  const widestStart = landscape.data?.widestStart ?? null;

  // Active Fund
  const activeFund = rows.find((r) => r.symbol === symbol) ?? null;

  // Set default fund
  useEffect(() => {
    if (landscape.isPending || rows.length === 0) return;
    if (rows.some((r) => r.symbol === symbol)) return;
    const rankedFunds = rows.filter((r) => r.ranked);
    const oldest = [...(rankedFunds.length ? rankedFunds : rows)].sort((a, b) => (a.since < b.since ? -1 : 1))[0];
    if (oldest) setSymbol(oldest.symbol);
  }, [symbol, landscape.isPending, rows]);

  const sim = useSimulation(activeFund ? symbol : "", startMonth, amount, rdRate, fees);
  const chartPoints = useMemo(() => mergeChart(sim), [sim]);

  // Fund deep-dive query for top holdings and facts
  const fundBundleQ = useQuery(mfSchemeQuery(activeFund?.symbol ?? null));
  const fundHoldings = useMemo(() => fundBundleQ.data?.holdings ?? [], [fundBundleQ.data]);

  // User holding in active fund
  const userOwnsActive = useMemo(() => {
    if (!symbol) return null;
    return userHoldings.find((h) => h.scrip.toUpperCase() === symbol.toUpperCase()) ?? null;
  }, [userHoldings, symbol]);

  const vsRd = sim ? sim.value - sim.rd.value : 0;
  const vsNepse = sim && sim.nepse && sim.xirr != null && sim.nepse.xirr != null ? sim.xirr - sim.nepse.xirr : null;

  // Sort State with default capability
  const { sort, toggle, reset } = useSort<"fund" | "value" | "profit" | "xirr" | "nepse" | "rd">(
    { key: "xirr", dir: "desc" },
    { fund: "text", value: "number", profit: "number", xirr: "number", nepse: "number", rd: "number" },
  );

  // Pre-calculate ranks for full-window funds
  const rankedMap = useMemo(() => {
    const map = new Map<string, number>();
    const eligible = rows.filter((r) => r.ranked).sort((a, b) => (b.xirr ?? -99) - (a.xirr ?? -99));
    eligible.forEach((r, idx) => map.set(r.symbol, idx + 1));
    return map;
  }, [rows]);

  // All 14 funds with filtering and sorting
  const filteredAndSortedRows = useMemo(() => {
    let list = [...rows];
    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase();
      list = list.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.manager.toLowerCase().includes(q));
    }
    if (tableFilter === "ranked_only") {
      list = list.filter((r) => r.ranked);
    } else if (tableFilter === "beat_nepse") {
      list = list.filter((r) => r.beatsNepse === true);
    } else if (tableFilter === "beat_rd") {
      list = list.filter((r) => r.value > r.rdValue);
    }

    if (sort.dir === "default") {
      // Default order: ranked funds first sorted by XIRR desc, then newer funds sorted by since asc
      return list.sort((a, b) => {
        if (a.ranked && !b.ranked) return -1;
        if (!a.ranked && b.ranked) return 1;
        if (a.ranked && b.ranked) return (b.xirr ?? -99) - (a.xirr ?? -99);
        return a.since.localeCompare(b.since);
      });
    }

    const key = (r: SipFundRow) =>
      ({
        fund: r.symbol,
        value: r.value,
        profit: r.profit,
        xirr: r.xirr ?? -99,
        nepse: r.nepseXirr == null || r.xirr == null ? -99 : r.xirr - r.nepseXirr,
        rd: r.rdValue,
      })[sort.key];
    return sortBy(list, key, sort.dir);
  }, [rows, tableSearch, tableFilter, sort]);

  const totals = landscape.data;
  const windowMonths = totals
    ? Math.max(
        0,
        Math.round(
          (new Date(`${totals.asOf ?? startMonth}T00:00:00`).getTime() - new Date(`${startMonth}-01T00:00:00`).getTime()) /
            (30.4375 * 86_400_000),
        ),
      )
    : 0;

  // Calculators logic
  const compoundResult = useMemo(() => {
    const monthlyRate = calcReturnRate / 100 / 12;
    const totalMonths = calcYears * 12;
    let totalInvested = 0;
    let futureCorpus = 0;

    if (monthlyRate === 0) {
      totalInvested = calcAmount * totalMonths;
      futureCorpus = totalInvested;
    } else {
      totalInvested = calcAmount * totalMonths;
      futureCorpus = calcAmount * ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate);
    }

    let stepUpInvested = 0;
    let stepUpCorpus = 0;
    let currentMonthly = calcAmount;

    for (let y = 0; y < calcYears; y++) {
      for (let m = 0; m < 12; m++) {
        const remainingMonths = totalMonths - (y * 12 + m);
        stepUpInvested += currentMonthly;
        stepUpCorpus += currentMonthly * Math.pow(1 + monthlyRate, remainingMonths);
      }
      currentMonthly = currentMonthly * (1 + stepUpPct / 100);
    }

    let goalMonthlyNeeded = 0;
    if (monthlyRate > 0) {
      goalMonthlyNeeded = goalTarget / (((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate) * (1 + monthlyRate));
    }

    const delayYearsTotal = Math.max(1, calcYears - Math.round(delayMonths / 12));
    const delayMonthsTotal = delayYearsTotal * 12;
    const delayedCorpus =
      monthlyRate === 0
        ? calcAmount * delayMonthsTotal
        : calcAmount * ((Math.pow(1 + monthlyRate, delayMonthsTotal) - 1) / monthlyRate) * (1 + monthlyRate);
    const delayLoss = Math.max(0, futureCorpus - delayedCorpus);

    const trajectory: { year: number; invested: number; corpus: number; stepUpCorpus: number }[] = [];
    let curInv = 0;
    let curStepInv = 0;
    let curStepAmt = calcAmount;
    let cumStepVal = 0;

    for (let yr = 1; yr <= Math.min(25, calcYears); yr++) {
      const mCount = yr * 12;
      curInv = calcAmount * mCount;
      const fv = calcAmount * ((Math.pow(1 + monthlyRate, mCount) - 1) / monthlyRate) * (1 + monthlyRate);

      for (let m = 0; m < 12; m++) {
        curStepInv += curStepAmt;
        cumStepVal = (cumStepVal + curStepAmt) * (1 + monthlyRate);
      }
      curStepAmt *= 1 + stepUpPct / 100;

      trajectory.push({
        year: yr,
        invested: Math.round(curInv),
        corpus: Math.round(fv),
        stepUpCorpus: Math.round(cumStepVal),
      });
    }

    return {
      totalInvested: Math.round(totalInvested),
      futureCorpus: Math.round(futureCorpus),
      wealthGain: Math.round(Math.max(0, futureCorpus - totalInvested)),
      stepUpInvested: Math.round(stepUpInvested),
      stepUpCorpus: Math.round(stepUpCorpus),
      stepUpGain: Math.round(Math.max(0, stepUpCorpus - futureCorpus)),
      goalMonthlyNeeded: Math.round(goalMonthlyNeeded),
      delayedCorpus: Math.round(delayedCorpus),
      delayLoss: Math.round(delayLoss),
      trajectory,
    };
  }, [calcAmount, calcReturnRate, calcYears, stepUpPct, goalTarget, delayMonths]);

  // Click on any fund row to simulate and smoothly scroll to the top chart
  const handleSelectFund = (fundSymbol: string) => {
    setSymbol(fundSymbol);
    const overviewEl = document.getElementById("sip-overview-section");
    if (overviewEl) {
      overviewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-xs">
              <Repeat className="size-5" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">SIP Investor Studio</h1>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 text-xs font-medium">
              All 14 Open-End Schemes
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Evaluate real systematic investment compounding across Nepali mutual funds against Bank RD and NEPSE benchmarks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totals?.asOf ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-xs">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Valued {longDate(totals.asOf)}
            </span>
          ) : null}
          {activeFund && sim ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportSipCsv(sim, activeFund.symbol)}
              className="h-8 gap-1.5 text-xs"
              title="Download installment statement in CSV format"
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main Configuration Panel */}
      <Panel className="border-border/80 bg-card/90 shadow-sm backdrop-blur-xs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Fund Picker */}
          <div className="space-y-1.5">
            <Label htmlFor="sip-fund" className="flex items-center justify-between text-xs font-semibold">
              <span>Select Scheme</span>
              {userOwnsActive ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                  <Sparkles className="size-3" /> You hold {formatQty(userOwnsActive.units)} units
                </span>
              ) : null}
            </Label>
            <Select value={symbol} onValueChange={handleSelectFund}>
              <SelectTrigger id="sip-fund" className="w-full bg-background font-medium">
                <SelectValue placeholder={landscape.isPending ? "Loading funds..." : "Pick a fund"} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {rows.map((r) => (
                  <SelectItem key={r.symbol} value={r.symbol} className="py-2">
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="font-semibold text-foreground">{r.symbol}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-44">{r.name}</span>
                      {r.ranked ? null : (
                        <span className="rounded-xs bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">New</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start Horizon Month & Year + Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <Label className="text-xs font-semibold">Start Horizon</Label>
              {landscape.isFetching ? (
                <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse font-medium">
                  <RotateCcw className="size-2.5 animate-spin" /> Computing...
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">{monthLabel(startMonth)}</span>
              )}
            </div>

            {/* Clean Dropdown Selectors for Month and Year */}
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={selectedMonth} onValueChange={handleMonthChange}>
                <SelectTrigger className="h-9 text-xs bg-background font-medium">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {MONTHS.map((m) => (
                    <SelectItem key={m.val} value={m.val} className="text-xs">
                      {m.name} ({m.val})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedYear} onValueChange={handleYearChange}>
                <SelectTrigger className="h-9 text-xs bg-background font-medium">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick Duration Preset Chips */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {PRESETS.map((p) => {
                const targetM = monthsAgo(p.months);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setStartMonth(targetM)}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                      startMonth === targetM
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
              {widestStart ? (
                <button
                  type="button"
                  onClick={() => setStartMonth(widestStart)}
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                    startMonth === widestStart
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
                  )}
                  title={`Earliest month with at least three funds: ${widestStart}`}
                >
                  Max
                </button>
              ) : null}
            </div>
          </div>

          {/* Monthly Amount & Presets */}
          <div className="space-y-1.5">
            <Label htmlFor="sip-amount" className="text-xs font-semibold">
              Monthly Amount (रु)
            </Label>
            <div className="space-y-1.5">
              <Input
                id="sip-amount"
                type="number"
                min={100}
                step={500}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="bg-background font-semibold"
              />
              <div className="flex flex-wrap gap-1">
                {AMOUNT_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setAmountText(String(val));
                      setAmount(val);
                    }}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                      amount === val
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    रु {formatNumber(val)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bank RD Rate Benchmark */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sip-rd" className="text-xs font-semibold">
                Bank RD Benchmark
              </Label>
              <span className="text-[11px] text-muted-foreground">6% interest tax</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="sip-rd"
                type="number"
                min={0}
                max={25}
                step={0.5}
                value={rdRate}
                onChange={(e) => setRdRate(Math.min(25, Math.max(0, toNumber(e.target.value) || 6)))}
                className="bg-background"
              />
              <span className="text-xs font-medium text-muted-foreground shrink-0">% p.a.</span>
            </div>
          </div>
        </div>

        {/* Fee & Installment line */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs">
          <label className="flex items-center gap-2.5 cursor-pointer font-medium text-foreground">
            <Switch checked={fees} onCheckedChange={setFees} />
            <span>Model mandatory fees: रु 5 DP charge + रु 4.52 payment gateway per installment</span>
          </label>

          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="size-3.5" /> Installments land on the 1st of each month (or next published NAV).
          </span>
        </div>
      </Panel>

      {/* -------------------- SECTION 1: OVERVIEW & INTERACTIVE VISUALIZER (FIRST LENS) -------------------- */}
      <div id="sip-overview-section" className="space-y-4 scroll-mt-6">
        {landscape.isError ? (
          <ErrorBlock error={landscape.error} retry={() => void landscape.refetch()} />
        ) : landscape.isPending || !totals ? (
          <SkeletonCards count={4} />
        ) : (
          <>
            {/* Macro Statistics Summary Bar */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Funds Outperforming NEPSE"
                value={`${totals.beatCount} of ${totals.rankedCount}`}
                tone={totals.beatCount * 2 >= totals.rankedCount ? "gain" : "loss"}
                sub={
                  totals.nepse?.xirr == null
                    ? "NEPSE benchmark unavailable"
                    : `NEPSE delivered ${formatPercent(totals.nepse.xirr)} annual XIRR`
                }
              />
              <StatCard
                label="Top Historical Performer"
                value={totals.best ? totals.best.symbol : "-"}
                tone="brand"
                sub={
                  totals.best
                    ? `${formatPercent(totals.best.xirr ?? 0)} XIRR · ${formatNpr(totals.best.value)} corpus`
                    : "No fund covers this window"
                }
              />
              <StatCard
                label="Median Fund Return"
                value={totals.medianXirr == null ? "-" : formatPercent(totals.medianXirr)}
                tone={
                  totals.medianXirr != null && totals.nepse?.xirr != null && totals.medianXirr > totals.nepse.xirr
                    ? "gain"
                    : "loss"
                }
                sub={
                  totals.nepse?.xirr == null
                    ? "vs NEPSE n/a"
                    : `Alpha vs NEPSE: ${
                        totals.medianXirr == null
                          ? "-"
                          : (totals.medianXirr - totals.nepse.xirr >= 0 ? "+" : "") +
                            (totals.medianXirr - totals.nepse.xirr).toFixed(2) +
                            " pp"
                      }`
                }
              />
              <StatCard
                label="Simulation Window"
                value={`${windowMonths} Months`}
                sub={`${formatNpr(amount)} / mo · ${formatNpr(amount * windowMonths)} total paid`}
              />
            </div>

            {/* Selected Fund Overview & Interactive Chart */}
            {sim ? (
              <Panel className="space-y-4 border-border/80 shadow-sm">
                {/* Fund Header & Key Badges */}
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-bold text-foreground">{sim.fund.symbol}</span>
                      <span className="text-sm font-medium text-muted-foreground">· {sim.fund.name}</span>
                      {userOwnsActive ? (
                        <Badge variant="secondary" className="gap-1 text-[11px] bg-primary/10 text-primary border-primary/20">
                          <Sparkles className="size-3" /> In Your Portfolio
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sim.installments} monthly installments from {monthLabel(sim.series[0]?.date ?? "")} to{" "}
                      {monthLabel(sim.navDate)} · Current NAV रु {sim.fund.navNow}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground">
                      Avg Buy NAV: <strong className="text-foreground">रु {sim.avgBuyNav}</strong>
                    </span>
                    <span className="rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground">
                      {sim.units.toLocaleString()} Units Accumulated
                    </span>
                  </div>
                </div>

                {/* Fund Primary Metric Cards */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Corpus Value Today"
                    value={formatNpr(sim.value)}
                    tone="brand"
                    sub={`${formatNpr(sim.paid)} paid in · ${formatSignedNpr(sim.profit)} net profit`}
                  />
                  <StatCard
                    label="Annualized XIRR"
                    value={sim.xirr == null ? "-" : formatPercent(sim.xirr)}
                    tone={sim.xirr != null && sim.xirr > 0 ? "gain" : "loss"}
                    sub={`Total Return: ${formatPercent(sim.totalReturnPct)} over ${sim.installments} mos`}
                  />
                  <StatCard
                    label="Against Bank RD (After Tax)"
                    value={formatNpr(sim.rd.value)}
                    sub={
                      <Verdict
                        ok={vsRd >= 0}
                        text={`${vsRd >= 0 ? "Ahead" : "Behind"} by ${formatNpr(Math.abs(vsRd))}`}
                      />
                    }
                  />
                  <StatCard
                    label="Against NEPSE Index"
                    value={sim.nepse ? formatNpr(sim.nepse.value) : "-"}
                    sub={
                      vsNepse == null ? (
                        "Benchmark unavailable"
                      ) : (
                        <Verdict
                          ok={vsNepse >= 0}
                          text={`${vsNepse >= 0 ? "Outperformed" : "Underperformed"} by ${Math.abs(vsNepse).toFixed(2)} pp`}
                          title="Comparison with NEPSE price index on identical cash-flow dates with identical fees"
                        />
                      )
                    }
                  />
                </div>

                {/* Interactive Chart & On/Off Toggles */}
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      Growth Trajectory: Fund Value vs Capital & Benchmarks
                    </h3>

                    {/* On/Off Series Indicator Toggles */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground mr-1">Indicators:</span>
                      <IndicatorToggle
                        color="var(--primary)"
                        label="Fund Value"
                        active={visibleSeries.value}
                        onClick={() => setVisibleSeries((s) => ({ ...s, value: !s.value }))}
                      />
                      <IndicatorToggle
                        color="var(--muted-foreground)"
                        label="Paid In"
                        dashed
                        active={visibleSeries.paid}
                        onClick={() => setVisibleSeries((s) => ({ ...s, paid: !s.paid }))}
                      />
                      <IndicatorToggle
                        color="#60a5fa"
                        label="Bank RD"
                        active={visibleSeries.rd}
                        onClick={() => setVisibleSeries((s) => ({ ...s, rd: !s.rd }))}
                      />
                      <IndicatorToggle
                        color="#eab308"
                        label="NEPSE Index"
                        dashed
                        active={visibleSeries.nepse}
                        onClick={() => setVisibleSeries((s) => ({ ...s, nepse: !s.nepse }))}
                      />
                    </div>
                  </div>

                  <SipChart points={chartPoints} visibleSeries={visibleSeries} />
                </div>

                {/* Deep Insights Strip: Real Value, DCA Advantage, Dividend Clarity */}
                <div className="grid gap-3 pt-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Real Value (Inflation Adjusted)</span>
                      <HelpCircle className="size-3.5" title="Purchasing power of today's corpus in start-year rupees" />
                    </div>
                    <div className="font-display text-xl font-bold text-foreground">
                      {formatNpr(sim.inflation.realValue)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prices rose by {sim.inflation.factorPct}% · Real XIRR:{" "}
                      <strong className="text-foreground">
                        {sim.inflation.realXirr != null ? formatPercent(sim.inflation.realXirr) : "-"}
                      </strong>
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Rupee-Cost Averaging Advantage</span>
                      <TrendingUp className="size-3.5 text-gain" />
                    </div>
                    <div className="font-display text-xl font-bold text-foreground">
                      रु {sim.fund.navNow >= sim.avgBuyNav ? "+" : ""}
                      {(sim.fund.navNow - sim.avgBuyNav).toFixed(2)} / unit
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accumulated at avg रु {sim.avgBuyNav} vs current NAV रु {sim.fund.navNow}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Dividend Status</span>
                      <Coins className="size-3.5 text-amber-500" />
                    </div>
                    <div className="font-display text-base font-bold text-foreground flex items-center gap-1.5">
                      Capital Gain Floor (NAV)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cash dividend payouts (5%–15% of par) are distributed to accounts; total investor return is higher than NAV alone.
                    </p>
                  </div>
                </div>

                {sim.startMoved ? (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                    <strong>Note:</strong> {sim.fund.name} started publishing daily NAVs on {longDate(sim.firstInstallment)}. Its simulation begins on its inception date.
                  </div>
                ) : null}
              </Panel>
            ) : null}
          </>
        )}
      </div>

      {/* -------------------- SECTION 2: FUND LEADERBOARD (ALL 14 OPEN-END SCHEMES) -------------------- */}
      <Panel padding="none" className="overflow-clip border-border/80 shadow-sm">
        <div className="flex flex-col gap-3 p-4 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Award className="size-4 text-primary" />
              <h2 className="font-display text-base font-semibold">
                All Open-End Funds Leaderboard ({rows.length} Schemes)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Click any row to simulate that fund in the chart above. Valued {longDate(totals?.asOf ?? null)}.
            </p>
          </div>

          {/* Filters, Search & Reset Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search ticker or name..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-8 w-44 pl-8 text-xs bg-background"
              />
            </div>

            <div className="flex rounded-lg border border-border/70 p-0.5 bg-background">
              <button
                type="button"
                onClick={() => setTableFilter("all")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                  tableFilter === "all" ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                All ({rows.length})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("beat_nepse")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                  tableFilter === "beat_nepse" ? "bg-gain/15 text-gain font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Beat NEPSE ({totals?.beatCount ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("beat_rd")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                  tableFilter === "beat_rd" ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Beat RD
              </button>
              <button
                type="button"
                onClick={() => setTableFilter("ranked_only")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                  tableFilter === "ranked_only" ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Full Window ({totals?.rankedCount ?? 0})
              </button>
            </div>

            {sort.dir !== "default" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reset()}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Reset sort order"
              >
                <RotateCcw className="size-3" /> Reset sort
              </Button>
            ) : null}
          </div>
        </div>

        {/* The Table */}
        <Table className="min-w-[860px]">
          <TableHeader className="bg-muted/90 backdrop-blur-xs">
            <TableRow className="border-b border-border/70 hover:bg-transparent">
              <TableHead className="w-14 pl-4 text-center font-bold">Rank</TableHead>
              <SortableTh label="Scheme" active={sort.key === "fund"} dir={sort.dir} onClick={() => toggle("fund")} kind="text" />
              <TableHead className="text-right font-bold">Window</TableHead>
              <SortableTh label="Corpus Value" active={sort.key === "value"} dir={sort.dir} onClick={() => toggle("value")} align="right" />
              <SortableTh label="Net Profit" active={sort.key === "profit"} dir={sort.dir} onClick={() => toggle("profit")} align="right" />
              <SortableTh label="Annual XIRR" active={sort.key === "xirr"} dir={sort.dir} onClick={() => toggle("xirr")} align="right" />
              <SortableTh label="vs NEPSE" active={sort.key === "nepse"} dir={sort.dir} onClick={() => toggle("nepse")} align="right" />
              <SortableTh label="Gain vs Bank RD" active={sort.key === "rd"} dir={sort.dir} onClick={() => toggle("rd")} align="right" />
              <TableHead className="text-right pr-4 font-bold">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/60">
              {filteredAndSortedRows.map((r) => {
                const rdDelta = r.value - r.rdValue;
                const isSelected = r.symbol === symbol;
                const rankNum = rankedMap.get(r.symbol) ?? null;

                return (
                  <TableRow
                    key={r.symbol}
                    tabIndex={0}
                    onClick={() => handleSelectFund(r.symbol)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectFund(r.symbol);
                      }
                    }}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
                      isSelected && "bg-primary/10 border-l-4 border-l-primary font-medium",
                    )}
                    aria-label={`Select ${r.symbol}`}
                  >
                    <TableCell className="pl-4 text-center">
                      <RankBadge position={rankNum} ranked={r.ranked} since={r.since} />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-foreground text-sm">{r.symbol}</span>
                          {isSelected ? (
                            <span className="size-2 rounded-full bg-primary animate-pulse" />
                          ) : null}
                          {userHoldings.some((h) => h.scrip.toUpperCase() === r.symbol.toUpperCase()) ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/30">
                              Owned
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground truncate max-w-64">{r.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {r.installments} mos
                      {!r.ranked ? <span className="block text-[10px]">from {monthLabel(r.since)}</span> : null}
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-bold text-foreground">
                      {formatNpr(r.value)}
                    </TableCell>
                    <TableCell className={cn("num px-4 py-3 text-right font-medium", r.profit >= 0 ? "text-gain" : "text-loss")}>
                      {formatSignedNpr(r.profit)}
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {formatPercent(r.totalReturnPct)}
                      </div>
                    </TableCell>
                    <TableCell className="num px-4 py-3 text-right font-extrabold text-foreground text-sm">
                      {r.xirr == null ? "-" : formatPercent(r.xirr)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <BeatCell beats={r.beatsNepse} ranked={r.ranked} />
                    </TableCell>
                    <TableCell className={cn("num px-4 py-3 text-right font-medium", rdDelta >= 0 ? "text-gain" : "text-loss")}>
                      {formatSignedNpr(rdDelta)}
                    </TableCell>
                    <TableCell className="px-4 py-3 pr-4 text-right">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs gap-1 cursor-pointer pointer-events-none sm:pointer-events-auto"
                      >
                        {isSelected ? "Simulating" : "Simulate"} <ChevronRight className="size-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredAndSortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No funds match the current filter or search criteria.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
      </Panel>

      {/* -------------------- SECTION 3: EXPANDABLE TOOLS & PLANNERS -------------------- */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Sliders className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Studio Planners, Statement & Guides</h2>
        </div>

        <Tabs value={toolsTab} onValueChange={(v) => setToolsTab(v as typeof toolsTab)} className="w-full space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2 sm:grid-cols-4 bg-muted/60 p-1 rounded-xl">
            <TabsTrigger value="calculators" className="gap-1.5 text-xs font-medium">
              <Zap className="size-3.5" /> Wealth Planners
            </TabsTrigger>
            <TabsTrigger value="ledger" className="gap-1.5 text-xs font-medium">
              <FileSpreadsheet className="size-3.5" /> Ledger & Statement
            </TabsTrigger>
            <TabsTrigger value="deepdive" className="gap-1.5 text-xs font-medium">
              <Layers className="size-3.5" /> Scheme Holdings
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-1.5 text-xs font-medium">
              <BookOpen className="size-3.5" /> SIP Rules & Taxes
            </TabsTrigger>
          </TabsList>

          {/* TAB: WEALTH PLANNERS */}
          <TabsContent value="calculators" className="space-y-4 focus-visible:outline-none">
            <Panel className="space-y-6 border-border/80 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
                <div>
                  <h3 className="font-display text-base font-semibold">Future Wealth & Goal Planners</h3>
                  <p className="text-xs text-muted-foreground">
                    Simulate compound growth, annual step-up multipliers, target financial goals, or the cost of delay.
                  </p>
                </div>

                <div className="flex rounded-lg border border-border/70 p-0.5 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setCalcTab("compound")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      calcTab === "compound" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Compounder
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcTab("stepup")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      calcTab === "stepup" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Step-Up SIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcTab("goal")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      calcTab === "goal" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Goal Planner
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcTab("delay")}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                      calcTab === "delay" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Cost of Delay
                  </button>
                </div>
              </div>

              {/* Planners grid */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="font-semibold">Monthly Investment</Label>
                      <span className="font-bold text-primary font-display text-sm">
                        रु {formatNumber(calcAmount)}
                      </span>
                    </div>
                    <Slider
                      min={500}
                      max={100000}
                      step={500}
                      value={[calcAmount]}
                      onValueChange={([v]) => setCalcAmount(v ?? 5000)}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>रु 500</span>
                      <span>रु 50,000</span>
                      <span>रु 1,00,000</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="font-semibold">Expected Annual Return</Label>
                      <span className="font-bold text-primary font-display text-sm">{calcReturnRate}% p.a.</span>
                    </div>
                    <Slider
                      min={6}
                      max={25}
                      step={0.5}
                      value={[calcReturnRate]}
                      onValueChange={([v]) => setCalcReturnRate(v ?? 12)}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>6% (Conservative)</span>
                      <span>12% (Balanced)</span>
                      <span>18%+ (Aggressive)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <Label className="font-semibold">Time Horizon</Label>
                      <span className="font-bold text-primary font-display text-sm">{calcYears} Years</span>
                    </div>
                    <Slider
                      min={1}
                      max={30}
                      step={1}
                      value={[calcYears]}
                      onValueChange={([v]) => setCalcYears(v ?? 10)}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>1 Year</span>
                      <span>15 Years</span>
                      <span>30 Years</span>
                    </div>
                  </div>

                  {calcTab === "stepup" ? (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex justify-between items-center text-xs">
                        <Label className="font-semibold">Annual Step-Up Increment</Label>
                        <span className="font-bold text-gain font-display text-sm">+{stepUpPct}% / year</span>
                      </div>
                      <Slider
                        min={5}
                        max={25}
                        step={1}
                        value={[stepUpPct]}
                        onValueChange={([v]) => setStepUpPct(v ?? 10)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Automatically raises your monthly contribution each year in line with salary increments.
                      </p>
                    </div>
                  ) : null}

                  {calcTab === "goal" ? (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex justify-between items-center text-xs">
                        <Label className="font-semibold">Target Financial Corpus</Label>
                        <span className="font-bold text-primary font-display text-sm">{formatNpr(goalTarget)}</span>
                      </div>
                      <Slider
                        min={1000000}
                        max={20000000}
                        step={500000}
                        value={[goalTarget]}
                        onValueChange={([v]) => setGoalTarget(v ?? 5000000)}
                      />
                    </div>
                  ) : null}

                  {calcTab === "delay" ? (
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex justify-between items-center text-xs">
                        <Label className="font-semibold">Waiting Period (Delay)</Label>
                        <span className="font-bold text-loss font-display text-sm">
                          {Math.round(delayMonths / 12)} Year(s) ({delayMonths} Months)
                        </span>
                      </div>
                      <Slider
                        min={6}
                        max={60}
                        step={6}
                        value={[delayMonths]}
                        onValueChange={([v]) => setDelayMonths(v ?? 24)}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Projection Output Card */}
                <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-gradient-to-br from-card to-card/60 p-5 shadow-sm space-y-4">
                  {calcTab === "compound" && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Projected Future Wealth
                      </h4>
                      <div className="font-display text-3xl font-extrabold text-primary sm:text-4xl">
                        {formatNpr(compoundResult.futureCorpus)}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <span className="text-xs text-muted-foreground">Total Invested</span>
                          <div className="font-display text-lg font-bold text-foreground">
                            {formatNpr(compoundResult.totalInvested)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-gain/10 p-3">
                          <span className="text-xs text-gain">Wealth Multiplier</span>
                          <div className="font-display text-lg font-bold text-gain">
                            +{formatNpr(compoundResult.wealthGain)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {calcTab === "stepup" && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Corpus with {stepUpPct}% Annual Step-Up
                      </h4>
                      <div className="font-display text-3xl font-extrabold text-gain sm:text-4xl">
                        {formatNpr(compoundResult.stepUpCorpus)}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <span className="text-xs text-muted-foreground">Without Step-Up</span>
                          <div className="font-display text-base font-bold text-foreground">
                            {formatNpr(compoundResult.futureCorpus)}
                          </div>
                        </div>
                        <div className="rounded-lg bg-gain/15 p-3">
                          <span className="text-xs text-gain">Bonus Wealth Created</span>
                          <div className="font-display text-base font-bold text-gain">
                            +{formatNpr(compoundResult.stepUpGain)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {calcTab === "goal" && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Required Monthly SIP
                      </h4>
                      <div className="font-display text-3xl font-extrabold text-primary sm:text-4xl">
                        {formatNpr(compoundResult.goalMonthlyNeeded)} <span className="text-sm font-normal text-muted-foreground">/ month</span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Target Goal:</span>
                          <span className="font-bold">{formatNpr(goalTarget)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Horizon:</span>
                          <span className="font-bold">{calcYears} Years</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {calcTab === "delay" && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-loss">
                        Opportunity Loss from Delaying
                      </h4>
                      <div className="font-display text-3xl font-extrabold text-loss sm:text-4xl">
                        -{formatNpr(compoundResult.delayLoss)}
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="rounded-lg bg-gain/10 p-3">
                          <span className="text-xs text-gain">Starting Today</span>
                          <div className="font-display text-base font-bold">{formatNpr(compoundResult.futureCorpus)}</div>
                        </div>
                        <div className="rounded-lg bg-loss/10 p-3">
                          <span className="text-xs text-loss">Waiting {Math.round(delayMonths / 12)} Yrs</span>
                          <div className="font-display text-base font-bold">{formatNpr(compoundResult.delayedCorpus)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => {
                      setAmount(calcAmount);
                      setAmountText(String(calcAmount));
                      toast.success(`Applied रु ${formatNumber(calcAmount)} to the live fund simulator!`);
                      const el = document.getElementById("sip-overview-section");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <Zap className="size-3.5" /> Apply रु {formatNumber(calcAmount)}/mo to Overview
                  </Button>
                </div>
              </div>

              {/* Trajectory Bar Chart */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <h4 className="font-display text-xs font-semibold text-foreground">
                  Year-by-Year Growth Trajectory (Capital Invested vs Accumulated Corpus)
                </h4>
                <div className="h-56 w-full sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={compoundResult.trajectory} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.7} vertical={false} />
                      <XAxis dataKey="year" tickFormatter={(y) => `Yr ${y}`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} />
                      <YAxis tickFormatter={axisRs} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip
                        formatter={(val, name) => [
                          formatNpr(toNumber(val)),
                          name === "invested" ? "Total Invested" : name === "corpus" ? "Standard SIP Value" : "Step-Up SIP Value",
                        ]}
                        labelFormatter={(yr) => `Year ${yr} of Investment`}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          borderColor: "var(--border)",
                          borderRadius: "0.75rem",
                          fontSize: "0.75rem",
                        }}
                      />
                      <Bar dataKey="invested" name="invested" fill="var(--muted-foreground)" opacity={0.6} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="corpus" name="corpus" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      {calcTab === "stepup" ? (
                        <Bar dataKey="stepUpCorpus" name="stepUpCorpus" fill="#10b981" radius={[4, 4, 0, 0]} />
                      ) : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Panel>
          </TabsContent>

          {/* TAB: LEDGER & STATEMENT */}
          <TabsContent value="ledger" className="space-y-4 focus-visible:outline-none">
            {sim ? (
              <Panel padding="none" className="overflow-clip border-border/80 shadow-sm">
                <div className="flex flex-col gap-3 p-4 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold">
                      {sim.fund.symbol} Monthly Installment Statement ({sim.installments} Installments)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Exact execution date, units credited, purchase NAV, and cash outflow for every deposit.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => copyXirrFormula(sim)}>
                      <Copy className="size-3.5" /> Copy =XIRR() Formula
                    </Button>
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => exportSipCsv(sim, sim.fund.symbol)}>
                      <Download className="size-3.5" /> Download CSV
                    </Button>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10">
                      <TableRow>
                        <TableHead className="w-16 pl-4">#</TableHead>
                        <TableHead>Installment Date</TableHead>
                        <TableHead className="text-right">Outflow (Paid)</TableHead>
                        <TableHead className="text-right">NAV</TableHead>
                        <TableHead className="text-right">Units Added</TableHead>
                        <TableHead className="text-right pr-4">Total Units Held</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/60">
                      {(() => {
                        let cumUnits = 0;
                        const perOutflow = sim.paid / sim.installments;
                        return (sim.buys ?? []).map((b, i) => {
                          cumUnits += b.units;
                          return (
                            <TableRow key={b.date} className="hover:bg-muted/30">
                              <TableCell className="num pl-4 text-xs font-semibold text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-xs font-medium text-foreground">{longDate(b.date)}</TableCell>
                              <TableCell className="num text-right text-xs font-medium">{formatNpr(perOutflow)}</TableCell>
                              <TableCell className="num text-right text-xs font-medium">रु {b.nav.toFixed(2)}</TableCell>
                              <TableCell className="num text-right text-xs font-medium text-gain">+{b.units.toFixed(2)}</TableCell>
                              <TableCell className="num text-right pr-4 text-xs font-bold text-foreground">{cumUnits.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t border-border/60 bg-muted/20 p-4 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <FileSpreadsheet className="size-4 text-primary" /> Independent Spreadsheet Verification
                  </div>
                  <p className="text-muted-foreground">
                    Verify this simulation independently: click <strong>"Copy =XIRR() Formula"</strong>, paste into Excel or Google Sheets, then enter:
                  </p>
                  <div className="rounded-md bg-background/80 border border-border/70 p-2 font-mono text-[11px] text-foreground flex justify-between items-center">
                    <code>=XIRR(B2:B{sim.installments + 2}, A2:A{sim.installments + 2})</code>
                    <span className="text-xs text-muted-foreground font-sans">Yields {formatPercent(sim.xirr ?? 0)}</span>
                  </div>
                </div>
              </Panel>
            ) : null}
          </TabsContent>

          {/* TAB: SCHEME HOLDINGS */}
          <TabsContent value="deepdive" className="space-y-4 focus-visible:outline-none">
            {activeFund ? (
              <div className="grid gap-4 md:grid-cols-3">
                <Panel className="space-y-4 border-border/80 shadow-sm md:col-span-1">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                    <Building2 className="size-4 text-primary" />
                    <h3 className="font-display text-sm font-semibold">Scheme Profile</h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Scheme Name</span>
                      <p className="font-semibold text-foreground text-sm">{activeFund.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Fund Manager (AMC)</span>
                      <p className="font-medium text-foreground">{activeFund.manager}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Fund Type</span>
                        <p className="font-medium text-foreground">Open-Ended</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Par Value</span>
                        <p className="font-medium text-foreground">रु 10.00</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Inception</span>
                        <p className="font-medium text-foreground">{longDate(activeFund.since)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Latest NAV</span>
                        <p className="font-semibold text-foreground">रु {activeFund.navNow}</p>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const portal = AMC_PORTALS[activeFund.symbol] ?? Object.values(AMC_PORTALS).find((p) =>
                      activeFund.name.toLowerCase().includes(p.name.toLowerCase()),
                    );
                    return portal ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2 mt-4 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-primary">
                          <ExternalLink className="size-3.5" /> Start SIP in {activeFund.symbol} Online
                        </div>
                        <p className="text-muted-foreground text-[11px] leading-relaxed">
                          {portal.guideNote}
                        </p>
                        <a
                          href={portal.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-xs"
                        >
                          Visit {portal.portalName} <ChevronRight className="size-3" />
                        </a>
                      </div>
                    ) : null;
                  })()}
                </Panel>

                <Panel className="space-y-3 border-border/80 shadow-sm md:col-span-2">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="size-4 text-primary" />
                      <h3 className="font-display text-sm font-semibold">Underlying Portfolio Holdings</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">{fundHoldings.length} scrips in portfolio</span>
                  </div>

                  {fundBundleQ.isPending ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">Loading portfolio holdings...</div>
                  ) : fundHoldings.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10">
                          <TableRow>
                            <TableHead className="w-12 pl-4">#</TableHead>
                            <TableHead>Scrip</TableHead>
                            <TableHead className="text-right">Shares Held</TableHead>
                            <TableHead className="text-right">Market Value</TableHead>
                            <TableHead className="text-right pr-4">Portfolio Weight</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-border/60">
                          {fundHoldings.slice(0, 15).map((h, i) => (
                            <TableRow key={h.stockSymbol} className="hover:bg-muted/30">
                              <TableCell className="num pl-4 text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-xs font-semibold text-foreground">{h.stockSymbol}</TableCell>
                              <TableCell className="num text-right text-xs font-medium">{formatQty(h.units)}</TableCell>
                              <TableCell className="num text-right text-xs font-medium">{formatNpr(h.value)}</TableCell>
                              <TableCell className="num text-right pr-4 text-xs font-bold text-primary">
                                {formatPercent(h.weight)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Holdings disclosure for this scheme is being synchronized from AMC disclosures.
                    </div>
                  )}
                </Panel>
              </div>
            ) : null}
          </TabsContent>

          {/* TAB: SIP RULES & TAXES */}
          <TabsContent value="guide" className="space-y-4 focus-visible:outline-none">
            <div className="grid gap-4 md:grid-cols-2">
              <Panel className="space-y-3 border-border/80 shadow-sm text-xs text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/60 pb-2">
                  <BookOpen className="size-4 text-primary" /> Rupee Cost Averaging in Nepal
                </div>
                <p>
                  A Systematic Investment Plan (SIP) in open-ended mutual funds automates rupee-cost averaging. In a volatile market like NEPSE, investing a fixed amount each month automatically buys more units when prices fall and fewer units when prices rise, lowering your average cost per unit without timing the market.
                </p>
                <p>
                  Unlike closed-end mutual funds which trade on NEPSE at market discounts or premiums, open-ended funds are bought and redeemed directly through the fund manager (AMC) at their daily published Net Asset Value (NAV).
                </p>
              </Panel>

              <Panel className="space-y-3 border-border/80 shadow-sm text-xs text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/60 pb-2">
                  <ShieldCheck className="size-4 text-primary" /> Fees & Tax Rules in Nepal
                </div>
                <ul className="space-y-1.5 list-disc pl-4 text-xs">
                  <li>
                    <strong className="text-foreground">DP Charge:</strong> रु 5.00 is deducted by the depository per monthly installment.
                  </li>
                  <li>
                    <strong className="text-foreground">Payment Gateway:</strong> ConnectIPS or digital wallet fee of रु 4.52 per installment.
                  </li>
                  <li>
                    <strong className="text-foreground">Capital Gains Tax (CGT):</strong> 5% flat final withholding tax for resident individual investors upon redemption.
                  </li>
                  <li>
                    <strong className="text-foreground">Dividend Tax:</strong> 5% source tax on cash distributions.
                  </li>
                </ul>
              </Panel>
            </div>

            <Panel className="space-y-3 border-border/80 shadow-sm text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground font-semibold text-sm border-b border-border/60 pb-2">
                <HelpCircle className="size-4 text-primary" /> Shabdakosh (Investor Glossary)
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <span className="font-semibold text-foreground text-xs">NAV (Net Asset Value)</span>
                  <p className="mt-1 text-[11px]">
                    The market value of all securities held by the fund minus liabilities, divided by total outstanding units.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <span className="font-semibold text-foreground text-xs">XIRR (Extended Internal Rate of Return)</span>
                  <p className="mt-1 text-[11px]">
                    The true annualized rate of return for a series of periodic cash flows, accounting for exact deposit dates.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <span className="font-semibold text-foreground text-xs">Dividend Impact</span>
                  <p className="mt-1 text-[11px]">
                    Cash payouts lower the daily NAV by the dividend amount on book closure; real investor returns exceed pure NAV growth.
                  </p>
                </div>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function useSimulation(symbol: string, startMonth: string, amount: number, rdRate: number, fees: boolean) {
  const q = useQuery(sipSimulationQuery(symbol || null, startMonth, amount, rdRate, fees));
  return q.data ?? null;
}
