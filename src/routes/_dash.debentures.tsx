import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Landmark, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { mfDebentureListQuery } from "@/lib/queries";
import { formatNpr, formatQty } from "@/lib/format";
import type { MfDebenture } from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/debentures")({
  head: () => ({
    meta: [
      { title: "Debentures | MeroShare Investor Console" },
      {
        name: "description",
        content: "Compare Nepali debentures by coupon, issuer and size — fixed income explorer.",
      },
      { property: "og:title", content: "Debentures | MeroShare Investor Console" },
    ],
  }),
  component: DebenturesPage,
});

type SortKey = "coupon" | "amount" | "recent";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "coupon", label: "Highest coupon" },
  { key: "amount", label: "Biggest issue" },
  { key: "recent", label: "Most recent" },
];

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3.5 py-2 leading-tight">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num font-semibold">{value}</p>
    </div>
  );
}

function CouponBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const hot = value >= 10;
  const warm = value >= 8;
  return (
    <span
      className={cn(
        "num flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl font-bold",
        hot && "bg-gain/15 text-gain",
        !hot && warm && "bg-primary/10 text-primary",
        !hot && !warm && "bg-muted text-muted-foreground",
      )}
    >
      <span className="text-base leading-none">{value.toFixed(2)}</span>
      <span className="text-[0.6rem] font-medium">% p.a.</span>
    </span>
  );
}

function DebenturesPage() {
  const listQ = useQuery(mfDebentureListQuery());
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("coupon");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [compared, setCompared] = useState<string[]>([]);
  const [principal, setPrincipal] = useState("100000");

  const all = useMemo(() => listQ.data?.debentures ?? [], [listQ.data]);
  const summary = listQ.data?.summary ?? null;

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of all) {
      if (d.sector) counts.set(d.sector, (counts.get(d.sector) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const keyOf = (d: MfDebenture) => `${d.issuer}||${d.instrument}`;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = all.filter((d) => {
      if (sector && d.sector !== sector) return false;
      if (!term) return true;
      return (
        d.issuer.toLowerCase().includes(term) ||
        d.instrument.toLowerCase().includes(term) ||
        (d.issueManager ?? "").toLowerCase().includes(term)
      );
    });
    const score = (d: MfDebenture): number => {
      switch (sortKey) {
        case "coupon":
          return d.couponPct ?? -1;
        case "amount":
          return d.publicIssueAmount ?? d.amountRegistered ?? 0;
        case "recent":
          return d.dateBs ?? d.fiscalYear ?? "";
      }
    };
    return [...rows].sort((a, b) => {
      const va = score(a);
      const vb = score(b);
      if (typeof va === "string") return va.localeCompare(vb as string) * sortDir;
      return ((va as number) - (vb as number)) * sortDir;
    });
  }, [all, search, sector, sortKey, sortDir]);

  const toggleCompare = (d: MfDebenture) => {
    const k = keyOf(d);
    setCompared((cur) =>
      cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= 3 ? cur : [...cur, k],
    );
  };
  const compareRows = useMemo(
    () => compared.flatMap((k) => all.filter((d) => keyOf(d) === k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compared, all],
  );
  const principalNum = Number(String(principal).replace(/,/g, ""));
  const principalValid = Number.isFinite(principalNum) && principalNum > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Landmark className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Debentures</h1>
          <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
            Fixed-income promises from Nepali issuers.
          </p>
        </div>
      </div>

      {listQ.isLoading ? (
        <LoadingBlock label="Loading debentures" />
      ) : listQ.isError ? (
        <ErrorBlock error={listQ.error} retry={() => void listQ.refetch()} />
      ) : all.length === 0 ? (
        <EmptyBlock
          title="No debentures"
          description="No debenture records in the feed right now."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Issues" value={String(summary?.count ?? all.length)} />
            <StatChip label="Issuers" value={String(summary?.issuers ?? "-")} />
            <StatChip
              label="Coupon range"
              value={
                summary?.couponMin != null && summary?.couponMax != null
                  ? `${summary.couponMin.toFixed(2)}–${summary.couponMax.toFixed(2)}%`
                  : "-"
              }
            />
            {compared.length > 0 ? (
              <StatChip label="Comparing" value={`${compared.length} / 3`} />
            ) : null}
          </div>

          {compareRows.length >= 2 ? (
            <section className="space-y-3 rounded-2xl border border-primary/25 bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold">
                  Side by side {compareRows.length > 2 ? "(pick any 3)" : ""}
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Rs</span>
                  <Input
                    value={principal}
                    onChange={(e) => setPrincipal(e.target.value.replace(/[^0-9,]/g, ""))}
                    inputMode="numeric"
                    className="num h-8 w-32 rounded-lg text-xs"
                    aria-label="Investment amount in rupees"
                  />
                  <span className="text-xs text-muted-foreground">/ yr each</span>
                </div>
              </div>
              <div
                className={cn("grid gap-2", compareRows.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
              >
                {compareRows.map((d) => {
                  const annual =
                    principalValid && d.couponPct != null
                      ? (principalNum * d.couponPct) / 100
                      : null;
                  return (
                    <div
                      key={keyOf(d)}
                      className="relative rounded-xl border border-border/60 bg-surface p-3"
                    >
                      <button
                        type="button"
                        aria-label={`Remove ${d.issuer}`}
                        onClick={() => toggleCompare(d)}
                        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                      <p className="num text-2xl font-bold text-gain">
                        {d.couponPct != null ? `${d.couponPct.toFixed(2)}%` : "—"}
                      </p>
                      <p className="mt-1 truncate text-[13px] font-bold" title={d.issuer}>
                        {d.issuer}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground" title={d.instrument}>
                        {d.instrument}
                      </p>
                      <dl className="num mt-2 space-y-1 text-[11px] text-muted-foreground">
                        <div className="flex justify-between gap-2">
                          <dt>Tenor</dt>
                          <dd className="font-semibold text-foreground">
                            {d.tenorYears != null
                              ? `${d.tenorYears}y${d.maturityBs ? ` · ${d.maturityBs}` : ""}`
                              : (d.maturityBs ?? "—")}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Face</dt>
                          <dd className="font-semibold text-foreground">
                            {d.faceValue != null ? formatNpr(d.faceValue) : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>Public issue</dt>
                          <dd className="font-semibold text-foreground">
                            {d.publicIssueAmount != null
                              ? formatNpr(d.publicIssueAmount, { compact: true })
                              : "—"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 border-t border-border/60 pt-1">
                          <dt>Yearly on input</dt>
                          <dd className="font-bold text-gain">
                            {annual != null ? formatNpr(Math.round(annual)) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
              <p className="text-[0.68rem] text-muted-foreground">
                Simple annual interest before tax — actual payout schedules vary by issue.
              </p>
            </section>
          ) : null}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issuer, instrument or issue manager…"
              className="h-10 rounded-xl pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={sector === null} onClick={() => setSector(null)} label="All sectors" />
            {sectors.map(([s, n]) => (
              <FilterChip
                key={s}
                active={sector === s}
                onClick={() => setSector((cur) => (cur === s ? null : s))}
                label={`${s} · ${n}`}
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
                      setSortDir(-1);
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
                  <ArrowUpDown className="size-3 opacity-60" />
                </button>
              ))}
            </div>
            <span className="num ml-auto text-[11px] text-muted-foreground">
              {visible.length} of {all.length}
            </span>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No debentures match your filters.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((d) => {
                const k = keyOf(d);
                const picked = compared.includes(k);
                return (
                  <div
                    key={k}
                    className={cn(
                      "flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-all",
                      picked
                        ? "border-primary/60 shadow-lg shadow-primary/5"
                        : "border-border/70 hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <CouponBadge value={d.couponPct} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold leading-tight" title={d.issuer}>
                          {d.issuer}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={d.instrument}
                        >
                          {d.instrument}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
                          {d.sector ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                              {d.sector}
                            </span>
                          ) : null}
                          {d.fiscalYear ? (
                            <span className="num rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                              FY {d.fiscalYear}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <dl className="num grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-surface px-2.5 py-1.5">
                        <dt className="text-muted-foreground">Tenor</dt>
                        <dd className="font-bold">
                          {d.tenorYears != null
                            ? `${d.tenorYears} yrs`
                            : (d.maturityBs ?? "—")}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-surface px-2.5 py-1.5">
                        <dt className="text-muted-foreground">Public issue</dt>
                        <dd className="font-bold">
                          {d.publicIssueAmount != null
                            ? formatNpr(d.publicIssueAmount, { compact: true })
                            : "—"}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {d.issueManager ? `via ${d.issueManager}` : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCompare(d)}
                        disabled={!picked && compared.length >= 3}
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-1 font-semibold transition-colors disabled:opacity-40",
                          picked
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/60 hover:border-primary/40 hover:text-primary",
                        )}
                      >
                        {picked ? "Added" : "Compare"}
                      </button>
                    </div>
                    {d.units != null || d.faceValue != null ? (
                      <p className="num -mt-1 text-[0.68rem] text-muted-foreground">
                        {d.units != null ? `${formatQty(d.units)} units` : ""}
                        {d.units != null && d.faceValue != null ? " · " : ""}
                        {d.faceValue != null ? `@ ${formatNpr(d.faceValue)}` : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Issue records from SEBON public data — indicative only, not investment advice. Coupons
            are annual rates before tax; payout frequency varies by issue.
          </p>
        </>
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
