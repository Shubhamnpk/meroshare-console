// Daily NAV history for open-end (SIP) funds, from the open
// binayabaral/nepal-market-data dataset (MIT, updated daily from each AMC's own
// disclosure page). The community capitals API only keeps ~6 months of weekly
// NAV, which is useless for a multi-year SIP, so the long series comes from
// here and the capitals feed stays for prices, holdings and returns.
//
// One CSV per symbol, `published_date,nav`. Fetched server-side, cached in
// memory, stale copy served when GitHub is unreachable.
import type { MfNavPoint } from "./types";

const BASE = "https://raw.githubusercontent.com/binayabaral/nepal-market-data/main/data/sip-mutual-funds";
const TTL_MS = 6 * 60 * 60_000;
const EMPTY_TTL_MS = 30 * 60_000;
const UA = "meroshare-console (nav history)";

/** This app's scheme symbols vs the dataset's symbols, where they differ. */
const CSV_SYMBOL: Record<string, string> = {
  NMBSBFE: "NMBSBF",
  NICADF: "NADDF",
  NICAES: "NICAELIS",
};

interface CacheEntry {
  value: MfNavPoint[] | null;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MfNavPoint[] | null>>();

export function csvSymbolFor(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return CSV_SYMBOL[s] ?? s;
}

/** Parse the dataset CSV. Duplicate dates keep the last row; junk lines are dropped. */
export function parseNavCsv(text: string): MfNavPoint[] {
  const byDate = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !/^\d{4}-\d{2}-\d{2},/.test(line)) continue;
    const comma = line.indexOf(",");
    const date = line.slice(0, comma);
    const nav = Number(line.slice(comma + 1).split(",")[0]);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    byDate.set(date, nav);
  }
  return [...byDate.entries()]
    .map(([date, nav]) => ({ date, nav, adjNav: nav }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchCsv(symbol: string): Promise<MfNavPoint[] | null> {
  const url = `${BASE}/${encodeURIComponent(csvSymbolFor(symbol))}.csv`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const points = parseNavCsv(await res.text());
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

/**
 * Full daily NAV series for one fund, oldest first. Returns null when the fund
 * is not in the dataset; callers fall back to the live feed for the last few
 * months so a brand-new scheme still appears.
 */
export async function getSipNavHistory(symbol: string): Promise<MfNavPoint[] | null> {
  const key = csvSymbolFor(symbol);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = fetchCsv(symbol)
    .then((points) => {
      // A null result is cached briefly: a missing file should not be
      // re-fetched on every page view, but a fresh fund may appear later.
      cache.set(key, { value: points, expires: Date.now() + (points ? TTL_MS : EMPTY_TTL_MS) });
      return points;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, task);
  const fresh = await task;
  if (fresh) return fresh;

  // Stale beats empty: a GitHub outage should not blank the page.
  const stale = cache.get(key);
  return stale?.value ?? null;
}
