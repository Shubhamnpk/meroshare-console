# More value, no database

Everything below runs either in the browser (stored on the user's own device) or off free public feeds we already talk to. Nothing new is stored on a server, so credentials and holdings stay session-only as before.

## 1. Cost basis & real profit/loss (device-stored)

Today the portfolio shows market value and day change, but not what you actually paid. Add a local "cost book": for each holding you enter (or import from the WACC page, which already returns purchase price) your buy price and date. Then the portfolio gets:

- Unrealised gain/loss per scrip and total, in rupees and percent
- Break-even price after broker commission, SEBON fee, DP charge and capital-gains tax (5% / 7.5% bands by holding period)
- "If I sell today" calculator showing net proceeds in hand
- XIRR / absolute return since first purchase

Stored in browser local storage, exportable and importable as a JSON/CSV file so the user can move it between devices or keep a backup. Clearly labelled as living only on this device.

## 2. Price and event alerts (in-app, while open)

A watchlist rule builder: alert when a scrip crosses a price, moves more than X% in a day, or hits a 52-week high/low. While the app is open, checks run against the live feed and fire a browser notification (with permission) plus a toast. Rules stored on device. Also alert on IPO events already in the feed: an issue opens, closes tomorrow, or an allotment result is out for something you applied for.

## 3. Tax and dividend workbook

- Capital-gains estimator for the year, built from the local cost book plus MeroShare transaction history
- Dividend tracker: the feed already carries cash/bonus announcements — cross-match with your holdings to show expected dividend income, bonus units and the resulting adjusted cost, with a book-close calendar
- One-click export of a year's transactions and gains as CSV for a tax filing

## 4. IPO command centre

- Applied-vs-result tracker with per-issue allotment history and your hit rate over time
- Reminder chips for issues closing within 24 hours
- Locked-capital view: how much of your money is currently sitting in ASBA blocks
- Bulk result check across every applied issue in one pass

## 5. Portfolio intelligence (computed, no storage)

- Concentration and risk panel: top-holding weight, sector weight, a warning when one scrip is over a threshold you set
- Correlation / beta of your portfolio against NEPSE using the chart history we already fetch
- Drawdown chart and best/worst day
- "What if" rebalancer: adjust unit sliders and see the resulting sector mix and value before you actually trade

## 6. Screener over the free feed

Filter all listed scrips by price, percent change, volume, turnover, P/E, EPS, market cap, sector, distance from 52-week high, and dividend yield. Save filter presets on the device. Rows link straight into the terminal chart.

## 7. Offline and speed

Cache the last successful market snapshot, portfolio and profile in the browser so the app opens instantly and still shows the last known figures (with an "as of" timestamp) when the network or the upstream feed is down. Add a PWA manifest so it installs to the home screen on mobile.

## 8. Small quality-of-life

- Calculators: broker commission, WACC merge, right-share/bonus adjusted cost, SIP-style averaging
- NEPSE market-open countdown and trading-holiday awareness
- Keyboard shortcuts and expanded command palette (jump to scrip, toggle theme, run a screen)
- Per-scrip notes and tags stored on device
- Share a read-only snapshot image of your portfolio performance (rendered client-side, nothing uploaded)

## Technical notes

- New `src/lib/local/` layer: a typed local-storage store with versioned schema, migration and export/import, used by cost book, alerts, notes, screener presets and settings.
- Alerts run in a single interval hook driven by the existing market snapshot query; Notification API with graceful fallback to toasts.
- Tax, XIRR, beta, drawdown and fee math live in pure functions in `src/lib/calc/` with unit tests.
- Screener and intelligence panels reuse the existing NEPSE server functions; no new upstream sources needed beyond what the terminal already merges.
- PWA via a manifest plus a cache-first service worker for the shell, network-first for data.

## Suggested build order

1. Local store + cost book + real P/L on portfolio
2. Screener
3. Alerts and IPO command centre
4. Tax/dividend workbook
5. Portfolio intelligence
6. PWA/offline and quality-of-life extras
