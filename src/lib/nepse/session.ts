/** NEPSE trading session clock: Monday–Friday, 11:00 AM – 3:00 PM NPT (since Apr 2026). */

const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;
const OPEN_MIN = 11 * 60;
const CLOSE_MIN = 15 * 60;

export interface NepseSession {
  open: boolean;
  /** Until the next 11:00 AM session ("3h 49m", "2 days"); null while open. */
  opensIn: string | null;
}

function formatWait(diffMs: number): string {
  const mins = Math.max(1, Math.round(diffMs / 60_000));
  if (mins >= 2880) return `${Math.round(mins / 1440)} days`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function getNepseSession(nowMs = Date.now()): NepseSession {
  const nptMs = nowMs + NPT_OFFSET_MS;
  const npt = new Date(nptMs);
  const day = npt.getUTCDay();
  const mins = npt.getUTCHours() * 60 + npt.getUTCMinutes();
  // getUTCDay: Sun = 0 … Sat = 6. NEPSE rests Sat (6) and Sun (0).
  if (day >= 1 && day <= 5 && mins >= OPEN_MIN && mins < CLOSE_MIN) return { open: true, opensIn: null };

  const midnightNpt = nptMs - (mins * 60 + npt.getUTCSeconds()) * 1000;
  for (let off = 0; off < 8; off++) {
    const d = (day + off) % 7;
    if (d === 0 || d === 6) continue;
    if (off === 0 && mins >= OPEN_MIN) continue;
    const target = midnightNpt + off * 86_400_000 + OPEN_MIN * 60_000 - NPT_OFFSET_MS;
    if (target > nowMs) return { open: false, opensIn: formatWait(target - nowMs) };
  }
  return { open: false, opensIn: null };
}
