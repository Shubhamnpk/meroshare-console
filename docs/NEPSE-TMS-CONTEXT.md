# NEPSE TMS API Reverse-Engineering Prompt

## What This Project Is

A **modern investor console** for the Nepali stock market (NEPSE/CDSC) built with:
- **React** + **TanStack Router** + **TanStack Query**
- **TanStack Start** (server-side rendering)
- **Tailwind CSS** + **shadcn/ui**
- **Cloudflare Workers** (deployment target)

The app proxies all CDSC API calls server-side (no CORS, no credential exposure to the browser). The browser talks to our server; our server talks to CDSC.

## How We Reverse-Engineered the MeroShare API

### The Approach
1. **Downloaded the real MeroShare Angular JS bundle** from `https://meroshare.cdsc.com.np/main.*.js`
2. **Extracted URL constants** by searching for string literals like `API_ENDPOINT`, `MERO_SHARE`, `EDIS`, etc.
3. **Extracted model class definitions** from the minified code (field names from constructor assignments)
4. **Extracted request body shapes** by finding `filterFieldParams` arrays and `searchRoleViewConstants` values
5. **Extracted all search/filter patterns** by finding `filterDateParams` and role-view constants
6. **Cross-referenced** with the Python library at `https://meroshare.readthedocs.io` for additional context
7. **Documented everything** in `docs/cdsc-api-reference.md` (154+ endpoints, 26 sections)

### Key CDSC API Patterns
- **Base URL**: `https://webbackend.cdsc.com.np/api/`
- **Auth**: Bearer token in `Authorization` header (from login endpoint)
- **Session**: 2-hour TTL, stored in encrypted httpOnly cookie
- **Search Pattern**: All list endpoints use POST with this body:
```json
{
  "filterFieldParams": [
    { "key": "fieldName", "value": "optionalFilter", "alias": "Display Label" }
  ],
  "page": 1,
  "size": 50,
  "searchRoleViewConstants": "VIEW_NAME",
  "filterDateParams": [
    { "key": "dateField", "value": "", "condition": "", "alias": "" }
  ]
}
```
- **Error Handling**: 401/403 = session expired, HTML response = security filter block

## What We Built (MeroShare Console)

### Core Features
- Fingerprint/WebAuthn sign-in with encrypted vault
- Dashboard with upcoming IPO issues
- IPO apply/edit/withdraw (2-step wizard with disclaimer)
- Application reports with status tracking
- Portfolio with live prices from YONEPSE feed
- Transactions with date filtering
- Market data with charts, scrip details, dividend simulator
- Brokers page with floor sheet analysis and trade trails
- Tools hub: Best Shares, Mutual Funds, IPO Pipeline, Debentures, WACC, EDIS
- Activity log with IP geolocation
- Settings with Appearance/Security/General/About tabs

### Architecture
```
src/
├── lib/
│   ├── meroShare/
│   │   ├── cdsc.server.ts      # URL constants + HTTP client
│   │   ├── api.server.ts        # Server-side API functions
│   │   ├── session.server.ts    # Encrypted cookie session
│   │   ├── types.ts             # All TypeScript interfaces
│   │   ├── *.functions.ts       # TanStack Start server functions
│   │   └── demo-data.ts         # Mock data for demo mode
│   ├── nepse/
│   │   ├── feed.server.ts       # YONEPSE feed loader
│   │   ├── brokers.server.ts    # Floor sheet aggregation
│   │   └── market.functions.ts  # Market data functions
│   ├── queries.ts               # All TanStack Query definitions
│   └── format.ts                # Formatting utilities
├── components/
│   ├── tools/                   # Feature components
│   ├── ui/                      # shadcn/ui components
│   └── *.tsx                    # Shared components
└── routes/
    ├── _dash.*.tsx              # Dashboard routes
    └── index.tsx                # Login page
```

### Server Function Pattern
```typescript
// src/lib/meroshare/*.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./api.server";

export const getData = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ param: z.string() }).parse(input)
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (auth.demo) return DEMO_DATA;
    return fetchFromCdsc(auth, data.param);
  });
```

### Query Pattern
```typescript
// src/lib/queries.ts
export const dataQuery = (param: string) =>
  queryOptions({
    queryKey: ["data", param],
    queryFn: () => getData({ data: { param } }),
    staleTime: 60_000,
    retry: false,
  });
```

## Your New Task: NEPSE TMS API

### Target
**NEPSE Trading Management System** at `https://tms77.nepsetms.com.np/login`

### What to Do
1. **Inspect the TMS frontend bundle** — Download the main JS bundle from the TMS site
2. **Extract all API endpoints** — Find URL constants, base paths, API routes
3. **Extract request/response models** — Find TypeScript/JS class definitions, interfaces
4. **Extract authentication flow** — How login works, token format, session management
5. **Map all features** — IPO, trading, portfolio, reports, settings, etc.
6. **Document everything** — Create a comprehensive API reference like we did for CDSC

### Key Differences from MeroShare
- TMS is for **trading** (buy/sell orders), MeroShare is for **demat** (holdings/IPO)
- TMS likely has **real-time WebSocket** connections for live quotes
- TMS has **order management** (place, modify, cancel orders)
- TMS has **market depth** (Level 2 data)
- TMS may use **different auth** (possibly JWT or session-based)

### Files to Reference
- `docs/cdsc-api-reference.md` — Our MeroShare API documentation (format reference)
- `src/lib/meroshare/cdsc.server.ts` — How we structure URL constants
- `src/lib/meroshare/api.server.ts` — How we structure API functions
- `src/lib/meroshare/types.ts` — How we define TypeScript interfaces
- `meroshare-playwright.mjs` — Playwright script we used for CDSC frontend inspection

### What the User Wants
A **new project** (or new section of this project) that:
- Reverse-engineers the NEPSE TMS API
- Documents all endpoints, models, and flows
- Builds a modern UI on top of the TMS API
- Similar architecture to the MeroShare console

## Session Continuation Prompt

Copy and paste this into a new session:

---

I have a MeroShare investor console at `D:\shubham\coding\meroshare-next` that reverse-engineered the CDSC API by downloading and analyzing the real Angular JS bundle. The API documentation is at `docs/cdsc-api-reference.md` (154+ endpoints).

Now I want to do the same for the **NEPSE TMS** at `https://tms77.nepsetms.com.np/login`. 

**Step 1**: Inspect the TMS frontend to find the JS bundle URL. Use Playwright or browser DevTools to:
- Navigate to the login page
- Find the main JS bundle(s) in the network tab
- Download and analyze the bundle for API endpoints

**Step 2**: Extract all API patterns:
- Base URL and API prefix
- Authentication endpoints (login, logout, refresh)
- All feature endpoints (IPO, trading, portfolio, reports)
- Request body shapes (especially search/filter patterns)
- Response models
- WebSocket endpoints (if any)

**Step 3**: Create a comprehensive API reference document similar to `docs/cdsc-api-reference.md`.

**Step 4**: Build the server-side proxy layer following the same patterns as the MeroShare integration.

The existing project structure to follow:
- `src/lib/meroshare/cdsc.server.ts` → URL constants + HTTP client
- `src/lib/meroshare/api.server.ts` → Server-side API functions  
- `src/lib/meroshare/types.ts` → TypeScript interfaces
- `src/lib/meroshare/*.functions.ts` → TanStack Start server functions
- `src/lib/queries.ts` → TanStack Query definitions

Let's start by inspecting the TMS login page to find the JS bundle.

---
