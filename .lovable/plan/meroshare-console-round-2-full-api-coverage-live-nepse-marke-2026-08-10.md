# MeroShare console — round 2: full API coverage + live NEPSE market data

I re-read the whole MeroShare API reference and compared it to what the app already does, then went looking for a real, working NEPSE market data source. Two gaps stood out: a few CDSC endpoints are still unused, and the app currently has no live market prices — so portfolio valuation relies only on what MeroShare returns.

## 1. Live NEPSE market data (verified working today)

I tested several public NEPSE sources. Most are dead or return 404. One is live, free, no key, updated automatically:

- All-scrip live prices (LTP, prev close, change %, high/low, volume, turnover, 52-week) — 352 scrips
- NEPSE + sensitive + sector indices
- Top gainers / losers / turnover / volume / transactions
- Market summary (turnover, traded shares, transactions, scrips)
- Open-ended mutual fund NAVs, IPO archive, proposed dividends, broker directory

All of it is fetched server-side and cached, so nothing extra hits the user's browser and the feed can be swapped for another provider later without touching the UI.

## 2. MeroShare endpoints not yet wired

- **Current issues** (`companyShare/currentIssue`) — every open, upcoming and closed issue, not just the ones this BOID can apply for. Powers a proper IPO calendar.
- **Bank request detail** (`bankRequest/{bankCode}`) — CRN, branch and KYC details, so the ASBA apply form auto-fills CRN instead of asking the user to type it.
- **Full my-detail / bank-detail field coverage** — account status, DP name, KYC state, citizenship, account open date, suspension flags surfaced in the profile.

## 3. New features this unlocks

**Market**

- Market overview page: NEPSE index with sector indices, market summary bar, top gainers/losers/turnover/volume tables
- Scrip detail sheet: LTP, day range, 52-week range, volume, turnover, and the user's own holding + P/L in the same view
- Live search across all listed scrips (command palette, `Ctrl+K`)
- Watchlist for scrips the user doesn't own yet (saved locally to the device, no account needed)

**Portfolio, now with real prices**

- True market valuation of every holding against live LTP, not just MeroShare's cached price
- Day change per scrip and for the whole portfolio, in rupees and percent
- Unrealised P/L per scrip using WACC from purchase source, with total cost vs market value
- Sector allocation and concentration breakdown from live sector mapping
- Best/worst performers, and a portfolio-vs-NEPSE comparison

**IPO**

- IPO calendar: open now, upcoming, and recently closed, with countdown timers
- Auto-filled CRN and bank branch on the apply form
- IPO archive with historical issues and past results
- Result checking for every applied issue in one pass instead of one at a time

**Extras**

- Proposed and announced dividends for scrips the user holds, with estimated cash and bonus value
- Open-ended mutual fund NAV tracker
- Broker directory
- CSV export for portfolio, transactions and application reports
- Auto-refresh of market data during trading hours (11:00–15:00 NPT, Sun–Thu) with a manual refresh and a "last updated" stamp

## 4. Design

Same dark-first financial aesthetic, extended: gainer/loser colour tokens, sparkline mini-charts, tabular numerals everywhere, sticky table headers on desktop and card lists on mobile. New nav entries for Market, Watchlist, Dividends and Funds; mobile bottom bar stays at five items with the rest behind a "More" sheet.

## 5. Technical notes

- New `src/lib/nepse/` module: server-only fetcher with an in-memory TTL cache (60s for prices, 10min for slow-moving sets), Zod-validated responses, and a graceful fallback so the app still works when the feed is down (falls back to MeroShare's own prices, with a banner).
- New server functions: `getMarketSnapshot`, `getScrip`, `getIndices`, `getTopStocks`, `getDividends`, `getMutualFunds`, `getBrokers`, plus CDSC `getCurrentIssues` and `getBankRequest`.
- Portfolio enrichment happens server-side: MeroShare holdings joined to live prices by symbol before reaching the client.
- Watchlist persists in local storage only — no new backend, no accounts, credentials stay session-only as before.
- Market data is clearly labelled as unofficial and indicative; nothing about it touches the ASBA/apply path.

## Build order

1. NEPSE data layer + caching + server functions
2. Market overview, scrip detail, command-palette search, watchlist
3. Portfolio/dashboard enrichment with live prices, P/L and sector charts
4. Current issues + IPO calendar, CRN auto-fill, bulk result check, IPO archive
5. Dividends, mutual funds, brokers, CSV export, trading-hours auto-refresh, mobile pass
