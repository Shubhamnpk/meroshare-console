# Complete account profile + user tools

Dropping the dividends / mutual-fund / broker pages from the earlier list. Focus: surface every field the MeroShare API returns about the user, and add tools that are genuinely useful on top of it.

## What's there now

The profile page reads only `ownDetail` — name, demat, a few expiry badges. The account API already exposes `myDetail`, `bankList`, `bankDetail` and `bankRequest`, but none of that extra detail reaches the UI.

## 1. Full profile coverage

Rebuild `/profile` around every field the API returns, grouped into sections:

- **Identity** — full name, gender, date of birth (BS and AD), father/mother/spouse name, grandfather name where returned
- **Citizenship & documents** — citizenship number, issue date, issue district, PAN if present
- **Contact** — email, mobile, address (district, municipality, ward, street), permanent vs temporary
- **Demat / BOID** — demat number, BOID, client code, account status, account open date, demat expiry, renewal state, suspension/blocked flags
- **Depository participant** — DP name, DP code, branch, contact
- **MeroShare account** — username, account status, password expiry, last login, KYC status, profile picture if the API returns one
- **Banks** — every linked ASBA bank with account number, branch, CRN and KYC state (from `bankList` + `bankDetail` + `bankRequest`), not just the one used at apply time

Fields the API omits for a given user are hidden rather than shown blank. Anything sensitive (citizenship, account numbers) is masked by default with a reveal toggle, and copy buttons on the identifiers.

## 2. Extra tools worth having

- **Account health panel** — one card that flags what needs action: password expiring soon, demat expiring, CRN missing on a bank, KYC incomplete, PIN never changed. Each item links to the place that fixes it.
- **Export my data** — download the full account profile (identity, banks, DP) as JSON/CSV for the user's own records.
- **Quick actions on profile** — change password, change PIN, and sign out of the session, inline instead of only under Settings.
- **Session info** — when the session started, when it expires, and last login device from the activity log.

## 3. Design

Same dark-first financial style. Two-column definition grids on desktop, stacked cards on mobile, sticky section nav on the left for long profiles, masked values in tabular numerals.

## Technical notes

- New server function `getAccountProfile` in `account.functions.ts` that fans out `ownDetail`, `myDetail`, `bankList` (+ per-bank `bankDetail` / `bankRequest`) in one server round-trip and returns one normalised, serialization-safe DTO — so the client makes a single request.
- Typed `AccountProfile` shape in `meroshare/types.ts`; unknown/extra CDSC keys kept in a raw section so nothing the API returns is lost.
- `/profile` rewritten to use it via a new `accountProfileQuery`; masking and export are client-side only.
- No credential storage changes — session stays cookie-only, PIN and password never returned to the browser.
