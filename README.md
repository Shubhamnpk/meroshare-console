# MeroShare Next

A modern, real MeroShare client for Nepali investors. Sign in with your own DP,
username and password and get your **live CDSC data** — portfolio valuation,
holdings, share transactions, IPO applications, WACC and account details — in a
polished, dark-first interface built for both desktop and mobile.

No demo data anywhere: every screen is powered by the real CDSC backend through
a secure server-side proxy.

## Highlights

- **Real data, real sessions** — users log in with their own MeroShare
  credentials; everything is fetched live from CDSC (`webbackend.cdsc.com.np`).
- **Full MeroShare parity** — Portfolio, My Shares, Transactions, IPO apply +
  reports + results, Purchase Source / WACC, Activity Log, My Profile, bank
  details, change password / transaction PIN.
- **Modern UI/UX** — dark-first design system (oklch tokens, no hardcoded
  colours), desktop sidebar + mobile bottom tabs, hover popovers, tabular
  numbers with NPR formatting, per-page search and CSV export.
- **Secure by design** — the browser never talks to CDSC directly. Credentials
  live only in an encrypted, httpOnly session cookie; the password and PIN are
  never stored or logged; the PIN is re-entered for every transaction.
- **Resilient** — session-expiry detection with auto sign-out, WAF-block
  detection (CDSC's filter rejects some endpoints with HTML), graceful
  error states and Zod validation on every server function.

## Tech stack

- **TanStack Start** (React + Vite, server-rendered, file-based routing)
- **TanStack Query** — caching, background auto-refresh, mutation invalidation
- **Tailwind CSS** + shadcn-style UI components (Radix primitives)
- **Zod** — input validation on every server function
- **Lucide** icons, `sonner` toasts

## How it works

The CDSC backend cannot be called from a browser (CORS + credential exposure),
so every request is proxied through the app's own server layer:

```text
Browser  ->  app server functions  ->  webbackend.cdsc.com.np
          (encrypted session cookie holds the CDSC auth token)
```

`createServerFn` handlers in `src/lib/meroshare/*.functions.ts` wrap each CDSC
endpoint; `cdsc.server.ts` attaches the auth token and shared headers, and maps
errors (including CDSC's 401/403 session expiry and WAF-blocked HTML responses).

## Getting started

Requires Node.js 20+ and npm.

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
```

Copy the environment template and set a strong session secret:

```sh
cp .env.example .env.local
```

| Variable         | Required | Purpose                                   |
| ---------------- | -------- | ----------------------------------------- |
| `SESSION_SECRET` | yes      | Encrypts the httpOnly session cookie.     |

Then start the dev server:

```sh
npm run dev
```

Open the printed URL (default `http://localhost:3000`) and sign in with your
MeroShare DP, username and password.

## Scripts

```sh
npm run dev       # start the dev server
npm run build     # production build
npm run start     # serve the production build
npm run lint      # eslint
npm run typecheck # tsc --noEmit
```

## Project layout

```text
src/
├── components/        # UI kit (ui/), app shell, settings, states
├── lib/
│   ├── meroshare/     # CDSC integration: api.server.ts (fetchers),
│   │                  # cdsc.server.ts (HTTP client + URLs), session.server.ts
│   │                  # *.functions.ts (createServerFn wrappers), types.ts
│   ├── queries.ts     # TanStack Query options per feature
│   ├── format.ts      # NPR formatting, dates, error/session helpers
│   └── settings.tsx   # local settings store (theme, auto-refresh, …)
└── routes/            # TanStack Router file routes (_dash.* = signed-in pages)
```

## Security notes

- Password and transaction PIN are sent straight to CDSC and never persisted.
- The session token is stored server-side in an encrypted, httpOnly cookie.
- Every server function validates its input with Zod before touching CDSC.
- Sessions are cleared on logout and on expiry (auto sign-out to the login screen).

---

Built with [Lovable](https://lovable.dev) — an independent client for MeroShare,
not affiliated with CDSC. All data belongs to CDSC/MeroShare and your DP.
