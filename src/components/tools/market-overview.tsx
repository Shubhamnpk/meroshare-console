import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Activity,
  Layers,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  TableProperties,
  PieChart,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Flame,
  BarChart2,
  Zap,
  AlertTriangle,
  BarChart3,
  LineChart,
} from "lucide-react";
import { formatNpr, formatNumber, formatPercent, formatQty } from "@/lib/format";
import type { LivePrice, MarketIndex, PricePoint, SectorIndex } from "@/lib/nepse/types";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { IndexChartModal } from "@/components/tools/index-chart-modal";
import { MarketMarquee } from "@/components/market/market-marquee";
import { Heatmap, type HeatTile } from "@/components/market/heatmap";
import { cn } from "@/lib/utils";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tileColor(pct: number): string {
  if (pct > 3) return "bg-emerald-500 text-white";
  if (pct > 1) return "bg-emerald-500/75 text-white";
  if (pct > 0.2) return "bg-emerald-500/40 text-emerald-100";
  if (pct >= -0.2) return "bg-muted/70 text-muted-foreground";
  if (pct > -1) return "bg-red-500/40 text-red-100";
  if (pct > -3) return "bg-red-500/75 text-white";
  return "bg-red-500 text-white";
}

function sectorBorderColor(pct: number): string {
  if (pct > 1) return "border-emerald-500/50";
  if (pct > 0) return "border-emerald-500/25";
  if (pct === 0) return "border-border/50";
  if (pct > -1) return "border-red-500/25";
  return "border-red-500/50";
}

function sectorSortKey(s: string): number {
  const order = [
    "Commercial Banks",
    "Development Banks",
    "Microfinance",
    "Finance",
    "Life Insurance",
    "Non-Life Insurance",
    "Insurance",
    "Hydropower",
    "Manufacturing",
    "Trading",
    "Hotels",
    "Telecom",
    "Investment",
    "Mutual Fund",
    "Others",
  ];
  const idx = order.findIndex((o) => s.toLowerCase().includes(o.toLowerCase()));
  return idx >= 0 ? idx : order.length;
}

function chartGradientId(name: string) {
  return `grad-${name.replace(/\s+/g, "-").toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Sentiment Arc Gauge (SVG)
// ---------------------------------------------------------------------------

function SentimentGauge({ score }: { score: number }) {
  // score: 0 = extreme bear, 50 = neutral, 100 = extreme bull
  const clamped = Math.max(0, Math.min(100, score));

  const cx = 80;
  const cy = 80;
  const r = 58;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const arcPath = (from: number, to: number, innerR: number, outerR: number) => {
    const s1 = { x: cx + outerR * Math.cos(toRad(from)), y: cy + outerR * Math.sin(toRad(from)) };
    const e1 = { x: cx + outerR * Math.cos(toRad(to)), y: cy + outerR * Math.sin(toRad(to)) };
    const s2 = { x: cx + innerR * Math.cos(toRad(to)), y: cy + innerR * Math.sin(toRad(to)) };
    const e2 = { x: cx + innerR * Math.cos(toRad(from)), y: cy + innerR * Math.sin(toRad(from)) };
    return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 0 0 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 0 1 ${e2.x} ${e2.y} Z`;
  };

  const zones = [
    { from: 180, to: 144, color: "#ef4444" },
    { from: 144, to: 108, color: "#f97316" },
    { from: 108, to: 72, color: "#eab308" },
    { from: 72, to: 36, color: "#84cc16" },
    { from: 36, to: 0, color: "#22c55e" },
  ];

  // Needle angle: 180 (bear) → 0 (bull)
  const needleAngleDeg = 180 - (clamped / 100) * 180;
  const needleEnd = {
    x: cx + (r - 6) * Math.cos(toRad(needleAngleDeg)),
    y: cy + (r - 6) * Math.sin(toRad(needleAngleDeg)),
  };
  const nb1 = {
    x: cx + 4 * Math.cos(toRad(needleAngleDeg + 90)),
    y: cy + 4 * Math.sin(toRad(needleAngleDeg + 90)),
  };
  const nb2 = {
    x: cx + 4 * Math.cos(toRad(needleAngleDeg - 90)),
    y: cy + 4 * Math.sin(toRad(needleAngleDeg - 90)),
  };

  const labelColor =
    clamped >= 80
      ? "#22c55e"
      : clamped >= 60
        ? "#84cc16"
        : clamped >= 40
          ? "#eab308"
          : clamped >= 20
            ? "#f97316"
            : "#ef4444";

  const label =
    clamped >= 80
      ? "Strong Bull"
      : clamped >= 60
        ? "Mild Bull"
        : clamped >= 40
          ? "Neutral"
          : clamped >= 20
            ? "Mild Bear"
            : "Strong Bear";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 90" className="w-40 select-none" aria-label={`Sentiment: ${label}`}>
        {zones.map((z, i) => (
          <path key={i} d={arcPath(z.from, z.to, 40, 58)} fill={z.color} opacity={0.3} />
        ))}
        <path d={arcPath(180, 0, 56, 58)} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
        <polygon
          points={`${needleEnd.x},${needleEnd.y} ${nb1.x},${nb1.y} ${nb2.x},${nb2.y}`}
          fill={labelColor}
          opacity={0.95}
        />
        <circle cx={cx} cy={cy} r={6} fill={labelColor} />
        <circle cx={cx} cy={cy} r={3.5} fill="hsl(var(--card))" />
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize="14" fontWeight="bold" fill={labelColor}>
          {Math.round(clamped)}
        </text>
      </svg>
      <span
        className="mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
        style={{ background: `${labelColor}22`, color: labelColor }}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intelligence mini-card shell
// ---------------------------------------------------------------------------

function IntelCard({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/60 p-3.5 shadow-xs min-w-0">
      <div className="flex items-center gap-1.5">
        <span className={cn("flex size-5 items-center justify-center rounded-md", color)}>
          <Icon className="size-3 text-white" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}


function IndexCard({
  name,
  data,
  chartPoints,
  onClick,
}: {
  name: string;
  data: MarketIndex | undefined;
  chartPoints: PricePoint[];
  onClick: () => void;
}) {
  const change = data?.percentChange ?? 0;
  const pointChange = data?.change ?? 0;
  const close = data?.close ?? 0;
  const isUp = change >= 0;
  const color = isUp ? "#22c55e" : "#ef4444";

  const chartData = useMemo(
    () =>
      chartPoints.map((p) => ({
        t: p.time * 1000,
        v: p.value,
      })),
    [chartPoints],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card/70 p-3.5 text-left transition-all hover:ring-2 cursor-pointer shadow-xs",
        isUp
          ? "border-emerald-500/30 hover:ring-emerald-500/30 hover:border-emerald-500/50"
          : "border-red-500/30 hover:ring-red-500/30 hover:border-red-500/50",
      )}
    >
      {/* Gradient tint */}
      <div
        className="pointer-events-none absolute inset-0 opacity-5 transition-opacity group-hover:opacity-10"
        style={{ background: `radial-gradient(ellipse at top right, ${color} 0%, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
            {name}
          </span>
          {data && (
            <div className="flex items-center gap-1">
              <span className={cn("num text-xs font-bold", isUp ? "text-emerald-400" : "text-red-400")}>
                {isUp ? "+" : ""}{formatPercent(change)}
              </span>
              <ArrowUpRight className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          )}
        </div>

        {data && (
          <div className="mt-1 flex items-baseline gap-2">
            <p className="num text-xl font-bold text-foreground">
              {close.toLocaleString("en-NP", { maximumFractionDigits: 2 })}
            </p>
            <span className={cn("num text-xs font-medium", isUp ? "text-emerald-400/80" : "text-red-400/80")}>
              {isUp ? "+" : ""}{formatNumber(pointChange)}
            </span>
          </div>
        )}

        <div className="mt-1.5 h-14">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={chartGradientId(name)} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#${chartGradientId(name)})`}
                  dot={false}
                  isAnimationActive={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: "0.65rem",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "none",
                    background: "hsl(var(--card))",
                    color: "hsl(var(--foreground))",
                  }}
                  formatter={(val: number) => [val.toLocaleString("en-NP", { maximumFractionDigits: 2 }), name]}
                  labelFormatter={(t) => new Date(t as number).toLocaleDateString("en-NP")}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-[0.6rem] text-muted-foreground/50">
              Click to load full history
            </div>
          )}
        </div>

        {data && (
          <div className="mt-1.5 flex justify-between text-[0.6rem] text-muted-foreground/70">
            <span className="flex items-center gap-0.5">
              <TrendingUp className="size-2.5 text-emerald-400/60" /> {formatNumber(data.high)}
            </span>
            <span className="flex items-center gap-0.5">
              <TrendingDown className="size-2.5 text-red-400/60" /> {formatNumber(data.low)}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component: Market Overview & Market Depth
// ---------------------------------------------------------------------------

export type MarketDepthViewMode = "matrix" | "grid" | "treemap";

export function MarketOverview({
  prices,
  indices,
  sectorIndices,
  indexGraphQueries,
}: {
  prices: LivePrice[];
  indices: MarketIndex[];
  sectorIndices: SectorIndex[];
  indexGraphQueries: Record<string, { data?: PricePoint[]; isLoading: boolean }>;
}) {
  const [viewMode, setViewMode] = useState<MarketDepthViewMode>("matrix");
  const [pickedScrip, setPickedScrip] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [treemapMetric, setTreemapMetric] = useState<"turnover" | "volume">("turnover");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());
  const [chartModal, setChartModal] = useState<{
    open: boolean;
    title: string;
    indexName?: string;
    sectorName?: string;
  }>({ open: false, title: "" });

  const nepseIndex = indices.find((i) => /nepse/i.test(i.name));
  const sensitiveIndex = indices.find((i) => /sensitive/i.test(i.name));
  const floatIndex = indices.find((i) => /float/i.test(i.name));

  // Build sector map for fast code/name lookups
  const sectorIndexMap = useMemo(() => {
    const map = new Map<string, SectorIndex>();
    for (const si of sectorIndices) {
      map.set(si.name.toLowerCase(), si);
      map.set(si.code.toLowerCase(), si);
      if (si.sector) map.set(si.sector.toLowerCase(), si);
    }
    return map;
  }, [sectorIndices]);

  const findSectorIndex = (sectorName: string): SectorIndex | undefined => {
    const lower = sectorName.toLowerCase();
    return (
      sectorIndexMap.get(lower) ??
      [...sectorIndexMap.values()].find((si) =>
        si.name.toLowerCase().includes(lower.split(" ")[0] ?? ""),
      )
    );
  };

  // Aggregated sector statistics and market breadth
  const { sectors, breadth, totalMarketTurnover, totalMarketVolume } = useMemo(() => {
    const grouped = new Map<string, LivePrice[]>();
    for (const p of prices) {
      const sector = p.sector ?? "Others";
      const arr = grouped.get(sector) ?? [];
      arr.push(p);
      grouped.set(sector, arr);
    }

    const total = prices.length;
    const advancers = prices.filter((p) => p.percentChange > 0).length;
    const decliners = prices.filter((p) => p.percentChange < 0).length;
    const unchanged = total - advancers - decliners;
    const avgChange =
      total > 0 ? prices.reduce((s, p) => s + p.percentChange, 0) / total : 0;
    const grandTurnover = prices.reduce((s, p) => s + p.turnover, 0);
    const grandVolume = prices.reduce((s, p) => s + p.volume, 0);

    const compiledSectors = [...grouped.entries()]
      .sort(([a], [b]) => sectorSortKey(a) - sectorSortKey(b))
      .map(([sector, items]) => {
        const sectorTurnover = items.reduce((s, p) => s + p.turnover, 0);
        const sectorVolume = items.reduce((s, p) => s + p.volume, 0);
        const sectorTrades = items.reduce((s, p) => s + p.trades, 0);
        const secAdv = items.filter((p) => p.percentChange > 0).length;
        const secDec = items.filter((p) => p.percentChange < 0).length;
        const secFlat = items.length - secAdv - secDec;
        const sortedByTurnover = [...items].sort((a, b) => b.turnover - a.turnover);
        const sortedByChange = [...items].sort((a, b) => b.percentChange - a.percentChange);
        const topGainer = sortedByChange[0];
        const topLoser = sortedByChange[sortedByChange.length - 1];
        const topTraded = sortedByTurnover[0];
        const si = findSectorIndex(sector);

        return {
          sector,
          sectorIndex: si,
          items: sortedByTurnover,
          avgChange:
            items.length > 0
              ? items.reduce((s, p) => s + p.percentChange, 0) / items.length
              : 0,
          sectorPoints: si?.close ?? null,
          sectorPointChange: si?.change ?? null,
          sectorPercentChange: si?.percentChange ?? null,
          totalTurnover: sectorTurnover,
          marketSharePct: grandTurnover > 0 ? (sectorTurnover / grandTurnover) * 100 : 0,
          totalVolume: sectorVolume,
          totalTrades: sectorTrades,
          advancers: secAdv,
          decliners: secDec,
          unchanged: secFlat,
          topGainer: topGainer && topGainer.percentChange > 0 ? topGainer : null,
          topLoser: topLoser && topLoser.percentChange < 0 ? topLoser : null,
          topTraded: topTraded ?? null,
        };
      });

    return {
      sectors: compiledSectors,
      breadth: {
        total,
        advancers,
        decliners,
        unchanged,
        advPct: total > 0 ? Math.round((advancers / total) * 100) : 0,
        decPct: total > 0 ? Math.round((decliners / total) * 100) : 0,
        avgChange,
      },
      totalMarketTurnover: grandTurnover,
      totalMarketVolume: grandVolume,
    };
  }, [prices, sectorIndexMap]);

  // ── Sentiment Score (0 = extreme bear, 100 = extreme bull) ──
  const sentimentScore = useMemo(() => {
    const breadthSignal = breadth.total > 0 ? (breadth.advancers / breadth.total) * 100 : 50;
    const nepseChg = nepseIndex?.percentChange ?? 0;
    const nepseSignal = Math.max(0, Math.min(100, 50 + (nepseChg / 3) * 50));
    const greenSectors = sectors.filter((s) => (s.sectorPercentChange ?? s.avgChange) > 0).length;
    const sectorSignal = sectors.length > 0 ? (greenSectors / sectors.length) * 100 : 50;
    const avgTurnover = breadth.total > 0 ? totalMarketTurnover / breadth.total : 0;
    const turnoverSignal = Math.max(0, Math.min(100, (avgTurnover / 2_000_000) * 100));
    return breadthSignal * 0.35 + nepseSignal * 0.25 + sectorSignal * 0.25 + turnoverSignal * 0.15;
  }, [breadth, nepseIndex, sectors, totalMarketTurnover]);

  // ── Top Movers ──
  const topMovers = useMemo(() => {
    const sorted = [...prices].filter((p) => p.ltp > 0);
    const gainers = [...sorted].sort((a, b) => b.percentChange - a.percentChange).slice(0, 5);
    const losers = [...sorted].sort((a, b) => a.percentChange - b.percentChange).slice(0, 5);
    return { gainers, losers };
  }, [prices]);

  // ── Volume Surge / Most Active ──
  const volumeSurge = useMemo(() => {
    return [...prices].filter((p) => p.turnover > 0).sort((a, b) => b.turnover - a.turnover).slice(0, 5);
  }, [prices]);

  // ── Sector Rotation (vs market avg) ──
  const sectorRotation = useMemo(() => {
    const marketAvg = breadth.avgChange;
    return [...sectors]
      .map((s) => ({ ...s, vsMarket: (s.sectorPercentChange ?? s.avgChange) - marketAvg }))
      .sort((a, b) => b.vsMarket - a.vsMarket);
  }, [sectors, breadth.avgChange]);

  // ── 52-Week Extremes ──
  const extremes = useMemo(() => {
    const nearHigh = prices
      .filter((p) => p.fiftyTwoWeekHigh && p.ltp > 0 && p.ltp / p.fiftyTwoWeekHigh >= 0.97)
      .sort((a, b) => b.ltp / (b.fiftyTwoWeekHigh ?? 1) - a.ltp / (a.fiftyTwoWeekHigh ?? 1))
      .slice(0, 5);
    const nearLow = prices
      .filter((p) => p.fiftyTwoWeekLow && p.ltp > 0 && p.ltp / p.fiftyTwoWeekLow <= 1.03)
      .sort((a, b) => a.ltp / (a.fiftyTwoWeekLow ?? 1) - b.ltp / (b.fiftyTwoWeekLow ?? 1))
      .slice(0, 5);
    return { nearHigh, nearLow };
  }, [prices]);

  const sentimentLabel =
    sentimentScore >= 80 ? "Strong Bull"
      : sentimentScore >= 60 ? "Mild Bull"
        : sentimentScore >= 40 ? "Neutral"
          : sentimentScore >= 20 ? "Mild Bear"
            : "Strong Bear";


  const treemapTiles: HeatTile[] = useMemo(() => {
    return [...prices]
      .filter((p) => p.ltp > 0)
      .sort((a, b) =>
        treemapMetric === "turnover" ? b.turnover - a.turnover : b.volume - a.volume,
      )
      .slice(0, 80)
      .map((p) => {
        const val = treemapMetric === "turnover" ? p.turnover : p.volume;
        return {
          key: p.symbol,
          label: p.symbol,
          detail: formatPercent(p.percentChange),
          value: Math.max(1, val),
          change: p.percentChange,
          group: p.sector ?? "Others",
          title: `${p.symbol} · ${p.name} · LTP ${formatNpr(p.ltp)} · Change ${formatPercent(p.percentChange)} · Turnover ${formatNpr(p.turnover, { compact: true })}`,
        };
      });
  }, [prices, treemapMetric]);

  const toggleExpandSector = (sector: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  const filteredSectors = useMemo(() => {
    if (!searchQuery.trim()) return sectors;
    const term = searchQuery.toLowerCase().trim();
    return sectors.filter(
      (s) =>
        s.sector.toLowerCase().includes(term) ||
        s.items.some(
          (p) =>
            p.symbol.toLowerCase().includes(term) ||
            p.name.toLowerCase().includes(term),
        ),
    );
  }, [sectors, searchQuery]);

  const sentiment =
    breadth.avgChange >= 1
      ? "Strong Bullish"
      : breadth.avgChange >= 0
        ? "Mild Bullish"
        : breadth.avgChange >= -1
          ? "Weak Bearish"
          : "Heavy Bearish";

  return (
    <div className="space-y-5">
      {/* 1. Real-time Marquee Ticker */}
      <MarketMarquee
        indices={indices}
        sectorIndices={sectorIndices}
        prices={prices}
        onSelectIndex={(idx) =>
          setChartModal({
            open: true,
            title: `${idx} Index`,
            indexName: idx,
          })
        }
        onSelectSector={(sec) =>
          setChartModal({
            open: true,
            title: `${sec} Index`,
            sectorName: sec,
          })
        }
        onSelectScrip={(sym) => setPickedScrip(sym)}
      />

      {/* 2. Major Indices Cards */}
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <TrendingUp className="size-3.5 text-primary" />
            <span>Major Benchmarks</span>
          </div>
          <span className="text-[11px] text-muted-foreground/70">
            Click any index card to launch all-time chart
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <IndexCard
            name="NEPSE"
            data={nepseIndex}
            chartPoints={indexGraphQueries["NEPSE"]?.data ?? []}
            onClick={() =>
              setChartModal({
                open: true,
                title: "NEPSE Index",
                indexName: "NEPSE",
              })
            }
          />
          <IndexCard
            name="Sensitive"
            data={sensitiveIndex}
            chartPoints={indexGraphQueries["SENSITIVE"]?.data ?? []}
            onClick={() =>
              setChartModal({
                open: true,
                title: "Sensitive Index",
                indexName: "SENSITIVE",
              })
            }
          />
          <IndexCard
            name="Float"
            data={floatIndex}
            chartPoints={indexGraphQueries["FLOAT"]?.data ?? []}
            onClick={() =>
              setChartModal({
                open: true,
                title: "Float Index",
                indexName: "FLOAT",
              })
            }
          />
        </div>
      </div>

      {/* 3. Market Breadth & Depth Barometer */}
      <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">
              Market Breadth &amp; Flow
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                breadth.avgChange >= 0
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400",
              )}
            >
              {sentiment} · {formatPercent(breadth.avgChange)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              Turnover:{" "}
              <strong className="text-foreground">
                {formatNpr(totalMarketTurnover, { compact: true })}
              </strong>
            </span>
            <span className="text-muted-foreground">
              Volume:{" "}
              <strong className="text-foreground">
                {formatQty(totalMarketVolume)}
              </strong>
            </span>
          </div>
        </div>

        {/* Breadth Bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${breadth.advPct}%` }}
            title={`${breadth.advancers} Advancers`}
          />
          <div
            className="bg-muted-foreground/30 transition-all"
            style={{
              width: `${breadth.total > 0 ? Math.round((breadth.unchanged / breadth.total) * 100) : 0}%`,
            }}
            title={`${breadth.unchanged} Unchanged`}
          />
          <div
            className="bg-red-500 transition-all"
            style={{
              width: `${breadth.total > 0 ? Math.round((breadth.decliners / breadth.total) * 100) : 0}%`,
            }}
            title={`${breadth.decliners} Decliners`}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-emerald-400">
            ▲ {breadth.advancers} Advancing ({breadth.advPct}%)
          </span>
          <span className="text-muted-foreground/80">
            ▬ {breadth.unchanged} Unchanged
          </span>
          <span className="font-semibold text-red-400">
            ▼ {breadth.decliners} Declining (
            {breadth.total > 0 ? Math.round((breadth.decliners / breadth.total) * 100) : 0}%)
          </span>
        </div>
      </div>

      {/* 4. Market Depth / Sector Heatmap Section with View Switcher */}
      <div className="space-y-3">
        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="font-display text-base font-bold text-foreground">
              Market Depth &amp; Sector Heatmap
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Filter */}
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sector or scrip…"
                className="h-8 w-full rounded-xl border border-border/60 bg-surface pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-hidden"
              />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-border/60 bg-surface p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode("matrix")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors cursor-pointer",
                  viewMode === "matrix"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TableProperties className="size-3.5" />
                <span className="hidden sm:inline">Depth Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors cursor-pointer",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">Sector Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("treemap")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors cursor-pointer",
                  viewMode === "treemap"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <PieChart className="size-3.5" />
                <span className="hidden sm:inline">Treemap</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode 1: Market Depth Matrix (Institutional Table) */}
        {viewMode === "matrix" && (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-surface/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 pl-4 pr-2">Sector</th>
                    <th className="py-2.5 px-3 text-right">Index Points</th>
                    <th className="py-2.5 px-3 text-right">Turnover</th>
                    <th className="py-2.5 px-3 text-right">Mkt Share</th>
                    <th className="py-2.5 px-3 text-center min-w-[120px]">Breadth</th>
                    <th className="py-2.5 px-3 text-left">Top Performer</th>
                    <th className="py-2.5 px-3 text-left">Heaviest Scrip</th>
                    <th className="py-2.5 pr-4 pl-2 text-right">Chart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredSectors.map((s) => {
                    const isExpanded = expandedSectors.has(s.sector);
                    const isUp = (s.sectorPercentChange ?? s.avgChange) >= 0;

                    return (
                      <tr key={s.sector} className="group hover:bg-surface/50 transition-colors">
                        <td className="py-3 pl-4 pr-2">
                          <button
                            type="button"
                            onClick={() => toggleExpandSector(s.sector)}
                            className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors cursor-pointer text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            )}
                            <span>{s.sector}</span>
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-normal">
                              {s.items.length}
                            </span>
                          </button>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="num font-bold text-foreground">
                              {s.sectorPoints != null
                                ? formatNumber(s.sectorPoints)
                                : "—"}
                            </span>
                            <span
                              className={cn(
                                "num text-[11px] font-semibold",
                                isUp ? "text-gain" : "text-loss",
                              )}
                            >
                              {s.sectorPercentChange != null
                                ? `${s.sectorPercentChange >= 0 ? "+" : ""}${formatPercent(s.sectorPercentChange)}`
                                : formatPercent(s.avgChange)}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="num font-semibold text-foreground">
                              {formatNpr(s.totalTurnover, { compact: true })}
                            </span>
                            <span className="num text-[10px] text-muted-foreground">
                              {formatQty(s.totalVolume)} shares
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="num font-semibold text-foreground">
                              {s.marketSharePct.toFixed(1)}%
                            </span>
                            <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.min(100, s.marketSharePct * 3)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex h-2 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className="bg-emerald-500"
                                style={{
                                  width: `${(s.advancers / s.items.length) * 100}%`,
                                }}
                                title={`${s.advancers} Up`}
                              />
                              <div
                                className="bg-muted-foreground/30"
                                style={{
                                  width: `${(s.unchanged / s.items.length) * 100}%`,
                                }}
                                title={`${s.unchanged} Flat`}
                              />
                              <div
                                className="bg-red-500"
                                style={{
                                  width: `${(s.decliners / s.items.length) * 100}%`,
                                }}
                                title={`${s.decliners} Down`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              <span className="text-emerald-400 font-semibold">{s.advancers}↑</span>{" "}
                              <span>{s.unchanged}▬</span>{" "}
                              <span className="text-red-400 font-semibold">{s.decliners}↓</span>
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-left">
                          {s.topGainer ? (
                            <button
                              type="button"
                              onClick={() => setPickedScrip(s.topGainer!.symbol)}
                              className="text-left group/top hover:underline cursor-pointer"
                            >
                              <span className="font-bold text-foreground group-hover/top:text-primary">
                                {s.topGainer.symbol}
                              </span>{" "}
                              <span className="num text-gain font-semibold text-[11px]">
                                +{formatPercent(s.topGainer.percentChange)}
                              </span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-left">
                          {s.topTraded ? (
                            <button
                              type="button"
                              onClick={() => setPickedScrip(s.topTraded!.symbol)}
                              className="text-left group/trade hover:underline cursor-pointer"
                            >
                              <span className="font-bold text-foreground group-hover/trade:text-primary">
                                {s.topTraded.symbol}
                              </span>{" "}
                              <span className="num text-[10px] text-muted-foreground">
                                {formatNpr(s.topTraded.turnover, { compact: true })}
                              </span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>

                        <td className="py-3 pr-4 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setChartModal({
                                open: true,
                                title: `${s.sector} Index`,
                                sectorName: s.sector,
                              })
                            }
                            className="rounded-lg border border-border/60 bg-surface px-2 py-1 text-[11px] font-semibold text-primary hover:border-primary/40 hover:bg-primary/10 transition-colors cursor-pointer"
                          >
                            Chart
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded Sector Details Drawer */}
            {expandedSectors.size > 0 && (
              <div className="border-t border-border/60 bg-surface/40 p-4 space-y-4">
                {[...expandedSectors].map((secName) => {
                  const sec = sectors.find((s) => s.sector === secName);
                  if (!sec) return null;

                  return (
                    <div key={secName} className="space-y-2 rounded-xl border border-border/50 bg-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-foreground">
                          {secName} Constituents ({sec.items.length} stocks)
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpandSector(secName)}
                          className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Collapse
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {sec.items.map((p) => {
                          const up = p.percentChange >= 0;
                          return (
                            <button
                              key={p.symbol}
                              type="button"
                              onClick={() => setPickedScrip(p.symbol)}
                              className="rounded-lg border border-border/50 bg-surface p-2 text-left hover:border-primary/40 transition-colors cursor-pointer"
                            >
                              <p className="truncate font-bold text-xs text-foreground">
                                {p.symbol}
                              </p>
                              <div className="flex items-baseline justify-between text-[11px]">
                                <span className="num text-muted-foreground">
                                  {formatNpr(p.ltp)}
                                </span>
                                <span className={cn("num font-semibold", up ? "text-gain" : "text-loss")}>
                                  {up ? "+" : ""}
                                  {formatPercent(p.percentChange)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View Mode 2: Sector Grid (Interactive Heatmap Cards) */}
        {viewMode === "grid" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSectors.map((s) => {
              const isUp = (s.sectorPercentChange ?? s.avgChange) >= 0;

              return (
                <div
                  key={s.sector}
                  className={cn(
                    "rounded-2xl border bg-card/60 p-3.5 transition-all shadow-xs",
                    sectorBorderColor(s.avgChange),
                  )}
                >
                  {/* Sector header — clickable for full chart */}
                  <button
                    type="button"
                    onClick={() =>
                      setChartModal({
                        open: true,
                        title: `${s.sector} Index`,
                        sectorName: s.sector,
                      })
                    }
                    className="mb-2.5 flex w-full items-baseline justify-between border-b border-border/40 pb-2 text-left group cursor-pointer hover:border-primary/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                          {s.sector}
                        </p>
                        <ArrowUpRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {s.items.length} stocks · {formatNpr(s.totalTurnover, { compact: true })} vol
                      </p>
                    </div>

                    <div className="ml-2 text-right">
                      <p
                        className={cn(
                          "num text-xs font-bold",
                          isUp ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {s.sectorPercentChange != null
                          ? `${s.sectorPercentChange >= 0 ? "+" : ""}${formatPercent(s.sectorPercentChange)}`
                          : formatPercent(s.avgChange)}
                      </p>
                      {s.sectorPoints != null && (
                        <p className="num text-[10px] text-muted-foreground">
                          {formatNumber(s.sectorPoints)}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Stock tiles */}
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                    {s.items.map((p) => {
                      const maxTurnover = s.items[0]?.turnover ?? 1;
                      const scale = Math.max(0.4, Math.min(1, p.turnover / maxTurnover));

                      return (
                        <button
                          key={p.symbol}
                          type="button"
                          onClick={() => setPickedScrip(p.symbol)}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-md px-1 py-1 text-center transition-all hover:ring-1 hover:ring-white/40 cursor-pointer",
                            tileColor(p.percentChange),
                          )}
                          style={{ opacity: Math.max(0.45, scale) }}
                          title={`${p.symbol} ${formatNpr(p.ltp)} (${formatPercent(p.percentChange)})`}
                        >
                          <span className="text-[10px] font-bold leading-tight">
                            {p.symbol}
                          </span>
                          <span className="num text-[9px] leading-tight opacity-85 font-medium">
                            {formatPercent(p.percentChange)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View Mode 3: Treemap View */}
        {viewMode === "treemap" && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Squarified area scaled by session metric · grouped by sector
              </span>
              <div className="flex items-center rounded-lg bg-surface border border-border/50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTreemapMetric("turnover")}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                    treemapMetric === "turnover"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Turnover
                </button>
                <button
                  type="button"
                  onClick={() => setTreemapMetric("volume")}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                    treemapMetric === "volume"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Volume
                </button>
              </div>
            </div>

            <Heatmap
              tiles={treemapTiles}
              onPick={(symbol) => setPickedScrip(symbol)}
              sizeLabel={treemapMetric}
              heightClass="h-[52vh] sm:h-[60vh]"
            />
          </div>
        )}
      </div>

      {/* Full Range Historical Chart Modal */}
      <IndexChartModal
        open={chartModal.open}
        onOpenChange={(open) => setChartModal((s) => ({ ...s, open }))}
        title={chartModal.title}
        indexName={chartModal.indexName}
        sectorName={chartModal.sectorName}
        prices={prices}
        onSelectScrip={(sym) => {
          setChartModal((s) => ({ ...s, open: false }));
          setPickedScrip(sym);
        }}
      />

      {/* Stock detail sheet */}
      {pickedScrip && (
        <ScripSheet
          symbol={pickedScrip}
          open={Boolean(pickedScrip)}
          onOpenChange={(open) => {
            if (!open) setPickedScrip(null);
          }}
        />
      )}
    </div>
  );
}
