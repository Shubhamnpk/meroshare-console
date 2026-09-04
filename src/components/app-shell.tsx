import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Search, Settings, UserRound } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/meroshare/auth.functions";
import { clearSessionUnlock } from "@/lib/biometric";
import type { SessionUser } from "@/lib/meroshare/types";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBell } from "@/components/notification-bell";
import { ScripSheet } from "@/components/market/scrip-sheet";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { usePrefs } from "@/lib/prefs";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "MS"
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sidebarCollapsed, setSidebarCollapsed } = usePrefs();
  const [signingOut, setSigningOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pickedScrip, setPickedScrip] = useState<string | null>(null);

  const toggleCollapsed = () => setSidebarCollapsed(!sidebarCollapsed);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await logout();
      clearSessionUnlock();
      // Clear notification + cache state on logout (prefs persist intentionally)
      try {
        localStorage.removeItem("ms-notif.v1");
        localStorage.removeItem("ms-cache.v1");
      } catch {
        // ignore
      }
    } finally {
      setSigningOut(false);
      navigate({ to: "/", replace: true });
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <AppSidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleCollapsed} />

      <div
        className={cn(
          "flex-1 flex flex-col transition-[padding] duration-300 ease-in-out",
          sidebarCollapsed ? "lg:pl-[4.75rem]" : "lg:pl-64",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold sm:text-base">
              {user.name || user.username}
            </p>
            <p className="num truncate text-xs text-muted-foreground">BOID {user.demat}</p>
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-xl border border-border/70 bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent md:flex"
            aria-label="Search scrips (Ctrl+K)"
          >
            <Search className="size-3.5" aria-hidden />
            <span>Search scrips…</span>
            <kbd className="num rounded-md bg-muted px-1.5 py-0.5 font-sans text-[0.65rem]">
              Ctrl K
            </kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search scrips"
          >
            <Search className="size-4" />
          </Button>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex items-center gap-1 rounded-full border border-border bg-secondary py-1 pl-1 pr-2 transition-colors hover:bg-accent"
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full text-xs font-semibold"
                  aria-hidden
                >
                  {initials(user.name || user.username)}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="truncate font-display font-semibold">
                    {user.name || user.username}
                  </span>
                  <span className="num truncate text-xs font-normal text-muted-foreground">
                    BOID {user.demat}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
                <UserRound className="size-4" aria-hidden />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                <Settings className="size-4" aria-hidden />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="size-4" aria-hidden />
                {signingOut ? "Signing out…" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
          <footer className="mt-12 flex flex-col items-center justify-center gap-1.5 border-t border-border/50 pt-6 text-center text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-medium text-foreground/80">MeroShare Console</span>
              <span className="text-muted-foreground/40">•</span>
              <Link
                to="/releases"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-secondary/70 px-2.5 py-0.5 text-[0.725rem] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>{APP_VERSION} Release Notes</span>
              </Link>
            </div>
            <p className="text-[0.68rem] text-muted-foreground/60">
              An independent client for CDSC MeroShare. Not affiliated with CDSC.
            </p>
          </footer>
        </main>
      </div>

      <MobileNav />

      <CommandPalette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        onPick={(symbol) => setPickedScrip(symbol)}
      />
      <ScripSheet
        symbol={pickedScrip}
        onOpenChange={(open) => {
          if (!open) setPickedScrip(null);
        }}
      />
    </div>
  );
}
