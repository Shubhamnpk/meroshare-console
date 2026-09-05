import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { APP_VERSION } from "@/lib/version";
import {
  Check,
  ChevronsUpDown,
  Clock,
  Eye,
  EyeOff,
  Fingerprint,
  Loader2,
  Lock,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/format";
import { clearRemembered, loadRemembered, saveRemembered } from "@/lib/remember-me";
import { isBiometricEnrolled } from "@/lib/biometric";
import { clearVault, getVaultOwner, hasVault, readVault, writeVault } from "@/lib/secure-vault";
import { toast } from "sonner";
import { ogImage, canonicalLink } from "@/lib/seo";
import { getCapitals, getCurrentUser, login, loginDemo } from "@/lib/meroshare/auth.functions";
import type { Capital } from "@/lib/meroshare/types";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { expired?: boolean | undefined } => ({
    expired: search["expired"] === true || search["expired"] === "true" ? true : undefined,
  }),
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Sign in | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Sign in with your MeroShare (CDSC) credentials to track your portfolio, apply for IPOs and review share transactions.",
      },
      { property: "og:title", content: "MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "A modern MeroShare client for Nepali investors: live portfolio value, IPO applications, transactions and analytics.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/")],
  }),
  component: LoginPage,
});

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: "Live portfolio value",
    text: "Holdings valued at LTP and previous close, refreshed automatically.",
  },
  {
    icon: Zap,
    title: "Full IPO parity",
    text: "Apply, edit and withdraw ASBA applications and check allotment results.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Nothing is saved unless you ask, fingerprint sign-ins stay encrypted on your device.",
  },
];

function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <span className="truncate">{text}</span>;
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return <span className="truncate">{text}</span>;
  return (
    <span className="truncate">
      {text.slice(0, idx)}
      <span className="rounded-sm bg-primary/15 text-primary">
        {text.slice(idx, idx + trimmed.length)}
      </span>
      {text.slice(idx + trimmed.length)}
    </span>
  );
}

function CapitalItem({
  capital,
  selected,
  onSelect,
  query,
}: {
  capital: Capital;
  selected: boolean;
  onSelect: () => void;
  query: string;
}) {
  return (
    <CommandItem
      value={`${capital.code} ${capital.name}`}
      onSelect={onSelect}
      className={cn("gap-1.5", selected && "bg-accent/30")}
    >
      {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
      <span className="num shrink-0 text-xs text-muted-foreground">{capital.code}</span>
      <Highlighted text={capital.name} query={query} />
    </CommandItem>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { expired } = Route.useSearch();
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [capitalSearch, setCapitalSearch] = useState("");
  const [remembered] = useState(() => loadRemembered());
  const [capitalId, setCapitalId] = useState<number | null>(remembered?.capitalId ?? null);
  const [username, setUsername] = useState(remembered?.username ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => remembered !== null);
  const [bioEnrolled] = useState(() => isBiometricEnrolled());
  const [saveBio, setSaveBio] = useState(() => isBiometricEnrolled());
  const [bioBusy, setBioBusy] = useState(false);
  const bioAttempt = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const capitals = useQuery({
    queryKey: ["capitals"],
    queryFn: () => getCapitals(),
    staleTime: 60 * 60_000,
  });

  const selected = useMemo(
    () => capitals.data?.find((c) => c.id === capitalId) ?? null,
    [capitals.data, capitalId],
  );

  const mutation = useMutation({
    mutationFn: (vars: { capitalId: number; username: string; password: string }) =>
      login({ data: vars }),
    onSuccess: async (_data, vars) => {
      if (rememberMe) saveRemembered(vars.username, vars.capitalId);
      else clearRemembered();
      // Save for fingerprint sign-in only when needed: a fresh vault, or the
      // vault belongs to a different user. Re-saving identical credentials
      // would demand a pointless extra fingerprint prompt on every login.
      if (bioEnrolled && saveBio && getVaultOwner() !== vars.username) {
        try {
          await writeVault({
            capitalId: vars.capitalId,
            username: vars.username,
            password: vars.password,
          });
          toast.success("Fingerprint sign-in saved for this device.");
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Fingerprint sign-in could not be saved.",
          );
        }
      }
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error) => {
      if (bioAttempt.current) {
        bioAttempt.current = false;
        clearVault();
        setFormError(
          "The saved fingerprint sign-in no longer works, your password may have changed. Sign in manually.",
        );
        return;
      }
      setFormError(errorMessage(error, "Unable to sign in. Check your details."));
    },
  });

  const bioLogin = async (source: "auto" | "manual" = "manual") => {
    setBioBusy(true);
    setFormError(null);
    try {
      if (!hasVault()) {
        setFormError(
          "No fingerprint sign-in saved yet. Sign in with your password once and keep “Save for fingerprint sign-in” checked.",
        );
        return;
      }
      const creds = await readVault();
      bioAttempt.current = true;
      setCapitalId(creds.capitalId);
      setUsername(creds.username);
      mutation.mutate({
        capitalId: creds.capitalId,
        username: creds.username,
        password: creds.password,
      });
    } catch (err) {
      bioAttempt.current = false;
      const message = err instanceof Error ? err.message : "Fingerprint sign-in failed.";
      // An automatic attempt failing (no gesture, device asleep) is not the
      // user's fault - point at the button instead of the error.
      setFormError(
        source === "auto" && /cancelled|did not complete/i.test(message)
          ? "Your session expired. Tap “Sign in with fingerprint” to jump back in."
          : message,
      );
    } finally {
      setBioBusy(false);
    }
  };

  // Expired mid-use with a vault on this device? Try to glide back in once;
  // any failure just leaves the normal sign-in form (and button) in place.
  const autoTried = useRef(false);
  useEffect(() => {
    if (expired && !autoTried.current && bioEnrolled && hasVault()) {
      autoTried.current = true;
      void bioLogin("auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, bioEnrolled]);

  const demoMutation = useMutation({
    mutationFn: () => loginDemo(),
    onSuccess: () => navigate({ to: "/dashboard", replace: true }),
    onError: (error) => setFormError(errorMessage(error, "Unable to start demo mode.")),
  });

  // Hidden shortcut: Ctrl+Shift+D enters demo mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        if (!mutation.isPending && !demoMutation.isPending) demoMutation.mutate();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mutation.isPending, demoMutation.isPending, demoMutation]);

  const isMobile = useIsMobile();

  const capitalList = (
    <Command>
      <CommandInput
        autoFocus
        value={capitalSearch}
        onValueChange={setCapitalSearch}
        placeholder="Search DP by name or code…"
      />
      <CommandList>
        <CommandEmpty>No DP found.</CommandEmpty>
        <CommandGroup>
          {(capitals.data ?? []).map((capital) => (
            <CapitalItem
              key={capital.id}
              capital={capital}
              selected={capitalId === capital.id}
              query={capitalSearch}
              onSelect={() => {
                setCapitalId(capital.id);
                setCapitalOpen(false);
              }}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  const capitalTrigger = (
    <Button
      id="dp"
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={capitalOpen}
      className="h-9 w-full justify-between font-normal"
      disabled={capitals.isLoading}
      onClick={() => setCapitalOpen(true)}
    >
      <span className={cn("truncate", !selected && "text-muted-foreground")}>
        {capitals.isLoading ? "Loading DP list…" : selected ? selected.name : "Select your DP"}
      </span>
      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
    </Button>
  );

  const capitalPicker = isMobile ? (
    <>
      {capitalTrigger}
      <Sheet
        open={capitalOpen}
        onOpenChange={(open) => {
          setCapitalOpen(open);
          if (!open) setCapitalSearch("");
        }}
      >
        <SheetContent
          side="bottom"
          className="h-[70dvh] px-0 pt-2"
          onClose={() => {
            setCapitalOpen(false);
            setCapitalSearch("");
          }}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="px-4 text-left">
            <SheetTitle>Select your DP</SheetTitle>
            <SheetDescription>Depository Participant for your account.</SheetDescription>
          </SheetHeader>
          <div className="mt-2 overflow-y-auto px-2">{capitalList}</div>
        </SheetContent>
      </Sheet>
    </>
  ) : (
    <Popover
      open={capitalOpen}
      onOpenChange={(open) => {
        setCapitalOpen(open);
        if (!open) setCapitalSearch("");
      }}
    >
      <PopoverTrigger asChild>{capitalTrigger}</PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {capitalList}
      </PopoverContent>
    </Popover>
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!capitalId) {
      setFormError("Select your depository participant (DP).");
      return;
    }
    if (!username.trim() || !password) {
      setFormError("Enter your MeroShare username and password.");
      return;
    }
    mutation.mutate({ capitalId, username: username.trim(), password });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "var(--gradient-brand)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-background/72" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-3">
            <img
              src="/logo-512.png"
              alt="MeroShare Console logo"
              className="size-11 rounded-2xl"
              aria-hidden
            />
            <div>
              <p className="font-display text-lg font-semibold">MeroShare Console</p>
              <p className="text-xs text-muted-foreground">
                CDSC &amp; Clearing Ltd. account access
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md space-y-8">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Your demat account,
            <br />
            <span className="brand-gradient-text">finally readable.</span>
          </h1>
          <ul className="space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card">
                  <item.icon className="size-4 text-primary" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <p>An independent client for MeroShare. Not affiliated with CDSC.</p>
          <Link
            to="/releases"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/70 px-2.5 py-0.5 text-[0.7rem] font-medium backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>{APP_VERSION}</span>
          </Link>
        </div>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-512.png"
              alt="MeroShare Console logo"
              className="size-9 rounded-xl"
              aria-hidden
            />
            <p className="font-display text-base font-semibold">MeroShare Console</p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="hidden justify-end lg:flex">
            <ThemeToggle />
          </div>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use the same DP, username and password you use on MeroShare.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {expired ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                Your MeroShare session expired.
                {bioEnrolled
                  ? " Trying your fingerprint to sign you straight back in."
                  : " Sign back in to continue."}
              </p>
            ) : null}
            {bioEnrolled ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void bioLogin()}
                  disabled={bioBusy || mutation.isPending}
                  className="h-11 w-full"
                >
                  {bioBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Checking fingerprint…
                    </>
                  ) : (
                    <>
                      <Fingerprint className="size-4" /> Sign in with fingerprint
                    </>
                  )}
                </Button>
                {!hasVault() ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <Fingerprint className="size-3.5 text-primary" />
                      Set up one-tap sign-in
                    </p>
                    <p className="mt-1 leading-relaxed">
                      1. Sign in with your password below.
                      <br />
                      2. Keep “Save for fingerprint sign-in” checked.
                      <br />
                      Next visit, the button above signs you straight in.
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden />
                  or continue with password
                  <span className="h-px flex-1 bg-border" aria-hidden />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="dp">Depository Participant (DP)</Label>
              {capitalPicker}
              {capitals.isError ? (
                <p className="text-xs text-destructive">
                  Could not load the DP list. Check your connection and refresh.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                inputMode="numeric"
                placeholder="MeroShare username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11"
                maxLength={64}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {formError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="flex items-start gap-2.5">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="mt-0.5"
              />
              <div className="leading-snug">
                <Label htmlFor="remember-me" className="cursor-pointer text-sm font-medium">
                  Remember me on this device
                </Label>
                <p className="text-xs text-muted-foreground">
                  Prefills your username next time. Your password is never saved.
                </p>
              </div>
            </div>

            {bioEnrolled ? (
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="save-bio"
                  checked={saveBio}
                  onCheckedChange={(checked) => setSaveBio(checked === true)}
                  className="mt-0.5"
                />
                <div className="leading-snug">
                  <Label htmlFor="save-bio" className="cursor-pointer text-sm font-medium">
                    Save for fingerprint sign-in
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Encrypts this sign-in on your device so your fingerprint signs you in next time.
                  </p>
                </div>
              </div>
            ) : null}

            <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Signing in…
                </>
              ) : (
                "Sign in to MeroShare"
              )}
            </Button>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              Your credentials are sent straight to CDSC over our server and are never saved to any
              database. The session ends when you sign out or after 2 hours.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
