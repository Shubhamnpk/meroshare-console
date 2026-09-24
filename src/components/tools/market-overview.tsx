import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { indexDailyQuery, indexGraphQuery } from "@/lib/queries";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import {
  Activity,
  Layers,
  TrendingUp,
  TrendingDown,
  LayoutGrid,
  TableProperties,
  PieChart,
  Search,
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
import { normalizeSectorKey, subindexKeyFor } from "@/lib/nepse/sectors";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { IndexChartModal } from "@/components/tools/index-chart-modal";
import { MarketMarquee } from "@/components/market/market-marquee";
import { Heatmap, type HeatTile } from "@/components/market/heatmap";
import { SectorBadge } from "@/components/market/sector-icon";
import { CompactNpr, CompactQty } from "@/components/market/compact-value";
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

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// ---------------------------------------------------------------------------
// Sentiment Arc Gauge (SVG)
// ---------------------------------------------------------------------------

export function SentimentGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  // score: 0 = extreme bear, 50 = neutral, 100 = extreme bull
  const clamped = Math.max(0, Math.min(100, score));

  // Tween the needle toward each new score so every per-number move is
  // visible instead of jumping between readings.
  const [display, setDisplay] = useState(clamped);
  const targetRef = useRef(clamped);
  useEffect(() => {
    const from = targetRef.current;
    targetRef.current = clamped;
    if (from === clamped) {
      setDisplay(clamped);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 650;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (clamped - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const cx = 80;
  const cy = 80;
  const r = 58;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  // Screen Y grows downward, so the dial uses y = cy − R·sin(deg).
  const pt = (deg: number, rad: number) => ({
    x: cx + rad * Math.cos(toRad(deg)),
    y: cy - rad * Math.sin(toRad(deg)),
  });

  const arcPath = (from: number, to: number, innerR: number, outerR: number) => {
    const s1 = pt(from, outerR);
    const e1 = pt(to, outerR);
    const s2 = pt(to, innerR);
    const e2 = pt(from, innerR);
    return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 0 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 0 0 ${e2.x} ${e2.y} Z`;
  };

  const zones = [
    { from: 180, to: 144, color: "#ef4444" },
    { from: 144, to: 108, color: "#f97316" },
    { from: 108, to: 72, color: "#eab308" },
    { from: 72, to: 36, color: "#84cc16" },
    { from: 36, to: 0, color: "#22c55e" },
  ];

  // Zone the score sits in: lights up while the rest dim.
  const activeZone = Math.max(0, Math.min(4, Math.floor((display / 100) * zones.length)));

  // Needle angle: 180 (bear) → 0 (bull)
  const needleAngleDeg = 180 - (display / 100) * 180;
  const needleEnd = pt(needleAngleDeg, r - 6);
  const nb1 = pt(needleAngleDeg + 90, 4);
  const nb2 = pt(needleAngleDeg - 90, 4);

  const labelColor =
    display >= 80
      ? "#22c55e"
      : display >= 60
        ? "#84cc16"
        : display >= 40
          ? "#eab308"
          : display >= 20
            ? "#f97316"
            : "#ef4444";

  const label =
    display >= 80
      ? "Strong Bull"
      : display >= 60
        ? "Mild Bull"
        : display >= 40
          ? "Neutral"
          : display >= 20
            ? "Mild Bear"
            : "Strong Bear";

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 160 112"
        className={compact ? "w-16 select-none" : "w-40 select-none"}
        aria-label={`Sentiment: ${label}`}
      >
        <title>{`${label} ${Math.round(display)}`}</title>
        {zones.map((z, i) => (
          <path
            key={i}
            d={arcPath(z.from, z.to, 40, 58)}
            fill={z.color}
            opacity={i === activeZone ? 0.95 : 0.22}
          />
        ))}
        {[180, 144, 108, 72, 36, 0].map((deg) => {
          const a = pt(deg, 58);
          const b = pt(deg, 63);
          return (
            <line
              key={deg}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1"
              opacity={0.6}
            />
          );
        })}
        {[162, 126, 90, 54, 18].map((deg) => {
          const a = pt(deg, 58);
          const b = pt(deg, 60.5);
          return (
            <line
              key={deg}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1"
              opacity={0.35}
            />
          );
        })}
        <polygon
          points={`${needleEnd.x},${needleEnd.y} ${nb1.x},${nb1.y} ${nb2.x},${nb2.y}`}
          fill={labelColor}
          opacity={0.95}
        />
        {/* Pivot knob, layered above the needle: soft halo ring + cap + inset dot. */}
        <circle cx={cx} cy={cy} r={8.5} fill={labelColor} opacity={0.18} />
        <circle cx={cx} cy={cy} r={6} fill={labelColor} />
        <circle cx={cx} cy={cy} r={3.5} fill="hsl(var(--card))" />
        {/* Score sits below the pivot: the needle only ever sweeps the upper
            half (y <= cy), so the two can never overlap. */}
        {!compact && (
          <text x={cx} y={cy + 24} textAnchor="middle" fontSize="15" fontWeight="bold" fill={labelColor}>
            {Math.round(display)}
          </text>
        )}
      </svg>
      {!compact && (
        <span
          className="mt-0.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: `${labelColor}22`, color: labelColor }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

/** Header-slot mini dial: same gauge geometry, dial only (label lives beside it). */
export function MiniMood({ score }: { score: number }) {
  return <SentimentGauge score={score} compact />;
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
  loadError,
  onRetry,
}: {
  name: string;
  data: MarketIndex | undefined;
  chartPoints: PricePoint[];
  onClick: () => void;
  loadError?: boolean | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const change = data?.percentChange ?? 0;
  const pointChange = data?.change ?? 0;
  const close = data?.close ?? 0;
  const isUp = change >= 0;
  const color = isUp ? "#22c55e" : "#ef4444";

  const chartData = useMemo(() => {
    const pts = chartPoints
      .filter((p) => Number.isFinite(p.value) && p.value > 0)
      .map((p) => ({
        t: p.time > 1e12 ? Math.floor(p.time) : p.time * 1000,
        v: p.value,
      }))
      .sort((a, b) => a.t - b.t);
    return pts;
  }, [chartPoints]);

  // Tight Y domain so a ~2,600-point index with ±20 intraday movement
  // actually shows shape. Recharts defaults the Y domain to [0, auto],
  // which squashes index sparklines into a visually flat line even though
  // hover values are correct.
  const yDomain: [number, number] | undefined = useMemo(() => {
    if (chartData.length < 2) return undefined;
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      if (d.v < min) min = d.v;
      if (d.v > max) max = d.v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    if (max - min <= 0) {
      const pad = Math.abs(max) * 0.005 || 1;
      return [max - pad, max + pad];
    }
    const pad = (max - min) * 0.15;
    return [min - pad, max + pad];
  }, [chartData]);

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
                {formatPercent(change)}
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
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
                <YAxis
                  type="number"
                  domain={yDomain ?? ["dataMin", "dataMax"]}
                  hide
                  allowDataOverflow={false}
                />
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
          ) : loadError && onRetry ? (
            <div className="flex h-full items-center justify-center text-[0.6rem] text-muted-foreground/50">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onRetry();
                  }
                }}
                className="cursor-pointer rounded px-2 py-1 hover:text-foreground hover:underline"
              >
                Couldn&apos;t load — tap to retry
              </span>
            </div>
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
// Benchmarks section: majors + sub-indices with user-selectable cards
// ---------------------------------------------------------------------------

interface BenchmarkOption {
  key: string;
  label: string;
  kind: "major" | "sub";
  /** Key for the intraday graph endpoint. */
  graphKey: string;
  /** Key for the daily-bars fallback (YONEPSE archive understands sector names). */
  dailyKey: string;
  quote: MarketIndex | undefined;
  indexName?: string;
  sectorName?: string;
}

function toQuote(
  name: string,
  close: number | null | undefined,
  change: number | null | undefined,
  percentChange: number | null | undefined,
): MarketIndex | undefined {
  if (close == null) return undefined;
  const ch = change ?? 0;
  return {
    name,
    close,
    high: close,
    low: close,
    previousClose: close - ch,
    change: ch,
    percentChange: percentChange ?? 0,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    generatedTime: null,
  };
}

function BenchmarkCard({
  option,
  preloaded,
  onOpen,
}: {
  option: BenchmarkOption;
  preloaded?: PricePoint[] | undefined;
  onOpen: () => void;
}) {
  const intraday = useQuery(indexGraphQuery(option.graphKey));
  const intradayPoints = (intraday.data ?? []).length >= 2 ? (intraday.data ?? []) : (preloaded ?? []);
  const needFallback = !intraday.isLoading && intradayPoints.length < 2;
  const daily = useQuery(indexDailyQuery(option.dailyKey, 90, needFallback));

  const chartPoints: PricePoint[] = useMemo(() => {
    if (intradayPoints.length >= 2) return intradayPoints;
    const bars = daily.data ?? [];
    return bars
      .filter((b) => b.close > 0)
      .map((b) => {
        const ms = Date.parse(`${b.date}T00:00:00+05:45`);
        return {
          time: Number.isFinite(ms) ? Math.floor(ms / 1000) : 0,
          value: b.close,
        };
      })
      .filter((p) => p.time > 0);
  }, [intradayPoints, daily.data]);

  const showError = chartPoints.length < 2 && (intraday.isError || daily.isError);

  return (
    <IndexCard
      name={option.label}
      data={option.quote}
      chartPoints={chartPoints}
      onClick={onOpen}
      loadError={showError}
      onRetry={() => {
        void intraday.refetch();
        void daily.refetch();
      }}
    />
  );
}

function BenchmarksSection({
  indices,
  sectorIndices,
  indexGraphQueries,
  onOpen,
}: {
  indices: MarketIndex[];
  sectorIndices: SectorIndex[];
  indexGraphQueries?: Record<string, { data: PricePoint[] | undefined; isLoading: boolean }> | undefined;
  onOpen: (opt: BenchmarkOption) => void;
}) {
  const [filter, setFilter] = useState<"all" | "major" | "sub">("all");
  const [selected, setSelected] = useState<string[] | null>(null);

  const options = useMemo<BenchmarkOption[]>(() => {
    const majors: BenchmarkOption[] = indices.map((idx) => {
      const clean = idx.name.replace(/\s*Index$/i, "").trim() || idx.name;
      const upper = clean.toUpperCase();
      const graphKey =
        /nepse/i.test(clean) && !/sensitive|float/i.test(clean)
          ? "NEPSE"
          : /sensitive\s*float|sen\s*float/i.test(clean)
            ? "SENFLOAT"
            : /sensitive/i.test(clean)
              ? "SENSITIVE"
              : /float/i.test(clean)
                ? "FLOAT"
                : clean;
      void upper;
      return {
        key: `major:${clean.toUpperCase()}`,
        label: clean,
        kind: "major" as const,
        graphKey,
        dailyKey: clean,
        quote: idx,
        indexName: graphKey,
      };
    });

    const subs: BenchmarkOption[] = sectorIndices
      .filter((si) => (si.close ?? 0) > 0 || si.code || si.name)
      .map((si) => {
        const label = (si.sector ?? si.name).replace(/\s*Index$/i, "").trim() || si.name;
        return {
          key: `sub:${(si.code || si.name).toUpperCase()}`,
          label,
          kind: "sub" as const,
          graphKey: si.code || si.name,
          dailyKey: si.sector ?? si.name,
          quote: toQuote(si.name, si.close, si.change, si.percentChange),
          sectorName: label,
        };
      })
      .sort((a, b) => sectorSortKey(a.label) - sectorSortKey(b.label));

    // De-dupe majors vs subs sharing a label (e.g. "Sensitive").
    const seen = new Set(majors.map((m) => m.label.toLowerCase()));
    return [...majors, ...subs.filter((s) => !seen.has(s.label.toLowerCase()))];
  }, [indices, sectorIndices]);

  const visible = useMemo(
    () => options.filter((o) => (filter === "all" ? true : o.kind === filter)),
    [options, filter],
  );

  const activeKeys = useMemo(() => {
    if (selected) return selected.filter((k) => options.some((o) => o.key === k));
    const preferred = ["major:NEPSE", "major:SENSITIVE", "major:FLOAT"];
    const avail = preferred.filter((k) => options.some((o) => o.key === k));
    if (avail.length > 0) return avail.slice(0, 3);
    return options.slice(0, 3).map((o) => o.key);
  }, [selected, options]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const base = prev ?? activeKeys;
      if (base.includes(key)) {
        if (base.length <= 1) return base;
        return base.filter((k) => k !== key);
      }
      if (base.length >= 6) return [...base.slice(1), key];
      return [...base, key];
    });
  };

  const active = activeKeys
    .map((k) => options.find((o) => o.key === k))
    .filter((o): o is BenchmarkOption => Boolean(o));

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <TrendingUp className="size-3.5 text-primary" />
          <span>Benchmarks</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            {active.length}/{options.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-lg border border-border/60 bg-surface p-0.5 text-[11px] font-medium">
            {(
              [
                { v: "all", l: "All" },
                { v: "major", l: "Majors" },
                { v: "sub", l: "Sub-indices" },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setFilter(t.v)}
                className={cn(
                  "rounded-md px-2 py-0.5 transition-colors cursor-pointer",
                  filter === t.v
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.l}
              </button>
            ))}
          </div>
          <span className="hidden text-[11px] text-muted-foreground/70 sm:inline">
            Click a card for the full chart
          </span>
        </div>
      </div>

      {/* Picker chips */}
      <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-1">
        {visible.map((o) => {
          const isOn = activeKeys.includes(o.key);
          const pct = o.quote?.percentChange ?? 0;
          const up = pct >= 0;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => toggle(o.key)}
              title={`${o.label} · ${formatPercent(pct)} — click to ${isOn ? "remove" : "add"}`}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                isOn
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", up ? "bg-emerald-500" : "bg-red-500")} />
              {o.label}
              <span className={cn("num", up ? "text-emerald-400" : "text-red-400")}>
                {formatPercent(pct)}
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No benchmarks in this group yet.</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((o) => (
          <BenchmarkCard
            key={o.key}
            option={o}
            preloaded={indexGraphQueries?.[o.graphKey]?.data ?? indexGraphQueries?.[o.graphKey.toUpperCase()]?.data}
            onOpen={() => onOpen(o)}
          />
        ))}
      </div>
      {active.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No benchmarks selected — pick from the chips above.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked mover lists shared by the sector detail page.
// ---------------------------------------------------------------------------

export function MoverRows({
  title,
  rows,
  emptyLabel,
  tone,
  onPick,
  stat,
}: {
  title: string;
  rows: LivePrice[];
  emptyLabel: string;
  tone: "gain" | "flat" | "loss";
  onPick: (symbol: string) => void;
  stat?: ReactNode | undefined;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-surface/60 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            tone === "gain"
              ? "text-emerald-400"
              : tone === "loss"
                ? "text-red-400"
                : "text-muted-foreground",
          )}
        >
          {title}
        </p>
        {stat && (
          <span className="num text-[11px] font-semibold text-muted-foreground" title="Combined turnover">
            {stat}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="max-h-60 space-y-1 overflow-y-auto pr-0.5">
          {rows.map((p, i) => (
            <li key={p.symbol}>
              <button
                type="button"
                onClick={() => onPick(p.symbol)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface cursor-pointer"
              >
                <span className="num w-7 shrink-0 rounded bg-muted px-1 py-0.5 text-center text-[10px] font-bold text-muted-foreground">
                  {ordinal(i + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {p.symbol}
                  </span>
                  <span className="num block truncate text-[10px] text-muted-foreground">
                    {formatNpr(p.ltp)} · <CompactNpr value={p.turnover} />
                  </span>
                </span>
                <span
                  className={cn(
                    "num shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                    tone === "gain"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : tone === "loss"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {formatPercent(p.percentChange)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component: Market Overview & Market Depth
// ---------------------------------------------------------------------------

export type MarketDepthViewMode = "matrix" | "grid" | "treemap";

type DepthSortKey =
  | "sector"
  | "points"
  | "turnover"
  | "share"
  | "breadth"
  | "performer"
  | "traded";

export function MarketOverview({
  prices,
  indices,
  sectorIndices,
  indexGraphQueries,
}: {
  prices: LivePrice[];
  indices: MarketIndex[];
  sectorIndices: SectorIndex[];
  indexGraphQueries?: Record<string, { data: PricePoint[] | undefined; isLoading: boolean }> | undefined;
}) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<MarketDepthViewMode>("matrix");
  const [pickedScrip, setPickedScrip] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [treemapMetric, setTreemapMetric] = useState<"turnover" | "volume">("turnover");
  const [chartModal, setChartModal] = useState<{
    open: boolean;
    title: string;
    indexName?: string;
    sectorName?: string;
  }>({ open: false, title: "" });

  const nepseIndex = indices.find(
    (i) => /nepse/i.test(i.name) && !/sensitive|float/i.test(i.name),
  );

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
    // Constituent groups and the sub-index feed name things differently
    // ("Commercial Banks" vs "Banking SubIndex") — resolve via the alias map.
    const aliased = subindexKeyFor(sectorName);
    return (
      sectorIndexMap.get(lower) ??
      sectorIndexMap.get(aliased) ??
      [...sectorIndexMap.values()].find(
        (si) =>
          normalizeSectorKey(si.name) === aliased ||
          normalizeSectorKey(si.code) === aliased ||
          (si.sector != null && normalizeSectorKey(si.sector) === aliased),
      ) ??
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

  // Scrips matching the search term, shown directly so a scrip search
  // always surfaces visible results (not just its sector row).
  const matchingScrips = useMemo(() => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return [];
    return [...prices]
      .filter(
        (p) =>
          p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
      )
      .sort((a, b) => b.turnover - a.turnover)
      .slice(0, 12);
  }, [prices, searchQuery]);

  const { sort: depthSort, toggle: toggleDepthSort } = useSort<DepthSortKey>(
    { key: "sector", dir: "default" },
    {
      sector: "text",
      points: "number",
      turnover: "number",
      share: "number",
      breadth: "number",
      performer: "number",
      traded: "number",
    },
  );

  const sortedSectors = useMemo(() => {
    const getter = (s: (typeof filteredSectors)[number]): number | string => {
      switch (depthSort.key) {
        case "sector":
          return s.sector;
        case "points":
          return s.sectorPoints ?? Number.NEGATIVE_INFINITY;
        case "turnover":
          return s.totalTurnover;
        case "share":
          return s.marketSharePct;
        case "breadth":
          return s.advancers - s.decliners;
        case "performer":
          return s.topGainer?.percentChange ?? Number.NEGATIVE_INFINITY;
        case "traded":
          return s.topTraded?.turnover ?? Number.NEGATIVE_INFINITY;
      }
    };
    return sortBy(filteredSectors, getter, depthSort.dir);
  }, [filteredSectors, depthSort]);

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
          void navigate({ to: "/sectors/$sectorName", params: { sectorName: sec } })
        }
        onSelectScrip={(sym) => setPickedScrip(sym)}
      />

      {/* 2. Benchmarks (majors + sub-indices, user-selectable) */}
      <BenchmarksSection
        indices={indices}
        sectorIndices={sectorIndices}
        indexGraphQueries={indexGraphQueries}
        onOpen={(o) =>
          setChartModal({
            open: true,
            title: `${o.label} Index`,
            ...(o.kind === "sub" || o.sectorName
              ? { sectorName: o.sectorName ?? o.label }
              : { indexName: o.indexName ?? o.graphKey }),
          })
        }
      />

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
              <CompactNpr value={totalMarketTurnover} className="font-bold text-foreground" />
            </span>
            <span className="text-muted-foreground">
              Volume:{" "}
              <CompactQty value={totalMarketVolume} className="font-bold text-foreground" />
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
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
                - {breadth.unchanged} Unchanged
              </span>
              <span className="font-semibold text-red-400">
                ▼ {breadth.decliners} Declining (
                {breadth.total > 0 ? Math.round((breadth.decliners / breadth.total) * 100) : 0}%)
              </span>
            </div>
          </div>

          {/* Whole-NEPSE sentiment gauge */}
          <div className="flex shrink-0 items-center justify-center border-t border-border/50 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
            <SentimentGauge score={sentimentScore} />
          </div>
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

        {/* Scrip search results — visible matches, click opens the scrip */}
        {searchQuery.trim() && (
          <div className="rounded-2xl border border-border/70 bg-card/60 p-3.5 shadow-xs">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {matchingScrips.length > 0
                ? `Scrips matching “${searchQuery.trim()}” (${matchingScrips.length})`
                : `No scrips match “${searchQuery.trim()}”`}
            </p>
            {matchingScrips.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {matchingScrips.map((p) => {
                  const up = p.percentChange >= 0;
                  return (
                    <button
                      key={p.symbol}
                      type="button"
                      onClick={() => setPickedScrip(p.symbol)}
                      className="rounded-lg border border-border/50 bg-surface p-2 text-left transition-colors hover:border-primary/40 cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between gap-1">
                        <p className="truncate text-xs font-bold text-foreground">{p.symbol}</p>
                        <span className={cn("num shrink-0 text-[11px] font-semibold", up ? "text-gain" : "text-loss")}>
                          {formatPercent(p.percentChange)}
                        </span>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{p.name}</p>
                      <p className="num mt-0.5 text-[11px] text-muted-foreground">
                        {formatNpr(p.ltp)} · {p.sector ?? "Others"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View Mode 1: Market Depth Matrix (Institutional Table) */}
        {viewMode === "matrix" && (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-surface/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <SortableTh label="Sector" active={depthSort.key === "sector"} dir={depthSort.dir} onClick={() => toggleDepthSort("sector")} kind="text" className="py-2.5 pl-4 pr-2 font-semibold" />
                    <SortableTh label="Index Points" active={depthSort.key === "points"} dir={depthSort.dir} onClick={() => toggleDepthSort("points")} align="right" className="py-2.5 px-3 font-semibold" />
                    <SortableTh label="Turnover" active={depthSort.key === "turnover"} dir={depthSort.dir} onClick={() => toggleDepthSort("turnover")} align="right" className="py-2.5 px-3 font-semibold" />
                    <SortableTh label="Mkt Share" active={depthSort.key === "share"} dir={depthSort.dir} onClick={() => toggleDepthSort("share")} align="right" className="py-2.5 px-3 font-semibold" />
                    <SortableTh label="Breadth" active={depthSort.key === "breadth"} dir={depthSort.dir} onClick={() => toggleDepthSort("breadth")} className="py-2.5 px-3 text-center min-w-[120px] font-semibold" />
                    <SortableTh label="Top Performer" active={depthSort.key === "performer"} dir={depthSort.dir} onClick={() => toggleDepthSort("performer")} className="py-2.5 px-3 font-semibold" />
                    <SortableTh label="Heaviest Scrip" active={depthSort.key === "traded"} dir={depthSort.dir} onClick={() => toggleDepthSort("traded")} className="py-2.5 px-3 font-semibold" />
                    <th className="py-2.5 pr-4 pl-2 text-right">Chart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {sortedSectors.map((s) => {
                    const isUp = (s.sectorPercentChange ?? s.avgChange) >= 0;
                    const openSector = () =>
                      void navigate({
                        to: "/sectors/$sectorName",
                        params: { sectorName: s.sector },
                      });

                    return (
                      <tr
                        key={s.sector}
                        onClick={openSector}
                        title={`Open ${s.sector} sector page`}
                        className="group hover:bg-surface/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 pl-4 pr-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSector();
                            }}
                            className="flex items-center gap-2 font-semibold text-foreground hover:text-primary transition-colors cursor-pointer text-left"
                          >
                            <SectorBadge sector={s.sector} />
                            <span>{s.sector}</span>
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-normal">
                              {s.items.length}
                            </span>
                          </button>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className="num font-bold text-foreground"
                              title={
                                s.sectorPoints == null
                                  ? "NEPSE publishes no official sub-index for this group — % is the average of its stocks"
                                  : undefined
                              }
                            >
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
                              {s.sectorPercentChange != null && s.sectorPointChange != null
                                ? `${s.sectorPointChange >= 0 ? "+" : ""}${formatNumber(s.sectorPointChange)} (${formatPercent(s.sectorPercentChange)})`
                                : formatPercent(s.sectorPercentChange ?? s.avgChange)}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <CompactNpr value={s.totalTurnover} className="num font-semibold text-foreground" />
                            <span className="num text-[10px] text-muted-foreground">
                              <CompactQty value={s.totalVolume} /> shares
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
                              <span>{s.unchanged}-</span>{" "}
                              <span className="text-red-400 font-semibold">{s.decliners}↓</span>
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-left">
                          {s.topGainer ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickedScrip(s.topGainer!.symbol);
                              }}
                              className="text-left group/top hover:underline cursor-pointer"
                            >
                              <span className="font-bold text-foreground group-hover/top:text-primary">
                                {s.topGainer.symbol}
                              </span>{" "}
                              <span className="num text-gain font-semibold text-[11px]">
                                {formatPercent(s.topGainer.percentChange)}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setPickedScrip(s.topTraded!.symbol);
                              }}
                              className="text-left group/trade hover:underline cursor-pointer"
                            >
                              <span className="font-bold text-foreground group-hover/trade:text-primary">
                                {s.topTraded.symbol}
                              </span>{" "}
                              <CompactNpr value={s.topTraded.turnover} className="num text-[10px] text-muted-foreground" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>

                        <td className="py-3 pr-4 pl-2 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChartModal({
                                open: true,
                                title: `${s.sector} Index`,
                                sectorName: s.sector,
                              });
                            }}
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
                  {/* Sector header — opens the dedicated sector detail page */}
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/sectors/$sectorName",
                        params: { sectorName: s.sector },
                      })
                    }
                    title={`Open ${s.sector} sector page`}
                    className="mb-2.5 flex w-full items-center justify-between gap-2 border-b border-border/40 pb-2 text-left group cursor-pointer hover:border-primary/40 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <SectorBadge sector={s.sector} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                            {s.sector}
                          </p>
                          <ArrowUpRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {s.items.length} stocks · <CompactNpr value={s.totalTurnover} /> vol
                      </p>
                      </div>
                    </div>

                    <div className="ml-2 text-right">
                      <p
                        className={cn(
                          "num text-xs font-bold",
                          isUp ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {s.sectorPercentChange != null
                          ? formatPercent(s.sectorPercentChange)
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
