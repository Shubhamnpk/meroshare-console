import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, KeyRound, Lock, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettings, type ThemePref } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MeroShare Investor Console" },
      { name: "description", content: "Theme, data preferences and security for your MeroShare console." },
      { property: "og:title", content: "Settings — MeroShare Investor Console" },
      { property: "og:description", content: "Theme, data preferences and security for your MeroShare console." },
    ],
  }),
  component: SettingsPage,
});

const THEME_OPTIONS: { value: ThemePref; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright, paper feel", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easy on the eyes", icon: Moon },
  { value: "system", label: "System", hint: "Follows your device", icon: Monitor },
];

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Palette;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
      <header className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ToggleRow({
  title,
  hint,
  checked,
  onCheckedChange,
  labelId,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  labelId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background p-3.5">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={labelId} />
    </div>
  );
}

function SettingsPage() {
  const {
    theme,
    setTheme,
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
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appearance and data preferences are saved on this device. Security changes apply directly on MeroShare.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card icon={Palette} title="Appearance" subtitle="How this console looks on your device.">
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors",
                  theme === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-accent/40",
                )}
              >
                <Icon className={cn("size-5", theme === value && "text-primary")} />
                <span className="font-medium">{label}</span>
                <span className="text-[0.65rem]">{hint}</span>
                {theme === value && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </Card>

        <Card icon={Database} title="Data & refresh" subtitle="How often data loads and how numbers are shown.">
          <div className="space-y-3">
            <ToggleRow
              title="Auto-refresh portfolio"
              hint="Re-fetch holdings and valuation in the background."
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              labelId="auto-refresh"
            />
            {autoRefresh && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background p-3.5">
                <div>
                  <p className="text-sm font-medium">Refresh interval</p>
                  <p className="text-xs text-muted-foreground">How often your data is re-fetched.</p>
                </div>
                <div className="flex gap-1 rounded-lg bg-secondary p-1">
                  {intervalOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRefreshMinutes(m)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        refreshMinutes === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ToggleRow
              title="Compact numbers"
              hint="Show large values as 12.5 L / 1.2 Cr instead of full figures."
              checked={compactNumbers}
              onCheckedChange={setCompactNumbers}
              labelId="compact-numbers"
            />
          </div>
        </Card>
      </div>

      <Card icon={Lock} title="Security" subtitle="Password and transaction PIN are changed on MeroShare.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="outline" className="justify-start gap-2" onClick={openPassword}>
            <KeyRound className="size-4" /> Change password
          </Button>
          <Button variant="outline" className="justify-start gap-2" onClick={openPin}>
            <KeyRound className="size-4" /> Change transaction PIN
          </Button>
        </div>
      </Card>
    </div>
  );
}
