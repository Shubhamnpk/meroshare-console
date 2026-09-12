import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { EmptyBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { dividendsQuery, holdingSymbolsQuery } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import {
  BS_MONTHS_EN,
  BS_MONTHS_NE,
  WEEKDAYS_SHORT,
  adKey,
  adToBs,
  bsMonthLength,
  bsToAd,
  formatBs,
  parseFeedDate,
  todayBs,
  type BsDate,
} from "@/lib/nepali-dates";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_dash/calendar")({
  validateSearch: (search: Record<string, unknown>): { symbol?: string | undefined } => ({
    symbol: typeof search["symbol"] === "string" ? search["symbol"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Calendar | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "AD and Nepali (Bikram Sambat) calendar with your holdings' dividend announcements and book-closure dates.",
      },
      { property: "og:title", content: "Calendar | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Dividend calendar for your holdings in AD and Bikram Sambat.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/calendar")],
  }),
  component: CalendarPage,
});

type CalKind = "announce" | "bookclose";

interface CalEvent {
  key: string;
  date: Date;
  symbol: string;
  kind: CalKind;
  bonus: number;
  cash: number;
  fy: string | null;
  mine: boolean;
}

const KIND_STYLE: Record<CalKind, { dot: string; badge: string; label: string }> = {
  announce: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "Announced",
  },
  bookclose: {
    dot: "bg-gain",
    badge: "bg-gain/15 text-gain",
    label: "Book close",
  },
};

function dividendText(e: CalEvent): string {
  const parts: string[] = [];
  if (e.bonus > 0) parts.push(`${e.bonus}% bonus`);
  if (e.cash > 0) parts.push(`${e.cash}% cash`);
  return parts.join(" + ") || "Dividend";
}

function MonthGrid({
  cells,
  selectedKey,
  onSelect,
  todayKey,
  eventsOf,
}: {
  cells: { key: string; primary: number; secondary: string | null; inMonth: boolean; date: Date }[];
  selectedKey: string | null;
  todayKey: string;
  onSelect: (date: Date) => void;
  eventsOf: (key: string) => CalEvent[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
        {WEEKDAYS_SHORT.map((d) => (
          <p
            key={d}
            className="px-1 py-2 text-center text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c) => {
          const events = eventsOf(c.key);
          const shown = events.slice(0, 3);
          const extra = events.length - shown.length;
          const selected = c.key === selectedKey;
          const isToday = c.key === todayKey;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c.date)}
              className={cn(
                "flex min-h-[76px] flex-col items-stretch gap-1 border-b border-r border-border/40 p-1.5 text-left transition-colors last:border-r-0 hover:bg-muted/40 sm:min-h-[104px] sm:p-2",
                !c.inMonth && "bg-muted/20 opacity-50",
                selected && "bg-primary/10 hover:bg-primary/15",
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "num flex size-6 items-center justify-center rounded-full text-xs font-semibold sm:size-7 sm:text-sm",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && selected && "text-primary",
                  )}
                >
                  {c.primary}
                </span>
                {c.secondary ? (
                  <span className="num hidden text-[0.65rem] text-muted-foreground sm:block">
                    {c.secondary}
                  </span>
                ) : null}
              </span>
              {shown.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1 px-0.5">
                  {shown.map((e) => (
                    <span
                      key={e.key}
                      title={`${e.symbol} · ${dividendText(e)}`}
                      className={cn("size-2 rounded-full", KIND_STYLE[e.kind].dot)}
                    />
                  ))}
                  {extra > 0 ? (
                    <span className="num text-[0.62rem] font-semibold text-muted-foreground">
                      +{extra}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarPage() {
  const now = new Date();
  const bsNow = todayBs();
  const { symbol: symbolParam } = Route.useSearch();
  const focusSymbol = (symbolParam ?? "").trim().toUpperCase();
  const [view, setView] = useState<"ad" | "bs">("ad");
  const [adCursor, setAdCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [bsCursor, setBsCursor] = useState<BsDate>(
    bsNow ?? { y: 2083, m: 5, d: 1 },
  );
  const [selected, setSelected] = useState<Date>(now);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const navigate = Route.useNavigate();

  const dividends = useQuery(dividendsQuery());
  const holdings = useQuery(holdingSymbolsQuery());
  const held = useMemo(
    () => new Set((holdings.data ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean)),
    [holdings.data],
  );

  const events = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const div of dividends.data ?? []) {
      const symbol = String(div.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      if (focusSymbol && symbol !== focusSymbol) continue;
      const mine = held.has(symbol);
      if (!focusSymbol && scope === "mine" && !mine) continue;
      const bonus = Number(div.bonusShare ?? 0) || 0;
      const cash = Number(div.cashDividend ?? 0) || 0;
      const fy = div.fiscalYear ?? null;
      const push = (date: Date | null, kind: CalKind) => {
        if (!date) return;
        const key = adKey(date);
        const list = map.get(key) ?? [];
        list.push({ key: `${kind}-${symbol}-${key}`, date, symbol, kind, bonus, cash, fy, mine });
        map.set(key, list);
      };
      push(parseFeedDate(div.bookCloseDate), "bookclose");
      push(parseFeedDate(div.announcementDate), "announce");
    }
    for (const list of map.values())
      list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "bookclose" ? -1 : 1));
    return map;
  }, [dividends.data, held, scope, focusSymbol]);

  const eventsOf = (key: string) => events.get(key) ?? [];
  const todayKey = adKey(now);
  const selectedKey = adKey(selected);
  const selectedEvents = eventsOf(selectedKey);

  const upcoming = useMemo(() => {
    const out: CalEvent[] = [];
    for (const list of events.values())
      for (const e of list) {
        if (e.kind === "bookclose" && e.date.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())
          out.push(e);
      }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // AD month cells.
  const adCells = useMemo(() => {
    const first = new Date(adCursor.y, adCursor.m, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(adCursor.y, adCursor.m + 1, 0).getDate();
    const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const cells: { key: string; primary: number; secondary: string | null; inMonth: boolean; date: Date }[] = [];
    for (let i = 0; i < total; i++) {
      const date = new Date(adCursor.y, adCursor.m, 1 - startOffset + i);
      const bs = adToBs(date);
      cells.push({
        key: adKey(date),
        primary: date.getDate(),
        secondary: bs ? String(bs.d) : null,
        inMonth: date.getMonth() === adCursor.m,
        date,
      });
    }
    return cells;
  }, [adCursor]);

  // BS month cells.
  const bsCells = useMemo(() => {
    const len = bsMonthLength(bsCursor.y, bsCursor.m) ?? 30;
    const firstAd = bsToAd(bsCursor.y, bsCursor.m, 1);
    const startOffset = firstAd ? firstAd.getDay() : 0;
    const cells: { key: string; primary: number; secondary: string | null; inMonth: boolean; date: Date }[] = [];
    const total = Math.ceil((startOffset + len) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const bsDay = i - startOffset + 1;
      if (bsDay < 1 || bsDay > len) {
        const filler = new Date(now.getFullYear(), now.getMonth(), 1);
        cells.push({ key: `x-${i}`, primary: 0, secondary: null, inMonth: false, date: filler });
        continue;
      }
      const ad = bsToAd(bsCursor.y, bsCursor.m, bsDay);
      const date = ad ?? new Date();
      cells.push({
        key: ad ? adKey(ad) : `bs-${bsDay}`,
        primary: bsDay,
        secondary: ad ? String(ad.getDate()) : null,
        inMonth: true,
        date,
      });
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bsCursor]);

  const adTitle = new Date(adCursor.y, adCursor.m, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const adSub = (() => {
    const names = new Set<string>();
    for (const c of adCells) {
      if (!c.inMonth) continue;
      const bs = adToBs(c.date);
      if (bs) names.add(BS_MONTHS_EN[bs.m - 1]!);
    }
    const firstBs = adToBs(new Date(adCursor.y, adCursor.m, 1));
    return `${[...names].join(" / ")}${firstBs ? ` ${firstBs.y}` : ""}`;
  })();
  const bsTitle = `${BS_MONTHS_EN[bsCursor.m - 1]} ${bsCursor.y}`;
  const bsTitleNe = `${BS_MONTHS_NE[bsCursor.m - 1]} ${bsCursor.y}`;
  const bsSub = (() => {
    const first = bsToAd(bsCursor.y, bsCursor.m, 1);
    const len = bsMonthLength(bsCursor.y, bsCursor.m) ?? 30;
    const last = bsToAd(bsCursor.y, bsCursor.m, len);
    return first && last ? `${formatDate(first)} to ${formatDate(last)}` : "";
  })();

  const step = (dir: 1 | -1) => {
    if (view === "ad") {
      const d = new Date(adCursor.y, adCursor.m + dir, 1);
      setAdCursor({ y: d.getFullYear(), m: d.getMonth() });
    } else {
      let { y, m } = bsCursor;
      m += dir;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y >= 2000 && y <= 2090) setBsCursor({ y, m, d: 1 });
    }
  };
  const goToday = () => {
    setAdCursor({ y: now.getFullYear(), m: now.getMonth() });
    const bs = todayBs();
    if (bs) setBsCursor({ y: bs.y, m: bs.m, d: 1 });
    setSelected(new Date());
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
          <CalendarDays className="size-6 text-primary" /> Calendar
        </h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Dividend announcements and book closures for your holdings, in AD and Bikram Sambat.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border/70 bg-card p-1">
          {(["ad", "bs"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "ad" ? "AD" : "BS (Nepali)"}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-border/70 bg-card p-1">
          {(["mine", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                scope === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "mine" ? "My holdings" : "All scrips"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {focusSymbol ? (
        <button
          type="button"
          onClick={() => void navigate({ search: {} })}
          title="Show all scrips"
          className="num inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
        >
          Showing {focusSymbol} only · clear <X className="size-3" />
        </button>
      ) : null}

      <div>
        <h2 className="font-display text-xl font-semibold">
          {view === "ad" ? adTitle : bsTitle}
          {view === "bs" ? <span className="ml-2 text-sm font-normal text-muted-foreground">{bsTitleNe}</span> : null}
        </h2>
        <p className="num mt-0.5 text-xs text-muted-foreground">{view === "ad" ? adSub : bsSub}</p>
      </div>

      <MonthGrid
        cells={view === "ad" ? adCells : bsCells}
        selectedKey={selectedKey}
        todayKey={todayKey}
        onSelect={setSelected}
        eventsOf={eventsOf}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-gain" /> Book close
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" /> Announced
        </span>
        <span className="num">
          {view === "ad" ? "BS date under each day" : "AD date under each day"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h3 className="font-display text-base font-semibold">
            {formatDate(selected)}{" "}
            <span className="num text-xs font-normal text-muted-foreground">
              {(() => {
                const bs = adToBs(selected);
                return bs ? formatBs(bs) : "";
              })()}
            </span>
          </h3>
          {selectedEvents.length === 0 ? (
            <EmptyBlock title="No events" description="No dividend activity on this day." />
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e) => (
                <li
                  key={e.key}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
                >
                  <span
                    className={cn(
                      "num flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      KIND_STYLE[e.kind].badge,
                    )}
                  >
                    {e.symbol.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{e.symbol}</span>
                      <span className={cn("num rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", KIND_STYLE[e.kind].badge)}>
                        {KIND_STYLE[e.kind].label}
                      </span>
                      {e.mine ? (
                        <span className="num rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                          Holding
                        </span>
                      ) : null}
                    </span>
                    <span className="num mt-0.5 block text-xs text-muted-foreground">
                      {dividendText(e)}
                      {e.fy ? ` · FY ${e.fy}` : ""}
                    </span>
                    <span className="num mt-0.5 block text-xs text-muted-foreground">
                      {formatDate(e.date)}
                      {(() => {
                        const bs = adToBs(e.date);
                        return bs ? ` · ${formatBs(bs)}` : "";
                      })()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-base font-semibold">Upcoming book closures</h3>
          {upcoming.length === 0 ? (
            <p className="rounded-2xl border border-border/60 bg-surface px-4 py-3 text-sm text-muted-foreground">
              Nothing on the books ahead.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(e.date);
                      setAdCursor({ y: e.date.getFullYear(), m: e.date.getMonth() });
                      const bs = adToBs(e.date);
                      if (bs) setBsCursor({ y: bs.y, m: bs.m, d: 1 });
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold">{e.symbol}</span>
                      <span className="num mt-0.5 block text-xs text-muted-foreground">
                        {dividendText(e)} · closes {formatDate(e.date)}
                      </span>
                    </span>
                    <span className="num shrink-0 rounded-full bg-gain/15 px-2 py-0.5 text-[0.68rem] font-semibold text-gain">
                      Book close
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
