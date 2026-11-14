/** Digit grouping for every number the app prints: Nepali lakh/crore, US, or EU. */
export type NumberFormatMode = "np" | "us" | "eu";

const LOCALES: Record<NumberFormatMode, string> = {
  np: "en-IN", // latin digits, South Asian grouping: 1,23,45,678
  us: "en-US", // 12,345,678
  eu: "de-DE", // 12.345.678
};

/**
 * Active grouping, kept in sync with Settings by PrefsProvider. Module-level so
 * every `format*` helper (tables, charts, toasts, exports) picks it up without
 * each component wiring the preference again.
 */
let activeMode: NumberFormatMode = "np";
const FORMATTERS = new Map<string, Intl.NumberFormat>();

export function setNumberFormatMode(mode: NumberFormatMode): void {
  activeMode = mode;
}

export function getNumberFormatMode(): NumberFormatMode {
  return activeMode;
}

/** Locale string for a grouping mode (also used by amount inputs). */
export function numberFormatLocale(mode: NumberFormatMode = activeMode): string {
  return LOCALES[mode];
}

/** Cached formatter so grouping changes never rebuild on each cell. */
function nf(maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${activeMode}:${maximumFractionDigits}`;
  let formatter = FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALES[activeMode], { maximumFractionDigits });
    FORMATTERS.set(key, formatter);
  }
  return formatter;
}

/** At most 2 decimals, dropping a useless ".00" everywhere (universal rule). */
const num = (value: number) => nf(2).format(value);

/** Quantities keep whatever fraction they carry (0.4444 shares, not 0.44). */
const qty = (value: number) => nf(8).format(value);

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
    if (abs >= 1_00_00_00_00_000) return `रु ${num(n / 1_00_00_00_00_000)} Kharba`;
    if (abs >= 1_00_00_00_000) return `रु ${num(n / 1_00_00_00_000)} Arba`;
    if (abs >= 1_00_00_000) return `रु ${num(n / 1_00_00_000)} Cr`;
    if (abs >= 1_00_000) return `रु ${num(n / 1_00_000)} L`;
    if (abs >= 1_000) return `रु ${num(n / 1_000)} K`;
  }
  return `रु ${num(n)}`;
}

export function formatNumber(value: unknown): string {
  return num(toNumber(value));
}

/**
 * Currency symbol, not the code: £ not GBP, $ not USD. Unknown codes fall
 * back to the code itself so nothing ever renders blank.
 */
export function currencySymbol(ccy: string | null | undefined): string {
  // Pence first and case-sensitive: uppercasing "GBp" would collapse it into
  // pounds (a 100x error).
  const raw = (ccy ?? "").trim();
  if (raw === "GBX" || raw === "GBp") return "p";
  const c = raw.toUpperCase();
  if (c === "GBP") return "£";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "INR") return "₹";
  if (c === "NPR") return "रु";
  return c;
}

export function formatQty(value: unknown, opts?: { compact?: boolean }): string {
  const n = toNumber(value);
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_00_00_000) return `${num(n / 1_00_00_000)} Cr`;
    if (abs >= 1_00_000) return `${num(n / 1_00_000)} L`;
    if (abs >= 1_000) return `${num(n / 1_000)} K`;
  }
  // Units keep every decimal they carry (0.4444 stays 0.4444); money stays 2dp.
  return Number.isInteger(n) ? num(n) : qty(Number(n.toFixed(8)));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%";
  return `${value > 0 ? "+" : "-"}${num(Math.abs(value))}%`;
}

export function formatSignedNpr(value: number): string {
  return `${value >= 0 ? "+" : "-"}\u0930\u0941 ${num(Math.abs(value))}`;
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
  return error instanceof Error && (error.name === "SessionExpiredError" || /session has expired/i.test(error.message));
}
