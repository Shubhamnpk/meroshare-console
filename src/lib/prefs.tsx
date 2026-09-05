// Unified client-only preferences: theme, display, sidebar, terminal, watchlist.
// All persisted in a single localStorage key (ms-prefs.v1).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemePref = "light" | "dark" | "system";
export type ColorTheme = "teal" | "blue" | "purple" | "green" | "orange" | "pink";

export const COLOR_OPTIONS: { value: ColorTheme; label: string; swatch: string }[] = [
  { value: "teal", label: "Teal", swatch: "oklch(0.76 0.145 168)" },
  { value: "blue", label: "Blue", swatch: "oklch(0.76 0.145 235)" },
  { value: "purple", label: "Purple", swatch: "oklch(0.76 0.145 280)" },
  { value: "green", label: "Green", swatch: "oklch(0.76 0.145 150)" },
  { value: "orange", label: "Orange", swatch: "oklch(0.76 0.145 30)" },
  { value: "pink", label: "Pink", swatch: "oklch(0.76 0.145 340)" },
];

export interface TerminalState {
  symbol: string;
  range: string;
  style: string;
  indicators: Record<string, boolean>;
  logScale: boolean;
}

export interface Prefs {
  // Display
  theme: ThemePref;
  colorTheme: ColorTheme;
  compactNumbers: boolean;
  autoRefresh: boolean;
  refreshMinutes: number;
  // Sidebar
  sidebarCollapsed: boolean;
  // Terminal
  terminal: TerminalState;
  // Watchlist
  watchlist: string[];
}

export interface PrefsApi extends Prefs {
  passwordOpen: boolean;
  pinOpen: boolean;
  // Display setters
  setTheme: (theme: ThemePref) => void;
  setColorTheme: (color: ColorTheme) => void;
  setCompactNumbers: (value: boolean) => void;
  setAutoRefresh: (value: boolean) => void;
  setRefreshMinutes: (minutes: number) => void;
  // Sidebar
  setSidebarCollapsed: (collapsed: boolean) => void;
  // Terminal
  setTerminal: (state: TerminalState) => void;
  // Watchlist
  toggleWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  hasInWatchlist: (symbol: string) => boolean;
  // Modal helpers
  openPassword: () => void;
  closePassword: () => void;
  openPin: () => void;
  closePin: () => void;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ms-prefs.v1";

// Legacy keys to migrate from and delete
const LEGACY_KEYS = {
  settings: "ms-settings",
  theme: "ms-theme",
  sidebar: "meroshare.sidebar-collapsed.v1",
  terminal: "meroshare.terminal.v1",
  watchlist: "ms.watchlist.v1",
} as const;

const DEFAULT_TERMINAL: TerminalState = {
  symbol: "NABIL",
  range: "1Y",
  style: "candles",
  indicators: { sma: true, ema: false, bb: false, vwap: false, rsi: false, macd: false },
  logScale: false,
};

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  colorTheme: "teal",
  compactNumbers: false,
  autoRefresh: true,
  refreshMinutes: 5,
  sidebarCollapsed: false,
  terminal: DEFAULT_TERMINAL,
  watchlist: [],
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode)
  }
}

function removeKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Migrate legacy keys into the unified key, then delete the old ones. */
function migrateLegacy(prefs: Prefs): Prefs {
  const next = { ...prefs };

  // ms-settings -> theme/colorTheme/compactNumbers/autoRefresh/refreshMinutes
  const old = readJson<{
    theme?: ThemePref;
    colorTheme?: ColorTheme;
    compactNumbers?: boolean;
    autoRefresh?: boolean;
    refreshMinutes?: number;
  }>(LEGACY_KEYS.settings);
  if (old) {
    if (!next.theme || next.theme === DEFAULT_PREFS.theme) {
      if (old.theme) next.theme = old.theme;
    }
    if (old.colorTheme) next.colorTheme = old.colorTheme;
    if (old.compactNumbers != null) next.compactNumbers = old.compactNumbers;
    if (old.autoRefresh != null) next.autoRefresh = old.autoRefresh;
    if (old.refreshMinutes != null) next.refreshMinutes = old.refreshMinutes;
  }

  // ms-theme (legacy single-value theme)
  const legacyTheme = window.localStorage.getItem(LEGACY_KEYS.theme);
  if (!old && (legacyTheme === "light" || legacyTheme === "dark")) {
    next.theme = legacyTheme;
  }

  // meroshare.sidebar-collapsed.v1
  const sidebarRaw = window.localStorage.getItem(LEGACY_KEYS.sidebar);
  if (sidebarRaw === "1") next.sidebarCollapsed = true;
  else if (sidebarRaw === "0") next.sidebarCollapsed = false;

  // meroshare.terminal.v1
  const term = readJson<Partial<TerminalState>>(LEGACY_KEYS.terminal);
  if (term) {
    next.terminal = {
      ...DEFAULT_TERMINAL,
      ...term,
      indicators: { ...DEFAULT_TERMINAL.indicators, ...(term.indicators ?? {}) },
    };
  }

  // ms.watchlist.v1
  const wl = readJson<unknown>(LEGACY_KEYS.watchlist);
  if (Array.isArray(wl)) {
    next.watchlist = wl.filter((s): s is string => typeof s === "string");
  }

  // Delete legacy keys after migration
  removeKey(LEGACY_KEYS.settings);
  removeKey(LEGACY_KEYS.theme);
  removeKey(LEGACY_KEYS.sidebar);
  removeKey(LEGACY_KEYS.terminal);
  removeKey(LEGACY_KEYS.watchlist);

  return next;
}

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const stored = readJson<Partial<Prefs>>(STORAGE_KEY);
    const base = stored ? { ...DEFAULT_PREFS, ...stored } : { ...DEFAULT_PREFS };
    // Only migrate if legacy keys still exist
    const hasLegacy = Object.values(LEGACY_KEYS).some(
      (k) => window.localStorage.getItem(k) !== null,
    );
    if (hasLegacy) return migrateLegacy(base);
    return base;
  } catch {
    return DEFAULT_PREFS;
  }
}

// ---------------------------------------------------------------------------
// Theme helpers (exported for inline script in __root.tsx)
// ---------------------------------------------------------------------------

export function applyTheme(theme: ThemePref) {
  if (typeof document === "undefined") return;
  const light =
    theme === "light" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", light);
}

export function applyColorTheme(color: ColorTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-color", color);
}

/** Read just theme/colorTheme for the inline <script> in __root.tsx (before React hydrates). */
export function readThemeForInline(): { theme: ThemePref; colorTheme: ColorTheme } {
  if (typeof window === "undefined") return { theme: "system", colorTheme: "teal" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Check legacy ms-settings
      const legacy = window.localStorage.getItem(LEGACY_KEYS.settings);
      if (legacy) {
        const p = JSON.parse(legacy) as Partial<Prefs>;
        return { theme: p.theme ?? "system", colorTheme: p.colorTheme ?? "teal" };
      }
      return { theme: "system", colorTheme: "teal" };
    }
    const p = JSON.parse(raw) as Partial<Prefs>;
    return { theme: p.theme ?? "system", colorTheme: p.colorTheme ?? "teal" };
  } catch {
    return { theme: "system", colorTheme: "teal" };
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PrefsContext = createContext<PrefsApi | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  // Apply theme + persist on every change
  useEffect(() => {
    applyTheme(prefs.theme);
    applyColorTheme(prefs.colorTheme);
    const {
      theme,
      colorTheme,
      compactNumbers,
      autoRefresh,
      refreshMinutes,
      sidebarCollapsed,
      terminal,
      watchlist,
    } = prefs;
    writeJson(STORAGE_KEY, {
      theme,
      colorTheme,
      compactNumbers,
      autoRefresh,
      refreshMinutes,
      sidebarCollapsed,
      terminal,
      watchlist,
    });
  }, [prefs]);

  // Listen for system theme changes when theme is "system"
  useEffect(() => {
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.theme]);

  // Watchlist helpers
  const toggleWatchlist = useCallback((symbol: string) => {
    const upper = symbol.toUpperCase();
    setPrefs((s) => ({
      ...s,
      watchlist: s.watchlist.includes(upper)
        ? s.watchlist.filter((x) => x !== upper)
        : [...s.watchlist, upper],
    }));
  }, []);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setPrefs((s) => ({
      ...s,
      watchlist: s.watchlist.filter((x) => x !== symbol.toUpperCase()),
    }));
  }, []);

  const hasInWatchlist = useCallback(
    (symbol: string) => prefs.watchlist.includes(symbol.toUpperCase()),
    [prefs.watchlist],
  );

  const api = useMemo<Omit<PrefsApi, "passwordOpen" | "pinOpen">>(
    () => ({
      ...prefs,
      setTheme: (theme) => setPrefs((s) => ({ ...s, theme })),
      setColorTheme: (colorTheme) => setPrefs((s) => ({ ...s, colorTheme })),
      setCompactNumbers: (compactNumbers) => setPrefs((s) => ({ ...s, compactNumbers })),
      setAutoRefresh: (autoRefresh) => setPrefs((s) => ({ ...s, autoRefresh })),
      setRefreshMinutes: (refreshMinutes) => setPrefs((s) => ({ ...s, refreshMinutes })),
      setSidebarCollapsed: (sidebarCollapsed) => setPrefs((s) => ({ ...s, sidebarCollapsed })),
      setTerminal: (terminal) => setPrefs((s) => ({ ...s, terminal })),
      toggleWatchlist,
      removeFromWatchlist,
      hasInWatchlist,
      openPassword: () => setPasswordOpen(true),
      closePassword: () => setPasswordOpen(false),
      openPin: () => setPinOpen(true),
      closePin: () => setPinOpen(false),
    }),
    [prefs, toggleWatchlist, removeFromWatchlist, hasInWatchlist],
  );

  return (
    <PrefsContext.Provider value={{ ...api, passwordOpen, pinOpen }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs(): PrefsApi {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}

// Re-export useSettings as an alias so existing consumers don't break
export const useSettings = usePrefs;
export const SettingsProvider = PrefsProvider;
export type Settings = Prefs;
export type SettingsApi = PrefsApi;
export const DEFAULT_SETTINGS = DEFAULT_PREFS;

// Re-export useWatchlist as an alias
export function useWatchlist() {
  const { watchlist, toggleWatchlist, removeFromWatchlist, hasInWatchlist } = usePrefs();
  return {
    symbols: watchlist,
    ready: true,
    has: hasInWatchlist,
    toggle: toggleWatchlist,
    remove: removeFromWatchlist,
  };
}

// Re-export WatchlistProvider as no-op (prefs handles it)
export function WatchlistProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
