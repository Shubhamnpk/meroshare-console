import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Clock,
  Database,
  Download,
  ExternalLink,
  Github,
  Hash,
  Info,
  KeyRound,
  Lock,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettings, COLOR_OPTIONS, type ThemePref } from "@/lib/settings";
import { APP_VERSION, GITHUB_REPO_URL } from "@/lib/version";
import {
  hasNativeInstallPrompt,
  initInstallCapture,
  isIosDevice,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from "@/lib/install";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Preferences | MeroShare Console" },
      {
        name: "description",
        content: "Appearance, data synchronization, security controls, and release preferences.",
      },
      { property: "og:title", content: "Settings | MeroShare Console" },
      {
        property: "og:description",
        content: "Appearance, data synchronization, security controls, and release preferences.",
      },
    ],
  }),
  component: SettingsPage,
});

const THEME_OPTIONS: { value: ThemePref; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light Mode", hint: "Bright & crisp interface", icon: Sun },
  { value: "dark", label: "Dark Mode", hint: "Easy on the eyes in low light", icon: Moon },
  { value: "system", label: "System Default", hint: "Sync with device settings", icon: Monitor },
];

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: typeof Palette;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {badge && (
        <Badge variant="outline" className="bg-secondary/60 text-xs font-medium">
          {badge}
        </Badge>
      )}
    </div>
  );
}

function InstallCard() {
  const [installed, setInstalled] = useState(isStandalone());
  const [promptReady, setPromptReady] = useState(hasNativeInstallPrompt());

  useEffect(() => {
    initInstallCapture();
    const sync = () => {
      setInstalled(isStandalone());
      setPromptReady(hasNativeInstallPrompt());
    };
    sync();
    return subscribeInstall(sync);
  }, []);

  const ios = isIosDevice();

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
      <SectionHeader
        icon={Download}
        title="App Installation"
        subtitle="Install MeroShare Console as a native PWA on your home screen."
        badge={installed ? "Installed" : "PWA Ready"}
      />

      {installed ? (
        <div className="flex items-center gap-3 rounded-xl border border-gain/30 bg-gain/10 p-4 text-xs font-medium text-gain">
          <Check className="size-4 shrink-0" />
          <span>App is currently installed and running in standalone mode.</span>
        </div>
      ) : promptReady ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Install on this device</p>
            <p className="text-xs text-muted-foreground">
              Launches full-screen directly from your app launcher or home screen.
            </p>
          </div>
          <Button size="sm" onClick={() => void promptInstall()} className="gap-2 shrink-0">
            <Download className="size-4" /> Install App
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-background p-4 space-y-1">
          <p className="text-sm font-semibold">
            {ios ? "Add to Home Screen (iOS Safari)" : "Install via Browser Menu"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ios
              ? "In Safari, tap the Share button at the bottom and select 'Add to Home Screen'."
              : "Open your browser menu (⋮) and choose 'Install App' or 'Add to Home Screen'."}
          </p>
        </div>
      )}
    </section>
  );
}

function SettingsPage() {
  const {
    theme,
    setTheme,
    colorTheme,
    setColorTheme,
    compactNumbers,
    setCompactNumbers,
    autoRefresh,
    setAutoRefresh,
    refreshMinutes,
    setRefreshMinutes,
    openPassword,
    openPin,
  } = useSettings();

  const intervalOptions = [1, 5, 10, 30];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {/* Top Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              {APP_VERSION}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Manage console appearance, automated data refresh rates, security actions, and release
            info.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
            <Link to="/releases">
              <Sparkles className="size-3.5 text-primary" />
              <span>Release Notes</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appearance & Themes */}
        <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <SectionHeader
            icon={Palette}
            title="Appearance & Theme"
            subtitle="Choose how MeroShare Console looks on your screen."
          />

          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    "group relative flex flex-col items-center justify-between gap-2.5 rounded-xl border p-4 text-center transition-all duration-200",
                    active
                      ? "border-primary bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30"
                      : "border-border/60 bg-background text-muted-foreground hover:border-border hover:bg-accent/30 hover:text-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="mt-0.5 text-[0.65rem] text-muted-foreground/80 leading-tight">
                      {hint}
                    </p>
                  </div>
                  {active && (
                    <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Color Theme Picker */}
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Accent Color
            </p>
            <div className="flex items-center gap-2.5">
              {COLOR_OPTIONS.map(({ value, label, swatch }) => {
                const active = colorTheme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setColorTheme(value)}
                    aria-label={label}
                    className={cn(
                      "relative flex size-8 items-center justify-center rounded-full border-2 transition-all duration-200",
                      active
                        ? "border-foreground scale-110 ring-2 ring-foreground/20"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ background: swatch }}
                  >
                    {active && (
                      <Check className="size-3.5 text-white drop-shadow-sm" strokeWidth={3} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Data Sync & Preferences */}
        <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <SectionHeader
            icon={Database}
            title="Data Sync & Presentation"
            subtitle="Control background data refresh and number formatting."
          />

          <div className="space-y-4">
            {/* Auto Refresh Toggle */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <RefreshCw className="size-4 text-primary" />
                  <p className="text-sm font-semibold">Auto-refresh Portfolio</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatically update stock prices and valuation in background.
                </p>
              </div>
              <Switch
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
                aria-label="auto-refresh"
              />
            </div>

            {/* Interval Selector */}
            {autoRefresh && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Refresh Frequency</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Background refetch interval.</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/60 p-1">
                  {intervalOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRefreshMinutes(m)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-semibold transition-all",
                        refreshMinutes === m
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Compact Numbers Toggle */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Hash className="size-4 text-primary" />
                  <p className="text-sm font-semibold">Compact Number Format</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Show values as Lakhs (L) and Crores (Cr), e.g. NPR 12.5 L.
                </p>
              </div>
              <Switch
                checked={compactNumbers}
                onCheckedChange={setCompactNumbers}
                aria-label="compact-numbers"
              />
            </div>
          </div>
        </section>

        {/* Security & Credentials */}
        <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <SectionHeader
            icon={Lock}
            title="Account & Security"
            subtitle="Manage your MeroShare credentials and security keys."
          />

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground">
              <Shield className="size-4 shrink-0 text-gain" />
              <span>
                Password and PIN changes are submitted directly to CDSC and never stored locally.
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-11 justify-start gap-2.5 rounded-xl border-border/70 font-medium"
                onClick={openPassword}
              >
                <KeyRound className="size-4 text-primary" />
                <span>Change Password</span>
              </Button>
              <Button
                variant="outline"
                className="h-11 justify-start gap-2.5 rounded-xl border-border/70 font-medium"
                onClick={openPin}
              >
                <KeyRound className="size-4 text-primary" />
                <span>Change Transaction PIN</span>
              </Button>
            </div>
          </div>
        </section>

        {/* App Install Card */}
        <InstallCard />
      </div>

      {/* About & System Info */}
      <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <SectionHeader
          icon={Info}
          title="About MeroShare Console"
          subtitle="Open-source project details, version tags, and documentation."
        />

        <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-bold">MeroShare Investor Console</p>
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary border-primary/20 text-[0.7rem]"
              >
                {APP_VERSION}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              An independent client built with TanStack Start, React 19, Vite, and Tailwind CSS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
              <Link to="/releases">
                <Sparkles className="size-3.5 text-primary" />
                <span>What's New</span>
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild className="gap-1.5 text-xs">
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                <Github className="size-3.5" />
                <span>GitHub Repo</span>
                <ExternalLink className="size-3 opacity-60" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
