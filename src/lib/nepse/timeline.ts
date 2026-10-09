// Pure, client-safe helpers for demat movement timelines.
// Kept outside of any `.server` module so the browser can reuse the same
// carry-forward math for things like "dividend cash on the units you held then".

export interface UnitSnapshot {
  time: number;
  units: number;
}

/**
 * Parse a MeroShare `transactionDate` string into a unix-epoch second value.
 * NEPSE/CDSC dates are NPT (UTC+05:45); date-only values are treated as NPT.
 */
export function parseNptEpoch(date: string | null | undefined): number | null {
  if (!date) return null;
  const s = String(date).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/i.exec(s);
  if (!m) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t / 1000 : null;
  }
  if (!m[4]) return Date.parse(`${s}T00:00:00+05:45`) / 1000;
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(m[4])) return Date.parse(`${s}+05:45`) / 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t / 1000 : null;
}

/** Units you physically held at or before `cutoffEpoch`, from chronological snapshots. */
export function unitsHeldAt(snapshots: UnitSnapshot[], cutoffEpoch: number): number {
  let units = 0;
  for (const s of snapshots) {
    if (s.time <= cutoffEpoch) units = s.units;
    else break;
  }
  return units;
}

/** Minimal dividend shape for 5-year averaging (structural — DividendRow fits). */
export interface DatedDividend {
  announcementDate: string | null;
  cashDividend: number;
  totalDividend: number;
}

function inLast5Years(date: string | null, cutoffMs: number): boolean {
  if (date == null) return false;
  const t = Date.parse(date.replace(" ", "T"));
  return !Number.isNaN(t) && t >= cutoffMs;
}

function cutoff5yMs(): number {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.getTime();
}

/**
 * Calendar 5-year average cash dividend (percent units): only announcements
 * inside the actual last 5 years count, spread over 5 — stale payouts and
 * gap years can't fake a fresh yield. Null when nothing paid is in-window.
 */
export function avgCashLast5Y(rows: DatedDividend[]): number | null {
  const cutoffMs = cutoff5yMs();
  const paid = rows.filter(
    (d) => d.cashDividend > 0 && inLast5Years(d.announcementDate, cutoffMs),
  );
  if (paid.length === 0) return null;
  return paid.reduce((s, d) => s + d.cashDividend, 0) / 5;
}

/** Same calendar window for total (cash + bonus) dividends. */
export function avgTotalLast5Y(rows: DatedDividend[]): number | null {
  const cutoffMs = cutoff5yMs();
  const paid = rows.filter(
    (d) => d.totalDividend > 0 && inLast5Years(d.announcementDate, cutoffMs),
  );
  if (paid.length === 0) return null;
  return paid.reduce((s, d) => s + d.totalDividend, 0) / 5;
}

/** Unix-epoch seconds at the start of a "YYYY-MM" month in NPT. */
export function monthStartEpoch(month: string): number {
  return Math.floor(Date.parse(`${month}-01T00:00:00+05:45`) / 1000);
}

/** "YYYY-MM" for a given epoch, in NPT. */
export function monthKeyFromEpoch(epoch: number): string {
  const dt = new Date((epoch + 20700) * 1000);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
