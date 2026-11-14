import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  Check,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  GitMerge,
  Hash,
  Info,
  Layers,
  Phone,
  Repeat,
  Search,
  Star,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/states";
import { BackButton } from "@/components/back-button";
import { BrokerLeaderboard as BrokerLeaderboardView } from "@/components/tools/broker-leaderboard";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { brokerDirectoryQuery, floorSheetDatesQuery, floorSheetRangeQuery, floorSheetTrailQuery } from "@/lib/queries";
import { formatNpr, formatNumber, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { BrokerRow, BrokerDayStat, FloorSheetTrade } from "@/lib/nepse/types";

export const Route = createFileRoute("/_dash/brokers")({
  head: () => ({
    meta: [
      { title: "Brokers & Floor Sheet | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Every NEPSE member broker with branch coverage, plus the daily floor sheet: broker leaderboard, stock leaderboard, hourly activity and per-transaction trade trails.",
      },
      { property: "og:title", content: "Brokers & Floor Sheet | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "NEPSE broker directory and daily floor sheet analytics. Who traded what, with whom, and when.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      ogImage(),
    ],
    links: [canonicalLink("/brokers")],
  }),
  component: BrokersPage,
});

function BrokersPage() {
  const [tab, setTab] = useState("floor");
  const [trail, setTrail] = useState<{
    brokerCode: string | null;
    symbol: string | null;
    contract: string | null;
  }>({ brokerCode: null, symbol: null, contract: null });

  const viewTrail = (brokerCode: string) => {
    setTrail({ brokerCode, symbol: null, contract: null });
    setTab("floor");
  };

  return (
    <div className="space-y-6">
      <BackButton fallback="/tools" />
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Brokers & Floor Sheet</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          All <span className="font-medium text-foreground">NEPSE member brokers</span>, and the day's floor sheet every
          transaction each broker executed, aggregated from the community YONEPSE feed. Indicative data only.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="floor">Floor Sheet</TabsTrigger>
          <TabsTrigger value="directory">Broker Directory</TabsTrigger>
        </TabsList>
        <TabsContent value="floor" className="mt-4">
          <FloorSheetTab trail={trail} setTrail={setTrail} />
        </TabsContent>
        <TabsContent value="directory" className="mt-4">
          <BrokerDirectoryTab onViewTrail={viewTrail} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-3 sm:p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-base font-semibold leading-tight sm:mt-1.5 sm:text-xl">{value}</p>
      {hint ? <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------ Floor sheet tab ----------------------------- */

type FlowRow = BrokerDayStat & { netBuy: number; spike: number | null };

function SpikePill({ value }: { value: number }) {
  return (
    <span
      title={`${value.toFixed(1)}× its 30-session average turnover`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-600 dark:text-amber-400"
    >
      <Zap className="size-2.5" aria-hidden />
      {value.toFixed(1)}×
    </span>
  );
}

function FlowSide({
  title,
  subtitle,
  icon,
  tone,
  rows,
  onPick,
}: {
  title: string;
  subtitle: string;
  icon: typeof TrendingUp;
  tone: "up" | "down";
  rows: (FlowRow & { rank: number })[];
  onPick: (code: string) => void;
}) {
  const Icon = icon;
  const accent = tone === "up" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("size-4", accent)} aria-hidden />
        {title}
      </h3>
      <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nobody on this side today.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {rows.map((row) => {
            const total = row.buyAmount + row.sellAmount;
            const buyPct = total > 0 ? (row.buyAmount / total) * 100 : 50;
            const up = row.netBuy >= 0;
            return (
              <li key={row.code}>
                <button
                  type="button"
                  onClick={() => onPick(row.code)}
                  title={`Follow every trade by broker ${row.code} today`}
                  className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent/60"
                >
                  <span className="num w-4 shrink-0 text-center text-[11px] font-bold text-muted-foreground">
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="num text-[0.8125rem] font-bold shrink-0">{row.code}</span>
                      <span className="truncate text-xs text-muted-foreground" title={row.name}>
                        {row.name}
                      </span>
                      {row.spike !== null && row.spike >= 2 ? <SpikePill value={row.spike} /> : null}
                    </span>
                    <span className="mt-1 flex h-1 overflow-hidden rounded-full bg-muted">
                      <span className="bg-emerald-500/80" style={{ width: `${buyPct}%` }} />
                      <span className="flex-1 bg-rose-500/80" />
                    </span>
                  </span>
                  <span
                    className={cn("num shrink-0 text-[0.8125rem] font-bold", up ? "text-emerald-600" : "text-rose-600")}
                  >
                    {up ? "+" : "-"}
                    {formatNpr(Math.abs(row.netBuy), { compact: true })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface FloorTrailFilter {
  brokerCode: string | null;
  symbol: string | null;
  contract: string | null;
}

function FloorSheetTab({
  trail,
  setTrail,
}: {
  trail: FloorTrailFilter;
  setTrail: (updater: FloorTrailFilter | ((f: FloorTrailFilter) => FloorTrailFilter)) => void;
}) {
  const datesQuery = useQuery(floorSheetDatesQuery());
  const [date, setDate] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [contractInput, setContractInput] = useState("");

  const dates = datesQuery.data?.dates ?? [];
  const latest = datesQuery.data?.latestDate ?? null;
  const toDate = dateTo && dateTo >= (date ?? "") ? dateTo : date;

  useEffect(() => {
    if (!date && latest) {
      setDate(latest);
      setDateTo(latest);
    }
  }, [date, latest]);

  // Debounced contract-number search so each keystroke doesn't rescan the range.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = contractInput.trim();
      setTrail((f) => ((f.contract ?? "") === v ? f : { ...f, contract: v || null }));
    }, 400);
    return () => clearTimeout(t);
  }, [contractInput, setTrail]);

  const dayQuery = useQuery(floorSheetRangeQuery(date, toDate));

  const trailQuery = useQuery(
    floorSheetTrailQuery(date, {
      brokerCode: trail.brokerCode,
      symbol: trail.symbol,
      contractId: trail.contract,
      dateTo: toDate !== date ? toDate : null,
    }),
  );

  const [flowTab, setFlowTab] = useState<"accumulators" | "distributors">("accumulators");
  const [mobileBoard, setMobileBoard] = useState<"brokers" | "stocks">("brokers");
  const trailRef = useRef<HTMLDivElement | null>(null);
  const [sheetBrokerCode, setSheetBrokerCode] = useState<string | null>(null);

  // Smooth scroll to trade trail on mobile when a party or stock is picked
  useEffect(() => {
    if (trail.brokerCode || trail.symbol || trail.contract) {
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setTimeout(() => {
          trailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, [trail.brokerCode, trail.symbol, trail.contract]);

  const setRange = (from: string | null, to: string | null) => {
    if (from) setDate(from);
    setDateTo(to ?? from);
  };

  const presetRange = (days: number) => {
    if (dates.length === 0) return;
    const end = dates[dates.length - 1]!;
    const start = dates[Math.max(0, dates.length - days)]!;
    setRange(start, end);
  };

  // Directory 30-session turnover powers the unusual-activity ("spike") signal.
  const directory = useQuery(brokerDirectoryQuery());
  const avgByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of directory.data ?? []) {
      if (b.thirtyDaysTurnover > 0) map.set(String(b.code), b.thirtyDaysTurnover / 30);
    }
    return map;
  }, [directory.data]);

  // Money flow: who accumulated (net bought) vs distributed (net sold).
  // Spike compares per-session average against the 30-session daily average.
  const flow = useMemo(() => {
    const board = dayQuery.data?.brokerLeaderboard ?? [];
    const sessions = Math.max(1, dayQuery.data?.sessions ?? 1);
    const withNet = board.map((b) => {
      const avg = avgByCode.get(b.code) ?? 0;
      return {
        ...b,
        netBuy: b.buyAmount - b.sellAmount,
        spike: avg > 0 ? b.totalAmount / sessions / avg : null,
      };
    });
    return {
      accumulators: withNet
        .filter((b) => b.netBuy > 0)
        .sort((a, b) => b.netBuy - a.netBuy)
        .slice(0, 5),
      distributors: withNet
        .filter((b) => b.netBuy < 0)
        .sort((a, b) => a.netBuy - b.netBuy)
        .slice(0, 5),
    };
  }, [dayQuery.data, avgByCode]);

  if (datesQuery.isLoading) return <LoadingBlock />;
  if (datesQuery.isError) return <ErrorBlock error={datesQuery.error} />;
  if (!date) {
    if (dates.length === 0) {
      return <EmptyBlock title="No floor sheet yet" description="No trading days published." />;
    }
    // Dates are in; the effect above is about to select the latest one.
    return <LoadingBlock />;
  }
  if (dayQuery.isLoading) return <LoadingBlock />;
  if (dayQuery.isError) return <ErrorBlock error={dayQuery.error} />;
  const day = dayQuery.data;
  if (!day)
    return <EmptyBlock title="No data for this range" description="The feed has no floor sheet for these dates yet." />;
  const sessions = Math.max(1, day.sessions);

  const selectedBroker = trail.brokerCode ? day.brokerLeaderboard.find((b) => b.code === trail.brokerCode) : null;

  const multiDay = Boolean(toDate && toDate !== date);
  const hasActiveFilter = Boolean(trail.brokerCode || trail.symbol || trail.contract);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:w-auto sm:flex sm:items-center sm:gap-2">
          <Select value={date ?? ""} onValueChange={(v) => setRange(v, v)}>
            <SelectTrigger className="w-full sm:w-[145px]" aria-label="From date">
              <SelectValue placeholder="From" />
            </SelectTrigger>
            <SelectContent>
              {(datesQuery.data?.dates ?? []).map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-center text-xs text-muted-foreground">to</span>
          <Select value={toDate ?? ""} onValueChange={(v) => setDateTo(v)}>
            <SelectTrigger className="w-full sm:w-[145px]" aria-label="To date">
              <SelectValue placeholder="To" />
            </SelectTrigger>
            <SelectContent>
              {(datesQuery.data?.dates ?? [])
                .filter((d) => !date || d >= date)
                .map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/60 p-0.5">
          {[
            { label: "Day", days: 1 },
            { label: "7D", days: 7 },
            { label: "1M", days: 31 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => presetRange(p.days)}
              className="rounded-md px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
        {day.stale ? (
          <Badge variant="outline" className="text-amber-600">
            cached / feed delayed
          </Badge>
        ) : null}
        {sessions > 1 ? (
          <span className="num hidden text-xs text-muted-foreground sm:inline">{sessions} sessions combined</span>
        ) : null}
      </div>

      {hasActiveFilter ? (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setContractInput("");
              setTrail({ brokerCode: null, symbol: null, contract: null });
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" />
            Back to Leaderboards & All Brokers
          </Button>

          <TradeTrail
            title={
              trail.contract
                ? `Trade trail - Contract ${trail.contract}`
                : trail.brokerCode
                  ? `Trade trail - Broker ${trail.brokerCode}${selectedBroker ? ` · ${selectedBroker.name}` : ""}`
                  : `Trade trail - ${trail.symbol}`
            }
            subtitle={[
              trail.symbol ? `Stock ${trail.symbol}` : null,
              trail.brokerCode ? `Broker ${trail.brokerCode}` : null,
              multiDay && date && toDate ? `${date} → ${toDate}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            query={trailQuery}
            filter={trail}
            multiDay={multiDay}
            contractInput={contractInput}
            setContractInput={setContractInput}
            onClose={() => {
              setContractInput("");
              setTrail({ brokerCode: null, symbol: null, contract: null });
            }}
            onClearPart={(part) => {
              if (part === "contract") setContractInput("");
              setTrail((f) => {
                const next = { ...f };
                next[part] = null;
                return next;
              });
            }}
            onPickParty={(code) => setTrail((f) => ({ ...f, brokerCode: code }))}
            onViewBroker={setSheetBrokerCode}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Turnover" value={formatNpr(day.totalAmount, { compact: true })} />
            <StatCard label="Trades" value={formatNumber(day.totalTrades)} />
            <StatCard label="Traded shares" value={formatQty(day.totalVolume)} />
            <StatCard
              label="Stocks / brokers"
              value={`${day.scripsTraded} / ${day.brokersActive}`}
              hint={
                day.biggestTrade
                  ? `Biggest trade: ${day.biggestTrade.symbol} ${formatNpr(day.biggestTrade.amount, { compact: true })}`
                  : undefined
              }
            />
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Money flow</h2>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Who accumulated and who distributed in this range. Tap a broker to follow its trades.
              </p>
            </div>

            {/* Mobile segmented toggle */}
            <div className="md:hidden">
              <div className="flex rounded-xl border border-border/60 bg-muted/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setFlowTab("accumulators")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
                    flowTab === "accumulators"
                      ? "bg-surface font-bold text-emerald-600 shadow-sm dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  <TrendingUp className="size-3.5" />
                  Accumulating ({flow.accumulators.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFlowTab("distributors")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
                    flowTab === "distributors"
                      ? "bg-surface font-bold text-rose-600 shadow-sm dark:text-rose-400"
                      : "text-muted-foreground",
                  )}
                >
                  <TrendingDown className="size-3.5" />
                  Distributing ({flow.distributors.length})
                </button>
              </div>

              <div className="mt-2.5">
                {flowTab === "accumulators" ? (
                  <FlowSide
                    title="Accumulating"
                    subtitle="Net buyers: bought more than sold"
                    icon={TrendingUp}
                    tone="up"
                    rows={flow.accumulators.map((r, i) => ({ ...r, rank: i + 1 }))}
                    onPick={(code) => {
                      setContractInput("");
                      setTrail((f) => ({ ...f, brokerCode: code, contract: null }));
                    }}
                  />
                ) : (
                  <FlowSide
                    title="Distributing"
                    subtitle="Net sellers: sold more than bought"
                    icon={TrendingDown}
                    tone="down"
                    rows={flow.distributors.map((r, i) => ({ ...r, rank: i + 1 }))}
                    onPick={(code) => {
                      setContractInput("");
                      setTrail((f) => ({ ...f, brokerCode: code, contract: null }));
                    }}
                  />
                )}
              </div>
            </div>

            {/* Desktop side-by-side */}
            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <FlowSide
                title="Accumulating"
                subtitle="Net buyers: bought more than sold"
                icon={TrendingUp}
                tone="up"
                rows={flow.accumulators.map((r, i) => ({ ...r, rank: i + 1 }))}
                onPick={(code) => {
                  setContractInput("");
                  setTrail((f) => ({ ...f, brokerCode: code, contract: null }));
                }}
              />
              <FlowSide
                title="Distributing"
                subtitle="Net sellers: sold more than bought"
                icon={TrendingDown}
                tone="down"
                rows={flow.distributors.map((r, i) => ({ ...r, rank: i + 1 }))}
                onPick={(code) => {
                  setContractInput("");
                  setTrail((f) => ({ ...f, brokerCode: code, contract: null }));
                }}
              />
            </div>
          </section>

          {/* Intraday hourly volume timeline */}
          {day.hourly.length > 0 ? (
            <HourlyTimeline points={day.hourly} trades={day.biggestTrades} onViewBroker={setSheetBrokerCode} />
          ) : null}

          {/* Today's biggest block trades (Whale flow) */}
          {day.biggestTrades && day.biggestTrades.length > 0 ? (
            <BlockTradesShowcase
              trades={day.biggestTrades}
              onPickStock={(sym) => {
                setContractInput("");
                setTrail((f) => ({ ...f, symbol: sym, contract: null }));
              }}
              onViewBroker={setSheetBrokerCode}
            />
          ) : null}

          {/* Mobile/Tablet leaderboard switcher */}
          <div className="xl:hidden">
            <div className="flex rounded-xl border border-border/60 bg-muted/50 p-0.5">
              <button
                type="button"
                onClick={() => setMobileBoard("brokers")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
                  mobileBoard === "brokers"
                    ? "bg-surface font-bold text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Brokers ({day.brokerLeaderboard.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileBoard("stocks")}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all",
                  mobileBoard === "stocks" ? "bg-surface font-bold text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                Stocks ({day.symbolLeaderboard.length})
              </button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section
              className={cn(
                "rounded-2xl border border-border/60 bg-surface min-w-0 overflow-clip",
                mobileBoard !== "brokers" && "hidden xl:block",
              )}
            >
              <header className="border-b border-border/60 px-4 py-3">
                <h2 className="text-sm font-semibold">Broker leaderboard</h2>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Tap a broker to follow every trade it made that day.
                </p>
              </header>
              <BrokerLeaderboard
                rows={day.brokerLeaderboard}
                selectedCode={trail.brokerCode}
                onSelect={(code) =>
                  setTrail((f) => (f.brokerCode === code ? { ...f, brokerCode: null } : { ...f, brokerCode: code }))
                }
              />
            </section>

            <section
              className={cn(
                "rounded-2xl border border-border/60 bg-surface min-w-0 overflow-clip",
                mobileBoard !== "stocks" && "hidden xl:block",
              )}
            >
              <header className="border-b border-border/60 px-4 py-3">
                <h2 className="text-sm font-semibold">Stock leaderboard</h2>
              </header>
              <SymbolLeaderboard
                rows={day.symbolLeaderboard}
                selectedSymbol={trail.symbol}
                onSelect={(symbol) =>
                  setTrail((f) => (f.symbol === symbol ? { ...f, symbol: null } : { ...f, symbol }))
                }
              />
            </section>
          </div>

          {/* floorsheet log log: every trade in the range, newest first */}
          <FloorSheetLog
            date={date}
            toDate={toDate}
            onViewBroker={setSheetBrokerCode}
            onPickSymbol={(symbol) => {
              setContractInput("");
              setTrail({ brokerCode: null, symbol, contract: null });
            }}
            onPickBroker={(code) => {
              setContractInput("");
              setTrail({ brokerCode: code, symbol: null, contract: null });
            }}
            onPickContract={(contract) => {
              setContractInput(contract);
              setTrail((f) => ({ ...f, contract }));
            }}
          />
        </>
      )}

      {/* Broker detail side sheet */}
      <BrokerDetailSheet
        brokerCode={sheetBrokerCode}
        date={date}
        symbol={trail.symbol}
        directory={directory.data ?? []}
        dayStat={sheetBrokerCode ? (day.brokerLeaderboard.find((b) => b.code === sheetBrokerCode) ?? null) : null}
        onClose={() => setSheetBrokerCode(null)}
        onPickSymbol={(symbol) => {
          setSheetBrokerCode(null);
          setContractInput("");
          setTrail({ brokerCode: null, symbol, contract: null });
        }}
        onFollowTrail={(code) => {
          setSheetBrokerCode(null);
          setContractInput("");
          setTrail((f) => ({ ...f, brokerCode: code, contract: null }));
        }}
      />
    </div>
  );
}

/* --------------------------- floorsheet log -------------------------- */

type LogSortKey = "time" | "contractId" | "symbol" | "buyer" | "seller" | "quantity" | "rate" | "amount";

/** The floorsheet log shows this many rows first, then expands on demand. */
const LOG_LIMIT = 50;
/** Row step for each "show more" click once the whole range is loaded. */
const LOG_STEP = 200;
/** Server-side cap when the log is asked to load the whole range. */
const LOG_MAX = 60_000;

/**
 * The unfiltered floor sheet for the selected range: newest trades first,
 * every column sortable, rows selectable so one trade can be inspected and
 * turned into a stock, broker or contract filter.
 */
function FloorSheetLog({
  date,
  toDate,
  onViewBroker,
  onPickSymbol,
  onPickBroker,
  onPickContract,
}: {
  date: string;
  toDate: string | null;
  onViewBroker: (code: string) => void;
  onPickSymbol: (symbol: string) => void;
  onPickBroker: (code: string) => void;
  onPickContract: (contractId: string) => void;
}) {
  const multiDay = Boolean(toDate && toDate !== date);
  const [loadAll, setLoadAll] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LOG_LIMIT);
  const q = useQuery(
    floorSheetTrailQuery(
      date,
      { brokerCode: null, symbol: null, contractId: null, dateTo: multiDay ? toDate : null },
      true,
      { limit: loadAll ? LOG_MAX : LOG_LIMIT, order: loadAll ? "newest" : "oldest" },
    ),
  );
  const { sort, toggle, reset } = useSort<LogSortKey>(
    { key: "time", dir: "asc" },
    {
      time: "number",
      contractId: "text",
      symbol: "text",
      buyer: "text",
      seller: "text",
      quantity: "number",
      rate: "number",
      amount: "number",
    },
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const loadEverything = () => {
    setLoadAll(true);
    setVisibleCount(LOG_LIMIT + LOG_STEP);
  };

  // Sorting only makes sense over the whole range, so pull it in first.
  const onSort = (key: LogSortKey) => {
    if (!loadAll && q.data?.truncated) loadEverything();
    // Time is a strict two-way toggle: arrow up means oldest first (10:00 at
    // the top), arrow down means newest first, never an unsorted third state.
    if (key === "time") {
      reset({ key: "time", dir: sort.key === "time" && sort.dir === "asc" ? "desc" : "asc" });
      return;
    }
    toggle(key);
  };

  const rows = useMemo(() => {
    if (!q.data) return [];
    const getter = (t: FloorSheetTrade): string | number => {
      switch (sort.key) {
        case "buyer":
          return t.buyer?.code ?? "";
        case "seller":
          return t.seller?.code ?? "";
        case "time":
          return `${t.date ?? ""} ${t.time ?? ""}`;
        default:
          return t[sort.key];
      }
    };
    return sortBy(q.data.trades, getter, sort.dir);
  }, [q.data, sort]);

  const rowKey = (t: FloorSheetTrade, idx: number) => `${t.date ?? ""}-${t.contractId}-${idx}`;
  const selected = rows.find((t, idx) => rowKey(t, idx) === selectedKey) ?? null;
  const visible = rows.slice(0, visibleCount);
  const chip =
    "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface px-2 py-0.5 text-[0.68rem] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary";

  return (
    <section className="rounded-2xl border border-border/60 bg-surface overflow-clip">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">floorsheet log</h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Every trade in this range, unfiltered. Sort any column, tap a row to inspect it.
          </p>
        </div>
        {q.data ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Trades <span className="num font-semibold text-foreground">{formatNumber(q.data.totalTrades)}</span>
            </span>
            <span>
              Turnover{" "}
              <span className="num font-semibold text-foreground">
                {formatNpr(q.data.totalAmount, { compact: true })}
              </span>
            </span>
            {q.data.stale ? <span className="text-amber-600">cached / feed delayed</span> : null}
          </div>
        ) : null}
      </header>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError ? (
        <ErrorBlock error={q.error} />
      ) : !q.data || q.data.trades.length === 0 ? (
        <EmptyBlock title="No trades" description="The floor sheet is empty for this range." />
      ) : (
        <>
          {selected ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-primary/20 bg-primary/5 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected</span>
              <button type="button" onClick={() => onPickSymbol(selected.symbol)} className={chip}>
                <TrendingUp className="size-3 text-primary" />
                {selected.symbol}
              </button>
              {selected.buyer ? (
                <button
                  type="button"
                  onClick={() => onPickBroker(selected.buyer!.code)}
                  className={cn(chip, "num text-gain")}
                  title={`Filter the trail by buyer ${selected.buyer.code}`}
                >
                  B{selected.buyer.code}
                </button>
              ) : null}
              {selected.seller ? (
                <button
                  type="button"
                  onClick={() => onPickBroker(selected.seller!.code)}
                  className={cn(chip, "num text-loss")}
                  title={`Filter the trail by seller ${selected.seller.code}`}
                >
                  S{selected.seller.code}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onPickContract(selected.contractId)}
                className={cn(chip, "num")}
                title={`Filter the trail by contract ${selected.contractId}`}
              >
                <Hash className="size-3" />
                {selected.contractId}
              </button>
              <span className="num text-xs text-muted-foreground">
                {formatQty(selected.quantity)} × {formatNpr(selected.rate)} ={" "}
                <span className="font-semibold text-foreground">{formatNpr(selected.amount)}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <Table className="min-w-[760px]">
            <TableHeader className="bg-surface">
              <TableRow>
                {multiDay ? (
                  <SortableTh
                    label="Date"
                    active={sort.key === "time"}
                    dir={sort.dir}
                    onClick={() => onSort("time")}
                    kind="text"
                  />
                ) : null}
                <SortableTh
                  label="Time"
                  active={sort.key === "time"}
                  dir={sort.dir}
                  onClick={() => onSort("time")}
                  kind="text"
                />
                <SortableTh
                  label="Contract"
                  active={sort.key === "contractId"}
                  dir={sort.dir}
                  onClick={() => onSort("contractId")}
                  kind="text"
                />
                <SortableTh
                  label="Stock"
                  active={sort.key === "symbol"}
                  dir={sort.dir}
                  onClick={() => onSort("symbol")}
                  kind="text"
                />
                <SortableTh
                  label="Buyer"
                  active={sort.key === "buyer"}
                  dir={sort.dir}
                  onClick={() => onSort("buyer")}
                  kind="text"
                />
                <SortableTh
                  label="Seller"
                  active={sort.key === "seller"}
                  dir={sort.dir}
                  onClick={() => onSort("seller")}
                  kind="text"
                />
                <SortableTh
                  label="Qty"
                  active={sort.key === "quantity"}
                  dir={sort.dir}
                  onClick={() => onSort("quantity")}
                  align="right"
                />
                <SortableTh
                  label="Rate"
                  active={sort.key === "rate"}
                  dir={sort.dir}
                  onClick={() => onSort("rate")}
                  align="right"
                />
                <SortableTh
                  label="Amount"
                  active={sort.key === "amount"}
                  dir={sort.dir}
                  onClick={() => onSort("amount")}
                  align="right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t, idx) => {
                const key = rowKey(t, idx);
                const isSelected = key === selectedKey;
                return (
                  <TableRow
                    key={key}
                    aria-selected={isSelected}
                    onClick={() => setSelectedKey(isSelected ? null : key)}
                    className={cn("cursor-pointer", isSelected && "bg-primary/10 hover:bg-primary/10")}
                  >
                    {multiDay ? (
                      <TableCell className="num py-1.5 text-xs whitespace-nowrap text-muted-foreground">
                        {t.date ?? "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="num py-1.5 text-xs whitespace-nowrap text-muted-foreground">
                      {t.time ?? "-"}
                    </TableCell>
                    <TableCell className="num py-1.5 font-mono text-[0.68rem] text-muted-foreground">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPickContract(t.contractId);
                        }}
                        className="rounded px-1 py-0.5 transition-colors hover:bg-primary/10 hover:text-primary"
                        title={`Filter the trail by contract ${t.contractId}`}
                      >
                        {t.contractId}
                      </button>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs font-semibold">{t.symbol}</TableCell>
                    <TableCell className="max-w-[150px] py-1.5 text-xs">
                      {t.buyer ? (
                        <span className="flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickBroker(t.buyer!.code);
                            }}
                            className="num shrink-0 font-semibold text-gain hover:underline"
                            title={`Filter the trail by buyer ${t.buyer.code}`}
                          >
                            {t.buyer.code}
                          </button>
                          <span className="truncate text-[11px] text-muted-foreground">{t.buyer.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewBroker(t.buyer!.code);
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                            title={`View broker ${t.buyer.code}`}
                          >
                            <Info className="size-3" />
                          </button>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[150px] py-1.5 text-xs">
                      {t.seller ? (
                        <span className="flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickBroker(t.seller!.code);
                            }}
                            className="num shrink-0 font-semibold text-loss hover:underline"
                            title={`Filter the trail by seller ${t.seller.code}`}
                          >
                            {t.seller.code}
                          </button>
                          <span className="truncate text-[11px] text-muted-foreground">{t.seller.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewBroker(t.seller!.code);
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                            title={`View broker ${t.seller.code}`}
                          >
                            <Info className="size-3" />
                          </button>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                      {formatQty(t.quantity)}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                      {formatNpr(t.rate)}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right text-xs font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center justify-end gap-1">
                        {t.amount >= 300_000 || t.quantity >= 1_000 ? (
                          <span title="Whale / Block execution (> Rs 3L or > 1,000 qty)" className="text-amber-500">
                            🔥
                          </span>
                        ) : null}
                        {formatNpr(t.amount, { compact: true })}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-2">
            <p className="text-[11px] text-muted-foreground">
              {q.isFetching && loadAll
                ? "Loading all trades in this range…"
                : q.data.truncated
                  ? loadAll
                    ? `Showing ${formatNumber(q.data.trades.length)} of ${formatNumber(q.data.totalTrades)} trades. Narrow the date range for the earlier ones.`
                    : `Showing the first ${formatNumber(q.data.trades.length)} of ${formatNumber(q.data.totalTrades)} trades, from 10:00 onward.`
                  : `All ${formatNumber(q.data.trades.length)} trades in this range.`}
            </p>
            <div className="flex items-center gap-1">
              {loadAll && !q.isFetching && rows.length > visibleCount ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount((v) => v + LOG_STEP)}
                  className="h-7 text-[11px] font-semibold"
                >
                  Show {formatNumber(Math.min(LOG_STEP, rows.length - visibleCount))} more
                </Button>
              ) : null}
              {!loadAll && q.data.truncated ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={loadEverything}
                  disabled={q.isFetching}
                  className="h-7 text-[11px] font-semibold"
                >
                  {q.isFetching ? "Loading trades…" : `Show all ${formatNumber(q.data.totalTrades)}`}
                </Button>
              ) : null}
              {loadAll && !q.isFetching && visibleCount > LOG_LIMIT ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(LOG_LIMIT)}
                  className="h-7 text-[11px] font-semibold text-muted-foreground"
                >
                  Show top {LOG_LIMIT} only
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type BrokerSortKey = "code" | "trades" | "buyAmount" | "sellAmount" | "totalAmount" | "netAmount";

/** Leaderboards show this many rows first, then expand on demand. */
const LEADERBOARD_LIMIT = 10;

type TrailSortKey = "contractId" | "symbol" | "buyer" | "seller" | "quantity" | "rate" | "amount" | "time";

function BrokerLeaderboard({
  rows,
  selectedCode,
  onSelect,
}: {
  rows: BrokerDayStat[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const { sort, toggle } = useSort<BrokerSortKey>(
    { key: "totalAmount", dir: "desc" },
    {
      code: "text",
      trades: "number",
      buyAmount: "number",
      sellAmount: "number",
      totalAmount: "number",
      netAmount: "number",
    },
  );
  const sorted = useMemo(() => sortBy(rows, (r) => r[sort.key], sort.dir), [rows, sort]);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, LEADERBOARD_LIMIT);
  return (
    <div className="overflow-x-auto xl:overflow-x-clip">
      <Table className="min-w-[560px]">
        <TableHeader className="bg-surface">
          <TableRow>
            <SortableTh
              label="Broker"
              active={sort.key === "code"}
              dir={sort.dir}
              onClick={() => toggle("code")}
              kind="text"
            />
            <SortableTh
              label="Trades"
              active={sort.key === "trades"}
              dir={sort.dir}
              onClick={() => toggle("trades")}
              align="right"
            />
            <SortableTh
              label="Bought"
              active={sort.key === "buyAmount"}
              dir={sort.dir}
              onClick={() => toggle("buyAmount")}
              align="right"
            />
            <SortableTh
              label="Sold"
              active={sort.key === "sellAmount"}
              dir={sort.dir}
              onClick={() => toggle("sellAmount")}
              align="right"
            />
            <SortableTh
              label="Total"
              active={sort.key === "totalAmount"}
              dir={sort.dir}
              onClick={() => toggle("totalAmount")}
              align="right"
            />
            <SortableTh
              label="Net"
              active={sort.key === "netAmount"}
              dir={sort.dir}
              onClick={() => toggle("netAmount")}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow
              key={row.code}
              onClick={() => onSelect(row.code)}
              className={cn("cursor-pointer", selectedCode === row.code && "bg-primary/10 hover:bg-primary/10")}
            >
              <TableCell className="min-w-[140px] max-w-[200px] py-1.5">
                <p className="truncate text-xs font-semibold sm:text-[0.8125rem]" title={`${row.code} · ${row.name}`}>
                  <span className="num font-bold">{row.code}</span>{" "}
                  <span className="font-medium text-muted-foreground">·</span>{" "}
                  <span className="font-normal text-foreground/90">{row.name}</span>
                </p>
                <p className="truncate text-[0.65rem] text-muted-foreground">
                  Top:{" "}
                  {row.topSymbols
                    .map((s) => s.symbol)
                    .slice(0, 5)
                    .join(", ") || "-"}
                </p>
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatNumber(row.trades)}
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatNpr(row.buyAmount, { compact: true })}
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatNpr(row.sellAmount, { compact: true })}
              </TableCell>
              <TableCell className="num py-1.5 text-right font-semibold text-xs sm:text-sm whitespace-nowrap">
                {formatNpr(row.totalAmount, { compact: true })}
              </TableCell>
              <TableCell
                className={cn(
                  "num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap",
                  row.netAmount >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                <span className="inline-flex items-center justify-end gap-0.5">
                  {row.netAmount >= 0 ? (
                    <TrendingUp className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <TrendingDown className="size-3 shrink-0" aria-hidden />
                  )}
                  {formatNpr(Math.abs(row.netAmount), { compact: true })}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sorted.length > LEADERBOARD_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          {showAll ? `Show top ${LEADERBOARD_LIMIT} only` : `Show ${sorted.length - LEADERBOARD_LIMIT} more`}
        </button>
      ) : null}
    </div>
  );
}

type SymbolSortKey = "symbol" | "trades" | "volume" | "amount" | "avgPrice";

function SymbolLeaderboard({
  rows,
  selectedSymbol,
  onSelect,
}: {
  rows: {
    symbol: string;
    name: string;
    trades: number;
    volume: number;
    amount: number;
    avgPrice: number;
    brokers: number;
  }[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const { sort, toggle } = useSort<SymbolSortKey>(
    { key: "amount", dir: "desc" },
    {
      symbol: "text",
      trades: "number",
      volume: "number",
      amount: "number",
      avgPrice: "number",
    },
  );
  const sorted = useMemo(() => sortBy(rows, (r) => r[sort.key], sort.dir), [rows, sort]);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, LEADERBOARD_LIMIT);
  return (
    <div className="overflow-x-auto xl:overflow-x-clip">
      <Table className="min-w-[500px]">
        <TableHeader className="bg-surface">
          <TableRow>
            <SortableTh
              label="Stock"
              active={sort.key === "symbol"}
              dir={sort.dir}
              onClick={() => toggle("symbol")}
              kind="text"
            />
            <SortableTh
              label="Trades"
              active={sort.key === "trades"}
              dir={sort.dir}
              onClick={() => toggle("trades")}
              align="right"
            />
            <SortableTh
              label="Volume"
              active={sort.key === "volume"}
              dir={sort.dir}
              onClick={() => toggle("volume")}
              align="right"
            />
            <SortableTh
              label="Avg price"
              active={sort.key === "avgPrice"}
              dir={sort.dir}
              onClick={() => toggle("avgPrice")}
              align="right"
            />
            <SortableTh
              label="Turnover"
              active={sort.key === "amount"}
              dir={sort.dir}
              onClick={() => toggle("amount")}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow
              key={row.symbol}
              onClick={() => onSelect(row.symbol)}
              className={cn("cursor-pointer", selectedSymbol === row.symbol && "bg-primary/10 hover:bg-primary/10")}
            >
              <TableCell className="min-w-[120px] max-w-[200px] py-1.5">
                <p className="truncate text-xs font-semibold sm:text-[0.8125rem]">{row.symbol}</p>
                <p className="truncate text-[0.65rem] text-muted-foreground" title={row.name}>
                  {row.name || "-"} · {row.brokers} brokers
                </p>
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatNumber(row.trades)}
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatQty(row.volume)}
              </TableCell>
              <TableCell className="num py-1.5 text-right text-xs sm:text-sm whitespace-nowrap">
                {formatNpr(row.avgPrice)}
              </TableCell>
              <TableCell className="num py-1.5 text-right font-semibold text-xs sm:text-sm whitespace-nowrap">
                {formatNpr(row.amount, { compact: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sorted.length > LEADERBOARD_LIMIT ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          {showAll ? `Show top ${LEADERBOARD_LIMIT} only` : `Show ${sorted.length - LEADERBOARD_LIMIT} more`}
        </button>
      ) : null}
    </div>
  );
}

function PartyBoard({
  title,
  tone,
  parties,
  total,
  onPick,
}: {
  title: string;
  tone: "up" | "down";
  parties: { code: string; name: string; amount: number; trades: number }[];
  total: number;
  onPick: (code: string) => void;
}) {
  if (parties.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {parties.slice(0, 5).map((p, i) => (
          <li key={p.code}>
            <button
              type="button"
              onClick={() => onPick(p.code)}
              title={`Follow broker ${p.code} in this stock`}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
            >
              <span className="num w-4 shrink-0 text-[11px] font-bold text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="num text-xs font-bold">{p.code}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{p.name}</span>
                </span>
                <span className="mt-0.5 flex h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={tone === "up" ? "bg-emerald-500/80" : "bg-rose-500/80"}
                    style={{ width: `${total > 0 ? Math.min(100, (p.amount / total) * 100) : 0}%` }}
                  />
                </span>
              </span>
              <span className="num shrink-0 text-xs font-semibold">{formatNpr(p.amount, { compact: true })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TradeTrail({
  title,
  subtitle,
  query,
  filter,
  multiDay,
  contractInput,
  setContractInput,
  onClose,
  onClearPart,
  onPickParty,
  onViewBroker,
}: {
  title: string;
  subtitle: string;
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: import("@/lib/nepse/types").FloorSheetTrail | null | undefined;
  };
  filter: FloorTrailFilter;
  multiDay: boolean;
  contractInput: string;
  setContractInput: (v: string) => void;
  onClose: () => void;
  onClearPart: (part: "brokerCode" | "symbol" | "contract") => void;
  onPickParty: (code: string) => void;
  onViewBroker?: ((code: string) => void) | undefined;
}) {
  const data = query.data ?? null;

  const { sort, toggle } = useSort<TrailSortKey>(
    { key: "time", dir: "desc" },
    {
      contractId: "text",
      symbol: "text",
      buyer: "text",
      seller: "text",
      quantity: "number",
      rate: "number",
      amount: "number",
      time: "number",
    },
  );
  const sorted = useMemo(() => {
    if (!data) return [];
    const getter = (t: (typeof data.trades)[number]): string | number => {
      switch (sort.key) {
        case "buyer":
          return t.buyer?.code ?? "";
        case "seller":
          return t.seller?.code ?? "";
        case "time":
          return `${t.date ?? ""} ${t.time ?? ""}`;
        default:
          return t[sort.key];
      }
    };
    return sortBy(data.trades, getter, sort.dir);
  }, [data, sort]);

  const [trailFilter, setTrailFilter] = useState<"all" | "whale" | "self" | "multifill">("all");

  const whaleTradesCount = useMemo(
    () => data?.trades.filter((t) => t.amount >= 300_000 || t.quantity >= 1_000).length ?? 0,
    [data?.trades],
  );

  const selfTradesCount = useMemo(
    () => data?.trades.filter((t) => t.buyer && t.seller && t.buyer.code === t.seller.code).length ?? 0,
    [data?.trades],
  );

  // Contract ID frequency map — contracts appearing >1 time are partial fills
  const contractStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of data?.trades ?? []) {
      counts.set(t.contractId, (counts.get(t.contractId) ?? 0) + 1);
    }
    return counts;
  }, [data?.trades]);

  const multiFillCount = useMemo(() => [...contractStats.values()].filter((v) => v > 1).length, [contractStats]);

  // Active contract spotlight (clicked from table)
  const [activeContractId, setActiveContractId] = useState<string | null>(null);

  const contractSpotlight = useMemo(() => {
    if (!activeContractId || !data) return null;
    const rows = data.trades.filter((t) => t.contractId === activeContractId);
    if (rows.length === 0) return null;
    const totalQty = rows.reduce((s, t) => s + t.quantity, 0);
    const totalAmt = rows.reduce((s, t) => s + t.amount, 0);
    const avgRate = totalQty > 0 ? totalAmt / totalQty : 0;
    return { contractId: activeContractId, fills: rows.length, totalQty, totalAmt, avgRate };
  }, [activeContractId, data]);

  const displayTrades = useMemo(() => {
    let base = sorted;
    if (trailFilter === "whale") {
      base = sorted.filter((t) => t.amount >= 300_000 || t.quantity >= 1_000);
    } else if (trailFilter === "self") {
      base = sorted.filter((t) => t.buyer && t.seller && t.buyer.code === t.seller.code);
    } else if (trailFilter === "multifill") {
      base = sorted.filter((t) => (contractStats.get(t.contractId) ?? 1) > 1);
    }
    // If a contract spotlight is active, highlight those rows at the top
    if (activeContractId) {
      const matches = base.filter((t) => t.contractId === activeContractId);
      const rest = base.filter((t) => t.contractId !== activeContractId);
      return [...matches, ...rest];
    }
    return base;
  }, [sorted, trailFilter, contractStats, activeContractId]);

  const chip =
    "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary hover:bg-primary/25";
  return (
    <section className="rounded-2xl border border-border/60 bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate" title={title}>
            {title}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {filter.brokerCode ? (
              <button type="button" onClick={() => onClearPart("brokerCode")} className={chip}>
                Broker {filter.brokerCode} ×
              </button>
            ) : null}
            {filter.symbol ? (
              <button type="button" onClick={() => onClearPart("symbol")} className={chip}>
                {filter.symbol} ×
              </button>
            ) : null}
            {filter.contract ? (
              <button type="button" onClick={() => onClearPart("contract")} className={chip}>
                #{filter.contract} ×
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={contractInput}
              onChange={(e) => setContractInput(e.target.value)}
              placeholder="Contract #"
              inputMode="numeric"
              aria-label="Search by contract number"
              className="num h-8 w-32 sm:w-36 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
        </div>
      </header>
      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} />
      ) : !data || data.trades.length === 0 ? (
        <EmptyBlock title="No trades" description="Nothing matched this filter in this range." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span>
              Matching trades:{" "}
              <span className="num font-semibold text-foreground">{formatNumber(data.totalTrades)}</span>
            </span>
            <span>
              Amount:{" "}
              <span className="num font-semibold text-foreground">
                {formatNpr(data.totalAmount, { compact: true })}
              </span>
            </span>
            {data.truncated ? (
              <span className="text-amber-600">
                Showing the newest {data.trades.length} of {formatNumber(data.totalTrades)}.
              </span>
            ) : null}
          </div>
          {data.topBuyers.length > 0 || data.topSellers.length > 0 ? (
            <div className="grid gap-2 border-b border-border/60 px-4 py-3 sm:grid-cols-2">
              <PartyBoard
                title="Top buyers"
                tone="up"
                parties={data.topBuyers}
                total={data.topBuyers[0]?.amount ?? 1}
                onPick={onPickParty}
              />
              <PartyBoard
                title="Top sellers"
                tone="down"
                parties={data.topSellers}
                total={data.topSellers[0]?.amount ?? 1}
                onPick={onPickParty}
              />
            </div>
          ) : null}

          {/* Recurring buyer↔seller pairs insight */}
          <RecurringPairs trades={data.trades} onPickParty={onPickParty} onViewBroker={onViewBroker} />

          {/* Quick filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/20 px-4 py-2">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">Filter view:</span>
            <button
              type="button"
              onClick={() => {
                setTrailFilter("all");
                setActiveContractId(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                trailFilter === "all" && !activeContractId
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border/60 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              All ({data.trades.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTrailFilter("whale");
                setActiveContractId(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors inline-flex items-center gap-1",
                trailFilter === "whale"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "border border-border/60 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              <Flame className="size-3" />
              Whale / Block ({whaleTradesCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTrailFilter("self");
                setActiveContractId(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors inline-flex items-center gap-1",
                trailFilter === "self"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border/60 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              <Repeat className="size-3" />
              In-House Self-Trades ({selfTradesCount})
            </button>
            {multiFillCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTrailFilter("multifill");
                  setActiveContractId(null);
                }}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors inline-flex items-center gap-1",
                  trailFilter === "multifill"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/60 bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                <GitMerge className="size-3" />
                Partial Fills ({multiFillCount})
              </button>
            ) : null}
            {activeContractId ? (
              <button
                type="button"
                onClick={() => setActiveContractId(null)}
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors inline-flex items-center gap-1 bg-primary text-primary-foreground shadow-sm"
              >
                <Hash className="size-3" />#{activeContractId.slice(-6)} ×
              </button>
            ) : null}
          </div>

          {/* Contract spotlight strip */}
          {contractSpotlight ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-primary/30 bg-primary/5 px-4 py-2 text-xs">
              <span className="font-semibold text-primary inline-flex items-center gap-1">
                <Hash className="size-3" />
                Contract #{contractSpotlight.contractId.slice(-8)}
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{contractSpotlight.fills}</span> fill
                {contractSpotlight.fills > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">
                Vol <span className="num font-semibold text-foreground">{formatQty(contractSpotlight.totalQty)}</span>{" "}
                units
              </span>
              <span className="text-muted-foreground">
                Turnover{" "}
                <span className="num font-semibold text-foreground">
                  {formatNpr(contractSpotlight.totalAmt, { compact: true })}
                </span>
              </span>
              <span className="text-muted-foreground">
                Avg rate{" "}
                <span className="num font-semibold text-foreground">{formatNpr(contractSpotlight.avgRate)}</span>
              </span>
            </div>
          ) : null}

          {/* Unified Compact Table for both Mobile and Desktop */}
          <div className="overflow-x-auto xl:overflow-x-clip">
            <Table className="min-w-[620px]">
              <TableHeader className="bg-surface">
                <TableRow>
                  {multiDay ? (
                    <SortableTh
                      label="Date"
                      active={sort.key === "time"}
                      dir={sort.dir}
                      onClick={() => toggle("time")}
                    />
                  ) : null}
                  <SortableTh
                    label="Contract"
                    active={sort.key === "contractId"}
                    dir={sort.dir}
                    onClick={() => toggle("contractId")}
                    kind="text"
                  />
                  <SortableTh
                    label="Stock"
                    active={sort.key === "symbol"}
                    dir={sort.dir}
                    onClick={() => toggle("symbol")}
                    kind="text"
                  />
                  <SortableTh
                    label="Buyer"
                    active={sort.key === "buyer"}
                    dir={sort.dir}
                    onClick={() => toggle("buyer")}
                    kind="text"
                  />
                  <SortableTh
                    label="Seller"
                    active={sort.key === "seller"}
                    dir={sort.dir}
                    onClick={() => toggle("seller")}
                    kind="text"
                  />
                  <SortableTh
                    label="Qty"
                    active={sort.key === "quantity"}
                    dir={sort.dir}
                    onClick={() => toggle("quantity")}
                    align="right"
                  />
                  <SortableTh
                    label="Rate"
                    active={sort.key === "rate"}
                    dir={sort.dir}
                    onClick={() => toggle("rate")}
                    align="right"
                  />
                  <SortableTh
                    label="Amount"
                    active={sort.key === "amount"}
                    dir={sort.dir}
                    onClick={() => toggle("amount")}
                    align="right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayTrades.map((t) => (
                  <TableRow
                    key={`${t.date ?? ""}-${t.contractId}`}
                    className={cn(
                      activeContractId === t.contractId
                        ? "bg-primary/10 hover:bg-primary/10"
                        : activeContractId
                          ? "opacity-40"
                          : "",
                    )}
                  >
                    {multiDay ? (
                      <TableCell className="num whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                        {t.date ?? "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="num py-1.5 text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => setActiveContractId((prev) => (prev === t.contractId ? null : t.contractId))}
                        className={cn(
                          "rounded px-1 py-0.5 font-mono text-[0.68rem] transition-colors hover:bg-primary/10 hover:text-primary",
                          activeContractId === t.contractId ? "bg-primary/10 text-primary ring-1 ring-primary/40" : "",
                        )}
                        title={`Click to spotlight contract ${t.contractId}`}
                      >
                        {t.contractId.slice(-8)}
                        {(contractStats.get(t.contractId) ?? 1) > 1 ? (
                          <span className="ml-1 rounded-sm bg-amber-500/15 px-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                            {contractStats.get(t.contractId)}x
                          </span>
                        ) : null}
                      </button>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs sm:text-[0.8125rem] font-semibold">{t.symbol}</TableCell>
                    <TableCell className="max-w-[110px] sm:max-w-[170px] py-1.5 text-xs">
                      {t.buyer ? (
                        <span className="flex max-w-full items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onPickParty(t.buyer!.code)}
                            className="flex min-w-0 items-center gap-1 text-left hover:underline"
                            title={`Filter trades by broker ${t.buyer.code}`}
                          >
                            <span className="num font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                              {t.buyer.code}
                            </span>
                            <span className="text-muted-foreground truncate text-[11px]">{t.buyer.name}</span>
                          </button>
                          {t.buyer?.code === t.seller?.code ? (
                            <span
                              className="ml-0.5 rounded bg-amber-500/15 px-1 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400 shrink-0"
                              title="Internal self-cross (same broker on both sides)"
                            >
                              Self
                            </span>
                          ) : null}
                          {onViewBroker ? (
                            <button
                              type="button"
                              onClick={() => onViewBroker(t.buyer!.code)}
                              className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                              title={`View broker ${t.buyer.code} details`}
                            >
                              <Info className="size-3" />
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[110px] sm:max-w-[170px] py-1.5 text-xs">
                      {t.seller ? (
                        <span className="flex max-w-full items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onPickParty(t.seller!.code)}
                            className="flex min-w-0 items-center gap-1 text-left hover:underline"
                            title={`Filter trades by broker ${t.seller.code}`}
                          >
                            <span className="num font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                              {t.seller.code}
                            </span>
                            <span className="text-muted-foreground truncate text-[11px]">{t.seller.name}</span>
                          </button>
                          {onViewBroker ? (
                            <button
                              type="button"
                              onClick={() => onViewBroker(t.seller!.code)}
                              className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                              title={`View broker ${t.seller.code} details`}
                            >
                              <Info className="size-3" />
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                      {formatQty(t.quantity)}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                      {formatNpr(t.rate)}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right font-semibold text-xs sm:text-sm whitespace-nowrap">
                      <span className="inline-flex items-center justify-end gap-1">
                        {t.amount >= 300_000 || t.quantity >= 1_000 ? (
                          <span title="Whale / Block execution (> Rs 3L or > 1,000 qty)" className="text-amber-500">
                            🔥
                          </span>
                        ) : null}
                        {formatNpr(t.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------- Hourly session volume timeline --------------------- */

function HourlyTimeline({
  points,
  trades = [],
  onViewBroker,
}: {
  points: import("@/lib/nepse/types").HourPoint[];
  trades?: FloorSheetTrade[];
  onViewBroker?: (code: string) => void;
}) {
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chart" | "buyers">("chart");

  const totalAmount = useMemo(() => points.reduce((s, p) => s + p.amount, 0), [points]);
  const totalTrades = useMemo(() => points.reduce((s, p) => s + p.trades, 0), [points]);
  const maxAmount = useMemo(() => Math.max(1, ...points.map((p) => p.amount)), [points]);
  const maxTrades = useMemo(() => Math.max(1, ...points.map((p) => p.trades)), [points]);

  const peakAmountPoint = useMemo(
    () => (points.length === 0 ? null : ([...points].sort((a, b) => b.amount - a.amount)[0] ?? null)),
    [points],
  );
  const peakTradesPoint = useMemo(
    () => (points.length === 0 ? null : ([...points].sort((a, b) => b.trades - a.trades)[0] ?? null)),
    [points],
  );

  // Interval trades for the selected hour (from biggestTrades slice)
  const intervalTrades = useMemo(() => {
    if (!selectedHour || !trades.length) return [];
    const prefix = selectedHour.slice(0, 2);
    return trades.filter((t) => t.time && t.time.startsWith(prefix)).sort((a, b) => b.amount - a.amount);
  }, [selectedHour, trades]);

  // Buyer contract-ID repeat analysis across all trades
  const buyerContractStats = useMemo(() => {
    if (!trades.length) return [];
    // Group by contractId — same contractId appearing multiple times = partial fills / same buyer order
    const map = new Map<
      string,
      {
        contractId: string;
        fills: number;
        totalQty: number;
        totalAmt: number;
        symbols: Set<string>;
        brokerCode: string | null;
        brokerName: string | null;
      }
    >();
    for (const t of trades) {
      const existing = map.get(t.contractId);
      if (existing) {
        existing.fills += 1;
        existing.totalQty += t.quantity;
        existing.totalAmt += t.amount;
        existing.symbols.add(t.symbol);
      } else {
        map.set(t.contractId, {
          contractId: t.contractId,
          fills: 1,
          totalQty: t.quantity,
          totalAmt: t.amount,
          symbols: new Set([t.symbol]),
          brokerCode: t.buyer?.code ?? null,
          brokerName: t.buyer?.name ?? null,
        });
      }
    }
    return [...map.values()]
      .filter((v) => v.fills > 1)
      .sort((a, b) => b.fills - a.fills || b.totalAmt - a.totalAmt)
      .slice(0, 20);
  }, [trades]);

  if (points.length === 0) return null;

  const selectedPoint = selectedHour ? (points.find((p) => p.hour === selectedHour) ?? null) : null;

  return (
    <section className="rounded-2xl border border-border/60 bg-surface overflow-clip">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center rounded-lg bg-primary/10 p-1.5">
            <Clock className="size-3.5 text-primary" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-semibold leading-tight">Intraday Session Volume</h2>
            <p className="text-[10px] text-muted-foreground hidden sm:block">
              {formatNpr(totalAmount, { compact: true })} across {formatNumber(totalTrades)} trades, click a bar to
              inspect
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {peakAmountPoint ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <Flame className="size-2.5" />
              {peakAmountPoint.hour} peak
            </span>
          ) : null}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab("chart")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-semibold transition-all",
                activeTab === "chart"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BarChart3 className="size-2.5" />
              Chart
            </button>
            {buyerContractStats.length > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab("buyers")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-semibold transition-all",
                  activeTab === "buyers"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <GitMerge className="size-2.5" />
                Repeat Buyers
                <span className="rounded-full bg-primary/15 px-1 text-[9px] font-bold text-primary">
                  {buyerContractStats.length}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {activeTab === "chart" ? (
        <div className="p-3 sm:p-4 space-y-3">
          {/* Bar chart */}
          <div className="rounded-xl border border-border/40 bg-background/60 p-3">
            <div className="flex gap-2 sm:gap-3">
              {/* Turnover scale, same height as the plot so the labels line up */}
              <div className="hidden h-36 w-12 shrink-0 flex-col justify-between text-right sm:flex sm:h-44">
                {[100, 75, 50, 25, 0].map((pct) => (
                  <span key={pct} className="num text-[9px] leading-none text-muted-foreground/60">
                    {formatNpr((maxAmount * pct) / 100, { compact: true })}
                  </span>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <div className="relative h-36 sm:h-44">
                  {/* Gridlines */}
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <div
                      key={pct}
                      className={cn(
                        "pointer-events-none absolute inset-x-0 border-t",
                        pct === 0 ? "border-border/60" : "border-dashed border-border/40",
                      )}
                      style={{ bottom: `${pct}%` }}
                    />
                  ))}

                  {/* Bars */}
                  <div className="absolute inset-0 flex items-end gap-1 sm:gap-2">
                    {points.map((p, idx) => {
                      const heightPct = Math.max(4, Math.round((p.amount / maxAmount) * 100));
                      const tradesPct = Math.max(4, Math.round((p.trades / maxTrades) * 100));
                      const sharePct = totalAmount > 0 ? ((p.amount / totalAmount) * 100).toFixed(1) : "0";
                      const isSelected = selectedHour === p.hour;
                      const isHovered = hoveredHour === p.hour;
                      const isPeak = peakAmountPoint?.hour === p.hour;
                      const tooltipAlign =
                        idx === 0 ? "left-0" : idx === points.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";

                      return (
                        <div
                          key={p.hour}
                          className="group relative flex h-full min-w-0 flex-1 items-end"
                          onMouseEnter={() => setHoveredHour(p.hour)}
                          onMouseLeave={() => setHoveredHour(null)}
                        >
                          {/* Trade density underlay */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-md bg-primary/10 transition-colors group-hover:bg-primary/15"
                            style={{ height: `${tradesPct}%` }}
                          />
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${p.hour}, ${formatNpr(p.amount)} turnover, ${formatNumber(p.trades)} trades`}
                            onClick={() => setSelectedHour(isSelected ? null : p.hour)}
                            onFocus={() => setHoveredHour(p.hour)}
                            onBlur={() => setHoveredHour(null)}
                            className="relative z-10 flex h-full w-full items-end outline-none"
                          >
                            <span
                              className={cn(
                                "relative w-full overflow-hidden rounded-t-md transition-all duration-300",
                                isSelected
                                  ? "bg-primary shadow-lg shadow-primary/25 ring-2 ring-primary/50 ring-offset-1 ring-offset-background"
                                  : isHovered
                                    ? "bg-primary/75"
                                    : isPeak
                                      ? "bg-gradient-to-t from-primary/80 to-amber-400/70"
                                      : "bg-primary/50 group-hover:bg-primary/70",
                              )}
                              style={{ height: `${heightPct}%` }}
                            >
                              <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-white/40" />
                            </span>
                          </button>

                          {/* Tooltip */}
                          {isHovered ? (
                            <div
                              className={cn(
                                "pointer-events-none absolute bottom-full z-40 mb-1 w-44 rounded-xl border border-border/80 bg-popover/95 p-2.5 text-popover-foreground shadow-2xl backdrop-blur",
                                tooltipAlign,
                              )}
                            >
                              <p className="mb-1.5 border-b border-border/40 pb-1 text-[11px] font-bold text-foreground">
                                {p.hour} window
                              </p>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-3">
                                  <span className="text-[10px] text-muted-foreground">Turnover</span>
                                  <span className="num text-[10px] font-semibold text-primary">
                                    {formatNpr(p.amount, { compact: true })}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <span className="text-[10px] text-muted-foreground">Trades</span>
                                  <span className="num text-[10px] font-semibold">{formatNumber(p.trades)}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <span className="text-[10px] text-muted-foreground">Avg/trade</span>
                                  <span className="num text-[10px] font-semibold">
                                    {formatNpr(p.trades > 0 ? p.amount / p.trades : 0, { compact: true })}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-3">
                                  <span className="text-[10px] text-muted-foreground">Session share</span>
                                  <span className="num text-[10px] font-semibold text-amber-600">{sharePct}%</span>
                                </div>
                              </div>
                              <p className="mt-1.5 text-center text-[9px] font-medium text-primary/70">
                                click to inspect
                              </p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hour labels */}
                <div className="mt-1.5 flex gap-1 sm:gap-2">
                  {points.map((p) => {
                    const isSelected = selectedHour === p.hour;
                    return (
                      <div key={p.hour} className="min-w-0 flex-1 text-center">
                        <p
                          className={cn(
                            "num truncate text-[10px] leading-none font-bold",
                            isSelected ? "text-primary" : "text-foreground/80",
                          )}
                        >
                          {p.hour}
                        </p>
                        <p className="num mt-0.5 truncate text-[9px] leading-none text-muted-foreground">{p.trades}t</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-primary/50" />
              Turnover
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-primary/15" />
              Trade density
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-sm bg-gradient-to-t from-primary/80 to-amber-400/70" />
              Peak hour
            </span>
          </div>

          {/* Interval Spotlight */}
          {selectedHour && selectedPoint ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 dark:bg-primary/10 overflow-clip animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
              {/* Spotlight header */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-primary/10 dark:bg-primary/15">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="num rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {selectedHour}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span>
                      <span className="text-muted-foreground">Turnover </span>
                      <span className="num font-semibold text-foreground">{formatNpr(selectedPoint.amount)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Trades </span>
                      <span className="num font-semibold text-foreground">{formatNumber(selectedPoint.trades)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Avg/trade </span>
                      <span className="num font-semibold text-foreground">
                        {formatNpr(selectedPoint.trades > 0 ? selectedPoint.amount / selectedPoint.trades : 0, {
                          compact: true,
                        })}
                      </span>
                    </span>
                    <span className="num rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {totalAmount > 0 ? ((selectedPoint.amount / totalAmount) * 100).toFixed(1) : 0}% of session
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHour(null)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close interval spotlight"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Interval executions, leaderboard table with a sticky header */}
              <div className="p-3">
                {intervalTrades.length > 0 ? (
                  <>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Top executions in {selectedHour}
                    </p>
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border/40 bg-background/70">
                      <Table className="min-w-[540px]">
                        <TableHeader className="top-0 bg-surface">
                          <TableRow>
                            <TableHead className="py-2">Stock</TableHead>
                            <TableHead className="py-2">Time</TableHead>
                            <TableHead className="py-2">Buyer</TableHead>
                            <TableHead className="py-2">Seller</TableHead>
                            <TableHead className="py-2 text-right">Qty</TableHead>
                            <TableHead className="py-2 text-right">Rate</TableHead>
                            <TableHead className="py-2 text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {intervalTrades.slice(0, 12).map((t) => (
                            <TableRow key={`${t.contractId}-${t.time}`}>
                              <TableCell className="py-1.5 text-xs font-semibold text-primary">{t.symbol}</TableCell>
                              <TableCell className="num py-1.5 text-xs whitespace-nowrap text-muted-foreground">
                                {t.time}
                              </TableCell>
                              <TableCell className="py-1.5">
                                {t.buyer ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewBroker?.(t.buyer!.code)}
                                    className="num text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                                  >
                                    {t.buyer.code}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5">
                                {t.seller ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewBroker?.(t.seller!.code)}
                                    className="num text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                                  >
                                    {t.seller.code}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                                {formatQty(t.quantity)}
                              </TableCell>
                              <TableCell className="num py-1.5 text-right text-xs whitespace-nowrap">
                                {formatNpr(t.rate)}
                              </TableCell>
                              <TableCell className="num py-1.5 text-right text-xs font-semibold whitespace-nowrap">
                                <span className="inline-flex items-center justify-end gap-1">
                                  {t.amount >= 300_000 || t.quantity >= 1_000 ? (
                                    <span title="Block trade" className="text-[11px] text-amber-500">
                                      🔥
                                    </span>
                                  ) : null}
                                  {formatNpr(t.amount, { compact: true })}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {intervalTrades.length > 12 ? (
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Showing the 12 largest of {intervalTrades.length} executions in this window.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    No top-trade detail available for this window (data sampled from daily biggest trades only).
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* Repeat Buyer Contract Analysis tab */
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <GitMerge className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">Partial Fill / Repeat Order Analysis</p>
              <p className="text-muted-foreground mt-0.5">
                Same contract ID matched across multiple rows = one large order split into multiple partial fills. High
                fill counts indicate algorithmic/chunked execution by the same buyer.
              </p>
            </div>
          </div>

          {buyerContractStats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No repeated contract IDs found in sampled trades.
            </p>
          ) : (
            <div className="space-y-2">
              {buyerContractStats.map((stat, idx) => {
                const symbolList = [...stat.symbols].join(", ");
                const avgRate = stat.totalQty > 0 ? stat.totalAmt / stat.totalQty : 0;
                return (
                  <div key={stat.contractId} className="rounded-xl border border-border/60 bg-background p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="num shrink-0 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold w-5 h-5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="num text-[10px] text-muted-foreground font-mono truncate">
                            #{stat.contractId.slice(-10)}
                          </p>
                          {stat.brokerCode ? (
                            <button
                              type="button"
                              onClick={() => stat.brokerCode && onViewBroker?.(stat.brokerCode)}
                              className="text-xs font-semibold text-foreground hover:text-primary hover:underline truncate max-w-[180px] block text-left"
                              title={stat.brokerName ?? stat.brokerCode}
                            >
                              {stat.brokerCode} · {stat.brokerName}
                            </button>
                          ) : (
                            <p className="text-xs text-muted-foreground">Unknown buyer</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          <GitMerge className="size-2.5" />
                          {stat.fills} fills
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="num text-xs font-semibold">{formatQty(stat.totalQty)}</p>
                        <p className="text-[9px] text-muted-foreground">shares</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="num text-xs font-semibold">{formatNpr(stat.totalAmt, { compact: true })}</p>
                        <p className="text-[9px] text-muted-foreground">total paid</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2 py-1.5">
                        <p className="num text-xs font-semibold">{formatNpr(avgRate)}</p>
                        <p className="text-[9px] text-muted-foreground">avg rate</p>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{symbolList}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* --------------------- Session largest block trades --------------------- */

function BlockTradesShowcase({
  trades,
  onPickStock,
  onViewBroker,
}: {
  trades: FloorSheetTrade[];
  onPickStock: (symbol: string) => void;
  onViewBroker: (code: string) => void;
}) {
  if (trades.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border/60 bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Flame className="size-3.5 text-amber-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Session Block Trades (Whale Flow)
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">Top single-contract executions today</span>
      </div>
      <div className="overflow-x-auto xl:overflow-x-clip">
        <Table className="min-w-[540px]">
          <TableHeader>
            <TableRow>
              <TableHead className="py-1 text-xs whitespace-nowrap">Stock</TableHead>
              <TableHead className="py-1 text-xs whitespace-nowrap">Buyer ➔ Seller</TableHead>
              <TableHead className="py-1 text-right text-xs whitespace-nowrap">Qty</TableHead>
              <TableHead className="py-1 text-right text-xs whitespace-nowrap">Rate</TableHead>
              <TableHead className="py-1 text-right text-xs whitespace-nowrap">Total Amount</TableHead>
              <TableHead className="py-1 text-right text-xs whitespace-nowrap">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.slice(0, 6).map((t) => (
              <TableRow key={`${t.contractId}-${t.time}`}>
                <TableCell className="py-1.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => onPickStock(t.symbol)}
                    className="hover:underline text-primary"
                    title={`View trade trail for ${t.symbol}`}
                  >
                    {t.symbol}
                  </button>
                </TableCell>
                <TableCell className="py-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => t.buyer && onViewBroker(t.buyer.code)}
                      className="num font-semibold text-emerald-600 hover:underline"
                      title={t.buyer?.name}
                    >
                      B {t.buyer?.code ?? "-"}
                    </button>
                    <ArrowRight className="size-2.5 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => t.seller && onViewBroker(t.seller.code)}
                      className="num font-semibold text-rose-600 hover:underline"
                      title={t.seller?.name}
                    >
                      S {t.seller?.code ?? "-"}
                    </button>
                    {t.buyer?.code === t.seller?.code ? (
                      <span className="ml-1 rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-bold text-amber-600">
                        Self
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="num py-1.5 text-right text-xs">{formatQty(t.quantity)}</TableCell>
                <TableCell className="num py-1.5 text-right text-xs">{formatNpr(t.rate)}</TableCell>
                <TableCell className="num py-1.5 text-right text-xs font-bold text-foreground">
                  {formatNpr(t.amount, { compact: true })}
                </TableCell>
                <TableCell className="num py-1.5 text-right text-[11px] text-muted-foreground">
                  {t.time ?? "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/* --------------------------- Broker directory tab --------------------------- */

function BrokerDirectoryTab({ onViewTrail }: { onViewTrail: (brokerCode: string) => void }) {
  const brokersQuery = useQuery(brokerDirectoryQuery());

  if (brokersQuery.isLoading) return <LoadingBlock />;
  if (brokersQuery.isError) return <ErrorBlock error={brokersQuery.error} />;

  return <BrokerLeaderboardView brokers={brokersQuery.data ?? []} onViewTrail={onViewTrail} />;
}

/* --------------------- Recurring buyer↔seller pair analysis --------------------- */

interface PairStat {
  buyerCode: string;
  buyerName: string;
  sellerCode: string;
  sellerName: string;
  trades: number;
  totalAmount: number;
  symbols: Set<string>;
}

function RecurringPairs({
  trades,
  onPickParty,
  onViewBroker,
}: {
  trades: FloorSheetTrade[];
  onPickParty: (code: string) => void;
  onViewBroker?: ((code: string) => void) | undefined;
}) {
  const pairs = useMemo(() => {
    const map = new Map<string, PairStat>();
    for (const t of trades) {
      if (!t.buyer || !t.seller) continue;
      // Canonical key: always smaller code first so A→B and B→A collapse
      const [a, b] = t.buyer.code < t.seller.code ? [t.buyer, t.seller] : [t.seller, t.buyer];
      const key = `${a.code}↔${b.code}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          buyerCode: a.code,
          buyerName: a.name,
          sellerCode: b.code,
          sellerName: b.name,
          trades: 0,
          totalAmount: 0,
          symbols: new Set(),
        };
        map.set(key, entry);
      }
      entry.trades += 1;
      entry.totalAmount += t.amount;
      entry.symbols.add(t.symbol);
    }
    return [...map.values()]
      .filter((p) => p.trades >= 3) // Only show pairs with 3+ transactions
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 8);
  }, [trades]);

  if (pairs.length === 0) return null;

  return (
    <div className="border-b border-border/60 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Repeat className="size-3.5 text-primary" />
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">Recurring pairs</p>
        <span className="text-[10px] text-muted-foreground/70">Same brokers trading together 3+ times</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {pairs.map((p) => (
          <div
            key={`${p.buyerCode}↔${p.sellerCode}`}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-background px-2.5 py-1.5"
          >
            <span className="flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {p.trades}×
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => onPickParty(p.buyerCode)}
                  className="num font-bold hover:underline shrink-0"
                  title={`Filter by broker ${p.buyerCode}`}
                >
                  {p.buyerCode}
                </button>
                {onViewBroker ? (
                  <button
                    type="button"
                    onClick={() => onViewBroker(p.buyerCode)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                    title={`View broker ${p.buyerCode}`}
                  >
                    <Info className="size-2.5" />
                  </button>
                ) : null}
                <ArrowLeftRight className="size-3 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => onPickParty(p.sellerCode)}
                  className="num font-bold hover:underline shrink-0"
                  title={`Filter by broker ${p.sellerCode}`}
                >
                  {p.sellerCode}
                </button>
                {onViewBroker ? (
                  <button
                    type="button"
                    onClick={() => onViewBroker(p.sellerCode)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                    title={`View broker ${p.sellerCode}`}
                  >
                    <Info className="size-2.5" />
                  </button>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                <span className="num">{formatNpr(p.totalAmount, { compact: true })}</span>
                <span>·</span>
                <span className="truncate">
                  {[...p.symbols].slice(0, 3).join(", ")}
                  {p.symbols.size > 3 ? ` +${p.symbols.size - 3}` : ""}
                </span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------- Broker detail side sheet --------------------- */

function BrokerDetailSheet({
  brokerCode,
  date,
  symbol,
  directory,
  dayStat,
  onClose,
  onFollowTrail,
  onPickSymbol,
}: {
  brokerCode: string | null;
  /** Selected floor-sheet day, used to pull this broker's big trades. */
  date?: string | null;
  /** When set, the big-trade list narrows to this stock. */
  symbol?: string | null;
  directory: BrokerRow[];
  dayStat: BrokerDayStat | null;
  onClose: () => void;
  onFollowTrail: (code: string) => void;
  onPickSymbol?: ((symbol: string) => void) | undefined;
}) {
  const broker = useMemo(
    () => (brokerCode ? (directory.find((b) => String(b.code) === brokerCode) ?? null) : null),
    [brokerCode, directory],
  );

  // Biggest floor-sheet executions where this broker was on either side.
  const whaleQuery = useQuery(
    floorSheetTrailQuery(
      date ?? null,
      { brokerCode, symbol: symbol ?? null, contractId: null, dateTo: null },
      Boolean(brokerCode && date),
    ),
  );
  const whaleTrades = useMemo(
    () =>
      (whaleQuery.data?.trades ?? [])
        .filter((t) => t.amount >= 300_000 || t.quantity >= 1_000)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6),
    [whaleQuery.data],
  );

  return (
    <Sheet open={brokerCode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle className="text-base">
            {broker ? (
              <span className="flex items-center gap-2">
                {broker.logoUrl ? (
                  <img
                    src={broker.logoUrl}
                    alt=""
                    className="size-8 rounded-lg object-contain ring-1 ring-border/60"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : (
                  <span className="num flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {broker.code}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{broker.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    #{broker.code} · {broker.membershipType}
                  </span>
                </span>
              </span>
            ) : (
              `Broker ${brokerCode ?? ""}`
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">Details for broker {brokerCode}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {!broker ? (
            <p className="text-sm text-muted-foreground">
              Broker <span className="num font-bold">{brokerCode}</span> not found in the directory. It may be inactive.
            </p>
          ) : (
            <>
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-2.5">
                <QuickStat
                  label="Today's turnover"
                  icon={TrendingUp}
                  value={broker.todayStats ? formatNpr(broker.todayStats.totalAmount, { compact: true }) : "-"}
                />
                <QuickStat
                  label="30d turnover"
                  icon={Clock}
                  value={formatNpr(broker.thirtyDaysTurnover, { compact: true })}
                />
                <QuickStat label="Branches" icon={Store} value={String(broker.branchCount)} />
                <QuickStat
                  label="Rating"
                  icon={Star}
                  value={
                    broker.rating && broker.rating.totalRatings > 0
                      ? `★ ${broker.rating.averageRating.toFixed(1)}`
                      : "-"
                  }
                />
              </div>

              {/* Day stat from floor sheet if available */}
              {dayStat
                ? (() => {
                    const netVol = dayStat.buyVolume - dayStat.sellVolume;
                    const totalVol = dayStat.buyVolume + dayStat.sellVolume;
                    const buyPct = totalVol > 0 ? Math.round((dayStat.buyVolume / totalVol) * 100) : 50;
                    const sellPct = 100 - buyPct;
                    const totalFlow = dayStat.buyAmount + dayStat.sellAmount;
                    return (
                      <section className="rounded-xl border border-border/60 bg-background p-3 space-y-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <Wallet className="size-3" />
                          Today&apos;s flow
                        </p>

                        {/* Net inventory pill */}
                        <div
                          className={cn(
                            "flex items-center justify-between rounded-lg px-3 py-2",
                            netVol >= 0 ? "bg-gain/10" : "bg-loss/10",
                          )}
                        >
                          <span className="text-xs text-muted-foreground">Net share inventory</span>
                          <span className={cn("num text-sm font-bold", netVol >= 0 ? "text-gain" : "text-loss")}>
                            {netVol >= 0 ? "+" : ""}
                            {formatQty(netVol)} units
                          </span>
                        </div>

                        {/* Buy / Sell dual columns */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-gain/10 p-2.5">
                            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-gain">
                              <TrendingUp className="size-3" aria-hidden />
                              Bought
                            </p>
                            <p className="num text-sm font-bold text-foreground">
                              {formatNpr(dayStat.buyAmount, { compact: true })}
                            </p>
                            <p className="num text-[10px] text-muted-foreground">
                              {formatQty(dayStat.buyVolume)} shares
                            </p>
                          </div>
                          <div className="rounded-lg bg-loss/10 p-2.5">
                            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-loss">
                              <TrendingDown className="size-3" aria-hidden />
                              Sold
                            </p>
                            <p className="num text-sm font-bold text-foreground">
                              {formatNpr(dayStat.sellAmount, { compact: true })}
                            </p>
                            <p className="num text-[10px] text-muted-foreground">
                              {formatQty(dayStat.sellVolume)} shares
                            </p>
                          </div>
                        </div>

                        {/* Buy/Sell volume ratio bar */}
                        <div>
                          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>
                              Buy share <span className="num font-semibold text-gain">{buyPct}%</span>
                            </span>
                            <span>
                              Sell share <span className="num font-semibold text-loss">{sellPct}%</span>
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted flex">
                            <div className="h-full bg-gain transition-all" style={{ width: `${buyPct}%` }} />
                            <div className="h-full bg-loss transition-all" style={{ width: `${sellPct}%` }} />
                          </div>
                        </div>

                        {/* Net cash flow */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Net cash flow</span>
                          <span className={cn("num font-semibold", dayStat.netAmount >= 0 ? "text-gain" : "text-loss")}>
                            {/* netAmount = sellAmount - buyAmount; positive = net seller (cash inflow) */}
                            {dayStat.netAmount >= 0 ? "+" : ""}
                            {formatNpr(dayStat.netAmount, { compact: true })}
                            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                              {dayStat.netAmount >= 0 ? "net inflow" : "net outflow"}
                            </span>
                          </span>
                        </div>

                        {/* Top scrips breakdown */}
                        {dayStat.topSymbols.length > 0 ? (
                          <div className="pt-1 border-t border-border/40">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Top scrips by flow</p>
                            <div className="space-y-1.5">
                              {dayStat.topSymbols.slice(0, 5).map((s) => {
                                const pct = totalFlow > 0 ? Math.round((s.amount / totalFlow) * 100) : 0;
                                return (
                                  <div key={s.symbol}>
                                    <div className="flex items-center justify-between text-xs mb-0.5">
                                      <span className="font-semibold text-foreground">{s.symbol}</span>
                                      <span className="num text-muted-foreground">
                                        {formatNpr(s.amount, { compact: true })} · {pct}%
                                      </span>
                                    </div>
                                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                      <div
                                        className="h-full bg-primary/60 transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </section>
                    );
                  })()
                : null}

              {/* Big player executions: this broker's block-sized trades for the picked stock */}
              {date ? (
                <section className="rounded-xl border border-border/60 bg-background p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Flame className="size-3 text-amber-500" />
                      Big player trades{symbol ? ` in ${symbol}` : ""}
                    </p>
                    {onPickSymbol && symbol ? (
                      <button
                        type="button"
                        onClick={() => onPickSymbol(symbol)}
                        className="shrink-0 text-[10px] font-semibold text-primary hover:underline"
                      >
                        Open stock trail
                      </button>
                    ) : null}
                  </div>

                  {whaleQuery.isLoading ? (
                    <p className="py-1 text-xs text-muted-foreground">Loading big trades…</p>
                  ) : whaleTrades.length === 0 ? (
                    <p className="py-1 text-xs text-muted-foreground">
                      No block-sized trades by this broker {symbol ? `in ${symbol}` : "on this day"}.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {whaleTrades.map((t) => (
                        <div
                          key={`${t.contractId}-${t.time ?? ""}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-surface px-2 py-1.5"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onPickSymbol?.(t.symbol)}
                              className="num shrink-0 text-xs font-bold text-primary hover:underline"
                              title={`Open ${t.symbol} trail`}
                            >
                              {t.symbol}
                            </button>
                            <span className="num shrink-0 text-[10px] text-muted-foreground">{t.time ?? "-"}</span>
                            <span className="num truncate text-[10px] text-muted-foreground">
                              {formatQty(t.quantity)} × {formatNpr(t.rate)}
                            </span>
                          </div>
                          <span className="num inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                            <Flame className="size-3 text-amber-500" aria-hidden />
                            {formatNpr(t.amount, { compact: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {whaleQuery.data?.truncated ? (
                    <p className="text-[10px] text-muted-foreground">
                      Sampled from the newest {formatNumber(whaleQuery.data.trades.length)} of{" "}
                      {formatNumber(whaleQuery.data.totalTrades)} trades.
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* Settlement & Service Performance */}
              {broker.rating &&
              (broker.rating.averageShareTransferDays > 0 || broker.rating.averageCashDepositDays > 0) ? (
                <section className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Settlement & Service Speed
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {broker.rating.averageShareTransferDays > 0 ? (
                      <div className="rounded-lg bg-muted/40 p-2">
                        <span className="text-[10px] text-muted-foreground block">EDIS Transfer Speed</span>
                        <span className="num font-semibold text-foreground">
                          ~{broker.rating.averageShareTransferDays.toFixed(1)} days
                        </span>
                      </div>
                    ) : null}
                    {broker.rating.averageCashDepositDays > 0 ? (
                      <div className="rounded-lg bg-muted/40 p-2">
                        <span className="text-[10px] text-muted-foreground block">Cash Payout Speed</span>
                        <span className="num font-semibold text-foreground">
                          ~{broker.rating.averageCashDepositDays.toFixed(1)} days
                        </span>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* Reach */}
              {broker.districts.length > 0 || broker.provinces.length > 0 ? (
                <section className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Reach
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {broker.provinces.length > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="size-3 text-primary" />
                        {broker.provinces.join(", ")}
                      </span>
                    ) : null}
                    {broker.districts.length > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3" />
                        {broker.districts.slice(0, 4).join(", ")}
                        {broker.districts.length > 4 ? ` +${broker.districts.length - 4}` : ""}
                      </span>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => onFollowTrail(String(broker.code))}
                >
                  <Filter className="size-3" />
                  Follow floor trail
                </Button>
                {broker.tmsLink ? (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                    <a href={broker.tmsLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-3" />
                      TMS portal
                    </a>
                  </Button>
                ) : null}
                {broker.phone ? (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                    <a href={`tel:${broker.phone}`}>
                      <Phone className="size-3" />
                      {broker.phone}
                    </a>
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuickStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof TrendingUp }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden />
        {label}
      </p>
      <p className="num mt-1 text-sm font-semibold leading-tight">{value}</p>
    </div>
  );
}
