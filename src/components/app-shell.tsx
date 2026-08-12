import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Briefcase,
  CalendarClock,
  CandlestickChart,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LineChart,
  LogOut,
  Rocket,
  Search,
  Settings,
  Star,
  UserRound,
} from "lucide-react";
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
import type { SessionUser } from "@/lib/meroshare/types";
import { CommandPalette } from "@/components/command-palette";
import { ScripSheet } from "@/components/market/scrip-sheet";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/chart", label: "Trading Chart", icon: CandlestickChart },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/transactions", label: "Transactions", icon: Activity },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

const IPO_NAV: NavItem[] = [
  { to: "/ipo", label: "Apply for Issue", icon: Rocket },
  { to: "/reports", label: "Application Report", icon: ClipboardList },
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
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/chart", label: "Chart", icon: CandlestickChart },
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

const SIDEBAR_KEY = "meroshare.sidebar-collapsed.v1";

function NavGroup({
  title,
  items,
  pathname,
  collapsed = false,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
}) {
  return (
    <div className="space-y-1">
      {collapsed ? (
        <div className="px-3 pb-1 pt-4">
          <div className="h-px bg-sidebar-border/70" aria-hidden />
        </div>
      ) : (
        <p className="px-3 pb-1 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          {title}
        </p>
      )}
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </div>
  );
}

function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center py-4",
        collapsed ? "flex-col justify-center gap-2" : "justify-between gap-2 px-3",
      )}
    >
      <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-2.5")}>
        <img
          src="/logo-512.png"
          alt="MeroShare Next logo"
          className="size-9 rounded-xl"
          aria-hidden
        />
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">MeroShare</p>
            <p className="text-[0.7rem] text-muted-foreground">CDSC Investor Console</p>
          </div>
        )}
      </div>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pickedScrip, setPickedScrip] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    } catch {
      // storage unavailable — keep expanded
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

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
    } finally {
      setSigningOut(false);
      navigate({ to: "/", replace: true });
    }
  };

  const navBody = (collapsedNav = false) => (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      <NavGroup title="Overview" items={PRIMARY_NAV} pathname={pathname} collapsed={collapsedNav} />
      <NavGroup title="Issues" items={IPO_NAV} pathname={pathname} collapsed={collapsedNav} />
      <NavGroup title="Account" items={ACCOUNT_NAV} pathname={pathname} collapsed={collapsedNav} />
    </nav>
  );

  return (
    <div className="min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        <Brand collapsed={collapsed} onToggle={toggleCollapsed} />
        {navBody(collapsed)}
      </aside>

      <div
        className={cn(
          "transition-[padding] duration-300 ease-in-out",
          collapsed ? "lg:pl-[4.75rem]" : "lg:pl-64",
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
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            asChild
            aria-label="Open settings"
          >
            <Link to="/settings">
              <Settings className="size-4" />
            </Link>
          </Button>
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

        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6">
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
        </div>
      </nav>

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
