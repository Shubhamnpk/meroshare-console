// Public NEPSE UDF history — no auth, no broker session.
// Base verified 2026-09-08 via Playwright network capture on charts app.
const UDF_BASE = "https://api-charts.naasasecurities.com.np/api/v1/datafeed/1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type UdfResolution = "1" | "5" | "15" | "30" | "60" | "1D" | "1W" | "1M";
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";

export function udfResolutionFor(range: ChartRange): UdfResolution {
  switch (range) {
    case "1D":
      return "1";
    case "1W":
      return "15";
    case "1M":
      return "60";
    default:
      return "1D";
  }
}

export function toUnix(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

export interface UdfHistory {
  s: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

export interface UdfBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function udfToBars(h: UdfHistory): UdfBar[] {
  if (h.s !== "ok" || !h.t || !h.c) return [];
  return h.t.map((t, i) => ({
    time: t,
    open: h.o?.[i] ?? h.c![i]!,
    high: h.h?.[i] ?? h.c![i]!,
    low: h.l?.[i] ?? h.c![i]!,
    close: h.c![i]!,
    volume: h.v?.[i] ?? 0,
  }));
}

export async function fetchUdfHistory(params: {
  symbol: string;
  resolution: UdfResolution;
  from: number;
  to: number;
}): Promise<UdfHistory> {
  const q = new URLSearchParams({
    symbol: params.symbol.toUpperCase(),
    resolution: params.resolution,
    from: String(params.from),
    to: String(params.to),
  });
  const res = await fetch(`${UDF_BASE}/history?${q}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return { s: "no_data" };
  return (await res.json().catch(() => ({ s: "no_data" }))) as UdfHistory;
}

export async function fetchUdfSymbols(symbol: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${UDF_BASE}/symbols?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
    {
      headers: { "User-Agent": UA, Accept: "application/json" },
    },
  );
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}

export async function fetchUdfConfig(): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${UDF_BASE}/config`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as Record<string, unknown> | null;
}
