// Client-only local settings (theme, display preferences) persisted in localStorage.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePref = "light" | "dark" | "system";

export interface Settings {
  theme: ThemePref;
  compactNumbers: boolean;
  autoRefresh: boolean;
  refreshMinutes: number;
}

export interface SettingsApi extends Settings {
  passwordOpen: boolean;
  pinOpen: boolean;
  setTheme: (theme: ThemePref) => void;
  setCompactNumbers: (value: boolean) => void;
  setAutoRefresh: (value: boolean) => void;
  setRefreshMinutes: (minutes: number) => void;
  openPassword: () => void;
  closePassword: () => void;
  openPin: () => void;
  closePin: () => void;
}

const STORAGE_KEY = "ms-settings";
const LEGACY_THEME_KEY = "ms-theme";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  compactNumbers: false,
  autoRefresh: true,
  refreshMinutes: 5,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    if (!parsed.theme && (legacy === "light" || legacy === "dark")) {
      parsed.theme = legacy;
    }
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function applyTheme(theme: ThemePref) {
  if (typeof document === "undefined") return;
  const light =
    theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("light", light);
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);

  useEffect(() => {
    applyTheme(settings.theme);
    const { theme, compactNumbers, autoRefresh, refreshMinutes } = settings;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, compactNumbers, autoRefresh, refreshMinutes }));
    } catch {
      // storage unavailable (private mode) — settings still apply for this session
    }
  }, [settings]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const api = useMemo(
    () => ({
      ...settings,
      setTheme: (theme: ThemePref) => setSettings((s) => ({ ...s, theme })),
      setCompactNumbers: (compactNumbers: boolean) => setSettings((s) => ({ ...s, compactNumbers })),
      setAutoRefresh: (autoRefresh: boolean) => setSettings((s) => ({ ...s, autoRefresh })),
      setRefreshMinutes: (refreshMinutes: number) => setSettings((s) => ({ ...s, refreshMinutes })),
      openPassword: () => setPasswordOpen(true),
      closePassword: () => setPasswordOpen(false),
      openPin: () => setPinOpen(true),
      closePin: () => setPinOpen(false),
    }),
    [settings],
  );

  return (
    <SettingsContext.Provider value={{ ...api, passwordOpen, pinOpen }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
