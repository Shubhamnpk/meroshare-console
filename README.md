# MeroShare Console

A modern, high-performance web client for Nepal Stock (NEPSE) and CDSC MeroShare investors.

Sign in with your own DP, username and password and get your **live CDSC data** in a polished,
responsive interface — installable as a PWA on mobile and desktop.

No demo data: every screen is powered by the real CDSC backend through a secure server-side proxy.

## Top services

| Service | What you get |
| ------- | ------------ |
| **Portfolio** | Live NEPSE price feed with auto-refresh, sector allocation breakdown, per-scrip detail (LTP, previous close, day change, holding value), portfolio value over time (daily/monthly/yearly), sector-weighted history chart |
| **Dividends** | Cash dividend, bonus share, merger and right credits, estimated cash payout per scrip, year-by-year breakdown with stat cards, filter and expand per-scrip tables |
| **Analytics** | Sector and scrip allocation donut charts, biggest movers today, top-5 concentration, gainers/losers count, interactive hover tooltips |
| **Transactions** | Full demat movement history (credits, debits, running balance), per-scrip filter and text search |
| **IPO & Applications** | All IPOs, apply screen, bank selection, application status reports, allotment results |
| **Purchase Source / WACC** | WACC calculation with per-scrip purchase history |
| **Activity & Account** | Last 30 days of sign-in and account activity, full MeroShare profile, account health indicators (password expiry, demat expiry, KYC status) |
| **Export** | Every page supports CSV, JSON, and PDF export via a format-picker modal |

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19 + Vite 8 + Nitro, server-rendered, file-based routing)
- [TanStack Query](https://tanstack.com/query) — caching, background auto-refresh, mutation invalidation
- [Tailwind CSS](https://tailwindcss.com) v4 + [shadcn/ui](https://ui.shadcn.com) components (Radix primitives)
- [Recharts](https://recharts.org) for pie/donut charts, [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) for candlestick/area charts
- [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable for PDF export
- [Zod](https://zod.dev) — input validation on every server function
- [Lucide](https://lucide.dev) icons, [sonner](https://sonner.emilkowal.ski/) toasts

## How it works

Because the CDSC backend enforces CORS restrictions and requires secure credential
encapsulation, this application proxies all requests through a fast server function
layer powered by Nitro and TanStack Start:

```
+-------------------------------+
     Client (Browser / PWA)
+-------------------------------+
               |  HTTPS / Server Functions
+-------------------------------+
    TanStack Start / Nitro      <--- Validates Zod schemas & decrypts
      Server Middleware              session token
+-------------------------------+
               |  Encrypted TLS / Headers / Auth Token
+-------------------------------+
   CDSC Backend (meroshare)     <--- Official CDSC Web Services
+-------------------------------+
```

`createServerFn` handlers in `src/lib/meroshare/*.functions.ts` wrap each CDSC endpoint;
`cdsc.server.ts` attaches the auth token and shared headers, and maps errors (including
CDSC's 401/403 session expiry and WAF-blocked HTML responses).

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.1+ (recommended) or Node.js 20+

### 1. Clone the repository

```sh
git clone https://github.com/Shubhamnpk/meroshare-next.git
cd meroshare-next
```

### 2. Install dependencies

```sh
bun install
```

### 3. Set up environment variables

Create a `.env.local` file from the example:

```sh
cp .env.example .env.local
```

Generate a secure random string for the session secret:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Add it to `.env.local`:

```
SESSION_SECRET=your_generated_random_secret_here
```

| Variable         | Required | Purpose                               |
| ---------------- | -------- | ------------------------------------- |
| `SESSION_SECRET` | yes      | Encrypts the httpOnly session cookie. |

### 4. Run the development server

```sh
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and sign in with your
MeroShare DP, username and password.

---

## Scripts

| Command          | Action                                       |
| :--------------- | :------------------------------------------- |
| `bun run dev`     | Start development server with HMR            |
| `bun run build`   | Build optimized production bundle with Nitro |
| `bun run preview` | Preview production build locally             |
| `bun run lint`    | Run ESLint and Prettier checks               |
| `bun run format`  | Auto-format source code with Prettier        |

---

## Project Structure

```
meroshare-next/
├── public/                  # Static assets, logos, icons, PWA manifest
├── src/
│   ├── components/
│   │   ├── market/          # Scrip sheets, technical charts
│   │   ├── portfolio/       # Valuation, history panels, dividends
│   │   ├── ui/              # Shadcn-inspired accessible primitives
│   │   ├── app-shell.tsx    # Dashboard layout, sidebar, command palette
│   │   └── export-dialog.tsx # PDF / CSV / JSON export engine
│   ├── hooks/               # Custom React hooks
│   ├── lib/
│   │   ├── meroshare/       # CDSC server functions, session, auth client
│   │   ├── nepse/           # Live market feeds, price calculations
│   │   ├── calc/            # Financial fees calculator
│   │   ├── format.ts        # NPR currency & date formatters
│   │   ├── version.ts       # App versioning and release notes
│   │   └── watchlist.tsx    # Watchlist state management
│   └── routes/              # TanStack Start file-based routing
│       ├── __root.tsx       # Root application shell & session handler
│       ├── index.tsx        # Sign-in portal with DP combobox
│       └── _dash.*.tsx      # Authenticated dashboard pages
├── package.json
└── vite.config.ts
```

---

## Deployment

MeroShare Console is built with **TanStack Start** and **Nitro**, configured for
Cloudflare Workers (`cloudflare-module` preset) out of the box.

First, build the production bundle:

```sh
bun run build
```

### Deploy to Cloudflare Workers

The build generates `.output/server/wrangler.json`, so deployment is a one-liner:

```sh
npx wrangler --cwd .output/server deploy
```

Or preview locally before shipping:

```sh
npx wrangler --cwd .output/server dev
```

Make sure `SESSION_SECRET` is set as a Worker secret:

```sh
npx wrangler secret put SESSION_SECRET
```

### Other platforms

Nitro ships presets for every major host — switch with `NITRO_PRESET`, rebuild, deploy:

| Platform | Build command | Run / deploy |
| :------- | :------------ | :----------- |
| Any Node server | `NITRO_PRESET=node-server bun run build` | `node .output/server/index.mjs` |
| Vercel | `NITRO_PRESET=vercel bun run build` | `vercel deploy --prebuilt` (or connect repo) |
| Netlify | `NITRO_PRESET=netlify bun run build` | `netlify deploy --prod` |
| Deno / Bun servers | `NITRO_PRESET=deno-server` / `bun-server` | run the emitted entry |

Wherever you host it, set `SESSION_SECRET` in that platform's environment variables
(`wrangler secret put SESSION_SECRET` on Workers, project settings on Vercel/Netlify,
`.env` or export on your own server).

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a
pull request. Bug reports and feature requests go through the issue templates.

---

## Disclaimer

**MeroShare Console** is an independent third-party open-source client. It is **not
affiliated with, endorsed by, or sponsored by CDS and Clearing Limited (CDSC) or Nepal
Stock Exchange (NEPSE)**.

All financial data, depository records, and trademarked names belong to their respective
owners and depository participants. Use at your own risk.

---

## License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
