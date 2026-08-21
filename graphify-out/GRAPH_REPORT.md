# Graph Report - D:\shubham\coding\meroshare-next  (2026-08-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 969 nodes · 2452 edges · 84 communities (37 shown, 47 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e1e9e2f6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- feed.server.ts
- _dash.profile.tsx
- routeTree.gen.ts
- devDependencies
- cn
- _dash.ipo.tsx
- sidebar.tsx
- compilerOptions
- index.tsx
- _dash.reports.tsx
- _dash.portfolio.tsx
- utils.ts
- auth.functions.ts
- scrip-sheet.tsx
- cdscRequest
- account.functions.ts
- formatNpr
- pagination.tsx
- server.ts
- app-shell.tsx
- requireAuth
- components.json
- format.ts
- queries.ts
- menubar.tsx
- api.server.ts
- form.tsx
- carousel.tsx
- dependencies
- chart.tsx
- drawer.tsx
- navigation-menu.tsx
- alert.tsx
- class-variance-authority
- clsx
- date-fns
- embla-carousel-react
- @hookform/resolvers
- input-otp
- lucide-react
- @radix-ui/react-accordion
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- @radix-ui/react-avatar
- @radix-ui/react-collapsible
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- @radix-ui/react-progress
- @radix-ui/react-scroll-area
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- react
- react-day-picker
- react-dom
- react-hook-form
- recharts
- sonner
- tailwind-merge
- tailwindcss
- @tailwindcss/vite
- @tanstack/react-query
- @tanstack/react-router
- @tanstack/react-start
- @tanstack/router-plugin
- tw-animate-css
- vaul
- vite-tsconfig-paths
- zod

## God Nodes (most connected - your core abstractions)
1. `cn()` - 260 edges
2. `requireAuth()` - 48 edges
3. `cdscRequest()` - 31 edges
4. `formatNpr()` - 29 edges
5. `formatQty()` - 25 edges
6. `toNumber()` - 23 edges
7. `ScripSheet()` - 22 edges
8. `formatPercent()` - 22 edges
9. `Button` - 22 edges
10. `compilerOptions` - 22 edges

## Surprising Connections (you probably didn't know these)
- `SortableHead()` --calls--> `cn()`  [EXTRACTED]
  src/routes/_dash.portfolio.tsx → src/lib/utils.ts
- `TabButton()` --calls--> `cn()`  [EXTRACTED]
  src/routes/_dash.portfolio.tsx → src/lib/utils.ts
- `TradingViewChart()` --calls--> `cn()`  [EXTRACTED]
  src/components/market/trading-view-chart.tsx → src/lib/utils.ts
- `AlertDialogFooter()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts
- `AlertDialogHeader()` --calls--> `cn()`  [EXTRACTED]
  src/components/ui/alert-dialog.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (84 total, 47 thin omitted)

### Community 0 - "feed.server.ts"
Cohesion: 0.06
Nodes (67): NeoCandlestickChart(), toCandles(), bitnepalJson(), cache, CacheEntry, dateKeyFromEpoch(), evaluateSnapshot(), FEED_ATTRIBUTION (+59 more)

### Community 1 - "_dash.profile.tsx"
Cohesion: 0.05
Nodes (46): PasswordDialog(), PinDialog(), SecurityDialogs(), ThemeToggle(), DialogContent, DialogDescription, DialogFooter(), DialogHeader() (+38 more)

### Community 2 - "routeTree.gen.ts"
Cohesion: 0.06
Nodes (47): getCurrentUser, sessionQuery(), getRouter(), Route, Route, Route, Route, Route (+39 more)

### Community 3 - "devDependencies"
Cohesion: 0.04
Nodes (46): eslint, eslint-config-prettier, @eslint/js, eslint-plugin-prettier, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @lovable.dev/vite-tanstack-config (+38 more)

### Community 4 - "cn"
Cohesion: 0.08
Nodes (38): Avatar, AvatarFallback, AvatarImage, Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList (+30 more)

### Community 5 - "_dash.ipo.tsx"
Cohesion: 0.15
Nodes (28): EmptyBlock(), ErrorBlock(), LoadingBlock(), Button, SelectContent, SelectItem, SelectScrollUpButton, SelectSeparator (+20 more)

### Community 6 - "sidebar.tsx"
Cohesion: 0.07
Nodes (30): Separator, Sidebar, SidebarContent, SidebarContext, SidebarContextProps, SidebarFooter, SidebarGroup, SidebarGroupAction (+22 more)

### Community 7 - "compilerOptions"
Cohesion: 0.06
Nodes (31): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/*.ts, src/**/*.tsx, vite/client, vite.config.ts (+23 more)

### Community 8 - "index.tsx"
Cohesion: 0.14
Nodes (22): Command, CommandDialog(), CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator (+14 more)

### Community 9 - "_dash.reports.tsx"
Cohesion: 0.10
Nodes (24): AccordionContent, AccordionItem, AccordionTrigger, JsonValue, applicationDetailsQuery(), applicationReportsQuery(), oldApplicationReportsQuery(), comparePairs() (+16 more)

### Community 10 - "_dash.portfolio.tsx"
Cohesion: 0.10
Nodes (25): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow (+17 more)

### Community 11 - "utils.ts"
Cohesion: 0.08
Nodes (16): TradingViewChart(), SwipeableCards(), Badge(), BadgeProps, badgeVariants, Checkbox, HoverCardContent, Progress (+8 more)

### Community 12 - "auth.functions.ts"
Cohesion: 0.13
Nodes (22): fetchCapitals(), logoutCdsc(), getCapitals, login, logout, performLogin(), toSessionUser(), BASE_HEADERS (+14 more)

### Community 13 - "scrip-sheet.tsx"
Cohesion: 0.16
Nodes (17): AreaChart(), clamp(), buildScripRanges(), chartDayLabel(), ChartModal(), SCRIP_RANGES, Point, Sparkline() (+9 more)

### Community 14 - "cdscRequest"
Cohesion: 0.14
Nodes (26): checkCanApply(), deleteIpoApplication(), editIpoApplication(), fetchApplicableIssues(), fetchApplicationReports(), fetchAppliedDetail(), fetchCurrentIssues(), fetchIssueManagerDetail() (+18 more)

### Community 15 - "account.functions.ts"
Cohesion: 0.14
Nodes (21): getAccountProfile, getActivityLog, getBankDetail, getBankRequest, getBanks, getMyDetail, updatePassword, updatePin (+13 more)

### Community 16 - "formatNpr"
Cohesion: 0.23
Nodes (22): CommandPalette(), chartTimeLabel(), Delta(), FinancialSummary(), ReportGroups(), ScripSheet(), formatNpr(), formatPercent() (+14 more)

### Community 17 - "pagination.tsx"
Cohesion: 0.11
Nodes (20): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay, AlertDialogTitle (+12 more)

### Community 18 - "server.ts"
Cohesion: 0.16
Nodes (13): consumeLastCapturedError(), describeError(), describeStatus(), originalConsoleError, safeStringify(), renderErrorPage(), fetch(), getServerEntry() (+5 more)

### Community 19 - "app-shell.tsx"
Cohesion: 0.13
Nodes (18): ACCOUNT_NAV, AppShell(), Brand(), initials(), IPO_NAV, MOBILE_NAV, NavGroup(), NavItem (+10 more)

### Community 20 - "requireAuth"
Cohesion: 0.21
Nodes (19): fetchHoldingSymbols(), fetchPortfolio(), fetchTransactions(), fetchWaccCalculated(), fetchWaccPending(), submitWacc(), calculateWacc, getEnrichedPortfolio (+11 more)

### Community 21 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 22 - "format.ts"
Cohesion: 0.20
Nodes (12): Input, formatDateTime(), formatNumber(), isoDate(), NUM, NUM2, activityLogQuery(), defaultActivityRange() (+4 more)

### Community 23 - "queries.ts"
Cohesion: 0.16
Nodes (17): getIndexGraph, getMarketMovers, getMarketSectors, getNews, getProposedDividends, getScripDetail, getScripFaceValues, getScripFinancials (+9 more)

### Community 24 - "menubar.tsx"
Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 25 - "api.server.ts"
Cohesion: 0.21
Nodes (15): ApplyIpoInput, ActivityLogItem, ApplicableIssue, ApplicationReportItem, BankDetail, BankListItem, Capital, MyShareItem (+7 more)

### Community 26 - "form.tsx"
Cohesion: 0.19
Nodes (12): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+4 more)

### Community 27 - "carousel.tsx"
Cohesion: 0.19
Nodes (13): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+5 more)

### Community 28 - "dependencies"
Cohesion: 0.15
Nodes (13): cmdk, lightweight-charts, dependencies, cmdk, lightweight-charts, @radix-ui/react-checkbox, @radix-ui/react-radio-group, @radix-ui/react-toggle (+5 more)

### Community 29 - "chart.tsx"
Cohesion: 0.25
Nodes (9): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, getPayloadConfigFromPayload(), THEMES (+1 more)

### Community 30 - "drawer.tsx"
Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 31 - "navigation-menu.tsx"
Cohesion: 0.29
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 32 - "alert.tsx"
Cohesion: 0.50
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

## Knowledge Gaps
- **222 isolated node(s):** `CacheEntry`, `Rec`, `ToasterProps`, `LovableErrorOptions`, `LovableEvents` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **47 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `_dash.profile.tsx`, `_dash.ipo.tsx`, `sidebar.tsx`, `index.tsx`, `_dash.reports.tsx`, `_dash.portfolio.tsx`, `utils.ts`, `scrip-sheet.tsx`, `formatNpr`, `pagination.tsx`, `app-shell.tsx`, `format.ts`, `queries.ts`, `menubar.tsx`, `form.tsx`, `carousel.tsx`, `chart.tsx`, `drawer.tsx`, `navigation-menu.tsx`, `alert.tsx`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `devDependencies`, `class-variance-authority`, `clsx`, `date-fns`, `embla-carousel-react`, `@hookform/resolvers`, `input-otp`, `lucide-react`, `@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`, `@radix-ui/react-collapsible`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `react`, `react-day-picker`, `react-dom`, `react-hook-form`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/router-plugin`, `tw-animate-css`, `vaul`, `vite-tsconfig-paths`, `zod`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `CacheEntry`, `Rec`, `ToasterProps` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `feed.server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06354642313546423 - nodes in this community are weakly interconnected._
- **Should `_dash.profile.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0523532522474881 - nodes in this community are weakly interconnected._
- **Should `routeTree.gen.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05803921568627451 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._