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
