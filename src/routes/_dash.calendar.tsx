import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { EmptyBlock } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ScripSheet } from "@/components/market/scrip-sheet";
import {
  currentIssuesQuery,
  dividendsQuery,
  enrichedPortfolioQuery,
  holdingSymbolsQuery,
} from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { statusGroup } from "@/lib/ipo/status";
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
import { canonicalSymbol } from "@/lib/nepse/aliases";
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

type CalKind = "announce" | "bookclose" | "ipo_open" | "ipo_close" | "ipo_upcoming";

interface CalEvent {
  key: string;
  date: Date;
  symbol: string;
  kind: CalKind;
  bonus: number;
  cash: number;
  fy: string | null;
  mine: boolean;
  /** IPO-only fields: present when kind starts with "ipo_" */
  companyName?: string;
  ipoLabel?: string | null;
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
  ipo_open: {
    dot: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    label: "IPO opens",
  },
  ipo_close: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    label: "IPO closes",
  },
  ipo_upcoming: {
    dot: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    label: "IPO upcoming",
  },
};

function dividendText(e: CalEvent): string {
  if (e.kind.startsWith("ipo_")) {
    const parts: string[] = [];
    if (e.ipoLabel) parts.push(e.ipoLabel);
    if (e.companyName && e.companyName !== e.symbol) parts.push(e.companyName);
    return parts.join(" · ") || e.symbol;
  }
  const parts: string[] = [];
  if (e.bonus > 0) parts.push(`${e.bonus}% bonus`);
  if (e.cash > 0) parts.push(`${e.cash}% cash`);
  return parts.join(" + ") || "Dividend";
}

function ipoTypeLabel(issue: {
  shareTypeName?: string | null;
  shareGroupName?: string | null;
}): string | null {
  const hay = `${issue.shareTypeName ?? ""} ${issue.shareGroupName ?? ""}`;
  if (/right/i.test(hay)) return "Right";
  if (/fpo/i.test(hay)) return "FPO";
  if (/\bipo\b/i.test(hay)) return "IPO";
  if (/mutual|fund/i.test(hay)) return "Fund";
  if (/debenture|bond/i.test(hay)) return "Bond";
  if (/auction/i.test(hay)) return "Auction";
  return null;
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
            className="px-1 py-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground sm:py-2 sm:text-[0.68rem]"
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
                "flex min-h-[62px] flex-col items-stretch gap-1 border-b border-r border-border/40 p-1 text-left transition-colors last:border-r-0 hover:bg-muted/40 sm:min-h-[92px] sm:p-2",
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
  const [bsCursor, setBsCursor] = useState<BsDate>(bsNow ?? { y: 2083, m: 5, d: 1 });
  const [selected, setSelected] = useState<Date>(now);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // Bottom panels: side-by-side on desktop, tabbed on mobile to avoid scrolling.
  const [panel, setPanel] = useState<"day" | "upcoming">("day");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedTab, setPickedTab] = useState<string | null>(null);
  const navigate = Route.useNavigate();

  const dividends = useQuery(dividendsQuery());
  const holdingSymbols = useQuery(holdingSymbolsQuery());
  const portfolio = useQuery(enrichedPortfolioQuery());
  const ipoIssues = useQuery(currentIssuesQuery());
  const focusCanonical = useMemo(
    () => (focusSymbol ? canonicalSymbol(focusSymbol) : ""),
    [focusSymbol],
  );
  // Dashboard's "My holdings" uses enrichedPortfolio holdings, which is more
  // reliable than the dedicated symbols endpoint (myPurchase/myShare/ is
  // frequently gated by CDSC's WAF). Merge both so whichever succeeds wins.
  const held = useMemo(() => {
    const fromSymbols = (holdingSymbols.data ?? []).map((s) => canonicalSymbol(s)).filter(Boolean);
    const fromPortfolio = (portfolio.data?.holdings ?? [])
      .map((h) => canonicalSymbol(h.scrip))
      .filter(Boolean);
    return new Set([...fromSymbols, ...fromPortfolio]);
  }, [holdingSymbols.data, portfolio.data]);

  const events = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const div of dividends.data ?? []) {
      const raw = String(div.symbol ?? "").trim();
      if (!raw) continue;
      const symbol = raw.toUpperCase();
      const canon = canonicalSymbol(symbol);
      if (focusCanonical && canon !== focusCanonical) continue;
      const mine = held.has(canon);
      if (!focusCanonical && scope === "mine" && !mine) continue;
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
    // IPO open / upcoming: shown regardless of holdings scope, but still
    // respects the symbol filter so `?symbol=XYZ` focuses the calendar.
    for (const issue of ipoIssues.data ?? []) {
      const rawSym = String(issue.scrip ?? "").trim();
      const symbol = rawSym
        ? rawSym.toUpperCase()
        : String(issue.companyName ?? "")
            .trim()
            .slice(0, 12)
            .toUpperCase() || "IPO";
      if (focusCanonical && canonicalSymbol(symbol) !== focusCanonical) continue;
      const companyName = String(issue.companyName ?? symbol).trim() || symbol;
      const ipoLabel = ipoTypeLabel(issue);
      const group = statusGroup(issue);
      const open = parseFeedDate(issue.issueOpenDate);
      const close = parseFeedDate(issue.issueCloseDate);
      const pushIpo = (date: Date | null, kind: CalKind) => {
        if (!date) return;
        const key = adKey(date);
        const list = map.get(key) ?? [];
        const k = `${kind}-${symbol}-${key}-${companyName.slice(0, 8)}`;
        list.push({
          key: k,
          date,
          symbol,
          kind,
          bonus: 0,
          cash: 0,
          fy: null,
          mine: false,
          companyName,
          ipoLabel,
        });
        map.set(key, list);
      };
      if (group === "open") {
        pushIpo(open, "ipo_open");
        pushIpo(close, "ipo_close");
      } else if (group === "upcoming") {
        pushIpo(open, "ipo_upcoming");
      }
    }
    const order: Record<CalKind, number> = {
      bookclose: 0,
      announce: 1,
      ipo_close: 2,
      ipo_open: 3,
      ipo_upcoming: 4,
    };
    for (const list of map.values())
      list.sort((a, b) => (order[a.kind] ?? 99) - (order[b.kind] ?? 99));
    return map;
  }, [dividends.data, ipoIssues.data, held, scope, focusCanonical]);

  const eventsOf = (key: string) => events.get(key) ?? [];
  const todayKey = adKey(now);
  const selectedKey = adKey(selected);
  const selectedEvents = eventsOf(selectedKey);

  const upcoming = useMemo(() => {
    const out: CalEvent[] = [];
    for (const list of events.values())
      for (const e of list) {
        if (
          e.kind === "bookclose" &&
          e.date.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        )
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
    const cells: {
      key: string;
      primary: number;
      secondary: string | null;
      inMonth: boolean;
      date: Date;
    }[] = [];
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
    const cells: {
      key: string;
      primary: number;
      secondary: string | null;
      inMonth: boolean;
      date: Date;
    }[] = [];
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
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else void navigate({ to: "/dashboard" });
          }}
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold sm:text-3xl">
          <CalendarDays className="size-6 text-primary" /> Calendar
        </h1>
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
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
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
                scope === v
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
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
          {view === "bs" ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">{bsTitleNe}</span>
          ) : null}
        </h2>
        <p className="num mt-0.5 text-xs text-muted-foreground">{view === "ad" ? adSub : bsSub}</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-3">
          <MonthGrid
            cells={view === "ad" ? adCells : bsCells}
            selectedKey={selectedKey}
            todayKey={todayKey}
            onSelect={(d) => {
              setSelected(d);
              setPanel("day");
            }}
            eventsOf={eventsOf}
          />

          <div className="rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-semibold">Dividends</p>
                <div className="space-y-1.5">
                  <span className="flex items-start gap-2.5 text-xs leading-snug">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-gain" aria-hidden />
                    <span>
                      <span className="font-semibold">Book close</span>: record date; your holdings
                      get a{" "}
                      <span className="rounded bg-primary/10 px-1 py-0.5 text-[0.60rem] font-semibold text-primary">
                        Holding
                      </span>{" "}
                      badge
                    </span>
                  </span>
                  <span className="flex items-start gap-2.5 text-xs leading-snug">
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-full bg-amber-500"
                      aria-hidden
                    />
                    <span>
                      <span className="font-semibold">Announced</span>: board declares bonus / cash
                    </span>
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold">IPOs</p>
                <div className="space-y-1.5">
                  <span className="flex items-start gap-2.5 text-xs leading-snug">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-sky-500" aria-hidden />
                    <span>
                      <span className="font-semibold">IPO opens</span>: subscription starts
                    </span>
                  </span>
                  <span className="flex items-start gap-2.5 text-xs leading-snug">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
                    <span>
                      <span className="font-semibold">IPO closes</span>: last day to apply
                    </span>
                  </span>
                  <span className="flex items-start gap-2.5 text-xs leading-snug">
                    <span
                      className="mt-1 size-2.5 shrink-0 rounded-full bg-violet-500"
                      aria-hidden
                    />
                    <span>
                      <span className="font-semibold">Upcoming</span>: announced future IPO
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <p className="num mt-3 border-t border-border/40 pt-2 text-[0.62rem] leading-snug text-muted-foreground">
              Tap any day to see details ·{" "}
              {view === "ad" ? "BS date under each AD day" : "AD date under each BS day"} ·{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-gain" /> dividends
              </span>{" "}
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-sky-500" /> IPOs
              </span>
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex rounded-full border border-border/70 bg-card p-1 sm:hidden">
            {(
              [
                { key: "day", label: "Selected day", count: selectedEvents.length },
                { key: "upcoming", label: "Upcoming", count: upcoming.length },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPanel(t.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  panel === t.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "num rounded-full px-1.5 py-0.5 text-[0.65rem]",
                    panel === t.key ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <section className={cn("space-y-2", panel === "day" ? "" : "hidden sm:block")}>
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
                <EmptyBlock title="No events" description="No activity on this day." />
              ) : (
                <ul className="space-y-2">
                  {selectedEvents.map((e) => {
                    const isIpo = e.kind.startsWith("ipo_");
                    const handleClick = () => {
                      if (isIpo) {
                        const tab = e.kind === "ipo_upcoming" ? "calendar" : "apply";
                        void navigate({ to: "/ipo", search: { tab } });
                      } else {
                        setPicked(e.symbol);
                        setPickedTab("dividend");
                      }
                    };
                    return (
                      <li
                        key={e.key}
                        role="button"
                        tabIndex={0}
                        onClick={handleClick}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            handleClick();
                          }
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <span
                          className={cn(
                            "num flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            KIND_STYLE[e.kind].badge,
                          )}
                        >
                          {isIpo
                            ? (e.companyName ?? e.symbol).slice(0, 2).toUpperCase()
                            : e.symbol.slice(0, 2)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">
                              {isIpo ? (e.companyName ?? e.symbol) : e.symbol}
                            </span>
                            <span
                              className={cn(
                                "num rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
                                KIND_STYLE[e.kind].badge,
                              )}
                            >
                              {KIND_STYLE[e.kind].label}
                            </span>
                            {!isIpo && e.mine ? (
                              <span className="num rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                                Holding
                              </span>
                            ) : null}
                            {isIpo && e.ipoLabel ? (
                              <span className="num rounded-full border border-border/70 px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
                                {e.ipoLabel}
                              </span>
                            ) : null}
                            {isIpo && e.symbol && e.companyName !== e.symbol ? (
                              <span className="num text-xs text-muted-foreground">{e.symbol}</span>
                            ) : null}
                          </span>
                          <span className="num mt-0.5 block text-xs text-muted-foreground">
                            {dividendText(e)}
                            {!isIpo && e.fy ? ` · FY ${e.fy}` : ""}
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
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={cn("space-y-2", panel === "upcoming" ? "" : "hidden sm:block")}>
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
                          setPanel("day");
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
      </div>
      <ScripSheet
        symbol={picked}
        initialTab={pickedTab}
        onOpenChange={(open) => {
          if (!open) {
            setPicked(null);
            setPickedTab(null);
          }
        }}
      />
    </div>
  );
}
