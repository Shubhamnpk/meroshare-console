import { useEffect, useState } from "react";
import type { GlobalTxn } from "./import";

/**
 * Device-local Global (non-NEPSE) data: imported transactions only.
 * Same bucket pattern as the Yo Broker wallet — never merged with demat.
 */
const KEY = "meroshare.global.v1";

export interface GlobalHolding {
  symbol: string;
  name: string;
  isin: string;
  currency: string;
  qty: number;
  /** Native average cost per share (average-cost pools). */
  avgPrice: number;
  /** GBP average cost per share, when every lot stated GBP (else null). */
  avgGbp: number | null;
}

interface GlobalStore {
  txns: GlobalTxn[];
  updatedAt: string;
}

function emptyStore(): GlobalStore {
  return { txns: [], updatedAt: new Date(0).toISOString() };
}

export function loadGlobalTxns(): GlobalTxn[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GlobalStore;
    return Array.isArray(parsed.txns) ? parsed.txns : [];
  } catch {
    return [];
  }
}

function persist(txns: GlobalTxn[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ txns, updatedAt: new Date().toISOString() }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    window.dispatchEvent(new CustomEvent("global:change"));
  } catch {
    // storage blocked
  }
}

/** Append imported rows, skipping duplicate broker IDs. Returns added count. */
export function appendGlobalTxns(rows: GlobalTxn[]): number {
  const existing = new Set(loadGlobalTxns().map((t) => t.id));
  const fresh = rows.filter((r) => !existing.has(r.id));
  if (fresh.length > 0) persist([...loadGlobalTxns(), ...fresh]);
  return fresh.length;
}

/** Replace the whole set (fresh file import). */
export function replaceGlobalTxns(rows: GlobalTxn[]): void {
  persist(rows);
}

/** Patch one row by broker ID (edit dialog). Cost fields scale with qty*price. */
export function updateGlobalTxn(
  id: string,
  patch: Partial<Pick<GlobalTxn, "qty" | "price" | "date" | "notes">>,
): boolean {
  const txns = loadGlobalTxns();
  const idx = txns.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const cur = txns[idx]!;
  const qty = patch.qty ?? cur.qty;
  const price = patch.price ?? cur.price;
  const oldNative = cur.qty * cur.price;
  const residualFees = cur.costNative - (oldNative > 0 ? oldNative : 0);
  const costNative = qty * price + Math.max(0, residualFees);
  txns[idx] = {
    ...cur,
    qty,
    price,
    date: patch.date ?? cur.date,
    notes: patch.notes ?? cur.notes,
    costNative,
    costGbp: cur.costGbp != null ? cur.costGbp * (oldNative > 0 ? costNative / Math.max(oldNative, 1e-9) : 1) : null,
  };
  persist(txns);
  return true;
}

/** Delete one row by broker ID. Returns true when something was removed. */
export function deleteGlobalTxn(id: string): boolean {
  const txns = loadGlobalTxns();
  const kept = txns.filter((t) => t.id !== id);
  if (kept.length === txns.length) return false;
  persist(kept);
  return true;
}

export function clearGlobalTxns(): void {
  persist([]);
}

/** Average-cost holdings derived from buys/sells. DIV/CASH never enter pools. */
export function deriveHoldings(txns: GlobalTxn[]): GlobalHolding[] {
  const pools = new Map<
    string,
    {
      qty: number;
      costNative: number;
      costGbp: number;
      gbpKnown: boolean;
      name: string;
      isin: string;
      currency: string;
    }
  >();
  const ordered = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of ordered) {
    if (t.side !== "BUY" && t.side !== "SELL") continue;
    const key = t.symbol.toUpperCase();
    if (!key) continue;
    let pool = pools.get(key);
    if (!pool) {
      pool = { qty: 0, costNative: 0, costGbp: 0, gbpKnown: true, name: t.name, isin: t.isin, currency: t.currency };
      pools.set(key, pool);
    }
    if (t.name) pool.name = t.name;
    if (t.side === "BUY") {
      pool.qty += t.qty;
      pool.costNative += t.costNative;
      if (t.costGbp != null) pool.costGbp += t.costGbp;
      else pool.gbpKnown = false;
    } else {
      if (pool.qty <= 0) continue;
      const take = Math.min(t.qty, pool.qty);
      const avgN = pool.costNative / pool.qty;
      const avgG = pool.costGbp / pool.qty;
      pool.qty -= take;
      pool.costNative -= avgN * take;
      pool.costGbp -= avgG * take;
    }
  }
  const out: GlobalHolding[] = [];
  for (const [symbol, p] of pools) {
    if (!(p.qty > 0)) continue;
    out.push({
      symbol,
      name: p.name,
      isin: p.isin,
      currency: p.currency,
      qty: p.qty,
      avgPrice: p.costNative / p.qty,
      avgGbp: p.gbpKnown ? p.costGbp / p.qty : null,
    });
  }
  return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Live view of the device store; refreshes on import/clear across tabs. */
export function useGlobalTxns(): GlobalTxn[] {
  const [txns, setTxns] = useState<GlobalTxn[]>(() => loadGlobalTxns());
  useEffect(() => {
    const refresh = () => setTxns(loadGlobalTxns());
    window.addEventListener("global:change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("global:change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return txns;
}
