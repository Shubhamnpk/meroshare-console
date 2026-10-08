const NUM = new Intl.NumberFormat("en-NP", { maximumFractionDigits: 2 });
const NUM2 = new Intl.NumberFormat("en-NP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatNpr(value: unknown, opts?: { compact?: boolean }): string {
  const n = toNumber(value);
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_00_00_00_00_000) return `\u0930\u0941 ${NUM2.format(n / 1_00_00_00_00_000)} Kharba`;
    if (abs >= 1_00_00_00_000) return `\u0930\u0941 ${NUM2.format(n / 1_00_00_00_000)} Arba`;
    if (abs >= 1_00_00_000) return `\u0930\u0941 ${NUM2.format(n / 1_00_00_000)} Cr`;
    if (abs >= 1_00_000) return `\u0930\u0941 ${NUM2.format(n / 1_00_000)} L`;
    if (abs >= 1_000) return `\u0930\u0941 ${NUM2.format(n / 1_000)} K`;
  }
  return `\u0930\u0941 ${NUM2.format(n)}`;
}

export function formatNumber(value: unknown): string {
  return NUM.format(toNumber(value));
}

export function formatQty(value: unknown, opts?: { compact?: boolean }): string {
  const n = toNumber(value);
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_00_00_000) return `${NUM.format(n / 1_00_00_000)} Cr`;
    if (abs >= 1_00_000) return `${NUM.format(n / 1_00_000)} L`;
    if (abs >= 1_000) return `${NUM.format(n / 1_000)} K`;
  }
  return NUM.format(Math.round(n));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0.00%";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

export function formatSignedNpr(value: number): string {
  return `${value >= 0 ? "+" : "-"}\u0930\u0941 ${NUM2.format(Math.abs(value))}`;
}

export function formatDate(value: unknown): string {
  if (!value) return "-";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: unknown): string {
  if (!value) return "-";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2:30 PM" from an ISO timestamp, or null when the value carries no time part. */
export function formatTimeOfDay(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  if (!/[T ]\d/.test(raw)) return null;
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Exact holding age for per-lot rows: precise days under a month, then a
 * month+day breakdown — so two lots inside the same month still read apart.
 */
export function formatPreciseAge(days: number): string {
  if (!Number.isFinite(days) || days < 0) return "-";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    const r = days % 30;
    return r === 0 ? `${m} mo` : `${m} mo ${r} d`;
  }
  const y = Math.floor(days / 365);
  const rem = days % 365;
  const m = Math.floor(rem / 30);
  const r = rem % 30;
  const tail = m > 0 ? (r > 0 ? ` ${m} mo ${r} d` : ` ${m} mo`) : r > 0 ? ` ${r} d` : "";
  return `${y} yr${tail}`;
}

/**
 * Relative session age like the home NEPSE header: "today" while the market
 * is open, otherwise "1 day ago · 12 Sep 2026", "3 days ago · …", or
 * "closed" when there is no session timestamp at all.
 */
export function sessionAgeLabel(raw: unknown, isOpen: boolean): string {
  if (isOpen) return "today";
  if (raw == null || raw === "") return "closed";
  const d = new Date(String(raw).replace(" ", "T"));
  const dateStr = formatDate(raw);
  if (Number.isNaN(d.getTime())) return `${dateStr} · closed`;
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const gen0 = new Date(d);
  gen0.setHours(0, 0, 0, 0);
  const diff = Math.round((today0.getTime() - gen0.getTime()) / 86_400_000);
  if (diff <= 0) return `${dateStr} · closed`;
  if (diff === 1) return `1 day ago · ${dateStr}`;
  return `${diff} days ago · ${dateStr}`;
}

export function daysUntil(value: unknown): number | null {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export function formatHoldingTime(days: number): string {
  if (!Number.isFinite(days) || days < 0) return "-";
  if (days === 0) return "today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return `${w} week${w === 1 ? "" : "s"}`;
  }
  if (days < 365) {
    const m = Math.round(days / 30);
    return `${m} month${m === 1 ? "" : "s"}`;
  }
  const y = Math.floor(days / 365);
  const rem = days % 365;
  if (rem >= 30) {
    const m = Math.round(rem / 30);
    return m > 0 ? `${y} year${y === 1 ? "" : "s"} ${m} month${m === 1 ? "" : "s"}` : `${y} year${y === 1 ? "" : "s"}`;
  }
  return `${y} year${y === 1 ? "" : "s"}`;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) {
    const msg = error.message;
    if (msg.length > 200) return fallback;
    return msg;
  }
  return fallback;
}

export function isSessionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "SessionExpiredError" || /session has expired/i.test(error.message))
  );
}
