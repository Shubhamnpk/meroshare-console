# Naasa X (x.naasasecurities.com.np) API Reference

Reverse-engineered from the production frontend bundles. No credentials were used;
all findings below come from **publicly served JavaScript** plus **anonymous**
HTTP probes (no authenticated calls were made).

> Scope note: this is the Naasa Securities broker terminal ("Naasa X"), **not**
> the classic NEPSE TMS Angular app at `tms77.nepsetms.com.np` (different stack,
> different auth — see §10). A parallel effort is documenting that system from
> `docs/tms-bundles/` + `tms-*.tmp.mjs`; those files were intentionally left
> untouched — this document only reads their output for comparison.

- Target: `https://x.naasasecurities.com.np/` → `307 /login`
- Login page: `https://x.naasasecurities.com.np/login` → `200`, Next.js App Router
- Date reverse-engineered: 2026-09-08
- Raw evidence (local, git-ignored): `C:\Users\shubh\AppData\Local\Temp\opencode\xnasa\`
  (`chunks/` = 32 downloaded webpack chunks, `extract*.mjs`, `probe.mjs`,
  `probe-results.txt`, `keycloak-openid-config.json`)

## 1. Architecture

```
Browser ──► x.naasasecurities.com.np (Next.js, nginx)
              ├─ /login, /order, /market, /heatmap, /reports/*, /resources (RSC pages)
              └─ /api/* (same-origin route handlers — ALL proxy/hide the real backend)
                    ├─ next-auth: /api/auth/* (Keycloak OAuth2+PKCE, public client `blaze`)
                    ├─ POST /api/auth/trading-login {action} (broker trading session)
                    ├─ GET  /api/feed/<ServiceName>?params (quote/market data services)
                    ├─ POST /api/market-watch {template} (index ticker list)
                    ├─ POST /api/CI/GetTicketLogs {} (support tickets)
                    └─ GET  /api/portfolio/redirect | /api/portfolio/developer-testing-redirect
Auth IdP: auth.naasasecurities.com.np/realms/naasa (Keycloak, realm `naasa`)
Siblings: charts.naasasecurities.com.np, wallet.naasasecurities.com.np,
          release.naasasecurities.com.np, www.naasasecurities.com.np/profile
```

- Framework: **Next.js App Router** (`/_next/static/chunks/...`, RSC flight data in HTML).
- Auth library: **next-auth (Auth.js)** with a single provider: `keycloak`.
- Session tokens (`accessToken`, `idToken`) live in the next-auth session (server
  httpOnly cookies `__Host-next-auth.csrf-token`, `__Secure-next-auth.callback-url`
  observed; session cookie set after login). The browser never talks to the
  trading backend directly — every data call goes through `/api/*`.
- No WebSocket/SignalR/socket.io client code in the login+layout bundles; market
  data is polled via TanStack Query (`staleTime`/`gcTime`, `refetchOnWindowFocus:
  false`). Live streaming for the authenticated terminal (if any) lives in the
  post-login page chunks, which are middleware-gated (see §7) and were not fetched.
- No `tmsapi` / classic-TMS URL strings anywhere in these bundles — the upstream
  backend address is server-side only.

## 2. Authentication flow

### 2.1 Keycloak (OAuth2 Authorization Code + PKCE S256, public client)

Discovered OIDC metadata (`GET
https://auth.naasasecurities.com.np/realms/naasa/.well-known/openid-configuration`
→ 200, saved as `keycloak-openid-config.json`):

| Purpose        | Endpoint                                                              |
| -------------- | --------------------------------------------------------------------- |
| issuer         | `https://auth.naasasecurities.com.np/realms/naasa`                     |
| authorization  | `.../protocol/openid-connect/auth`                                    |
| token          | `.../protocol/openid-connect/token`                                   |
| userinfo       | `.../protocol/openid-connect/userinfo`                                |
| jwks           | `.../protocol/openid-connect/certs`                                   |
| end_session    | `.../protocol/openid-connect/logout`                                  |

Authorization request (as built by next-auth + observed in the login redirect):

```
GET https://auth.naasasecurities.com.np/realms/naasa/protocol/openid-connect/auth
  ?client_id=blaze
  &scope=openid%20email%20profile
  &response_type=code
  &redirect_uri=https%3A%2F%2Fx.naasasecurities.com.np%2Fapi%2Fauth%2Fcallback%2Fkeycloak
  &state=...&code_challenge=...&code_challenge_method=S256
```

- `client_id=blaze`, public client (PKCE, no client secret in the bundle).
- Callback: `GET /api/auth/callback/keycloak` (next-auth route; anonymous hit →
  `302 /api/auth/error?error=OAuthCallback`, which is the expected "no OAuth
  state" response and proves the route exists).
- Providers endpoint (anonymous, 200):
  `GET /api/auth/providers` →
  `[{"keycloak":{"id":"keycloak","name":"Keycloak","type":"oauth",
  "signinUrl":"https://x.naasasecurities.com.np/api/auth/signin/keycloak",
  "callbackUrl":"https://x.naasasecurities.com.np/api/auth/callback/keycloak"}}]`
- Session endpoint (anonymous, 200): `GET /api/auth/session` → `{}`.
- Unauthenticated API access redirects: `GET
  /api/auth/signin?error=SessionRequired&callbackUrl=/` → `302
  /login?callbackUrl=https%3A%2F%2Fx.naasasecurities.com.np%2F&error=SessionRequired`.

Client login-page logic (from `app/login/page-*.js`):

1. `useSession()` → status `unauthenticated` ⇒
   `signIn("keycloak", { callbackUrl: "/login?clientId=<id>" | "/login" })`.
   (`clientId` here is a login-page query param — broker/client selector — **not**
   the Keycloak `client_id=blaze`.)
2. Status `authenticated` + trading store `idle` ⇒ run trading-login flow (§2.2).
3. Client code is derived **client-side by decoding the JWT**:
   `jwtDecode(accessToken).ClientCode ?? .clientCode`.

### 2.2 Trading session (broker backend session on top of Keycloak login)

`POST /api/auth/trading-login` — `Content-Type: application/json`.

| action    | Request body        | Success response shape                          |
| --------- | ------------------- | ----------------------------------------------- |
| `"LOGIN"` | `{"action":"LOGIN"}`  | `{ clientCode, sessionNo, finalToken }` (any may be null) |
| `"LOGOUT"`| `{"action":"LOGOUT"}` | (clears store regardless; `finally` block)      |

- Anonymous → `401 {"error":"Unauthorized"}` (proves next-auth gate, not the
  upstream error).
- Client behavior: missing `clientCode` in response ⇒ error
  `"Client code not found, or your trading account is not activated."`
- `401` with body `{ logout: true }` ⇒ full logout: clear trading store +
  next-auth `signOut` + redirect to Keycloak logout.
- Zustand store: `{ status: idle|loading, clientCode, sessionNo, finalToken,
  error }`.

### 2.3 Logout (3-step, from layout + login chunks)

1. `POST /api/auth/trading-login {"action":"LOGOUT"}` (best-effort).
2. next-auth `signOut({ redirect: false })`.
3. Browser redirect to Keycloak end-session:
   `{NEXT_PUBLIC_SIGNOUT_URI || "https://auth.naasasecurities.com.np/realms/naasa/protocol/openid-connect/logout"}?post_logout_redirect_uri=<url>&id_token_hint=<idToken>`
   where the redirect target defaults to `https://x.naasasecurities.com.np/login`
   (or `window.location.origin + "/login"` when `redirectToLogin`).

- Env override: `NEXT_PUBLIC_SIGNOUT_URI` (only `NEXT_PUBLIC_*` var referenced).

## 3. Endpoint catalog (same-origin `/api/*`)

All data routes are session-gated: anonymous requests return
`401 {"error":"Unauthorized"}` with `content-type: application/json`, served
through `server: nginx`. `GET /api/market-watch` returns `405` (POST-only).

### 3.1 `GET /api/feed/<ServiceName>` — quote/market data services

Generic service proxy. Client hook (`73025` in layout chunk):

```js
useQuery({
  queryKey: custom ?? ["feed", serviceName, params],
  queryFn: async () => {
    const res = (await axios.get("/api/feed/" + serviceName, { params })).data;
    const o = res.Result ?? res;
    if (o.ErrorCode != null && o.ErrorCode != 0) return null;   // service-level error
    let data = o.data ?? o.Data ?? o;                          // Data may be a JSON *string*
    return typeof data === "string" && data.trim() ? JSON.parse(data) : data;
  },
  retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
})
```

Observed services (all three also have dedicated hooks / query keys):

| ServiceName                  | Observed params                                                                 | queryKey                  | Cache                              |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| `Services.GetMarketStatus`   | `{}` (none)                                                                     | `["marketStatus"]`        | no refetch on focus/reconnect      |
| `Services.GetSpecifiedQuote` | `{ Tickers, Columns }` — see §4                                                 | `["feed","indices"]`, `["feed","market-…"]` | `staleTime 300s, gcTime 600s` |
| `Services.SearchTicker`      | `{ exchange:"NEPSE", searchString: UPPER(trim(q)), maxRows:"50", isFAndO:"false" }` | `["feed","Services.SearchTicker",params]` | `staleTime 30min, gcTime 60min` |

Anonymous probe shapes (all `401 {"error":"Unauthorized"}`):
`GET /api/feed/Services.GetMarketStatus`,
`GET /api/feed/Services.GetSpecifiedQuote?Tickers=25.1!NEPSE&Columns=TTQ,TTV,LTP`,
`GET /api/feed/Services.SearchTicker?exchange=NEPSE&searchString=NABIL&maxRows=50&isFAndO=false`.

### 3.2 `POST /api/market-watch` — index ticker list

- Request (JSON): `{ "template": "IndexWatch" | "LiveMarket" }` (only two
  template literals in the bundles; `LiveMarket` backs the market page's
  live tab).
- Response: `{ TickerList: [...] | "<json string>" }` — the hook accepts the
  whole body *or* `TickerList` as a pre-stringified JSON string (double-parse
  tolerant), then maps each row: `LTP`, `Close` → change/percent change
  (`(LTP-Close)/Close*100`), `Change|change`, `PercentChange|PctChange|%Change`.
- Anonymous → `401 {"error":"Unauthorized"}`; `GET` → `405`.

### 3.3 `POST /api/auth/trading-login` — see §2.2.

### 3.4 `POST /api/CI/GetTicketLogs` — support tickets

- Request: `{}`. Response: `Ticket[]` **or** `{ tickets: Ticket[] }`.
- Consumed by the navbar "recent tickets" bell (`queryKey:
  ["navbar-recent-tickets"]`, lazy — only fetched when the dropdown opens).
- Ticket fields observed: `id`, `status` (`"open"` filtered client-side;
  `ej()` normalizes: contains "resolve"/"closed" → `resolved`,
  "pending" → `pending`, else `open`), `time`, `description`, `unread`.
- Anonymous → `401 {"error":"Unauthorized"}`.

### 3.5 `GET /api/portfolio/redirect` / `GET /api/portfolio/developer-testing-redirect`

- Nav items, not fetch calls: Portfolio (`badge: "Beta"`, `target: "_blank"`,
  `forceDocumentNavigation: true`) and a dev-only "Developer Testing" link
  (rendered only when env is `development`/`testing`) point here — i.e. these
  are **document/redirect navigations** to the (legacy) portfolio app, not JSON APIs.
- Anonymous → `401 {"error":"Unauthorized"}` for both.

### 3.6 next-auth routes (`/api/auth/*`)

| Route | Anonymous behavior |
| ----- | ------------------ |
| `GET /api/auth/session` | `200 {}`, sets `__Host-next-auth.csrf-token`, `__Secure-next-auth.callback-url` |
| `GET /api/auth/providers` | `200` Keycloak provider JSON (see §2.1) |
| `GET /api/auth/signin?error=..&callbackUrl=..` | `302` → `/login?...` |
| `GET /api/auth/callback/keycloak` (no OAuth state) | `302` → `/api/auth/error?error=OAuthCallback` |
| `GET /api/auth/signout` (referenced via `signOut`) | standard next-auth signout |

## 4. Market-data protocol details

### 4.1 Ticker formats

- Index/equity tickers: `"NEPSE.NEPSE"`, `"NEPSE.SENSIND"` (i.e.
  `<exchange>.<symbol>`).
- Aggregate/market ticker: `"25.1!NEPSE"`.

### 4.2 Column sets (`Columns` param of `GetSpecifiedQuote`)

Indices call:
`LTP,%Change,BidQty,BidPrice,High,Low,Open,Close,DateTime,OfferQty,OfferPrice,TTQ,WeightedAverage,LastTradeTime`

Market-summary call (`Tickers: "25.1!NEPSE"`):
`TTQ,TTV,LTP,TradedSymbolCount,LogTime`
(consumed as `{ turnover: TTV, volume: TTQ, scripCount: TradedSymbolCount }`).

Known column vocabulary: `LTP %Change BidQty BidPrice High Low Open Close
DateTime OfferQty OfferPrice TTQ TTV WeightedAverage LastTradeTime
TradedSymbolCount LogTime Volume`.

### 4.3 Response envelope

```
GET /api/feed/<svc>  →  { Result: { ErrorCode: 0, data | Data: <array|object|json-string> } }
                          └─ ErrorCode != 0 → client treats as null (no throw)
```

## 5. Trading-domain models (order/trade tables)

Only **display** code for order/trade rows ships in the public chunks (the
`/order` placement page is login-gated); column accessors reveal the upstream
row shape:

- `ExchangeTradeID`, `ExchangeOrderNo`, `Scrip` (upper-cased `Symbol`),
  `"B/S"` (`"B"/"BUY"` → `BUY`, `"S"/"SELL"` → `SELL`, else raw),
  `Quantity`, `Price`, `Amount` (2-decimal formatted), `Date`.
- Side literals `"BUY"` / `"SELL"` and validity `"GTC"` appear as constants.
- Reports routes (all middleware-gated, bodies unknown): `/reports`,
  `/reports/order-book`, `/reports/trade-book`, `/reports/holding-report`,
  `/reports/net-position`.
- Resources sub-links include `Margin Eligible Companies`; `Release Notes`
  points at `release.naasasecurities.com.np`.

## 6. Route map (App Router)

| Route | Access | Notes |
| ----- | ------ | ----- |
| `/` (Home) | gated (`307 /login` anon) | nav `Home → /` |
| `/login` | public | Keycloak handoff; `?clientId=` selector param |
| `/order` | gated | nav `Order → /order` |
| `/market` | gated | nav `Market → /market` |
| `/heatmap` | gated | nav `HeatMap → /heatmap` |
| `/reports`, `/reports/order-book`, `/reports/trade-book`, `/reports/holding-report`, `/reports/net-position` | gated | nav `Reports → /reports` + 4 sub-links |
| `/resources` | gated | nav `Resources → /resources` |
| `/api/portfolio/redirect` | session (401 anon) | Portfolio (Beta, new tab) |
| `https://charts.naasasecurities.com.np/login` | external | nav `Charts` |
| `https://wallet.naasasecurities.com.np/login` | external | nav `Wallet` |

Route protection is server middleware: every protected page returns
`307 location: /login` (6-byte body) with no page chunks leaking anonymously.

## 7. Error handling & client conventions

- No-session data call: HTTP `401` + `{"error":"Unauthorized"}` (same-origin
  proxy error, not upstream).
- Wrong method on POST-only JSON routes: `405` with empty body
  (`GET /api/market-watch`).
- Feed service-level failure: `Result.ErrorCode != 0` → hook resolves `null`
  (React Query `data: null`, `retry: false` everywhere).
- Double-encoded JSON is normal: `TickerList`, `Data`/`data` may arrive as
  strings; clients `JSON.parse` defensively with `console.error` + fallback.
- Trading-login `401 { logout: true }` ⇒ full 3-step logout (§2.3).
- Axios is the HTTP client (`axios.get`, `paramsSerializer`, Basic-auth helper
  present in vendor code but **no Basic usage** found in app code).
- State: Zustand stores (`isSidebarOpen`, toasts/modals, `marketStatus[]`,
  trading session); server state: TanStack Query with `refetchOnWindowFocus:
  false, refetchOnReconnect: false` on market hooks.
- Cookies observed: `__Host-next-auth.csrf-token`,
  `__Secure-next-auth.callback-url` (both `Secure; SameSite=Lax`; callback-url
  is `HttpOnly`).

## 8. Example calls

Anonymous-safe (verified 2026-09-08):

```bash
# OIDC discovery
curl https://auth.naasasecurities.com.np/realms/naasa/.well-known/openid-configuration

# next-auth providers (proves keycloak-only auth)
curl -H 'Referer: https://x.naasasecurities.com.np/login' \
  https://x.naasasecurities.com.np/api/auth/providers

# anonymous session (empty + sets CSRF cookies)
curl -i https://x.naasasecurities.com.np/api/auth/session

# gated route shape (401 envelope)
curl -X POST https://x.naasasecurities.com.np/api/market-watch \
  -H 'Content-Type: application/json' -d '{"template":"IndexWatch"}'
# → 401 {"error":"Unauthorized"}
```

Authenticated (template — needs a real Keycloak login; **not executed**):

```bash
# 1. Complete Keycloak login, keep next-auth session cookies in jar ($JAR)
# 2. Start trading session
curl -b $JAR -c $JAR -X POST https://x.naasasecurities.com.np/api/auth/trading-login \
  -H 'Content-Type: application/json' -d '{"action":"LOGIN"}'
# → {"clientCode":"...","sessionNo":"...","finalToken":...}

# 3. Market status / quotes (params become the upstream service call)
curl -b $JAR 'https://x.naasasecurities.com.np/api/feed/Services.GetMarketStatus'
curl -b $JAR -G 'https://x.naasasecurities.com.np/api/feed/Services.GetSpecifiedQuote' \
  --data-urlencode 'Tickers=NEPSE.NEPSE,NEPSE.SENSIND' \
  --data-urlencode 'Columns=LTP,%Change,BidQty,BidPrice,High,Low,Open,Close,DateTime,OfferQty,OfferPrice,TTQ,WeightedAverage,LastTradeTime'
curl -b $JAR -G 'https://x.naasasecurities.com.np/api/feed/Services.SearchTicker' \
  --data-urlencode 'exchange=NEPSE' --data-urlencode 'searchString=NABIL' \
  --data-urlencode 'maxRows=50' --data-urlencode 'isFAndO=false'

# 4. Index watch
curl -b $JAR -X POST https://x.naasasecurities.com.np/api/market-watch \
  -H 'Content-Type: application/json' -d '{"template":"IndexWatch"}'

# 5. Tickets / logout
curl -b $JAR -X POST https://x.naasasecurities.com.np/api/CI/GetTicketLogs \
  -H 'Content-Type: application/json' -d '{}'
curl -b $JAR -X POST https://x.naasasecurities.com.np/api/auth/trading-login \
  -H 'Content-Type: application/json' -d '{"action":"LOGOUT"}'
```

Start the browser login manually (PKCE values are per-attempt):
`https://auth.naasasecurities.com.np/realms/naasa/protocol/openid-connect/auth?client_id=blaze&scope=openid%20email%20profile&response_type=code&redirect_uri=https%3A%2F%2Fx.naasasecurities.com.np%2Fapi%2Fauth%2Fcallback%2Fkeycloak&state=...&code_challenge=...&code_challenge_method=S256`

## 9. Bundle inventory (what was analyzed)

32 Next.js chunks from `/login` (all `200`, ~3.8 MB total), notably:

- `app/login/page-3ec85946a24aff53.js` (15 KB) — login flow, trading-login hook
- `app/layout-282b77dae8f7f328.js` (101 KB) — providers, nav, market hooks, logout
- `6489-9f5dcbace9d19dbe.js` (32 KB) — next-auth client (`getSession`, `signIn`)
- `4433-0df9ae4d4fa7c320.js` (97 KB), `5493da1b-…` (976 KB), `63b94182-…` (855 KB),
  `6edf0643-…` (933 KB) — shared/vendor (report PDF styles, tables, charts)
- `webpack-afc7c9de847d7797.js`, `main-app-*.js`, `polyfills-*.js` — runtime

No aggressive decompiler was needed (unminified-enough webpack output + targeted
regex extraction scripts in `.../xnasa/extract*.mjs`). No bundle was modified.

## 10. Relationship to classic NEPSE TMS (`tms77.nepsetms.com.np`)

| Aspect | Naasa X (this doc) | Classic TMS (parallel effort) |
| ------ | ------------------ | ----------------------------- |
| Frontend | Next.js App Router | Angular (runtime/polyfills/scripts/main + lazy chunks 5/10/11/21/common) |
| Auth | Keycloak OIDC (public client `blaze`, PKCE) + trading-login | `POST /tmsapi/authenticate` (userName, base64 password, captcha id/image), OTP/resend |
| API shape | Same-origin `/api/*` proxies; `Services.*` quote services; `Result.ErrorCode` envelope | Gateway prefixes `/tmsapi /orderApi /orderTradeApi /clientApi /fundApi /jobApi /rtApi /dnaApi /authApi` (~587 endpoints extracted) |
| Market data | Polled `GET /api/feed/*`, `POST /api/market-watch` | `GET /orderApi/exchange/marketwatch`, `/tmsapi/exchangeIndex/indices`, … (some anonymous) |
| Session | next-auth cookies + broker trading session | TMS session |

The `Services.*` naming and `TTQ/TTV/LTP` columns suggest a shared upstream
market-data vendor, but the two frontends share **no code or endpoints**.

## 12. Server-side auto-login ("vault") feasibility (probed 2026-09-08)

Goal: store user credentials server-side and log in on their behalf so the
user only ever logs into our app. Verdict: **feasible via scripted form login;
password-grant shortcut is closed.**

- Keycloak login form (`GET .../protocol/openid-connect/auth?...`, served as
  `200` HTML directly, theme `naasaX-page`): single step, `username`
  (`type=email`, "you@example.com") + `password` + optional `rememberMe` +
  `credentialId`, submitted to `.../realms/naasa/login-actions/authenticate?session_code=...&execution=...&client_id=blaze&tab_id=...`.
  **No captcha, no WebAuthn/passkey UI, no social IdPs, no OTP field, no
  OTP/authenticator/2FA text anywhere in the page** (the only "2fa" hits are
  `prompt=create` fragments of the `newkyc.naasasecurities.com.np` registration
  link — same realm, separate client). Per-account conditional OTP after the
  password step cannot be ruled out without real credentials, so a worker
  should still detect an OTP-challenge page if one ever appears.
- Session cookies set pre-login: `AUTH_SESSION_ID`, `KC_RESTART`,
  `KC_AUTH_SESSION_HASH` — standard jar-based scripting works (fetch with a
  cookie jar, no headless browser required).
- Resource-Owner Password Grant is **disabled**: `POST
  .../protocol/openid-connect/token {grant_type=password, client_id=blaze, ...}`
  with dummy creds → `401 {"error":"unauthorized_client","error_description":
  "Invalid client or Invalid client credentials"}` (public client cannot
  authenticate at the token endpoint). So the worker must do the form flow:
  auth URL → login form → POST creds → follow `code` back to
  `/api/auth/callback/keycloak` → next-auth session jar → `trading-login LOGIN`.
- Evidence: `.../xnasa/kc-login.html`, `probe-kc-login.mjs`, `probe-kc-form.mjs`,
  `probe-ropc.mjs`.

## 13. Limitations & next steps

1. **Order placement bodies are client-derived, not live-validated** — no real
   order was placed/modified/cancelled during research (account safety). Shapes
   below come from the order-form code + success/error handling; validate with
   a broker test account before production use.
2. **Live depth not captured** — market was closed during probing
   (`GetMarketStatus: "Market Close"`, `GetMDepth → ErrorCode -100 "No data
   available"`). Re-run `GetMDepth` + the WebSocket during market hours.
3. **Rate limiting** — not observed; all probes returned instantly.
4. **Mobile apps** referenced in-bundle: iOS `naasa-x` (`id6737237945`),
   Android `com.nepse.nepal`, plus `release.naasasecurities.com.np`.
5. Suggested proxy (mirroring the MeroShare console pattern): server-side
   next-auth session + `trading-login` handshake, then forward to `/api/*`
   with `fetch` — never expose `accessToken`/`idToken` to the browser.

---

# PART B — Trading API (authenticated research, 2026-09-08)

Mapped with a real authenticated session (Keycloak login + `trading-login`
handshake; user `Subana Niraula`, `clientCode 2260…`). 20 post-login chunks
downloaded (`app/order/page-*.js` 65 KB, market/heatmap/report pages). All
probes below were **read-only**; no order was placed, modified, or cancelled.
Sample values are trimmed/redacted. Session was logged out afterwards
(`trading-login LOGOUT` + next-auth signout; `/api/auth/session → {}`).

## 14. Order management (`/api/trading/order`)

### 14.1 Place order — `POST /api/trading/order` (axios `post`)

Client builds (order form, `page-00acdc94ae80fc46.js`):

```json
{
  "BuySellType": "Buy | Sell",
  "DeliveryFlag": "DEL (buy) | AUTO (sell)",
  "OrderTerms": "DAY | GTD | GTC | IOC | FOK",
  "OrderType": "MKT | NORMAL",
  "Price": "0 (MKT) | <limit price as string>",
  "Quantity": "<number>",
  "Scrip": "<SYMBOL, uppercase>",
  "ValidTill": "DD-Mon-YY (only when OrderTerms=GTD)"
}
```

- UI enums (zod): `orderType ∈ {LMT, MKT, AMO}` (`LMT` sent as `NORMAL`),
  `validity ∈ {DAY, GTD, GTC, IOC, FOK}`, default `validity: "DAY"`.
- `ValidTill` conversion: UI date `YYYY-MM-DD` → `DD-Mon-YY`
  (`2026-09-10` → `10-Sep-26`).
- Success test (all must hold): no `error`, `Success !== false`,
  `ErrorCode` absent or `0`/`"0"`. Errors surface via
  `error | Message | message`.
- After place: form resets qty/price, invalidates `["/api/report"]`,
  `["/api/trading/amo/list"]`, `["/api/dashboard-details"]`.

### 14.2 Modify order — `POST /api/trading/order` (same route + identity fields)

Same body as §14.1 plus:

```json
{
  "TranId": "<BrokerTranID | TranId>",
  "OrderId": "<same id>",
  "OrderStatus": "<current status, default ACCEPTED>",
  "OriginalRemainingQty": "<remaining qty>"
}
```

- Edit prefill maps row → form: `Scrip`, remaining qty, `Price`,
  validity via normalizer (`GTD|GTC|IOC|FOK` else `DAY`), side via
  (`BuySellType|B/S|BuySellIndicator`), type MKT when
  `OrderType=MKT|MARKET`, `Market=1`, or price `0`.
- HTTP `409` on modify ⇒ order changed server-side: client refreshes
  orderbook and closes the edit dialog.

### 14.3 Cancel order — `DELETE /api/trading/order` (body, not URL params)

Single:
```json
{
  "OrderStatus": "<row status>",
  "BuySellType": "Sell | Buy",
  "DeliveryFlag": "<row flag or DEL>",
  "OrderTerms": "<row terms or DAY>",
  "OrderType": "NORMAL",
  "Price": "<row price or 0>",
  "Quantity": "<remaining qty>",
  "Scrip": "<symbol>",
  "OrderId": "<LatestOrderID | OrderId | OrderNo>",
  "TranId": "<BrokerTranID | TranId>"
}
```

- Batch cancel supported client-side: loops `DELETE` per order, reports
  `"Success! Cancelled N orders."` / `"Cancelled N-M orders. Failed: M."`.
- Canonical id helper: `LatestOrderID | OrderId | OrderNo | BrokerTranID | TranId`.
- Cancellable filter: status `OPEN` or `PARTIALLY COMPLETE` (normalized from
  `TRADED|COMPLETE → COMPLETE`, `ACCEPTED + tradedQty>0 → PARTIALLY COMPLETE`,
  `ACCEPTED → OPEN`) and remaining qty > 0.

### 14.4 Order form validation (client, mirror server-side)

- Side required (`NEUTRAL` ⇒ `"Please choose Buy or Sell before placing an order."`).
- Scrip ≥ 3 chars, must resolve via `SearchTicker` (`"X" not found…`).
- `quantity ≥ 1`; price required & > 0 for `LMT`/`AMO`; `validTill` required for `GTD`.
- Price bands: LMT inside DPR — regular session `±3% LTP / ±15% prev.close`,
  pre-open `±5% prev.close`, else `±3% LTP`
  (`"Price must be between <lo> and <hi> - <session>"`).
- Tick/lot from `GetCompanyInformation.TickSize`: `0.01 → tickSizeAdj 100,
  fixedSize 2`; else `10 / 1`. DPR bounds rounded to tick; odd-lot AMO SELL
  blocked client-side (see §15).

## 15. After-market orders (AMO)

| Call | Shape |
| ---- | ----- |
| Place `POST /api/trading/amo` | `{ Scrip, OrderPrice: <float>, OrderQty, BuySellInd: "BUY"\|"SELL", Ltp }` → success toast `"After Market Order Placed successfully"` |
| List `POST /api/trading/amo/list` | `{}` → `{ data: [] }` (empty when no AMOs) |
| Cancel `POST /api/trading/amo/cancel` | `{ AlertName, Scrip (no 25.1! prefix), OrderPrice, TriggerPrice, OrderQty, BuySellInd: "B"\|"S" (first char), ValidTill }` → `Message` |

Rules (client): AMO only **outside** regular + pre-open hours (10:29 cut-off
observed); SELL qty < 10 rejected (`"AMO order not available for odd lot."`);
price checked by `rR(price)` validator. Order page has `normal | amo` tabs
(`ORDERBOOK` report vs `amo/list`).

## 16. Reports — `POST /api/report` (POST-only; GET → 405)

Request: `{ reportType, FromDate | fromDate, ToDate | toDate }` (both casings
accepted; empty strings = no date filter). Response: `{ data: { reportTable:
[...] | "<json string>" } }`.

| reportType | Verified |
| ---------- | -------- |
| `ORDERBOOK` | 200, 0 rows (no orders that day). Row vocab from code: `OrderStatus, BuySellType|B/S|BuySellIndicator, OrderType, Market, Price, Quantity, RemainingQty, TradedQuantity, Scrip, LatestOrderID|OrderId|OrderNo, BrokerTranID|TranId, ExchangeTradeID, ExchangeOrderNo, Amount, Date` |
| `TRADEBOOK` | 200, 0 rows. Same row vocab + trade fields (`ExchangeTradeID`) |
| `NETPOSITION` | 200, 0 rows |
| `HOLDINGREPORT` | 200, **3 real rows**. Fields: `AMSID, ClientCode, ISINCode, NEPSECode, DPF, DPH, SellTrade, SellPendingOrder, CollateralQty, CFSQty, AvailableQty, LastTradedPrice, MarketValue, TradingAccount, CollateralValue, ClosePrice, HoldAvgPrice, OBL, BlockedQty`. Derived columns: `CDS Total = DPF+OBL+DPH`, `CDS Free = DPF`, `NAASA = AvailableQty`, `Value as of CP = ClosePrice×AvailableQty`, `Value as of LTP = MarketValue`, `Day Profit = MarketValue − ClosePrice×AvailableQty` |
| `TURNOVER, VOLUME, GAINER, LOSER` | literals present (market page); same envelope expected |

Order history: `POST /api/report/order-history { orderId }` (orderId via
canonical id helper §14.3). Not probed — account had no orders to look up.

## 17. Dashboard — `POST /api/dashboard-details` (POST-only; GET → 405)

`{}` → `{ ServiceName: null, ErrorCode: 0, Message: "SUCCESS", Remarks, EncryptedResponse, Data: [5 blocks] }`:

| Block | Fields |
| ----- | ------ |
| 0 orders | `OrderCount, BuyOrderCount, SellOrderCount, TotalBuyOrderQty, TotalSellOrderQty, TotalOrderQty, TotalOrderValue, TotalBuyOrderValue, TotalSellOrderValue, TradedOrderCount, BuyTradedOrderCount, SellTradedOrderCount` |
| 1 trades | `TradeCount, BuyTradeCount, SellTradeCount, TotalTradedQty, TotalBuyTradedQty, TotalSellTradedQty, TotalTradedValue, TotalBuyTradedValue, TotalSellTradedValue` |
| 2 holdings | `TotalHoldingAmount, TotalFreeStockQty, HoldingStockCount` |
| 3 exposure | `GrossAllocatedExposure, GrossUsedExposure, GrossAvalibleExposure` (block `[3][0]`; note upstream typo `Avalible`) |
| 4 profile | `ClientName, PAN, DPId, Email, MobileNo, Address, City, State, Country, PinCode` |

## 18. Market data II — watchlists, depth, gainers, company info

- Watchlists: `POST /api/watchlist-list {}` → `{ ErrorCode, Message,
  isCompressed, data: "<json string>" }` with templates (`Default`,
  `MyHoldings`, `IndexWatch`; fields `Template_Name, Default_marketWatch,
  SystemTag`). Save: `POST /api/market-watch/save { tickersList,
  template }` (alt. `{ DefaultMarketwatch, template, tickersList: "" }`,
  `withCredentials`); remove-symbol variant sends remaining tickers joined as
  `NEPSE.SYM^…`. Delete: `POST /api/market-watch/delete <same shape>`.
  (`tickersList`: `^`-joined `NEPSE.<SYM>` list.)
- Depth: `GET /api/feed/Services.GetMDepth { Tickers: "<SYM>", Exchange:
  "NEPSE" }` (`queryKey ["market-depth"|"mw-order-depth", sym]`). After hours →
  `ErrorCode -100 "No data available"`.
- Depth quote columns: `High,Low,Open,Close,Volume,WeightedAverage,
  TotalBuyQty,TotalSellQty,Turnover,TTQ` (+`52WeekHigh,52WeekLow,LTQ,LTT,
  LastTradeTime` on market-watch variant).
- Gainers/losers: `GET /api/feed/Services.LoadTopGainerLoser { Exchange:
  "NEPSE", InstrumentType: "CASH", OptionType: "", ReportType: "GAINER"|"LOSER",
  NoOfRecs: "10" }` → rows `{ Symbol|Ticker, LTP|ltp, Open, High, Low,
  Close|PrevClose, TTQ|Volume, Value|Turnover, ... }` (verified live: PURE
  761.3 etc.).
- Company info: `GET /api/feed/Services.GetCompanyInformation { Exchange:
  "NEPSE", Scrip }` → `{ Symbol, InstrumentName, ISIN, CompanyName,
  "Security Name", TickSize, IssuedCapital, ListingDate, TradingStartDate,
  SecurityTradeCycle, ActiveStatus, 52WeekHigh/Low, "DPR Low/High", "PreOpen
  DPR Low/High", "Max. Order Size": "100000.00", MarketLot, ... }` (verified
  live for NABIL).
- Misc (verified live): `GET /api/stock-sector` → `{ isSuccess, statusCode,
  message, data: [{ id, stock, sector, stockName }] }`;
  `GET /api/heatmap/previous-contribution?marketDate=DD/MM/YYYY` → same
  envelope, `data: [{ sector, contribution, date }]` (localStorage `marketDate`
  or today; `staleTime` 30 min).

## 19. Live WebSocket feed

- URL (hardcoded host in `26767`): 
  `wss://serverx.naasasecurities.com.np:8006/WebSocket/Connect?UserId=<clientCode>&Password=<sessionNo>&protocol=WSS&ClientIP=&Source=1`
- Auth = trading-session identity (`clientCode`, `sessionNo` from §2.2 —
  no Keycloak token on the socket). Connects only when session is
  `authenticated` **and** both are set; auto-reconnect 1 s + heartbeat; also
  supports a Web-Worker transport.
- Subscribe protocol (refcounted, case-normalized): `ADD^<n>^<key…>`,
  `DELETE^<n>^<key…>`, resent on reconnect. Keys: quotes `25.1!<SYM>`
  (indices `25.1!NEPSE` get extra `endsWith("!NEPSE")` matching), depth
  `25.2!<SYM>`.
- Events: `{ type: "market", scripKey, row }`. Depth rows arrive as
  `|`-separated segments, `^`-separated fields `{ BBR, BBQ, BO, BSR, BSQ, SO }`.
- Status text map: `nepse preopen market open → Preopen Market`,
  `regular market open → Regular Market`, `…close → Market Close`,
  `operations suspended → Market Halt`, `resumed → Regular Market`, etc.
- Exchange column map (`Structures`, `EXCH^COL^idx`) is pushed over the socket
  (`_fillStructures`, `getColIndex`) — parse dynamically, don't hardcode.
- Not probed live (market closed; browser `WebSocket` only) — URL + protocol
  from client code. A server-side mirror can use any WS client with the same URL.

## 20. cURL (authenticated templates; session jar required)

```bash
JAR=cookies.txt  # next-auth session cookies after login + trading-login
B=https://x.naasasecurities.com.np
curl -b $JAR -X POST $B/api/trading/order -H 'Content-Type: application/json' -d '{
  "BuySellType":"Buy","DeliveryFlag":"DEL","OrderTerms":"DAY",
  "OrderType":"NORMAL","Price":"552.5","Quantity":10,"Scrip":"NABIL"}'
curl -b $JAR -X DELETE $B/api/trading/order -H 'Content-Type: application/json' -d '{
  "OrderStatus":"OPEN","BuySellType":"Buy","DeliveryFlag":"DEL","OrderTerms":"DAY",
  "OrderType":"NORMAL","Price":"552.5","Quantity":10,"Scrip":"NABIL",
  "OrderId":"<LatestOrderID>","TranId":"<BrokerTranID>"}'
curl -b $JAR -X POST $B/api/trading/amo -H 'Content-Type: application/json' -d '{
  "Scrip":"NABIL","OrderPrice":552.5,"OrderQty":10,"BuySellInd":"BUY","Ltp":552.5}'
curl -b $JAR -X POST $B/api/report -H 'Content-Type: application/json' -d '{
  "reportType":"ORDERBOOK","FromDate":"","ToDate":""}'
curl -b $JAR -X POST $B/api/dashboard-details -H 'Content-Type: application/json' -d '{}'
# live socket (any WS client):
# wss://serverx.naasasecurities.com.np:8006/WebSocket/Connect?UserId=<clientCode>&Password=<sessionNo>&protocol=WSS&ClientIP=&Source=1
# send: ADD^1^25.1!NABIL   then   ADD^1^25.2!NABIL
```

## 21. Remaining limitations

- Upstream backend stays hidden — `/api/*` handlers run server-side (no source
  maps exposed); order/AMO shapes above are client-derived until validated
  with a live test order on a broker test account.
- `OB/TB/NP` row shapes verified only as field vocabulary (account had no
  orders/trades that day); HOLD shapes are fully live-verified.
- Order-history (`POST /api/report/order-history {orderId}`) unprobed (no
  orderId available); shape follows the same `{data:{reportTable}}` envelope.
- Turn-over/volume/gainer/loser reportTypes unprobed but literal-confirmed.
- Live depth + socket frames need a market-hours capture.

## 22. Sibling apps (parallel recon, 2026-09-08)

- **Charts** (`charts.naasasecurities.com.np`): Next.js + next-auth + Keycloak
  (same realm, `client_id=blaze`-family), title "Naasa X - TradingView".
  Self-hosted **TradingView Advanced Chart** (`/static/charting_library/`,
  `TT v29.4.0`); chart config + datafeed live in the login-gated `/` chunk.
  Direct backend `api-trading.naasasecurities.com.np`: `POST /api/Login {}`
  with `Authorization: Bearer <Keycloak accessToken>` (anon → 400
  `"Authorization token not found."`), `POST /api/Login/RefreshToken`
  (multipart `RefreshToken` → new tokens; JWT carries
  `clientCode/sessionNo`). Embed verdict: reuse is license/ToS-blocked —
  build on self-hosted lightweight-charts + §4 quote services, or license
  TradingView + custom datafeed. Evidence: `Temp/opencode/xnasa-charts/`.
- **Wallet** (`wallet.naasasecurities.com.np`): Next.js + next-auth + Keycloak,
  single-page at `/` (dashboard/transactions/wallet/funds → 404; `/login` +
  `/auth/error` public). Public chunks contain **zero** fund endpoints — full
  surface mapped after authenticated capture, see §23. Evidence:
  `Temp/opencode/xnasa-wallet/` (anon) + `Temp/opencode/wallet-auth*/` (auth).
- **Legacy portfolio**: `POST /api/portfolio/redirect` (X, requires trading
  session — without it `401`; dev variant points at `localhost:7071`) →
  `307 https://portfolio.naasasecurities.com.np/auth/login?token=<single-use
  SSO token>`. Separate app, own surface — unmapped (token captured but not
  followed; needs its own bundle pass).

## 23. Wallet fund API — `api-tradeflow` (authenticated research, live-verified)

No same-origin proxy here: the browser calls
`https://api-tradeflow.naasasecurities.com.np/api/v1` **directly** (axios,
`Authorization: Bearer <Keycloak accessToken>` from the wallet next-auth
session; 401 → Keycloak logout redirect). Wallet session keys:
`user, expires, accessToken, idToken, refreshToken, clientCode`.

Reads (all `GET`, live-verified 200):

| Endpoint | Verified shape |
| -------- | -------------- |
| `/add-fund/instrument` | `[{instrumentName, gateway, instrumentCode, logoUrl, instrumentType, gatewayLimit}]` ×39 (Esewa, …) |
| `/client-collateral/client` | `{accountCode (=clientCode), accountName, balance, ledgerBalance, email, balanceMultiplier, tmsLimit, unbilledBalance, finalCollateral, updatedByUsername, updatedByUser, updatedAt}` |
| `/client-collateral/utilized-collaterals` | `{clientCode, pendingOrder, collateralUsed, collateralAvailableForWithdrawl, ledgerBalance, intradayFundTransfers, overallRemainingCollateral, unbilledSales, tmsLimit}` |
| `/wallet/transaction-summary?…` | `{totalCount, totalPages, pageSize, currentPage, data: []}` (filters: Search, TransactionType, Gateway, Status, DateFrom/DateTo `YYYY-MM-DD`, PageNumber; default last 7 days) |
| `ssa/banks` | `{isSuccess, result: {banks: [{accountNumber, type, accountName, bankName, bankCode, esewaBankCode, branchName, branchCode, isPrimary}], allowEdit}}` |
| `setting/bank` / `setting/bank/<bank>/branch` | bank/branch settings (5-min staleTime) |

Writes (client-derived, **never executed**):

| Call | Body |
| ---- | ---- |
| `POST add-fund` | fund-request object (gateway enum: `Mobile Wallet`=CheckoutGateway, `Card`=checkoutcard/Checkout Card Api, `E-Banking`, `M-Banking`) → invalidates collateral + txn queries |
| `PATCH add-fund/verify/<id>` | verify deposit |
| `POST client-collateral/withdraw?Amount=<n>&IsQuickRefund=<bool>` | withdraw / quick refund |
| `PATCH client-collateral/withdraw/reject-request` | `{withdrawFundRequestId[], remarks, rejectedBy: "<clientCode> - <user>"}` |
| `POST ssa/banks` / `PATCH ssa/banks/<acct>` / DELETE bank | add / set-primary / delete bank |
| `POST /auth/refresh` | refresh payload → new tokens |
| `GET /user-account-statement/user-account-statement?FromDate=&ToDate=` | account statement export |

## 24. Charts + BLAZE trading backend (authenticated research, live-verified)

Apps: `charts.naasasecurities.com.np` (Next.js, title "Naasa X - TradingView").
Login quirk found the hard way: the scripted client must scope cookies
per-domain — sending Keycloak cookies to the app host trips
`400 Request Header Or Cookie Too Large` (nginx). Same-realm SSO, scope
`openid profile`, custom `/auth/login` page. Charts session keys:
`user, expires, accessToken, idToken, refreshToken, expiresAt, clientId,
sessionNo, clientCode`. Trading login mirrors it:
`POST https://api-trading.naasasecurities.com.np/api/Login {}` +
`Authorization: Bearer <Keycloak accessToken>` → 200
`{"success":true,"message":"Login successful. Welcome to BLAZE. …"}`
(anon → 400 `"Authorization token not found."`);
`POST /api/Login/RefreshToken` (multipart `RefreshToken` → `access_token,
refresh_token`; JWT = `{clientCode, sessionNo, name, email}`).

### 24.1 OHLC datafeed — PUBLIC, no auth required (verified anonymously)

UDF-compatible (`supports_search, supports_time`, resolutions
`1,5,15,30,60,1D,1W,1M`), base
`https://api-charts.naasasecurities.com.np/api/v1/datafeed/1/`:

- `GET /config` → exchanges (`NEPSE`/`SENSIND`), symbols, resolutions
- `GET /symbols?symbol=<SYM>` → `{name, exchange-traded/listed, timezone:
  Asia/Kathmandu, session: "1100-1500:1234567", visible_plots_set: ohlcv, …}`
- `GET /history?symbol=<SYM>&resolution=<R>&from=<unix>&to=<unix>
  [&countback=]` → `{s: "ok", t[], o[], h[], l[], c[], v[]}` (verified live:
  NABIL daily + 60-min intraday)
- `GET /quotes?symbols=<SYM>` → `{s:"ok", d:[{…, lp, open_price, high_price,
  …}]}`; `GET /time`

**Embed recipe**: point any TradingView widget / lightweight-charts loader at
this base — no session, no key. This is the sanctioned-free path for charts
in our own app (the chart *library* itself is license-gated; the *data* is not).

### 24.2 Order API on `api-trading` (client-derived + browser-verified calls)

Axios base `https://api-trading.naasasecurities.com.np`, `Authorization:
Bearer <accessToken>` (raw KC token); order methods add headers `{SessionNo,
LoginID, Authorization}` from localStorage and **AES-CBC encrypt the JSON
body** (CryptoJS, key `CpqSramdF3sNVbAAPC5y!sjgckBX*5c6`, random 16-B IV
prepended, Base64) — mutations send `{payload: "<b64>"}`; responses are
double-JSON `{Message, ErrorCode, TranId, TranIdSL, TranIdTP}` /
`{errorCode, data}` (order list via `DecodeReportJsonObject`):

| Endpoint | Body (pre-encryption) |
| -------- | --------------------- |
| `POST /api/Order/PlacedOrder` | `{SessionNo, ClientCode, OrderPlacedBy: null, Source: 0, TradingAccount: "CNC", Exchange: "NEPSE", Scrip, Quantity, Price, Market: "0", OrderTerms: "DAY", BuySellIndicator: B\|S, BuySellType: Buy\|Sell, TriggerPrice: "", DeliveryTerms: "D", MarketSegment: "RL", DeliveryFlag: "DEL", OrderCategory: "NORMAL", OrderType: "NORMAL", AccRefCode: "SELF", TermValidity: " ", DisclosedQuantity: "", ProductType: "CASH", AMOBulkIndicator: "", OrderId: "", isSquareOff: 0, TranId: "", OriginalRemainingQty: 0}` |
| `POST /api/Order/ModifyOrder` | same + `OrderId/TranId = exchangeTranId`, `AMOBulkIndicator: "ACCEPTED"`, `OriginalRemainingQty` |
| `POST /api/Order/CancelOrder` | `{SessionNo, ClientCode, OrderPlacedBy: null, Source: 0, TradingAccount: "CNC", OrderId, Exchange: "NEPSE", Scrip, Quantity, Price, Market: "0", OrderTerms: "DAY", BuySellIndicator, BuySellType, TriggerPrice: "", DeliveryTerms: "D", MarketSegment: "RL", DeliveryFlag: "", OrderCategory: "NORMAL", OrderType: "NORMAL", AccRefCode: "SELF", …}` |
| `POST /api/Order/GetOrderList` | `{SessionNo, LoginID}` → rows `{Message, LatestOrderID, ExchangeOrderNo, ClientCode, OrderPlacedBy, BrokerTranID, Exchange, Group, Scrip, "B/S", RemainingQty, Price, DisclosedQuantity, …, TradingAccount, Quantity, MarketOrder, OrderType, DeliveryTerms, AccRefCode, ErrorCode, PQFactor, ProductType, OrderCategory, Contract2, ExpiryDate, TradeType, TradedQuantity, TotalQuantity, Segment, TradePrice, ContractName, OrderInitiator}` |
| `POST /api/Order/ProfileDetails` | `{SessionNo, LoginID}` → `Data[3]` (exposure block, cf. §17) |
| `POST /api/TriggerOrder/Order` | `{ClientCode, SessionNo, AlertName, Ticker, AlertExpression, ColumnList, Email/SMS/Push/ApplicationNotification, Status: "1", Remarks: "TriggerOrder", OrderAlert: "1", OrderQty, OrderPrice, …}` (stop/trigger orders) |
| `POST /api/TriggerOrder/GetOrders` | `{SessionNo, LoginID}` → rows `{TriggerId, ClientCode, Symbol, OrderPrice, TriggerPrice, OrderQty, TradedQty, BuySellInd, ValidTill, OrderStatus, Remarks, TriggerOrder, TriggerName, TriggerExpression, TradingAccount, Status, MarketOrder, SLOrder, OrderId, LastModifiedDateTime}` |
| `GET /api/MarketWatch/GetSpecifiedQuote?ticker=<SYM>&columns=LTP,Instrument` | `{statusCode: "200", reportTable: [row]}` |
| `GET /api/MarketWatch/GetMarketStatus`, `/api/MarketWatch/GetAdvancesDeclines`, `/api/Home/MarketSummary/` | market overview (same envelope family) |

Widget config (for parity, from page chunk): `library_path:
"/static/charting_library/"`, `charts_storage_url:
https://saveload-tradingview.waterflowtechnology.net` (v1.1),
`client_id: https://naasasecurities.com.np`, `user_id = clientCode`,
`timezone: Asia/Kathmandu`, symbol via `?Scrip=` param (default `NEPSE`).
Order placement from charts was browser-observed as live-called (same
`PlacedOrder` path) but no test order was submitted.

Evidence: `Temp/opencode/charts-auth*/` (authed chunks incl. public
`STATIC-udf.js`), `Temp/opencode/xnasa/browser-urls.txt` (Playwright
network capture), `Temp/opencode/xnasa-charts/` (anon recon).
