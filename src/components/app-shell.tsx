import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Settings,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/meroshare/auth.functions";
import type { SessionUser } from "@/lib/meroshare/types";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/shares", label: "My Shares", icon: Wallet },
  { to: "/transactions", label: "Transactions", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const IPO_NAV: NavItem[] = [
  { to: "/ipo", label: "Apply for Issue", icon: Rocket },
  { to: "/reports", label: "Application Report", icon: ClipboardList },
  { to: "/results", label: "IPO Result", icon: Trophy },
  { to: "/wacc", label: "Purchase Source", icon: Coins },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/activity", label: "Activity Log", icon: CalendarClock },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/ipo", label: "IPO", icon: Rocket },
  { to: "/reports", label: "Reports", icon: ClipboardList },
];

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

function NavGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        {title}
      </p>
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon
              className={cn("size-4 shrink-0", active && "text-primary")}
              aria-hidden
            />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-4">
      <img
        src="/logo-512.png"
        alt="MeroShare Next logo"
        className="size-9 rounded-xl"
        aria-hidden
      />
      <div className="leading-tight">
        <p className="font-display text-sm font-semibold">MeroShare</p>
        <p className="text-[0.7rem] text-muted-foreground">CDSC Investor Console</p>
      </div>
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await logout();
    } finally {
      setSigningOut(false);
      setMenuOpen(false);
      navigate({ to: "/", replace: true });
    }
  };

  const navBody = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      <NavGroup title="Overview" items={PRIMARY_NAV} pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />
      <NavGroup title="Issues" items={IPO_NAV} pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />
      <NavGroup title="Account" items={ACCOUNT_NAV} pathname={pathname} {...(onNavigate ? { onNavigate } : {})} />
    </nav>
  );

  return (
    <div className="min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        {navBody()}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <Brand />
                {navBody(() => setMenuOpen(false))}
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold sm:text-base">
              {user.name || user.username}
            </p>
            <p className="num truncate text-xs text-muted-foreground">
              BOID {user.demat}
            </p>
          </div>

          <Button variant="ghost" size="icon" asChild aria-label="Open settings">
            <Link to="/settings"><Settings className="size-4" /></Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="flex items-center gap-1 rounded-full border border-border bg-secondary py-1 pl-1 pr-2 transition-colors hover:bg-accent"
              >
                <span className="flex size-7 items-center justify-center rounded-full text-xs font-semibold" aria-hidden>
                  {initials(user.name || user.username)}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="truncate font-display font-semibold">{user.name || user.username}</span>
                  <span className="num truncate text-xs font-normal text-muted-foreground">BOID {user.demat}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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

        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium text-muted-foreground"
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
