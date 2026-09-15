import { useCallback, useEffect, useState } from "react";

// Local price alerts: no broker mutation, no credentials. The user sets
// "tell me when NABIL crosses 550" and any panel watching live prices fires
// a toast + bell badge. Persisted in localStorage, per device.

export interface PriceAlert {
  id: string;
  symbol: string;
  target: number;
  direction: "above" | "below";
  createdAt: string;
  /** Set once the alert has fired (stays until removed or reset). */
  hitAt: string | null;
}

const KEY = "meroshare.price-alerts.v1";

function load(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a): a is PriceAlert => typeof a === "object" && a !== null)
      .map((a) => ({
        id: String(a.id ?? Math.random().toString(36).slice(2)),
        symbol: String(a.symbol ?? "").toUpperCase(),
        target: Number(a.target),
        direction: (a.direction === "below" ? "below" : "above") as "above" | "below",
        createdAt: String(a.createdAt ?? new Date().toISOString()),
        hitAt: typeof a.hitAt === "string" ? a.hitAt : null,
      }))
      .filter((a) => a.symbol !== "" && Number.isFinite(a.target) && a.target > 0);
  } catch {
    return [];
  }
}

function persist(alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts));
  } catch {
    // storage full/blocked — alerts just won't survive reload
  }
}

/** True when the live price has crossed the alert line. */
export function isAlertHit(alert: PriceAlert, ltp: number | null | undefined): boolean {
  if (ltp == null || !Number.isFinite(ltp)) return false;
  return alert.direction === "above" ? ltp >= alert.target : ltp <= alert.target;
}

export function usePriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>(() =>
    typeof window === "undefined" ? [] : load(),
  );

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setAlerts(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: PriceAlert[]) => {
    setAlerts(next);
    persist(next);
  }, []);

  const add = useCallback(
    (symbol: string, target: number, direction: "above" | "below"): PriceAlert | null => {
      const sym = symbol.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,24}$/.test(sym)) return null;
      if (!Number.isFinite(target) || target <= 0 || target > 1_000_000) return null;
      const alert: PriceAlert = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        symbol: sym,
        target,
        direction,
        createdAt: new Date().toISOString(),
        hitAt: null,
      };
      const next = [alert, ...load()].slice(0, 50);
      update(next);
      return alert;
    },
    [update],
  );

  const remove = useCallback((id: string) => update(load().filter((a) => a.id !== id)), [update]);

  const reset = useCallback(
    (id: string) => update(load().map((a) => (a.id === id ? { ...a, hitAt: null } : a))),
    [update],
  );

  const markHit = useCallback(
    (id: string) =>
      update(
        load().map((a) =>
          a.id === id && !a.hitAt ? { ...a, hitAt: new Date().toISOString() } : a,
        ),
      ),
    [update],
  );

  return { alerts, add, remove, reset, markHit };
}
