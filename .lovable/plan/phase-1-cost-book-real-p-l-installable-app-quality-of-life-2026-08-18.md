# Phase 1: cost book, real P/L, installable app, quality-of-life

Nothing new is stored on a server. The cost book and preferences live in the browser's own storage on the user's device, with export/import so nothing is trapped there. Credentials stay session-only exactly as today.

## 1. Local store

A single versioned store in browser local storage holding: cost book entries, per-scrip notes/tags, and small UI preferences. It has a schema version and migration path so future changes don't wipe anyone's data, plus one place to export everything as a JSON file and import it back on another device. A "your data lives only on this device" note and a clear-all button in Settings.

## 2. Cost book

For each holding the user records what they actually paid:

- Add a buy lot: units, price per unit, date, optional broker number
- Multiple lots per scrip, so averaging works properly
- Prefill from the WACC page where MeroShare already knows the purchase price, and from transaction history where a credit entry exists — the user confirms before it's saved
- Edit and delete lots; a scrip with no lots simply shows "cost not set"

## 3. Real profit and loss on the portfolio

With cost known, the portfolio and dashboard gain:

- Weighted average cost per scrip and total invested
- Unrealised gain/loss per scrip and overall, in rupees and percent, alongside the existing day change
- Sell calculator per holding: enter units and price, see broker commission (NEPSE slab), SEBON fee, DP charge, capital-gains tax (5% long / 7.5% short by holding period), and the net amount in hand
- Break-even price — the price at which a sale nets zero after all charges
- A total-return line on the portfolio: invested vs current value vs realised charges

Holdings without a recorded cost are shown honestly as "cost not set" rather than assumed, and the totals say how much of the portfolio is covered.

## 4. Installable app (no offline)

Manifest plus icons so the app installs to the home screen on Android and iOS and launches standalone with the brand colour and splash. No service worker and no offline caching in this phase — it still needs a connection, it just looks and launches like an app.

## 5. Quality-of-life extras

- Calculators page: broker commission, WACC merge of two lots, right-share and bonus adjusted cost, sell-net-proceeds — all usable without any holdings
- Market-open countdown in the header: open/closed/pre-open state and time to the next session
- Per-scrip notes and tags, shown on the scrip sheet and portfolio row
- Expanded command palette: jump to any scrip, open a calculator, switch theme, run a page
- Copy-to-clipboard and CSV export on the portfolio and transactions tables

## Technical notes

- `src/lib/local/store.ts`: typed, versioned local-storage store with a React context and hook; `costbook.ts`, `notes.ts` as typed slices over it; export/import as one JSON envelope.
- `src/lib/calc/fees.ts`: pure functions for NEPSE broker commission slabs, SEBON 0.015%, DP Rs 25, CGT bands, break-even and net proceeds — with unit tests.
- Portfolio P/L is derived client-side by joining the enriched-portfolio server data with the local cost book; no server function changes.
- PWA: `public/manifest.webmanifest`, generated maskable icons, head tags in `src/routes/__root.tsx`. Manifest-only per the PWA guidance — no service worker, no registration code.
- New routes: `/_dash.calculators.tsx`; cost-book editing lives in a dialog on the portfolio page rather than its own page.

## Build order

1. Local store + export/import + Settings data section
2. Cost book entry, prefill from WACC/transactions
3. Fee/tax math + portfolio P/L columns, sell calculator, break-even
4. Manifest and icons
5. Calculators page, market countdown, notes, palette and export extras
