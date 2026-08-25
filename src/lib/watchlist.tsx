import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "ms.watchlist.v1";

interface WatchlistValue {
  symbols: string[];
  has: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
  remove: (symbol: string) => void;
  ready: boolean;
}

const WatchlistContext = createContext<WatchlistValue | null>(null);

/** Watchlist lives on the device only: no account, no server storage. */
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSymbols(parsed.filter((s): s is string => typeof s === "string"));
      }
    } catch {
      setSymbols([]);
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: string[]) => {
    setSymbols(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode); keep the in-memory list
    }
  }, []);

  const value = useMemo<WatchlistValue>(
    () => ({
      symbols,
      ready,
      has: (symbol: string) => symbols.includes(symbol.toUpperCase()),
      toggle: (symbol: string) => {
        const upper = symbol.toUpperCase();
        persist(symbols.includes(upper) ? symbols.filter((s) => s !== upper) : [...symbols, upper]);
      },
      remove: (symbol: string) => persist(symbols.filter((s) => s !== symbol.toUpperCase())),
    }),
    [symbols, ready, persist],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
