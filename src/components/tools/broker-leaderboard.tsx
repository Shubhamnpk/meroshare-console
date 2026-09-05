// Broker leaderboard for the Brokers page — mywallet-style: podium hero,
// metric pills, search/filter, ranked broker cards with an in-app detail view,
// plus a compact list view. Data comes pre-aggregated from the YONEPSE
// enriched broker feed via the server layer.
//
// Rank is fixed to the source feed's per-category order (today / 30-session /
// community rating). Filtering by name never re-ranks the list.
import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpCircle,
  ArrowUpWideNarrow,
  Building2,
  Clock,
  ExternalLink,
  History,
  LayoutGrid,
  List,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyBlock } from "@/components/states";
import { formatNpr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BrokerRow } from "@/lib/nepse/types";

type PodiumMetric = "today" | "month" | "review";
type ViewMode = "cards" | "list";
type RankSort = "high" | "low" | "branches";

const metricValue = (b: BrokerRow, m: PodiumMetric): number => {
  if (m === "review") return b.rating?.averageRating ?? 0;
  if (m === "month") return b.thirtyDaysTurnover;
  return b.todayStats?.totalAmount ?? 0;
};

const METRIC_LABEL: Record<PodiumMetric, string> = {
  today: "today's turnover",
  month: "30-session turnover",
  review: "community rating",
};

function metricLabel(m: PodiumMetric, v: number): string {
  if (m === "review") return `★ ${v.toFixed(1)}`;
  return formatNpr(v, { compact: true });
}

function BrokerAvatar({ broker, className }: { broker: BrokerRow; className?: string }) {
  if (broker.logoUrl) {
    return (
      <img
        src={broker.logoUrl}
        alt=""
        loading="lazy"
        className={cn("rounded-xl object-contain", className)}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <div
      className={cn(
        "num flex items-center justify-center rounded-xl bg-primary/10 font-bold text-primary",
        className,
      )}
    >
      {broker.code}
    </div>
  );
}

/** Hero podium: 2nd — 1st — 3rd with podium bars, mirroring mywallet. */
function PodiumHero({
  top3,
  metric,
  onMetricChange,
  onSelect,
}: {
  top3: [BrokerRow, BrokerRow, BrokerRow];
  metric: PodiumMetric;
  onMetricChange: (m: PodiumMetric) => void;
  onSelect: (b: BrokerRow) => void;
}) {
  // top3 is sorted best → worst by the podium metric, so index 0 is the winner.
  const [first, second, third] = top3;
  const places: { broker: BrokerRow; place: 1 | 2 | 3 }[] = [
    { broker: second, place: 2 },
    { broker: first, place: 1 },
    { broker: third, place: 3 },
  ];
  const barClass: Record<1 | 2 | 3, string> = {
    1: "from-amber-300/70 to-amber-100/30 border-amber-300/50 h-24",
    2: "from-zinc-200/60 to-zinc-100/30 border-zinc-200/40 h-16",
    3: "from-orange-200/60 to-orange-100/30 border-orange-200/40 h-12",
  };
  const ringClass: Record<1 | 2 | 3, string> = {
    1: "bg-amber-400",
    2: "bg-zinc-400",
    3: "bg-orange-400",
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-primary/5 shadow-lg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
      <div className="relative px-4 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">Top Brokers</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Leading performers this period
            </p>
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-full border bg-muted/60 p-0.5 shadow-sm">
            {(["today", "month", "review"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                  metric === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onMetricChange(m)}
              >
                {m === "today" ? "Today" : m === "month" ? "30d" : "Review"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-center gap-3 sm:gap-5">
          {places.map(({ broker, place }) => (
            <div
              key={broker.code}
              className="group flex w-[100px] cursor-pointer flex-col items-center transition-all duration-300 hover:scale-105 sm:w-[130px]"
              onClick={() => onSelect(broker)}
            >
              <div className="relative mb-2">
                <BrokerAvatar
                  broker={broker}
                  className={cn(
                    "rounded-full ring-2 shadow-md group-hover:ring-primary/30 transition-all",
                    place === 1
                      ? "size-11 ring-amber-300/50 sm:size-12"
                      : "size-9 sm:size-11 ring-muted-foreground/20",
                  )}
                />
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-sm ring-1 ring-background",
                    ringClass[place],
                  )}
                >
                  {place}
                </span>
              </div>
              <div className="text-center">
                <div className="line-clamp-1 text-xs font-semibold leading-tight">
                  {broker.name}
                </div>
                <div className="num mt-0.5 text-[10px] text-muted-foreground">
                  {metricLabel(metric, metricValue(broker, metric))}
                  {metric === "month" && broker.thirtyDaysTurnover > 0 ? (
                    <span className="block text-[9px] opacity-80">
                      ≈ {formatNpr(broker.thirtyDaysTurnover / 30, { compact: true })}/session
                    </span>
                  ) : null}
                </div>
              </div>
              <div
                className={cn(
                  "mt-2 w-full rounded-t-xl border bg-gradient-to-t shadow-inner",
                  barClass[place],
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ranked broker card (cards view). */
function BrokerCard({
  broker,
  rank,
  onSelect,
}: {
  broker: BrokerRow;
  rank: number;
  onSelect: (b: BrokerRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(broker)}
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-border/60 bg-surface p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        !broker.active && "opacity-60",
      )}
    >
      <div className="relative shrink-0">
        <span className="num absolute -top-1 -left-1 z-10 flex size-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-sm ring-2 ring-background">
          {rank}
        </span>
        <BrokerAvatar broker={broker} className="size-10" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold leading-tight">{broker.name}</p>
          {broker.isDealer ? (
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Dealer
            </span>
          ) : null}
        </div>
        <p className="num mt-1 text-[0.7rem] text-muted-foreground">
          Today{" "}
          <span className="font-semibold text-foreground">
            {broker.todayStats ? formatNpr(broker.todayStats.totalAmount, { compact: true }) : "—"}
          </span>
          {" · "}30d{" "}
          <span className="font-semibold text-foreground">
            {formatNpr(broker.thirtyDaysTurnover, { compact: true })}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {broker.districts.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {broker.districts.slice(0, 2).join(", ")}
              {broker.districts.length > 2 ? ` +${broker.districts.length - 2}` : ""}
            </span>
          ) : null}
          {broker.rating && broker.rating.totalRatings > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 text-amber-500" aria-hidden />
              {broker.rating.averageRating.toFixed(1)} ({broker.rating.totalRatings})
            </span>
          ) : null}
          {broker.todayStats?.topStock ? (
            <span className="num">Top: {broker.todayStats.topStock.symbol}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/** Compact list row (list view). */
function BrokerListRow({
  broker,
  rank,
  onSelect,
}: {
  broker: BrokerRow;
  rank: number;
  onSelect: (b: BrokerRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(broker)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40",
        !broker.active && "opacity-60",
      )}
    >
      <span className="num w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {rank}
      </span>
      <BrokerAvatar broker={broker} className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium">{broker.name}</p>
        <p className="truncate text-[0.68rem] text-muted-foreground">
          {broker.districts.slice(0, 2).join(", ") || "—"}
          {broker.rating && broker.rating.totalRatings > 0
            ? ` · ★ ${broker.rating.averageRating.toFixed(1)}`
            : ""}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="num text-[0.8125rem] font-semibold">
          {broker.todayStats ? formatNpr(broker.todayStats.totalAmount, { compact: true }) : "—"}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">today</p>
      </div>
      <div className="text-right">
        <p className="num text-[0.8125rem] font-semibold">
          {formatNpr(broker.thirtyDaysTurnover, { compact: true })}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">30d</p>
      </div>
    </button>
  );
}

/** Stat chip for the detail page hero. */
function DetailStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  icon?: typeof Phone;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </p>
      <p className="num mt-1.5 text-lg font-semibold leading-tight sm:text-xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** In-app detail page for a single broker. Replaces the listing. */
export function BrokerDetail({
  broker,
  rank,
  category,
  categoryRank,
  onBack,
  onViewTrail,
}: {
  broker: BrokerRow;
  /** Rank in the overall (source) list — fixed, doesn't change with search. */
  rank: number;
  /** Active podium category: today / month / review. */
  category: PodiumMetric;
  /** Rank inside the active category. */
  categoryRank: number | null;
  onBack: () => void;
  /** Jump to this broker's floor-sheet trail (provided by the brokers page). */
  onViewTrail?: ((brokerCode: string) => void) | undefined;
}) {
  const { rating, todayStats, branches } = {
    branches: broker.branchCount,
    rating: broker.rating,
    todayStats: broker.todayStats,
  };
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All brokers
      </button>

      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-primary/5 shadow-sm">
        <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
          <BrokerAvatar
            broker={broker}
            className="size-20 shrink-0 rounded-2xl ring-2 ring-border/60 sm:size-24"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                #{broker.code}
              </span>
              {broker.isDealer ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  Dealer
                </span>
              ) : null}
              {!broker.active ? (
                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  Inactive
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold leading-tight">
              {broker.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{broker.membershipType}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                {METRIC_LABEL[category]} rank #{rank}
              </span>
              {categoryRank !== null && categoryRank !== rank ? (
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-primary" aria-hidden />
                  Other categories also rank #{categoryRank}
                </span>
              ) : null}
              {branches > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Store className="size-3.5" aria-hidden />
                  {branches} branches
                </span>
              ) : null}
              {broker.provinces.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden />
                  {broker.provinces.join(", ")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onViewTrail ? (
              <button
                type="button"
                onClick={() => onViewTrail(String(broker.code))}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <History className="size-3.5" aria-hidden />
                Floor trail
              </button>
            ) : null}
            {broker.tmsLink ? (
              <a
                href={broker.tmsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/40"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                TMS portal
              </a>
            ) : null}
            {broker.phone ? (
              <a
                href={`tel:${broker.phone}`}
                className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/40"
              >
                <Phone className="size-3.5" aria-hidden />
                {broker.phone}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DetailStat
          label="Today's turnover"
          icon={TrendingUp}
          value={todayStats ? formatNpr(todayStats.totalAmount, { compact: true }) : "—"}
          hint={
            todayStats
              ? `Bought ${formatNpr(todayStats.buyAmount, { compact: true })} · Sold ${formatNpr(todayStats.sellAmount, { compact: true })}`
              : "Session not yet published"
          }
        />
        <DetailStat
          label="30d turnover"
          icon={History}
          value={formatNpr(broker.thirtyDaysTurnover, { compact: true })}
          hint={
            broker.thirtyDaysTurnover > 0
              ? `≈ ${formatNpr(broker.thirtyDaysTurnover / 30, { compact: true })} per session`
              : undefined
          }
        />
        <DetailStat
          label="Latest session"
          icon={Clock}
          value={formatNpr(broker.latestTurnover, { compact: true })}
        />
        <DetailStat
          label="Community rating"
          icon={Star}
          value={rating && rating.totalRatings > 0 ? `★ ${rating.averageRating.toFixed(1)}` : "—"}
          hint={
            rating
              ? `${rating.totalRatings} review${rating.totalRatings === 1 ? "" : "s"}`
              : "No reviews yet"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-surface p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Store className="size-4 text-primary" aria-hidden />
            Reach
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Branches
              </dt>
              <dd className="num mt-1 text-base font-semibold">{branches}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Provinces
              </dt>
              <dd className="mt-1 text-base font-semibold">{broker.provinces.length}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Districts
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {broker.districts.length > 0 ? (
                  broker.districts.map((d) => (
                    <span
                      key={d}
                      className="rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium"
                    >
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No districts listed</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border/60 bg-surface p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ArrowUpCircle className="size-4 text-emerald-600" aria-hidden />
            Today's buy vs sell
          </h3>
          {todayStats ? (
            <BuySellBars
              buy={todayStats.buyAmount}
              sell={todayStats.sellAmount}
              topStock={todayStats.topStock?.symbol ?? null}
            />
          ) : (
            <EmptyBlock
              title="No session data"
              description="Today's floor sheet hasn't been published yet."
            />
          )}
        </section>
      </div>

      {rating && rating.totalRatings > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-surface p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Star className="size-4 text-amber-500" aria-hidden />
            Community reviews
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Rating</p>
              <p className="num mt-1 text-lg font-semibold">★ {rating.averageRating.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Share transfer
              </p>
              <p className="num mt-1 text-lg font-semibold">
                {rating.averageShareTransferDays.toFixed(1)}d
              </p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Cash deposit
              </p>
              <p className="num mt-1 text-lg font-semibold">
                {rating.averageCashDepositDays.toFixed(1)}d
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Aggregated from {rating.totalRatings} community review
            {rating.totalRatings === 1 ? "" : "s"}.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-surface p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-primary" aria-hidden />
          Identity
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              NEPSE code
            </dt>
            <dd className="num mt-1 text-base font-semibold">#{broker.code}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              Membership
            </dt>
            <dd className="mt-1 text-base font-semibold">{broker.membershipType}</dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Status</dt>
            <dd className="mt-1 text-base font-semibold">
              {broker.active ? "Active member" : "Inactive"}
            </dd>
          </div>
          <div>
            <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Dealer</dt>
            <dd className="mt-1 text-base font-semibold">{broker.isDealer ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function BuySellBars({
  buy,
  sell,
  topStock,
}: {
  buy: number;
  sell: number;
  topStock: string | null;
}) {
  const total = buy + sell;
  if (total <= 0) {
    return (
      <EmptyBlock
        title="No activity"
        description="This broker recorded no trades today."
        className="mt-3"
      />
    );
  }
  const buyPct = (buy / total) * 100;
  const sellPct = 100 - buyPct;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60 bg-background">
        <div
          className="bg-emerald-500/80 transition-all"
          style={{ width: `${buyPct}%` }}
          title={`Bought ${formatNpr(buy, { compact: true })}`}
        />
        <div
          className="bg-rose-500/80 transition-all"
          style={{ width: `${sellPct}%` }}
          title={`Sold ${formatNpr(sell, { compact: true })}`}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ArrowUpCircle className="size-3.5 text-emerald-600" aria-hidden />
          Bought{" "}
          <span className="num font-semibold text-foreground">
            {formatNpr(buy, { compact: true })}
          </span>
          <span className="text-muted-foreground">({buyPct.toFixed(0)}%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ArrowDownCircle className="size-3.5 text-rose-600" aria-hidden />
          Sold{" "}
          <span className="num font-semibold text-foreground">
            {formatNpr(sell, { compact: true })}
          </span>
          <span className="text-muted-foreground">({sellPct.toFixed(0)}%)</span>
        </span>
      </div>
      {topStock ? (
        <p className="text-[11px] text-muted-foreground">
          Busiest scrip today: <span className="num font-semibold text-foreground">{topStock}</span>
        </p>
      ) : null}
    </div>
  );
}
export function BrokerLeaderboard({
  brokers,
  onViewTrail,
}: {
  brokers: BrokerRow[];
  onViewTrail?: ((brokerCode: string) => void) | undefined;
}) {
  const [metric, setMetric] = useState<PodiumMetric>("today");
  const [view, setView] = useState<ViewMode>("cards");
  const [sort, setSort] = useState<RankSort>("high");
  const [pickedCode, setPickedCode] = useState<number | null>(null);

  // Pre-compute the per-category ordered lists once. These are the "rankings"
  // that drive the podium and the rank badge on every row. They are derived
  // from the source feed and never re-sorted by user input.
  const rankedByCategory = useMemo(() => {
    const orderBy = (key: (b: BrokerRow) => number) =>
      brokers
        .map((b, idx) => ({ b, idx }))
        .sort((a, c) => {
          const diff = key(c.b) - key(a.b);
          return diff !== 0 ? diff : a.idx - c.idx;
        });
    return {
      today: orderBy((b) => b.todayStats?.totalAmount ?? 0),
      month: orderBy((b) => b.thirtyDaysTurnover),
      review: orderBy((b) => b.rating?.averageRating ?? 0),
    };
  }, [brokers]);

  const top3 = useMemo<[BrokerRow, BrokerRow, BrokerRow] | null>(() => {
    const list = rankedByCategory[metric];
    const first = list[0]?.b;
    if (!first) return null;
    const second = list[1]?.b ?? first;
    const third = list[2]?.b ?? second;
    return [first, second, third];
  }, [rankedByCategory, metric]);

  // Rank continues from the podium. Card/list ranks are the position inside
  // the active category, so the first card is rank #4 (right after the
  // podium's #1, #2, #3), the next is #5, and so on. Rankings stay fixed
  // even when the user types in the search box — search only filters which
  // rows render, never re-orders them.
  const categoryRankByCode = useMemo(() => {
    const map = new Map<number, number>();
    rankedByCategory[metric].forEach((entry, idx) => {
      map.set(entry.b.code, idx + 1);
    });
    return map;
  }, [rankedByCategory, metric]);

  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState<string>("all");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = brokers.filter((b) => {
      if (district !== "all" && !b.districts.includes(district)) return false;
      if (!q) return true;
      if (b.name.toLowerCase().includes(q)) return true;
      if (String(b.code).includes(q)) return true;
      if (b.membershipType.toLowerCase().includes(q)) return true;
      return false;
    });
    // Sort by category rank only — the rank badge stays the same value, this
    // just decides whether rank #4 sits above or below rank #N in the list.
    // "branches" override sorts by branch count (most first); rank badge
    // still reflects the active podium category.
    const rankOf = (b: BrokerRow) => categoryRankByCode.get(b.code) ?? Number.MAX_SAFE_INTEGER;
    const out = [...matches];
    out.sort((a, b) => {
      if (sort === "branches") {
        const diff = b.branchCount - a.branchCount;
        if (diff !== 0) return diff;
        return rankOf(a) - rankOf(b);
      }
      const diff = rankOf(a) - rankOf(b);
      if (diff !== 0) return sort === "high" ? diff : -diff;
      // Ties keep source-feed order.
      return brokers.indexOf(a) - brokers.indexOf(b);
    });
    return out;
  }, [brokers, search, district, categoryRankByCode, sort]);

  const districts = useMemo(() => {
    const set = new Set<string>();
    for (const b of brokers) for (const d of b.districts) set.add(d);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [brokers]);

  const pickedBroker =
    pickedCode !== null ? (brokers.find((b) => b.code === pickedCode) ?? null) : null;

  if (pickedBroker) {
    return (
      <BrokerDetail
        broker={pickedBroker}
        rank={categoryRankByCode.get(pickedBroker.code) ?? 0}
        category={metric}
        categoryRank={categoryRankByCode.get(pickedBroker.code) ?? null}
        onBack={() => setPickedCode(null)}
        onViewTrail={onViewTrail}
      />
    );
  }

  return (
    <div className="space-y-4">
      {top3 ? (
        <PodiumHero
          top3={top3}
          metric={metric}
          onMetricChange={setMetric}
          onSelect={(b) => setPickedCode(b.code)}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brokers…"
              className="w-[200px] pl-9 sm:w-[240px]"
            />
          </div>
          <Select value={district} onValueChange={setDistrict}>
            <SelectTrigger className="h-10 w-[170px] rounded-xl" aria-label="Filter by district">
              <SelectValue placeholder="All districts" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All districts ({brokers.length})</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center gap-0.5 rounded-full border bg-muted/60 p-0.5 shadow-sm"
            role="radiogroup"
            aria-label="Sort"
          >
            {(
              [
                { key: "high", label: "Highest rank", icon: ArrowUpWideNarrow },
                { key: "low", label: "Lowest rank", icon: ArrowDownWideNarrow },
                { key: "branches", label: "Most branches", icon: Store },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={sort === key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                  sort === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setSort(key)}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-full border bg-muted/60 p-0.5 shadow-sm">
            {(["cards", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all",
                  view === v
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setView(v)}
                aria-label={`${v} view`}
              >
                {v === "cards" ? (
                  <LayoutGrid className="size-3.5" aria-hidden />
                ) : (
                  <List className="size-3.5" aria-hidden />
                )}
                {v === "cards" ? "Cards" : "List"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyBlock
          title="No brokers match"
          description="Try a different name, code, membership type or district."
        />
      ) : view === "cards" ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => (
            <BrokerCard
              key={b.code}
              broker={b}
              rank={categoryRankByCode.get(b.code) ?? 0}
              onSelect={(row) => setPickedCode(row.code)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((b) => (
            <BrokerListRow
              key={b.code}
              broker={b}
              rank={categoryRankByCode.get(b.code) ?? 0}
              onSelect={(row) => setPickedCode(row.code)}
            />
          ))}
        </div>
      )}

      {search ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Showing {filtered.length} of {brokers.length}. Rankings stay fixed — search never
          re-orders the leaderboard.
        </p>
      ) : null}
    </div>
  );
}
