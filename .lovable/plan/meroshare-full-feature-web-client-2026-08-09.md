# MeroShare — full-feature web client

A real MeroShare client: users sign in with their own DP, username, password and PIN, and every screen shows their live CDSC data. No demo data anywhere.

One note up front: this project runs on TanStack Start (React + Vite), not Next.js. Next.js can't be installed here, but the result is the same kind of app — server-rendered React, server-side API handling, one codebase for desktop and mobile.

## How it works

The CDSC backend (`webbackend.cdsc.com.np`) cannot be called from a browser — it blocks cross-origin requests and would expose credentials. So every call goes through this app's own server layer:

```text
Browser  ->  app server functions  ->  webbackend.cdsc.com.np
          (encrypted session cookie holds the CDSC auth token)
```

The user's password and PIN are never stored in a database and never sent to the browser again after login. They live only inside an encrypted, httpOnly session cookie for the duration of the session; logging out clears it and calls the CDSC logout endpoint. The PIN is re-entered by the user for every transaction rather than kept in the session.

## Features (full parity)

**Auth**

- Login with capital/DP picker (loaded live from the capital list), username, password
- Session expiry handling, auto sign-out, real logout

**Dashboard**

- Account summary: name, BOID, demat, status, bank
- Portfolio value, today's change, top movers, sector split
- Open IPOs with a countdown and one-tap apply

**Portfolio & holdings**

- My Portfolio with live valuation, WACC vs LTP, profit/loss per scrip
- My Shares (holdings list), current holding symbols
- Share transaction history with filters, search, and date range

**IPO / ASBA**

- Applicable issues list with issue-manager details
- Eligibility check per BOID, apply with bank, quantity, CRN and PIN
- Edit and delete a pending application
- Application reports (current + migrated/old) with full detail views
- IPO result check against the CDSC result service

**Purchase source / WACC**

- Pending (WACC not calculated) and calculated lists
- Submit WACC calculation for a scrip

**Account**

- My details, bank details, bank list and detail views
- Activity log with pagination and filters
- Change password, change transaction PIN

**Analytics**

- Portfolio performance, allocation and P/L charts built from the user's own real holdings and transactions
- Auto-refresh of portfolio data on an interval, with manual pull-to-refresh

Live NEPSE market prices are out of scope for now (no source chosen yet); valuations use the price data MeroShare itself returns. A price source can be plugged in later without changing the UI.

## Design

Modern financial-dashboard aesthetic, dark-first with a light mode, built as a real design system (no hardcoded colours). Desktop gets a collapsible sidebar and dense data tables; mobile gets a bottom tab bar, card-based lists instead of tables, sticky action bars and large touch targets. Numbers use tabular figures, Nepali currency formatting and BS/AD dates where MeroShare uses them.

## Technical notes

- `createServerFn` handlers wrap each CDSC endpoint; a shared server-only client attaches the auth token, base headers and error mapping
- Encrypted session via `@tanstack/react-start/server` `useSession`, backed by a generated `SESSION_SECRET`
- TanStack Query for caching, background refetch and mutation invalidation
- Zod validation on every server function input; PIN and password never logged
- Route gate redirects unauthenticated users to `/login`; `/` is the login screen for signed-out users and the dashboard for signed-in ones

## Build order

1. Design system, layout shells (desktop sidebar + mobile tabs), session + login
2. Dashboard, portfolio, holdings, transactions
3. IPO: applicable issues, apply/edit/delete, reports, results
4. Purchase source/WACC, account, activity log, password/PIN
5. Analytics charts, auto-refresh, polish and mobile pass
