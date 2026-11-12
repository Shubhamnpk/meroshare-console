import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
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
  Menu,
  Rocket,
  Send,
  Settings,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { brokerConnectionsQuery } from "@/lib/queries";
import { loadYoWallet } from "@/lib/yobroker/store";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

export const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/terminal", label: "Terminal", icon: ChartCandlestick },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/transactions", label: "Transactions", icon: History },
  { to: "/tools", label: "Tools", icon: Blocks },
];

export const IPO_NAV: NavItem[] = [
  { to: "/ipo", label: "IPO", icon: Rocket },
  { to: "/wacc", label: "Purchase Source", icon: Coins },
  { to: "/edis", label: "EDIS Transfer", icon: Send },
];

export const TRADE_NAV: NavItem[] = [{ to: "/broker", label: "Broker Account", icon: ArrowLeftRight }];

export const ACCOUNT_NAV: NavItem[] = [
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** The four tabs that stay pinned on a phone. Everything else lives behind "More". */
export const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/market", label: "Market", icon: LineChart },
  { to: "/transactions", label: "Transactions", icon: History },
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
        <div className="px-3 pb-0.5 pt-2">
          <div className="h-px bg-sidebar-border/70" aria-hidden />
        </div>
      ) : (
        <p className="px-3 pb-1 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          {title}
        </p>
      )}
      {items.map((item) => {
        const active = pathname === item.to;
        // Expanded rows get the full treatment (gradient wash + accent bar +
        // filled tile). Collapsed rail stays bare: no row background at all,
        // the filled tile alone marks the active icon.
        const rowClass = collapsed
          ? active
            ? "font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:text-foreground"
          : active
            ? "bg-gradient-to-r from-primary/[0.14] via-primary/[0.06] to-transparent font-semibold text-foreground"
            : "font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground";
        const tileClass = cn(
          "flex shrink-0 items-center justify-center rounded-xl transition-all duration-200",
          collapsed ? "size-9" : "size-7 rounded-lg",
          active
            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
            : collapsed
              ? "text-muted-foreground group-hover/item:scale-105 group-hover/item:text-foreground"
              : "bg-muted/50 text-muted-foreground group-hover/item:bg-muted group-hover/item:text-foreground",
        );
        return (
          <Link
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group/item relative flex items-center rounded-xl text-sm transition-all duration-200",
              collapsed ? "justify-center px-0 py-0.5" : "gap-2.5 px-2.5 py-1.5",
              rowClass,
            )}
          >
            {active && !collapsed ? (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_1px] shadow-primary/40"
              />
            ) : null}
            <span className={tileClass}>
              <item.icon className="size-4" aria-hidden />
            </span>
            {!collapsed && <span className="truncate">{item.label}</span>}
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
        <img src="/logo.svg" alt="MeroShare Next logo" className="size-9 rounded-xl text-primary" aria-hidden />
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
  const { edisBeta } = useSettings();
  const connections = useQuery(brokerConnectionsQuery());
  const [moreOpen, setMoreOpen] = useState(false);

  const yoActive = (() => {
    try {
      return loadYoWallet(null).active;
    } catch {
      return false;
    }
  })();
  const brokerLinked = (connections.data?.length ?? 0) > 0 || yoActive;

  // Same order as the desktop sidebar, minus the pinned tabs.
  const moreNav: NavItem[] = [
    { to: "/terminal", label: "Terminal", icon: ChartCandlestick },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/tools", label: "Tools", icon: Blocks },
    ...IPO_NAV.filter((item) => item.to !== "/edis" || edisBeta),
    ...(brokerLinked ? TRADE_NAV : []),
    ...ACCOUNT_NAV,
  ];
  const moreActive = MOBILE_NAV.every((item) => pathname !== item.to);

  // Close the sheet whenever navigation lands somewhere new.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <MobileTab key={item.to} item={item} active={pathname === item.to} />
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn("flex min-w-0 flex-col items-center gap-1 py-1.5", moreActive && "text-primary")}
          >
            <span
              className={cn(
                "flex h-7 items-center justify-center rounded-full px-3.5 transition-colors",
                moreActive ? "bg-primary/12 text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" aria-hidden />
            </span>
            <span
              className={cn(
                "max-w-full truncate text-[0.65rem] leading-none tracking-tight",
                moreActive ? "font-semibold" : "font-medium text-muted-foreground",
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-1 text-left">
            <DrawerTitle className="font-display text-base">All pages</DrawerTitle>
            <DrawerDescription className="text-xs">Everything else in the console.</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {moreNav.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center text-[0.7rem] leading-tight transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                      : "border-border/60 bg-card/60 font-medium text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  <span className="line-clamp-2">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function MobileTab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className="flex min-w-0 flex-col items-center gap-1 py-1.5"
    >
      <span
        className={cn(
          "flex h-7 items-center justify-center rounded-full px-3.5 transition-colors",
          active ? "bg-primary/12 text-primary" : "text-muted-foreground",
        )}
      >
        <item.icon className="size-5" aria-hidden />
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[0.65rem] leading-none tracking-tight",
          active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function AppSidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { edisBeta } = useSettings();
  const connections = useQuery(brokerConnectionsQuery());
  const yoActive = (() => {
    try {
      return loadYoWallet(null).active;
    } catch {
      return false;
    }
  })();
  const brokerLinked = (connections.data?.length ?? 0) > 0 || yoActive;

  const handleClick = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "A" || tag === "BUTTON" || (e.target as HTMLElement).closest("a, button")) return;
    onToggleCollapsed();
  };

  // EDIS is beta-gated; broker trading hides until a broker is linked.
  const ipoNav = IPO_NAV.filter((item) => item.to !== "/edis" || edisBeta);
  const tradeNav = TRADE_NAV.filter(() => brokerLinked);

  return (
    <aside
      onClick={handleClick}
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        "cursor-pointer select-none transition-[width] duration-300 ease-in-out",
        collapsed ? "w-[4.75rem]" : "w-60",
      )}
    >
      <Brand collapsed={collapsed} onToggle={onToggleCollapsed} />
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <NavGroup title="Overview" items={PRIMARY_NAV} pathname={pathname} collapsed={collapsed} />
        {tradeNav.length > 0 ? (
          <NavGroup title="Trading" items={tradeNav} pathname={pathname} collapsed={collapsed} />
        ) : null}
        <NavGroup title="Issues" items={ipoNav} pathname={pathname} collapsed={collapsed} />
        <NavGroup title="Account" items={ACCOUNT_NAV} pathname={pathname} collapsed={collapsed} />
      </nav>
      {/* Hover grip indicator on the right edge */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-1 items-center justify-center opacity-0 transition-opacity group-hover/sidebar:opacity-100">
        <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40" />
      </div>
    </aside>
  );
}
