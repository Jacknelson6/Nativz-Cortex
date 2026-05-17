# PRD 10 — Onboarding rewrite

## Goal

Make the onboarding flow capture *exactly* the data the new profile surfaces, write it to the real profile tables, and never write anywhere else. The current flow scatters answers into `onboardings.step_state` JSONB, mirrors *some* fields to `clients`, and orphans the rest. After this PRD: every onboarding answer lands on a profile-visible row, and `step_state` shrinks to per-step "completed" flags only.

Per Jack's hard rule: onboarding must capture **POC data, social profiles, product info (with thumbnails, scraped), website URL, existing footage**.

## Current → new screen mapping

| Current screen | New screen | Writes to (NEW behavior) |
|---|---|---|
| welcome | welcome | onboardings.current_step only |
| points_of_contact | **People** | `contacts` (now also captures phone + project_role) |
| brand_basics | **Brand basics** | `clients.{name, website_url, logo_url, description}` (drops free-text `tagline`, `what_we_sell`, `current_offers`) |
| (new) | **Products** | Scrapes website on submit → `client_products` rows with thumbnails. User confirms which to keep before next step. |
| social_connect | **Social accounts** | Now writes `client_social_accounts` rows directly. Zernio webhook updates the same table instead of `step_state`. |
| footage_and_references | **Footage** | URLs become `client_brand_assets` rows with `category='footage'`, `source=onboarding_scrape`. Notes field deleted. |
| done | done | `onboardings.status='completed'`, `clients.lifecycle_state='active'` |

## Required schema additions

Migration 320:
- `client_products` (see PRD 03)
- `client_social_accounts` (see PRD 09)
- `contacts.project_role` text — verify exists; add if missing
- `client_brand_assets.source` text default `'admin_upload'` check (`source in ('admin_upload','onboarding_scrape','onboarding_upload')`)

## Wiring changes

### `lib/onboarding/api.ts`
- Delete `syncBrandBasicsToClient` — replaced by direct writes from the new PATCH handler.
- Delete `markPlatformConnection` — Zernio webhook writes to `client_social_accounts` directly.
- `markClientOnboardingComplete` keeps its single job: lifecycle flip + completion email.

### `app/api/public/onboarding/[token]/route.ts`
- PATCH per-screen now hits the real table, not `step_state`. `step_state` keeps a `{ completed: true }` flag per screen for resumability.

### New: `app/api/public/onboarding/[token]/products/scrape/route.ts`
- Calls a server-side scraper (reuse `lib/prospects/onboard-from-url.ts` patterns) → returns candidate products
- POST `[token]/products/confirm` accepts the admin-/client-selected subset → inserts `client_products`

### `components/onboarding/screens/`
- `brand-basics.tsx` — drop tagline/what_we_sell/audience fields from the form. Add description.
- `points-of-contact.tsx` — add phone + project_role inputs.
- New: `products.tsx` — shows scraped candidates as a checkbox list with thumbnails. "Add manually" button for the gaps.
- `social-connect.tsx` — on connect success, hits the new endpoint that inserts into `client_social_accounts` instead of `step_state`.
- `footage-and-references.tsx` — paste-URL rows now POST to `/api/clients/[id]/brand-assets/urls` (new endpoint) which downloads + stores or saves the URL as a `client_brand_assets` row with `category='footage'`.

## Orphan cleanup

After this PRD, the following `step_state` keys are obsolete and stop being written:
- `brand_basics.tagline`, `brand_basics.what_we_sell`, `brand_basics.current_offers`
- `social_handles.connections[]`, `social_handles.meta_business_suite_acknowledged`
- `footage_and_references.{notes, previous_edit_urls}`

A one-time data migration (migration 321) reads existing `step_state` data and writes it into the new tables for any in-flight onboarding, then leaves the JSONB as-is for history.

## Done criteria

- [ ] Every onboarding question maps to a profile-visible field
- [ ] PATCH handler refuses any payload key not in the screen schema (fail-loud)
- [ ] Product scrape works on a real ecommerce site (Beaux as test target)
- [ ] Social connect populates `client_social_accounts`; profile Integrations reflects it within one refresh
- [ ] Footage URLs/files land as `client_brand_assets` rows with correct source
- [ ] Existing in-flight onboardings continue working (migration 321 backfill verified)
- [ ] `step_state` keys listed above are not written by any new code path

## Out of scope

- Rebuilding the admin onboarding tracker — that surface stays as-is
- Email log changes — `onboarding_emails_log` keeps its current shape
