import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Blocks,
  Briefcase,
  ChartCandlestick,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  History,
  LayoutDashboard,
  LineChart,
  Rocket,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

export const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/terminal", label: "Terminal", icon: ChartCandlestick },
  { to: "/tools", label: "Tools", icon: Blocks },
  { to: "/transactions", label: "Transactions", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export const IPO_NAV: NavItem[] = [
  { to: "/ipo", label: "IPO", icon: Rocket },
  { to: "/wacc", label: "Purchase Source", icon: Coins },
];

export const ACCOUNT_NAV: NavItem[] = [
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/ipo", label: "IPO", icon: Rocket },
];

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
          src="/logo.svg"
          alt="MeroShare Next logo"
          className="size-9 rounded-xl text-primary"
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

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-4">
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
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleClick = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "A" || tag === "BUTTON" || (e.target as HTMLElement).closest("a, button")) return;
    onToggleCollapsed();
  };

  return (
    <aside
      onClick={handleClick}
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        "cursor-pointer select-none transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[4.75rem]" : "w-64",
      )}
    >
      <Brand collapsed={collapsed} onToggle={onToggleCollapsed} />
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <NavGroup title="Overview" items={PRIMARY_NAV} pathname={pathname} collapsed={collapsed} />
        <NavGroup title="Issues" items={IPO_NAV} pathname={pathname} collapsed={collapsed} />
        <NavGroup title="Account" items={ACCOUNT_NAV} pathname={pathname} collapsed={collapsed} />
      </nav>
      {/* Hover grip indicator on the right edge */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1 items-center justify-center opacity-0 transition-opacity group-hover/sidebar:opacity-100">
        <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40" />
      </div>
    </aside>
  );
}
