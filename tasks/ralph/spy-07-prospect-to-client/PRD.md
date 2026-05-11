# PRD: SPY · 07 · Prospect to client conversion

> Spying → Prospect Pipeline · 07/10 · 2026-05-10

## Purpose & Value

The moment a prospect signs. Preserve continuity: audits, competitor benchmarks, monitor history, scorecard, alerts — all of it stays connected to the new client record so the strategist isn't starting from scratch on day one. Convert without losing the relationship graph.

## Problem

Without an explicit conversion flow, signing a deal means either (a) create a new client manually and lose all prospect context, or (b) leave the data in the prospects table awkwardly. Neither honors the work the sales rep already did, and the strategist who picks up the new account on day one has to recreate the briefing from scratch.

## Primary User

Sales rep at signing time (clicks Convert). Strategist who picks up the new account week one (consumes "From prospecting" panel). Admin (audit log + push).

## SMART Goals

- Conversion is a single button click on a prospect record; full flow <30s elapsed.
- 100% of prospect history (audits, benchmarks, alerts, scorecard) becomes queryable from the new client record via `clients.converted_from_prospect_id`.
- New client onboarding kit (org, user invite, default settings) is created in <30s.
- Zero data loss; zero broken references. All prospect-side FKs remain valid post-conversion (we archive, never delete).
- SPY-06 monitor auto-pauses on conversion (active flag flipped to false).

## User Stories

- **US-01** — As a sales rep, I click "Convert to client" on a prospect, fill org name + primary contact email + tier + strategist, and the system creates the client + organization + invite in one flow.
- **US-02** — As a strategist on day one with the new client, I open `/admin/clients/[id]` and see a "From prospecting" panel summarizing: original audit date, scorecard, competitor benchmarks, alert history, with deep-links to each.
- **US-03** — As a developer, every prospect-side row that referenced `prospect_id` is queryable from the client record via `clients.converted_from_prospect_id`.
- **US-04** — As an admin, conversion fires the activity log + push notification ("Nike just converted").
- **US-05** — As a sales rep, I can undo a conversion within 1 hour if I picked the wrong tier or made a typo.

## In Scope

- Migration `282_prospect_conversion.sql`: ALTER `clients` ADD `converted_from_prospect_id UUID UNIQUE REFERENCES prospects(id) ON DELETE SET NULL`; ALTER `prospects` ADD `converted_to_client_id UUID REFERENCES clients(id) ON DELETE SET NULL`; ALTER `prospects` ADD `archived_at TIMESTAMPTZ`; index on each FK.
- API `POST /api/prospects/[id]/convert`: org_name, contact_email, contact_name, tier, strategist_user_id, notes (optional).
- Client + organization create flow: organization → client → user_client_access defaults → invite token mint.
- "From prospecting" panel component on `/admin/clients/[id]`.
- Prospect stage auto-flips to `converted`; archived_at set; `converted_to_client_id` populated.
- SPY-06 monitor auto-pause (set `prospect_monitor_config.active=false`).
- Undo window: `POST /api/prospects/[id]/convert/undo` within 1h of conversion.
- Activity log entry + push notification fires to admin team.

## Out of Scope

- Migrating prospect analytics into live analytics views (SPY-08 owns the source-router that handles this transparently).
- Billing / Stripe customer creation (separate flow).
- Auto-onboarding email to the new client (handled by existing email composer; conversion just drafts in inbox).
- Bulk conversion of multiple prospects.
- Migrating Mux / Drive / Zernio integrations.

## Resolved Decisions

- **D-01** — Default tier on convert? **→ Required field, dropdown of existing tiers from `client_tiers` table; no default.** Rationale: tier drives pricing and quotas; defaulting is dangerous.
- **D-02** — Auto-assign strategist? **→ Yes, required field, default to the sales rep who owns the prospect; allow override in modal.** Rationale: tight handoff.
- **D-03** — Keep prospect record around or delete on conversion? **→ Archive (set `archived_at`), hide from default `/admin/prospects` index; never delete.** Rationale: data preservation; FKs from snapshots/alerts stay valid.
- **D-04** — Bi-directional FK or single direction? **→ Both: `clients.converted_from_prospect_id` and `prospects.converted_to_client_id`.** Rationale: querying from either side is common; UNIQUE on both prevents double-convert.
- **D-05** — Monitor behavior on convert? **→ Auto-pause (active=false); strategist re-enables manually if they want.** Rationale: post-conversion they have real client data; competitor monitor is a sales tool primarily.
- **D-06** — Invite token type? **→ Existing `invite_tokens` flow with `kind='client_primary'`.** Rationale: reuse, no new auth surface.
- **D-07** — Undo window? **→ 1 hour from conversion; sets `archived_at=null` on prospect, deletes the client + org + invite. Hard wall after 1h (manual cleanup required).** Rationale: trade-off between safety and reducing footguns.
- **D-08** — Org name collision? **→ If org_name matches existing, surface "merge into existing org?" dialog; otherwise create new.** Rationale: multi-brand clients are real.
- **D-09** — Activity log table? **→ Reuse existing `activity_log` (or whatever the codebase has); kind='prospect_converted'.** Rationale: don't invent new log surface.
- **D-10** — Push notification audience? **→ All admins.** Rationale: conversions are team-celebration moments.
- **D-11** — Conversion modal location? **→ Modal on `/admin/prospects/[id]`; do not navigate away mid-flow; on success navigate to new `/admin/clients/[id]`.** Rationale: contextual.

## Data Model

### Migration `282_prospect_conversion.sql`

```sql
-- ============================================================
-- SPY-07: Prospect → Client conversion
-- Adds bi-directional FKs + archive flag.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS converted_from_prospect_id UUID UNIQUE
    REFERENCES prospects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_converted_from_prospect
  ON clients(converted_from_prospect_id)
  WHERE converted_from_prospect_id IS NOT NULL;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS converted_to_client_id UUID UNIQUE
    REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prospects_archived_at
  ON prospects(archived_at) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_converted_to_client
  ON prospects(converted_to_client_id)
  WHERE converted_to_client_id IS NOT NULL;
```

No new RLS policies (these are admin-only columns on admin-only tables; existing RLS suffices).

## API Contracts

### `POST /api/prospects/[id]/convert`

```ts
// Zod
const Body = z.object({
  org_name: z.string().min(2).max(120),
  contact_email: z.string().email(),
  contact_name: z.string().min(2).max(120),
  tier: z.string().min(1), // FK validated server-side against client_tiers
  strategist_user_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  merge_into_org_id: z.string().uuid().optional(), // when collision dialog used
});
```

Response:
```ts
{
  client_id: string;
  organization_id: string;
  invite_token: string;
  invite_url: string;
}
```

Behavior:
1. Auth: admin only via `createAdminClient()`.
2. Validate prospect exists, is not already converted (`converted_to_client_id IS NULL`), not archived.
3. Validate tier exists.
4. If `merge_into_org_id` set, use that org; else create new org.
5. Create client row with `converted_from_prospect_id`.
6. Create user_client_access rows for strategist + sales rep + all admins.
7. Mint invite_token kind='client_primary' for contact_email.
8. Update prospect: stage='converted', converted_to_client_id, archived_at=now().
9. Auto-pause SPY-06 monitor: `UPDATE prospect_monitor_config SET active=false WHERE prospect_id=$1`.
10. Insert activity_log row.
11. Push notification to all admins.
12. Return ids + invite URL.

Errors: 400 invalid body, 404 prospect not found, 409 already converted, 422 tier invalid.

### `POST /api/prospects/[id]/convert/undo`

```ts
// No body
```

Response: `{ ok: true }`

Behavior:
1. Auth admin.
2. Find conversion within last 1h (joined via activity_log timestamp or prospect.converted_at if we add it — let's just check `prospects.archived_at > now() - interval '1 hour'`).
3. Delete the linked client, org, user_client_access, invite_token.
4. Clear prospect's converted_to_client_id, archived_at, restore stage to previous.
5. Resume monitor if it was active before conversion (store prior active flag in activity_log payload).
6. Insert activity_log 'prospect_conversion_undone'.

Errors: 410 if outside undo window; 404 if no conversion to undo.

### `GET /api/clients/[id]/from-prospecting`

```ts
// No body
```

Response:
```ts
{
  prospect_id: string;
  original_audit_date: string | null;
  scorecard: ScorecardSnapshot | null; // from SPY-04
  benchmarks: ProspectCompetitorBenchmarkRow[]; // from SPY-05
  alerts_count: { total: number; high: number };
  monitor_active: boolean;
  links: {
    prospect_detail: string; // /admin/prospects/[id] (archived view)
    scorecard_share: string | null;
    benchmark_share: string | null;
  };
}
```

Behavior:
1. Auth admin.
2. Find client; require `converted_from_prospect_id` not null.
3. Fan-out reads: prospect, latest analysis, latest benchmark, alert counts, monitor config.
4. Return aggregated payload.

Errors: 404 if not converted-from-prospect.

## Components

### `components/prospects/convert-prospect-modal.tsx`

Props:
```ts
{
  prospect: ProspectRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Fields: org_name (default = prospect.brand_name), contact_email, contact_name, tier (select), strategist (select), notes (textarea).

On submit: POST `/api/prospects/[id]/convert`; on success, copy invite URL to clipboard + toast + navigate to `/admin/clients/[client_id]`.

Collision UX: if 409 with merge candidates, show "Merge into existing org [X]?" with re-submit using `merge_into_org_id`.

Copy: button label "Convert to client" (sentence case); success toast "Nike converted; invite sent to ann@nike.com" (sentence case).

### `components/clients/from-prospecting-panel.tsx`

Props:
```ts
{
  clientId: string;
}
```

Server component; fetches from `GET /api/clients/[id]/from-prospecting`; renders empty state when null. Sections:
- Original audit: date + link.
- Scorecard: R/Y/G dot summary band + "View scorecard" link.
- Competitor benchmarks: count + last_run date + "View head-to-head" link.
- Alert history: total + high count + "View alerts" link.
- Monitor: status pill (paused/active) + toggle.

Visual: `IconCard` per CLAUDE.md section-card design system; h-9 w-9 accent swatch.

### `components/prospects/undo-conversion-banner.tsx`

Props:
```ts
{
  clientId: string;
  convertedAt: string;
}
```

Renders only when within 1h of conversion; countdown timer; "Undo conversion" button → POST undo endpoint with confirmation dialog.

## File Inventory

New files:
- `supabase/migrations/282_prospect_conversion.sql`
- `app/api/prospects/[id]/convert/route.ts`
- `app/api/prospects/[id]/convert/undo/route.ts`
- `app/api/clients/[id]/from-prospecting/route.ts`
- `lib/prospects/convert.ts` (orchestrator helper)
- `lib/prospects/convert.test.ts`
- `components/prospects/convert-prospect-modal.tsx`
- `components/clients/from-prospecting-panel.tsx`
- `components/prospects/undo-conversion-banner.tsx`
- `tests/e2e/prospect-convert.spec.ts`

Edited files:
- `lib/supabase/types.ts` (regen)
- `app/admin/prospects/[id]/page.tsx` (mount Convert button + modal)
- `app/admin/clients/[id]/page.tsx` (mount FromProspectingPanel + UndoBanner if applicable)
- `app/admin/prospects/page.tsx` (filter out archived by default; "Show archived" toggle)

## Edge Cases

- Prospect already converted → 409.
- Contact email already a user → still mint invite; existing user just gets `user_client_access` added.
- Org name matches existing → collision dialog → merge or new.
- Tier deleted between modal load and submit → 422.
- Strategist deactivated → 422.
- Undo after 1h → 410.
- Undo while invite has been redeemed → block undo, surface "invite already redeemed; contact admin".
- Monitor row doesn't exist for prospect → no-op on pause.
- Push notification fails → log + continue (non-blocking).
- Activity log fails → log + continue.

## Verify Gates

- `npx tsc --noEmit`
- `npx vitest run lib/prospects/convert.test.ts`
- Apply migration via Supabase MCP; verify FKs exist.
- Manual conversion against staging seed prospect; verify all 11 behaviors.
- E2E: `tests/e2e/prospect-convert.spec.ts`.

## Done When

- 3 real prospect-to-client conversions completed end-to-end on staging.
- "From prospecting" panel renders with correct counts/links.
- Invite + login flow works for the converted prospect's primary contact.
- Activity log entry visible in admin activity feed.
- Push notification fires; verified on Jack's phone.
- Monitor confirmed auto-paused.
- Undo works within window; rejected outside it.
- Migration applied to prod; no FK violations; types regenerated.
