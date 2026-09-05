import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Phone, Search, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/states";
import { BackButton } from "@/components/back-button";
import { BrokerLeaderboard as BrokerLeaderboardView } from "@/components/tools/broker-leaderboard";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import {
  brokerDirectoryQuery,
  floorSheetDatesQuery,
  floorSheetRangeQuery,
  floorSheetTrailQuery,
} from "@/lib/queries";
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
          "Every NEPSE member broker with branch coverage, plus the daily floor sheet: broker leaderboard, scrip leaderboard, hourly activity and per-transaction trade trails.",
      },
      { property: "og:title", content: "Brokers & Floor Sheet | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "NEPSE broker directory and daily floor sheet analytics — who traded what, with whom, and when.",
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
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Brokers & Floor Sheet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All <span className="font-medium text-foreground">NEPSE member brokers</span>, and the
          day's floor sheet every transaction each broker executed, aggregated from the community
          YONEPSE feed. Indicative data only.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="num mt-1.5 text-lg font-semibold leading-tight sm:text-xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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
      <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
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
                    <span className="flex items-center gap-1.5">
                      <span className="num text-[0.8125rem] font-bold">{row.code}</span>
                      <span className="truncate text-xs text-muted-foreground">{row.name}</span>
                      {row.spike !== null && row.spike >= 2 ? (
                        <SpikePill value={row.spike} />
                      ) : null}
                    </span>
                    <span className="mt-1 flex h-1 overflow-hidden rounded-full bg-muted">
                      <span className="bg-emerald-500/80" style={{ width: `${buyPct}%` }} />
                      <span className="flex-1 bg-rose-500/80" />
                    </span>
                  </span>
                  <span
                    className={cn(
                      "num shrink-0 text-[0.8125rem] font-bold",
                      up ? "text-emerald-600" : "text-rose-600",
                    )}
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

  if (datesQuery.isLoading || (date && dayQuery.isLoading)) return <LoadingBlock />;
  if (datesQuery.isError) return <ErrorBlock error={datesQuery.error} />;
  if (!date)
    return <EmptyBlock title="No floor sheet yet" description="No trading days published." />;
  if (dayQuery.isError) return <ErrorBlock error={dayQuery.error} />;
  const day = dayQuery.data;
  if (!day)
    return (
      <EmptyBlock
        title="No data for this range"
        description="The feed has no floor sheet for these dates yet."
      />
    );
  const sessions = Math.max(1, day.sessions);

  const selectedBroker = trail.brokerCode
    ? day.brokerLeaderboard.find((b) => b.code === trail.brokerCode)
    : null;

  const multiDay = Boolean(toDate && toDate !== date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={date ?? ""} onValueChange={(v) => setRange(v, v)}>
          <SelectTrigger className="w-[150px]" aria-label="From date">
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
        <span className="text-xs text-muted-foreground">to</span>
        <Select value={toDate ?? ""} onValueChange={(v) => setDateTo(v)}>
          <SelectTrigger className="w-[150px]" aria-label="To date">
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
          <span className="num text-xs text-muted-foreground">{sessions} sessions combined</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Turnover" value={formatNpr(day.totalAmount, { compact: true })} />
        <StatCard label="Trades" value={formatNumber(day.totalTrades)} />
        <StatCard label="Traded shares" value={formatQty(day.totalVolume)} />
        <StatCard
          label="Scrips / brokers"
          value={`${day.scripsTraded} / ${day.brokersActive}`}
          hint={
            day.biggestTrade
              ? `Biggest trade: ${day.biggestTrade.symbol} ${formatNpr(day.biggestTrade.amount, { compact: true })}`
              : undefined
          }
        />
      </div>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Money flow</h2>
          <p className="text-xs text-muted-foreground">
            Who accumulated and who distributed in this range. Tap a broker to follow its trades.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
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

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-surface">
          <header className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">Broker leaderboard</h2>
            <p className="text-xs text-muted-foreground">
              Tap a broker to follow every trade it made that day.
            </p>
          </header>
          <BrokerLeaderboard
            rows={day.brokerLeaderboard}
            selectedCode={trail.brokerCode}
            onSelect={(code) =>
              setTrail((f) =>
                f.brokerCode === code ? { ...f, brokerCode: null } : { ...f, brokerCode: code },
              )
            }
          />
        </section>

        <section className="rounded-2xl border border-border/60 bg-surface">
          <header className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">Scrip leaderboard</h2>
            <p className="text-xs text-muted-foreground">By turnover for the day.</p>
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

      {trail.brokerCode || trail.symbol || trail.contract ? (
        <TradeTrail
          title={
            trail.contract
              ? `Trade trail - Contract ${trail.contract}`
              : trail.brokerCode
                ? `Trade trail - Broker ${trail.brokerCode}${selectedBroker ? ` · ${selectedBroker.name}` : ""}`
                : `Trade trail - ${trail.symbol}`
          }
          subtitle={[
            trail.symbol ? `Scrip ${trail.symbol}` : null,
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
        />
      ) : null}
    </div>
  );
}

type BrokerSortKey = "code" | "trades" | "buyAmount" | "sellAmount" | "totalAmount" | "netAmount";

type TrailSortKey =
  "contractId" | "symbol" | "buyer" | "seller" | "quantity" | "rate" | "amount" | "time";

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
  return (
    <div className="max-h-[520px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface">
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
          {sorted.map((row) => (
            <TableRow
              key={row.code}
              onClick={() => onSelect(row.code)}
              className={cn(
                "cursor-pointer",
                selectedCode === row.code && "bg-primary/10 hover:bg-primary/10",
              )}
            >
              <TableCell className="max-w-[220px] py-2">
                <p className="num text-[0.8125rem] font-semibold">
                  {row.code} <span className="font-medium text-muted-foreground">·</span>{" "}
                  <span className="font-normal">{row.name}</span>
                </p>
                <p className="truncate text-[0.68rem] text-muted-foreground">
                  Top:{" "}
                  {row.topSymbols
                    .map((s) => s.symbol)
                    .slice(0, 5)
                    .join(", ") || "-"}
                </p>
              </TableCell>
              <TableCell className="num py-2 text-right">{formatNumber(row.trades)}</TableCell>
              <TableCell className="num py-2 text-right">
                {formatNpr(row.buyAmount, { compact: true })}
              </TableCell>
              <TableCell className="num py-2 text-right">
                {formatNpr(row.sellAmount, { compact: true })}
              </TableCell>
              <TableCell className="num py-2 text-right font-semibold">
                {formatNpr(row.totalAmount, { compact: true })}
              </TableCell>
              <TableCell
                className={cn(
                  "num py-2 text-right",
                  row.netAmount >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                <span className="inline-flex items-center justify-end gap-1">
                  {row.netAmount >= 0 ? (
                    <TrendingUp className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <TrendingDown className="size-3.5 shrink-0" aria-hidden />
                  )}
                  {formatNpr(Math.abs(row.netAmount), { compact: true })}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
  return (
    <div className="max-h-[520px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface">
          <TableRow>
            <SortableTh
              label="Scrip"
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
          {sorted.map((row) => (
            <TableRow
              key={row.symbol}
              onClick={() => onSelect(row.symbol)}
              className={cn(
                "cursor-pointer",
                selectedSymbol === row.symbol && "bg-primary/10 hover:bg-primary/10",
              )}
            >
              <TableCell className="max-w-[220px] py-2">
                <p className="text-[0.8125rem] font-semibold">{row.symbol}</p>
                <p className="truncate text-[0.68rem] text-muted-foreground">
                  {row.name || "-"} · {row.brokers} brokers
                </p>
              </TableCell>
              <TableCell className="num py-2 text-right">{formatNumber(row.trades)}</TableCell>
              <TableCell className="num py-2 text-right">{formatQty(row.volume)}</TableCell>
              <TableCell className="num py-2 text-right">{formatNpr(row.avgPrice)}</TableCell>
              <TableCell className="num py-2 text-right font-semibold">
                {formatNpr(row.amount, { compact: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {parties.slice(0, 5).map((p, i) => (
          <li key={p.code}>
            <button
              type="button"
              onClick={() => onPick(p.code)}
              title={`Follow broker ${p.code} in this scrip`}
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
            >
              <span className="num w-4 shrink-0 text-[11px] font-bold text-muted-foreground">
                {i + 1}
              </span>
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
              <span className="num shrink-0 text-xs font-semibold">
                {formatNpr(p.amount, { compact: true })}
              </span>
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
  const chip =
    "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary hover:bg-primary/25";
  return (
    <section className="rounded-2xl border border-border/60 bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
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
              className="num h-8 w-36 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
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
              <span className="num font-semibold text-foreground">
                {formatNumber(data.totalTrades)}
              </span>
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
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface">
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
                    label="Scrip"
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
                {sorted.map((t) => (
                  <TableRow key={`${t.date ?? ""}-${t.contractId}`}>
                    {multiDay ? (
                      <TableCell className="num whitespace-nowrap py-1.5 text-xs text-muted-foreground">
                        {t.date ?? "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="num py-1.5 text-xs text-muted-foreground">
                      {t.contractId}
                    </TableCell>
                    <TableCell className="py-1.5 text-[0.8125rem] font-semibold">
                      {t.symbol}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate py-1.5 text-xs">
                      {t.buyer ? (
                        <span>
                          <span className="num font-semibold">{t.buyer.code}</span>{" "}
                          <span className="text-muted-foreground">{t.buyer.name}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate py-1.5 text-xs">
                      {t.seller ? (
                        <span>
                          <span className="num font-semibold">{t.seller.code}</span>{" "}
                          <span className="text-muted-foreground">{t.seller.name}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="num py-1.5 text-right">{formatQty(t.quantity)}</TableCell>
                    <TableCell className="num py-1.5 text-right">{formatNpr(t.rate)}</TableCell>
                    <TableCell className="num py-1.5 text-right font-semibold">
                      {formatNpr(t.amount)}
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

/* --------------------------- Broker directory tab --------------------------- */

function BrokerDirectoryTab({ onViewTrail }: { onViewTrail: (brokerCode: string) => void }) {
  const brokersQuery = useQuery(brokerDirectoryQuery());

  if (brokersQuery.isLoading) return <LoadingBlock />;
  if (brokersQuery.isError) return <ErrorBlock error={brokersQuery.error} />;

  return <BrokerLeaderboardView brokers={brokersQuery.data ?? []} onViewTrail={onViewTrail} />;
}
