# QA results — ad creatives & admin shell (2026-03-20)

## Round 3 — authenticated QA + API alignment

- **Templates GET `limit`:** `GET /api/clients/[id]/ad-creatives/templates` had **`max(100)`** while **`ad-wizard.tsx`** requests **`limit=500`**, causing **400** and console noise on the Generate flow. **Fixed:** `max` raised to **2000** (comment points to wizard).
- **Brand context PATCH:** Scraped **`description`** can exceed **2000** chars, failing Zod on autosave. **Fixed:** **`description` max 50000** in `app/api/ad-creatives/brand-context/route.ts`.
- **Signed-in browser QA from this environment:** Not possible without your session cookies; after pull, confirm **Generate → Templates** step loads with **no 400** in Network for client templates.

## Re-test summary (round 2)

- **`/admin/login`:** Now returns **HTTP 200** after fixing `app/admin/layout.tsx` (see below). Dev server was **restarted** so the layout change applied cleanly.
- **Playwright:** Login page renders correctly (headline, email/password, forgot link, brand toggle). **`/admin/ad-creatives` unauthenticated → redirects to `/admin/login`** as expected.
- **Console (errors):** **0** on login load (only benign devtools / autocomplete hints).
- **Authenticated ad creatives flow:** Not exercised here — requires real credentials in the browser. Use the checklist below after sign-in.

## Root cause of prior 500 on `/admin/login`

The admin root layout always mounted **sidebar, header, `getCachedUser` (service role + `unstable_cache`)** even when there was **no session**. On `/admin/login` that extra work was unnecessary and could **fail or error in dev**, surfacing as **500**.

### Fix: `app/admin/layout.tsx`

1. If **`getUser()` has no user**, render **only** `<PageTransition>{children}</PageTransition>` (full-screen login, no chrome).
2. Wrap bootstrap in **`try/catch`** and fall back to the same minimal shell so local misconfig is less likely to brick login.
3. **`getCachedUser`** wrapped in **`try/catch`** so a cache/DB hiccup does not take down the layout.

## Earlier ad-creatives fixes (still in tree)

| Area | Change |
|------|--------|
| **Brand DNA polling** | `AdCreativesHub`: single poll interval, cleanup on unmount / reset / new scan / client change. |
| **Long-running DNA** | 5-minute timeout → neutral toast. |
| **Client picker** | No website URL → toast; failed crawl → error toast. |
| **Missing `clientId`** | Empty state + start over instead of broken wizard. |
| **Tabs / back / inputs** | `type="button"`, `aria-label`s, focus rings on key controls. |
| **Ad library** | Category `aria-label`; input focus rings. |

## Login page polish (round 2)

- Password visibility control: **`aria-label`** (show / hide password).
- Email / password: **`autoComplete="email"`** and **`current-password`** (quieter browser warnings, better UX).
- Logo mode toggles: **`type="button"`** + mobile toggle **`aria-label`** (match desktop).

## Automated tests

- **`npm test`** — pass (includes `extract-ad-library-urls` when run as part of suite).
- **`npx tsc --noEmit`** — run after edits.

## Production build (unchanged caveat)

`npm run build` may still fail if this checkout is missing **route modules** or has a **corrupt `.next`**. Try `rm -rf .next && npm run build` after confirming routes exist on disk.

## Manual checklist (signed-in)

1. **`/admin/ad-creatives`** — URL vs client, scan, tabs Generate / Gallery / Templates.
2. **Client without `website_url`** — toast, no stuck spinner.
3. **Brand DNA generating** — poll completes or fails clearly.
4. **Templates → Ad library import** — scrape + empty/success toasts.
5. **`/admin/clients/[slug]/ad-creatives`** — generate tab + loading.
6. **AC mode** on login — toggle logos and readable form.
