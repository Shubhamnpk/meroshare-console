const NUM = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const NUM2 = new Intl.NumberFormat("en-IN", {
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
  if (opts?.compact && Math.abs(n) >= 1_00_000) {
    if (Math.abs(n) >= 1_00_00_000) return `\u0930\u0941 ${NUM2.format(n / 1_00_00_000)} Cr`;
    return `\u0930\u0941 ${NUM2.format(n / 1_00_000)} L`;
  }
  return `\u0930\u0941 ${NUM2.format(n)}`;
}

export function formatNumber(value: unknown): string {
  return NUM.format(toNumber(value));
}

export function formatQty(value: unknown): string {
  return NUM.format(Math.round(toNumber(value)));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0.00%";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

export function formatSignedNpr(value: number): string {
  return `${value >= 0 ? "+" : "-"}\u0930\u0941 ${NUM2.format(Math.abs(value))}`;
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
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
  if (!value) return "—";
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

export function daysUntil(value: unknown): number | null {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
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
