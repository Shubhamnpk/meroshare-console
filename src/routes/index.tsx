import { useMemo, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {Check,ChevronsUpDown,Eye,EyeOff,Loader2,Lock,ShieldCheck,TrendingUp,Zap,} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList,} from "@/components/ui/command";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/format";
import { getCapitals, getCurrentUser, login } from "@/lib/meroshare/auth.functions";
import type { Capital } from "@/lib/meroshare/types";

export const Route = createFileRoute("/")({
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
    ],
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
    title: "Credentials never stored",
    text: "Your login lives only in an encrypted session cookie for this visit.",
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
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [capitalSearch, setCapitalSearch] = useState("");
  const [capitalId, setCapitalId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    onSuccess: () => navigate({ to: "/dashboard", replace: true }),
    onError: (error) => setFormError(errorMessage(error, "Unable to sign in. Check your details.")),
  });

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

        <p className="relative text-xs text-muted-foreground">
          An independent client for MeroShare. Not affiliated with CDSC.
        </p>
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
            <div className="space-y-2">
              <Label htmlFor="dp">Depository Participant (DP)</Label>
              <Popover
                open={capitalOpen}
                onOpenChange={(open) => {
                  setCapitalOpen(open);
                  if (!open) setCapitalSearch("");
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="dp"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={capitalOpen}
                    className="h-9 w-full justify-between font-normal"
                    disabled={capitals.isLoading}
                  >
                    <span className={cn("truncate", !selected && "text-muted-foreground")}>
                      {capitals.isLoading
                        ? "Loading DP list…"
                        : selected
                          ? selected.name
                          : "Select your DP"}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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
                </PopoverContent>
              </Popover>
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
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Your credentials are sent straight to CDSC over our server and are never saved to any
              database. The session ends when you sign out or after 2 hours.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
