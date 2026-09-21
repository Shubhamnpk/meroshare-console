import type { YoWallet } from "./types";
import { YO_INITIAL_CASH } from "./types";

const KEY = "meroshare.yobroker.v1";

function keyFor(demat: string | null): string {
  const d = (demat ?? "").trim() || "anon";
  return `${KEY}:${d}`;
}

function emptyWallet(): YoWallet {
  return {
    cash: YO_INITIAL_CASH,
    holdings: [],
    orders: [],
    trades: [],
    active: false,
    createdAt: new Date().toISOString(),
    seq: 1,
  };
}

export function loadYoWallet(demat: string | null): YoWallet {
  try {
    const raw = localStorage.getItem(keyFor(demat));
    if (!raw) return emptyWallet();
    const j = JSON.parse(raw) as YoWallet;
    if (!j || typeof j.cash !== "number") return emptyWallet();
    return {
      cash: Number(j.cash) || YO_INITIAL_CASH,
      holdings: Array.isArray(j.holdings) ? j.holdings : [],
      orders: Array.isArray(j.orders) ? j.orders : [],
      trades: Array.isArray(j.trades) ? j.trades : [],
      active: Boolean(j.active),
      createdAt: String(j.createdAt ?? new Date().toISOString()),
      seq: Number(j.seq) || 1,
    };
  } catch {
    return emptyWallet();
  }
}

export function saveYoWallet(demat: string | null, w: YoWallet): void {
  try {
    localStorage.setItem(keyFor(demat), JSON.stringify(w));
    // notify other tabs / same-tab listeners
    window.dispatchEvent(new StorageEvent("storage", { key: keyFor(demat) }));
    window.dispatchEvent(new CustomEvent("yobroker:change"));
  } catch {
    // storage blocked
  }
}

export function isYoActive(demat: string | null): boolean {
  return loadYoWallet(demat).active;
}
