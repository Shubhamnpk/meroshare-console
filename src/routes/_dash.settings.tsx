import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Fingerprint,
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
  Target,
  UserRound,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettings, COLOR_OPTIONS, type ThemePref } from "@/lib/settings";
import { clearRemembered, loadRemembered } from "@/lib/remember-me";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { errorMessage, formatDate } from "@/lib/format";
import {
  arePopupsEnabled,
  clearSnoozed,
  isPushEnabled,
  pushState,
  requestPushPermission,
  setPopupsEnabled,
  setPushEnabled,
  snoozedCount,
  type PushState,
} from "@/lib/notifications";
import { sessionQuery } from "@/lib/queries";
import { getCapitals, login } from "@/lib/meroshare/auth.functions";
import {
  disableBiometrics,
  enrollBiometric,
  enrollBiometricDetailed,
  getEnrollment,
  isPlatformAuthenticatorAvailable,
  isWebAuthnSupported,
  type BiometricEnrollment,
} from "@/lib/biometric";
import { clearVault, hasVault, writeVault } from "@/lib/secure-vault";
import { ogImage, canonicalLink } from "@/lib/seo";

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
      ogImage(),
    ],
    links: [canonicalLink("/settings")],
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
  badge?: string | undefined;
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
    <Panel padding="lg" shadow className="space-y-4">
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
    </Panel>
  );
}

function CheckRow({
  label,
  state,
  pendingText,
}: {
  label: string;
  state: boolean | null;
  pendingText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {state === null ? (
        <span className="text-muted-foreground">{pendingText ?? "Checking…"}</span>
      ) : state ? (
        <span className="inline-flex items-center gap-1 font-medium text-gain">
          <Check className="size-3.5" /> Available
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <X className="size-3.5" /> Not available
        </span>
      )}
    </div>
  );
}

function BiometricCard() {
  const [enrollment, setEnrollment] = useState<BiometricEnrollment | null>(null);
  const [vaultSaved, setVaultSaved] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [prfVerdict, setPrfVerdict] = useState<boolean | null>(null);
  const [prfBlocked, setPrfBlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const session = useQuery(sessionQuery());
  const capitals = useQuery({
    queryKey: ["capitals"],
    queryFn: () => getCapitals(),
    staleTime: 60 * 60_000,
  });

  useEffect(() => {
    setEnrollment(getEnrollment());
    setVaultSaved(hasVault());
    if (!isWebAuthnSupported()) {
      setSupported(false);
      return;
    }
    void isPlatformAuthenticatorAvailable().then(setSupported);
  }, []);

  const username = session.data?.username ?? "";
  const capitalId = session.data?.capitalId ?? null;
  const isDemo = username === "demo" || capitalId === 0;
  const dpName =
    capitals.data?.find((c) => c.id === capitalId)?.name ?? (capitalId ? `DP #${capitalId}` : "-");

  // The device confirmed it cannot store encrypted sign-ins (passkey still
  // works for app unlock). Shown instead of the password form.
  const showBlocked = prfBlocked || (enrollment !== null && prfVerdict === false && !vaultSaved);

  const openModal = () => {
    setError(null);
    setStatus(null);
    setPrfBlocked(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setPassword("");
    setStatus(null);
    setError(null);
    setPrfBlocked(false);
  };

  const onEnable = () => {
    openModal();
  };

  const doDemoEnroll = async () => {
    setBusy(true);
    setError(null);
    setStatus("Waiting for your fingerprint…");
    try {
      const created = await enrollBiometric(username);
      setEnrollment(created);
      closeModal();
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not set up biometrics.");
    } finally {
      setBusy(false);
    }
  };

  const doSaveVault = async (creds: { capitalId: number; username: string; password: string }) => {
    setBusy(true);
    setError(null);
    setStatus("Step 2 of 2: touch your fingerprint again to encrypt the sign-in…");
    try {
      await writeVault(creds);
      setVaultSaved(true);
      return true;
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not save the sign-in.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || !capitalId || !username) {
      setError("Enter your MeroShare password to continue.");
      return;
    }
    const creds = { capitalId, username, password };
    setBusy(true);
    setError(null);
    setStatus("Verifying password…");
    try {
      // Re-signing in proves the password is correct before biometrics are enrolled.
      await login({ data: creds });
    } catch (err) {
      setBusy(false);
      setStatus(null);
      setError(errorMessage(err, "Incorrect password. Try again."));
      return;
    }
    setBusy(false);
    // The passkey may already exist (retry after a cancelled save) - only step 2 then.
    if (!getEnrollment()) {
      setBusy(true);
      setError(null);
      setStatus("Step 1 of 2: touch your fingerprint to create the passkey…");
      try {
        const result = await enrollBiometricDetailed(username);
        setEnrollment(result.enrollment);
        setPrfVerdict(result.prfEnabled);
        if (result.prfEnabled === false) {
          // Definitive: this device cannot store encrypted sign-ins. Stop
          // before asking anything else - the passkey still unlocks the app.
          setBusy(false);
          setStatus(null);
          setPassword("");
          setPrfBlocked(true);
          return;
        }
      } catch (err) {
        setBusy(false);
        setStatus(null);
        setError(err instanceof Error ? err.message : "Could not set up biometrics.");
        return;
      }
      setBusy(false);
    }
    const saved = await doSaveVault(creds);
    if (!saved) return;
    setPassword("");
    closeModal();
    setStatus("Fingerprint sign-in is ready, try it on the sign-in page.");
  };

  const onDisable = () => {
    disableBiometrics();
    clearVault();
    setEnrollment(null);
    setVaultSaved(false);
    setPassword("");
    setError(null);
    setPrfVerdict(null);
  };

  const onRemoveVault = () => {
    clearVault();
    setVaultSaved(false);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Fingerprint className="size-4 text-primary" />
            <p className="text-sm font-semibold">Fingerprint unlock</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {enrollment
              ? `On since ${formatDate(enrollment.createdAt)}. Unlocks the app on this device.`
              : "Use fingerprint or face to unlock the app on this device."}
          </p>
        </div>
        {enrollment ? (
          <div className="flex shrink-0 gap-2">
            {!vaultSaved ? (
              <Button size="sm" onClick={openModal}>
                Save sign-in
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onDisable}>
              Disable
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={onEnable} disabled={busy} className="shrink-0">
            {busy ? "Setting up…" : "Enable"}
          </Button>
        )}
      </div>
      {status ? <p className="mt-2 text-xs text-muted-foreground">{status}</p> : null}
      {enrollment && vaultSaved ? (
        <div className="mt-2.5 flex items-center justify-between gap-4 rounded-lg border border-gain/30 bg-gain/10 px-3 py-2">
          <p className="text-xs font-medium text-gain">
            Fingerprint sign-in is saved, DP, username and password, encrypted on this device.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveVault}
            className="h-7 shrink-0 text-xs"
          >
            Remove
          </Button>
        </div>
      ) : null}
      <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground/80">
        A convenience lock for this device only. Saved sign-ins are encrypted with a key your
        fingerprint unlocks, nothing readable ever leaves the device. Your MeroShare session still
        expires normally and sign-in always needs your password the first time.
      </p>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="size-5 text-primary" /> Fingerprint setup
            </DialogTitle>
            <DialogDescription>
              Checked on this device only. Your fingerprint never leaves it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/30 p-3">
            <CheckRow label="Fingerprint / face unlock" state={supported} />
            <CheckRow
              label="Encrypted sign-in storage"
              state={prfVerdict}
              pendingText="Checked during setup"
            />
          </div>

          {supported === false ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs leading-relaxed">
              <p className="font-semibold text-destructive">Not available on this device</p>
              <p className="mt-1 text-muted-foreground">
                Fingerprint unlock needs a phone or laptop with fingerprint or face unlock set up,
                used over HTTPS or the installed app, with a screen lock turned on.
              </p>
              <Button size="sm" className="mt-3" onClick={closeModal}>
                Got it
              </Button>
            </div>
          ) : showBlocked ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs leading-relaxed">
              <p className="font-semibold">Passkey created, but with a limit</p>
              <p className="mt-1 text-muted-foreground">
                This device cannot store encrypted sign-ins, so fingerprint login won&apos;t work
                here. The passkey still unlocks the app on this device.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={closeModal}>
                  Keep for app unlock
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onDisable();
                    closeModal();
                  }}
                >
                  Remove passkey
                </Button>
              </div>
            </div>
          ) : isDemo ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Demo mode has no MeroShare password, this creates the passkey for app unlock only.
              </p>
              {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button size="sm" disabled={busy} onClick={() => void doDemoEnroll()}>
                {busy ? "Waiting for fingerprint…" : "Create passkey"}
              </Button>
            </div>
          ) : (
            <form onSubmit={onConfirm} className="space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">DP</p>
                  <p className="truncate font-medium">{dpName}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    Username
                  </p>
                  <p className="num truncate font-medium">{username || "-"}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bio-password">Confirm your MeroShare password</Label>
                <div className="relative">
                  <Input
                    id="bio-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button type="submit" size="sm" disabled={busy} className="w-full">
                {busy ? "Working…" : "Confirm & enable"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationCard() {
  const [push, setPush] = useState<PushState>(() => pushState());
  const [pushOn, setPushOn] = useState(() => isPushEnabled());
  const [popupsOn, setPopupsOn] = useState(() => arePopupsEnabled());
  const [snoozed, setSnoozed] = useState(() => snoozedCount());

  const refresh = () => {
    setPush(pushState());
    setPushOn(isPushEnabled());
    setPopupsOn(arePopupsEnabled());
    setSnoozed(snoozedCount());
  };

  const pushDescription =
    push === "unsupported"
      ? "This browser can't show system notifications."
      : push === "denied"
        ? "Permission is blocked. Allow notifications in your browser's site settings."
        : push === "default"
          ? "Get IPO closings and expiry warnings even while looking at other tabs."
          : pushOn
            ? "On: urgent items alert you on this device."
            : "Off: turn back on anytime.";

  return (
    <Panel padding="lg" shadow className="space-y-5">
      <SectionHeader
        icon={Bell}
        title="Notifications"
        subtitle="IPO closings, password and DEMAT expiry warnings."
        badge={push === "granted" && pushOn ? "Alerts on" : undefined}
      />

      <div className="space-y-4">
        {/* Browser / device alerts */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <BellRing className="size-4 text-primary" />
              <p className="text-sm font-semibold">Browser alerts on this device</p>
            </div>
            <p className="text-xs text-muted-foreground">{pushDescription}</p>
          </div>
          {push === "default" ? (
            <Button
              size="sm"
              onClick={() => void requestPushPermission().then(() => refresh())}
              className="shrink-0"
            >
              Enable
            </Button>
          ) : push === "granted" ? (
            <Switch
              checked={pushOn}
              onCheckedChange={(v) => {
                setPushEnabled(v);
                refresh();
              }}
              aria-label="browser-alerts"
            />
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              {push === "unsupported" ? "Unavailable" : "Blocked"}
            </span>
          )}
        </div>

        {/* In-app pop-up toasts */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Pop-up alerts</p>
            <p className="text-xs text-muted-foreground">
              Show an in-app toast the first time an urgent item appears.
            </p>
          </div>
          <Switch
            checked={popupsOn}
            onCheckedChange={(v) => {
              setPopupsEnabled(v);
              refresh();
            }}
            aria-label="popup-alerts"
          />
        </div>

        {/* Snoozed reminders */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              <p className="text-sm font-semibold">Snoozed reminders</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {snoozed === 0
                ? "Nothing snoozed. Snoozed items return as unread tomorrow."
                : `${snoozed} reminder${snoozed === 1 ? "" : "s"} hidden until tomorrow.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={snoozed === 0}
            onClick={() => {
              clearSnoozed();
              refresh();
            }}
            className="shrink-0"
          >
            Show again
          </Button>
        </div>
      </div>

      <p className="text-[0.7rem] leading-relaxed text-muted-foreground/80">
        Alerts fire for IPOs closing within 3 days, password expiry within 30 days and DEMAT expiry
        within 90 days, while the app is open.
      </p>
    </Panel>
  );
}

function RememberedRow() {
  const [remembered, setRemembered] = useState(() => loadRemembered()?.username ?? null);
  if (!remembered) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background p-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <UserRound className="size-4 text-primary" />
          <p className="text-sm font-semibold">Remembered username</p>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="num font-medium text-foreground">{remembered}</span> prefilled on this
          device&apos;s sign-in form.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => {
          clearRemembered();
          setRemembered(null);
        }}
      >
        Forget
      </Button>
    </div>
  );
}

const TABS = [
  { id: "appearance", label: "Appearance", hint: "Theme and accent color", icon: Palette },
  { id: "security", label: "Security", hint: "Password, PIN and fingerprint", icon: Lock },
  { id: "general", label: "General", hint: "Sync, notifications and install", icon: Database },
  { id: "about", label: "About", hint: "Version and project info", icon: Info },
] as const;

type TabId = (typeof TABS)[number]["id"];

function MobileTabList({ onPick }: { onPick: (tab: TabId) => void }) {
  const bioOn = getEnrollment() !== null;
  const statusFor = (id: TabId): string | null =>
    id === "security" ? (bioOn ? "Fingerprint on" : null) : null;
  return (
    <div className="space-y-2">
      {TABS.map((tab) => {
        const status = statusFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onPick(tab.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left transition-colors hover:border-primary/40"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <tab.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {status ?? tab.hint}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
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

  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const current: TabId = activeTab ?? "appearance";
  const activeMeta = TABS.find((t) => t.id === current) ?? TABS[0]!;

  return (
    <div className="space-y-8 pb-8">
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

      {isMobile && activeTab === null ? (
        <MobileTabList onPick={setActiveTab} />
      ) : (
        <div className="sm:flex sm:items-start sm:gap-6">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setActiveTab(null)}
              className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40"
            >
              <ChevronLeft className="size-4" />
              {activeMeta.label}
            </button>
          ) : (
            <nav className="hidden w-60 shrink-0 flex-col gap-1.5 sm:flex">
              {TABS.map((tab) => {
                const selected = current === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:border-border/70 hover:bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <tab.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{tab.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tab.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
          <div className="min-w-0 flex-1 space-y-6">
            <div className={current === "appearance" ? "space-y-6" : "hidden"}>
              {/* Appearance & Themes */}
              <Panel padding="lg" shadow className="space-y-5">
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
              </Panel>
            </div>
            <div className={current === "general" ? "space-y-6" : "hidden"}>
              {/* Data Sync & Preferences */}
              <Panel padding="lg" shadow className="space-y-5">
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
                        <p className="text-xs text-muted-foreground">
                          Background refetch interval.
                        </p>
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
              </Panel>
            </div>
            <div className={current === "general" ? "space-y-6" : "hidden"}>
              {/* Notifications */}
              <NotificationCard />
            </div>
            <div className={current === "security" ? "space-y-6" : "hidden"}>
              {/* Security & Credentials */}
              <Panel padding="lg" shadow className="space-y-5">
                <SectionHeader
                  icon={Lock}
                  title="Account & Security"
                  subtitle="Manage your MeroShare credentials and security keys."
                />

                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground">
                    <Shield className="size-4 shrink-0 text-gain" />
                    <span>
                      Password and PIN changes are submitted directly to CDSC and never stored
                      locally.
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

                  <BiometricCard />

                  <RememberedRow />
                </div>
              </Panel>
            </div>
            <div className={current === "general" ? "space-y-6" : "hidden"}>
              {/* App Install Card */}
              <InstallCard />
            </div>
            <div className={current === "about" ? "space-y-6" : "hidden"}>
              {/* About & System Info */}
              <Panel padding="lg" shadow className="space-y-5">
                <SectionHeader
                  icon={Info}
                  title="About MeroShare Console"
                  subtitle="Who we are, what this app promises, and where it's going."
                />

                <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-background p-4">
                  <img
                    src="/logo-512.png"
                    alt="MeroShare Console logo"
                    className="size-14 shrink-0 rounded-2xl"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-bold">MeroShare Investor Console</p>
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary border-primary/20 text-[0.7rem]"
                      >
                        {APP_VERSION}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      An independent client for CDSC MeroShare · MIT licensed · by Shubham
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Target className="size-4 text-primary" /> Why this exists
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    The official MeroShare portal works, but watching your portfolio breathe,
                    tracking IPO history, and understanding your own performance across visits is
                    painful there. This app wraps the{" "}
                    <em>same official CDSC data you already own</em> in a fast, readable interface.
                    One goal: your demat account, finally readable.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    What we are not: affiliated with CDSC, a broker, or financial advice. Buy and
                    sell decisions stay entirely yours.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="size-4 text-gain" /> How your trust is handled
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">Open source.</span> Every line
                      is auditable on GitHub. No black boxes holding your money&apos;s data.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Credentials never stored.</span>{" "}
                      Your password and PIN go straight to CDSC and live only in an encrypted
                      session cookie that dies after ~2 hours or when you sign out.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">Your data stays yours.</span>{" "}
                      Portfolio and IPO data comes from CDSC&apos;s official API under your own
                      login. Market prices come from public NEPSE mirrors and the community YONEPSE
                      feed, indicative only and never used for orders.
                    </li>
                    <li>
                      <span className="font-medium text-foreground">No accounts, no tracking.</span>{" "}
                      Settings live in your browser. Fingerprint sign-in, if you enable it, encrypts
                      credentials on your device alone.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button variant="secondary" size="sm" asChild className="gap-1.5 text-xs">
                      <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                        <Github className="size-3.5" />
                        <span>GitHub Repo</span>
                        <ExternalLink className="size-3 opacity-60" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                      <Link to="/releases">
                        <Sparkles className="size-3.5 text-primary" />
                        <span>Release Notes</span>
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {["React 19", "TanStack Start", "Tailwind CSS", "PWA ready", "MIT License"].map(
                    (t) => (
                      <span
                        key={t}
                        className="rounded-full bg-muted px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground"
                      >
                        {t}
                      </span>
                    ),
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
