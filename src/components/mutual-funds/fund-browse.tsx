import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeltaPill } from "@/components/stat-card";
import { formatNpr, formatPercent } from "@/lib/format";
import type { LivePrice } from "@/lib/nepse/types";
import type { MfManager, MfPerformance, MfScheme } from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";
import { discountPct, maturityCountdown, referenceNav } from "./mf-math";

export interface BrowseFund {
  scheme: MfScheme;
  perf: MfPerformance | null;
  live: LivePrice | null;
}

type SortKey = "discount" | "nav" | "ltp" | "dividend" | "size" | "holdings" | "name" | "symbol";

const SORTS: { key: SortKey; label: string; dir: 1 | -1 }[] = [
  { key: "discount", label: "Biggest discount", dir: 1 },
  { key: "nav", label: "Highest NAV", dir: -1 },
  { key: "ltp", label: "Highest LTP", dir: -1 },
  { key: "dividend", label: "Expected payout", dir: -1 },
  { key: "size", label: "Fund size", dir: -1 },
  { key: "holdings", label: "Most holdings", dir: -1 },
  { key: "name", label: "Name A–Z", dir: 1 },
  { key: "symbol", label: "Symbol A–Z", dir: 1 },
];

function fundTypeLabel(t: string): string {
  return t === "close_end" ? "Close-end" : t === "open_end" ? "Open-end" : t;
}

function DiscountPill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">NAV n/a</span>;
  const bargain = value < -2;
  const premium = value > 2;
  return (
    <span
      className={cn(
        "num inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        bargain && "bg-gain/15 text-gain",
        premium && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        !bargain && !premium && "bg-muted text-muted-foreground",
      )}
      title={bargain ? "Trading below NAV, a bargain" : premium ? "Trading above NAV" : "Near NAV"}
    >
      {value <= 0 ? `${Math.abs(value).toFixed(2)}% below NAV` : `${value.toFixed(2)}% above NAV`}
    </span>
  );
}

function AllocBar({ perf }: { perf: MfPerformance | null }) {
  const cap = perf?.capitalMarketPct ?? 0;
  const fix = perf?.fixedIncomePct ?? 0;
  const cash = perf?.cashPct ?? 0;
  if (cap + fix + cash <= 0) return null;
  return (
    <div
      className="flex h-1.5 gap-px overflow-hidden rounded-full"
      title={`Shares ${cap.toFixed(0)}% · Bonds ${fix.toFixed(0)}% · Cash ${cash.toFixed(0)}%`}
    >
      <div className="bg-primary" style={{ width: `${cap}%` }} />
      <div className="bg-violet-400" style={{ width: `${fix}%` }} />
      <div className="bg-muted-foreground/40" style={{ width: `${cash}%` }} />
    </div>
  );
}

function FundCard({ fund, onPick }: { fund: BrowseFund; onPick: (symbol: string) => void }) {
  const { scheme, perf, live } = fund;
  const { nav, label: navLabel } = perf ? referenceNav(perf) : { nav: null, label: "NAV" };
  const ltp = live?.ltp ?? perf?.ltp ?? null;
  const disc = discountPct(ltp, nav);
  const countdown = maturityCountdown(scheme.maturityDate ?? perf?.maturityDate ?? null);
  const closeEnd = scheme.fundType === "close_end";
  return (
    <button
      type="button"
      onClick={() => onPick(scheme.symbol)}
      className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base font-bold leading-tight">{scheme.symbol}</p>
          <p className="truncate text-xs text-muted-foreground" title={scheme.name}>
            {scheme.name}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {perf?.timeToMature ? (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={`Matures ${scheme.maturityDate ?? perf?.maturityDate ?? ""}`}
            >
              {perf.timeToMature}
            </span>
          ) : null}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {fundTypeLabel(scheme.fundType)}
          </span>
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            NAV <span className="normal-case">({navLabel})</span>
          </p>
          <p className="num text-xl font-bold">{nav != null ? formatNpr(nav) : "-"}</p>
        </div>
        {closeEnd ? (
          <div className="text-right">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Market</p>
            <p className="num text-sm font-semibold">
              {ltp != null ? formatNpr(ltp) : "-"}{" "}
              {live ? (
                <DeltaPill value={live.percentChange}>
                  {formatPercent(live.percentChange)}
                </DeltaPill>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>

      {closeEnd ? (
        <div className="flex items-center justify-between gap-2">
          <DiscountPill value={disc} />
          {perf?.expectedDividendPct != null && perf.expectedDividendPct > 0 ? (
            <span className="num text-[11px] font-medium text-muted-foreground">
              ≈{perf.expectedDividendPct.toFixed(1)}% payout
            </span>
          ) : null}
        </div>
      ) : null}

      <AllocBar perf={perf} />

      <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{scheme.manager || "-"}</span>
        </span>
        {countdown ? <span className="num shrink-0">{countdown}</span> : null}
      </div>
    </button>
  );
}

export function FundBrowse({
  schemes,
  performances,
  managers,
  livePrices,
  onPick,
}: {
  schemes: MfScheme[];
  performances: Map<string, MfPerformance>;
  managers: MfManager[];
  livePrices: Map<string, LivePrice>;
  onPick: (symbol: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [manager, setManager] = useState<string | null>(null);
  const [type, setType] = useState<"all" | "close_end" | "open_end">("all");
  const [sortKey, setSortKey] = useState<SortKey>("discount");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const funds = useMemo<BrowseFund[]>(
    () =>
      schemes.map((scheme) => ({
        scheme,
        perf: performances.get(scheme.symbol) ?? null,
        live: livePrices.get(scheme.symbol) ?? null,
      })),
    [schemes, performances, livePrices],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = funds.filter((f) => {
      if (manager && f.scheme.managerSlug !== manager && f.scheme.manager !== manager) return false;
      if (type !== "all" && f.scheme.fundType !== type) return false;
      if (!term) return true;
      return (
        f.scheme.symbol.toLowerCase().includes(term) || f.scheme.name.toLowerCase().includes(term)
      );
    });
    const score = (f: BrowseFund): number | string | null => {
      switch (sortKey) {
        case "dividend":
          return f.perf?.expectedDividendPct ?? null;
        case "size":
          return f.perf?.totalPaidUp ?? f.scheme.paidUp ?? null;
        case "nav": {
          const { nav } = f.perf ? referenceNav(f.perf) : { nav: null };
          return nav;
        }
        case "ltp":
          return f.live?.ltp ?? f.perf?.ltp ?? null;
        case "holdings":
          return f.perf?.holdingsCount ?? null;
        case "name":
          return f.scheme.name.toLowerCase();
        case "symbol":
          return f.scheme.symbol;
        case "discount": {
          const { nav } = f.perf ? referenceNav(f.perf) : { nav: null };
          const d = discountPct(f.live?.ltp ?? f.perf?.ltp ?? null, nav);
          return d;
        }
      }
    };
    // Nulls always sink to the bottom, whichever direction is active.
    return [...rows].sort((a, b) => {
      const va = score(a);
      const vb = score(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb)) * sortDir;
      return (va - vb) * sortDir;
    });
  }, [funds, search, manager, type, sortKey, sortDir]);

  const usedManagers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of funds) {
      const key = f.scheme.managerSlug ?? f.scheme.manager;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return managers
      .map((m) => ({
        manager: m,
        count: (counts.get(m.slug) ?? 0) + (counts.get(m.name) ?? 0),
      }))
      .sort((a, b) => b.count - a.count || a.manager.name.localeCompare(b.manager.name));
  }, [funds, managers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search schemes or managers…"
            className="h-10 rounded-xl pl-9 pr-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <Select value={manager ?? "all"} onValueChange={(v) => setManager(v === "all" ? null : v)}>
          <SelectTrigger className="h-10 rounded-xl sm:w-64">
            <SelectValue placeholder="All managers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All managers ({funds.length})</SelectItem>
            {usedManagers.map(({ manager: m, count }) => (
              <SelectItem key={m.slug} value={m.slug}>
                {m.name.replace(/ Capital$| Mutual Fund$/i, "")} ({count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "close_end", "open_end"] as const).map((t) => (
          <FilterChip
            key={t}
            active={type === t}
            onClick={() => setType(t)}
            label={t === "all" ? "All types" : fundTypeLabel(t)}
          />
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                if (s.key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
                else {
                  setSortKey(s.key);
                  setSortDir(s.dir);
                }
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                sortKey === s.key
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground",
              )}
            >
              {s.label}
              {sortKey === s.key ? (
                sortDir === 1 ? (
                  <ArrowUp className="size-3 opacity-80" />
                ) : (
                  <ArrowDown className="size-3 opacity-80" />
                )
              ) : (
                <ArrowUpDown className="size-3 opacity-60" />
              )}
            </button>
          ))}
        </div>
        <span className="num ml-auto text-[11px] text-muted-foreground">
          {visible.length} of {funds.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No schemes match your filters.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((f) => (
            <FundCard key={f.scheme.symbol} fund={f} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/15 text-primary"
          : "border-border/60 bg-surface text-muted-foreground hover:border-primary/30",
      )}
    >
      {label}
    </button>
  );
}
