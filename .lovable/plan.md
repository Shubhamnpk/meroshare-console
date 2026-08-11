# Finishing the leftovers

I audited the app against the round-2 checklist. Most of it is already live: market overview, watchlist, scrip sheet, command palette, live-price portfolio enrichment, IPO calendar + archive, CRN auto-fill, CSV exports on portfolio/transactions/reports/activity/WACC, and auto-refresh from settings.

## Already done (no work needed)
- Market page with indices, movers, sectors, full scrip search
- Watchlist (device-local)
- Enriched portfolio with live LTP, day change, P/L, sector weights
- IPO calendar (current issues) + IPO archive + CRN/bank auto-fill
- CSV export on all report-style pages
- Trading-hours auto-refresh wired to Settings

## Leftovers to build

1. **Dividends page** — proposed/announced dividends as its own screen (currently only a small panel inside Portfolio), split into "my holdings" vs "all listed", with estimated cash and bonus value per holding, and CSV export.

2. **Mutual fund NAV tracker** — open-ended fund NAV list with search, sort and change indicators. The previously-planned feed path for funds returns 404, so I will re-verify a working source first; if none is live, the page ships reading NAVs from the existing scrip feed for listed closed-end funds only, clearly labelled.

3. **Broker directory** — searchable list of brokers (number, name, address, contact). Same feed caveat as above: verify a live source, otherwise fall back to a maintained static list bundled with the app and labelled as reference data.

4. **Bulk IPO result check** — one action on Reports that resolves allotment status for every applied issue in a single pass, with a per-row status column instead of checking one at a time.

5. **Navigation + mobile pass** — add Dividends, Funds and Brokers to the sidebar; mobile bottom bar stays at five items with the extras behind a "More" sheet.

6. **Per-route head metadata** — unique title/description/OG tags on the new routes.

## Technical notes
- New routes: `src/routes/_dash.dividends.tsx`, `_dash.funds.tsx`, `_dash.brokers.tsx`.
- New server functions in `src/lib/nepse/market.functions.ts` (`getMutualFunds`, `getBrokers`) backed by `feed.server.ts` with the same TTL cache and graceful-degrade behaviour; queries added to `src/lib/queries.ts`.
- Bulk result check reuses the existing `getApplicationDetails` batching in `ipo.functions.ts`; no new CDSC endpoint required.
- No new backend, no stored credentials — session stays cookie-only as today.
