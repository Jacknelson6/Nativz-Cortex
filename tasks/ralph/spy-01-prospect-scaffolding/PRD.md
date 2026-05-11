# PRD: SPY · 01 · Prospect scaffolding (tables, lifecycle, sidebar, save-as-prospect)

> Spying → Prospect Pipeline · 01/10 · 2026-05-10

## Purpose & Value

Replace the single-shot `prospect_audits` model (one row per audit) with a durable `prospects` pipeline: a prospect is a stable record with lifecycle states, social handles, touchpoints, and a clear path to client conversion. Adds the "Save as prospect" button on existing audit reports so the new system is fed by the work already happening.

## Problem

`prospect_audits` (migration 084) treats every audit as a disposable artifact. There's no concept of "this is the same prospect we audited last month, now in outreach." Sales work spans weeks; the data model must too.

## Primary User
Strategist or Jack running outreach. They audit a brand, decide it's worth pursuing, want to track it through demo → conversion (or lost).

## SMART Goals
- `prospects`, `prospect_socials`, `prospect_touchpoints` tables created with RLS.
- 6 lifecycle states enumerated and enforced via CHECK.
- "Save as prospect" button appears on every `prospect_audit` detail and `brand_audit` detail page; one click promotes the audit into a `prospects` row.
- Admin sidebar shows "Prospects" entry under Intelligence with count badge.
- `/admin/prospects` lists all prospects sorted by `last_touched_at DESC`.

## User Stories
- **US-01** — As a strategist, after running an audit I click "Save as prospect" and see a new prospect record at `/admin/prospects/<id>`.
- **US-02** — As Jack, I can change a prospect's lifecycle state via a status pill dropdown (discovered → audited → in_outreach → demo_scheduled → converted → lost).
- **US-03** — As a strategist, I can add a free-text touchpoint note ("Sent loom April 14, replied April 16") and it stamps with my user + timestamp.
- **US-04** — As an admin, when I open the Prospects list I see lifecycle counts at the top (Discovered: 4, Audited: 12, In outreach: 7, Demo: 2, Converted: 19, Lost: 8).

## In Scope
- Migration `277_prospects.sql` (3 tables, indexes, RLS).
- API: `POST /api/prospects/from-audit` (promote a prospect_audits or brand_audits row into a prospects row), `GET /api/prospects`, `GET /api/prospects/[id]`, `PATCH /api/prospects/[id]` (state change), `POST /api/prospects/[id]/touchpoints`.
- UI: `/admin/prospects/page.tsx` (list), `/admin/prospects/[id]/page.tsx` (detail), `<SaveAsProspectButton>` component embedded on audit detail pages.
- Sidebar entry under Intelligence: "Prospects" with badge showing in-outreach count.

## Out of Scope
- Quick onboarding flow (SPY-02).
- Initial analysis (SPY-03).
- Scorecard / share link (SPY-04).
- Competitor analysis (SPY-05).
- Conversion to client (SPY-07; this PRD writes only the lifecycle state, not the FK to clients yet).

## Resolved Decisions
- **D-01** — Keep `prospect_audits` or migrate data? **→ Keep as artifact log; new `prospects` table is the canonical record.** Rationale: don't break the existing audit flow; treat audits as artifacts attached to prospects.
- **D-02** — Six states or simpler? **→ Six.** (discovered, audited, in_outreach, demo_scheduled, converted, lost.) Rationale: maps to how Jack actually thinks about the pipeline; smaller misses "in_outreach" granularity.
- **D-03** — `last_touched_at` semantics? **→ Updated on any state change, touchpoint insert, or analysis run.** Rationale: single sort key for "what needs attention."
- **D-04** — Soft delete or hard delete? **→ Soft via `archived_at TIMESTAMPTZ`.** Rationale: prospects sometimes come back; don't lose history.
- **D-05** — Multi-tenant scoping? **→ Admin-only v1; no org scoping yet.** Rationale: prospects are agency-internal, not client-org-bound.
- **D-06** — How do socials attach? **→ Separate `prospect_socials` table, mirroring `social_profiles` shape so SPY-02 onboarding can reuse it.** Rationale: prospects often have multiple platforms; one column won't cut it.

## Data Model

### Migration `277_prospects.sql`

```sql
-- ============================================================
-- SPY-01: Prospect pipeline scaffolding
-- Tables: prospects, prospect_socials, prospect_touchpoints
-- ============================================================

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  website_url TEXT,
  primary_platform TEXT CHECK (primary_platform IN ('tiktok','instagram','youtube','facebook')),
  primary_handle TEXT,
  niche TEXT,
  notes TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'discovered'
    CHECK (lifecycle_state IN ('discovered','audited','in_outreach','demo_scheduled','converted','lost')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','from_brand_audit','from_prospect_audit','imported')),
  source_ref_id UUID,                              -- id of brand_audits or prospect_audits row, when applicable
  owner_user_id UUID REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ,
  last_touched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospects_state ON prospects(lifecycle_state) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_last_touched ON prospects(last_touched_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_owner ON prospects(owner_user_id);

CREATE TABLE IF NOT EXISTS prospect_socials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram','youtube','facebook')),
  handle TEXT NOT NULL,
  profile_url TEXT,
  display_name TEXT,
  avatar_url TEXT,
  followers_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_socials_prospect_platform
  ON prospect_socials(prospect_id, platform);

CREATE TABLE IF NOT EXISTS prospect_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note','email_sent','email_received','meeting','demo','loom','dm','phone','state_change')),
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_touchpoints_prospect_time
  ON prospect_touchpoints(prospect_id, occurred_at DESC);

-- triggers
CREATE TRIGGER trg_prospects_updated
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- bump last_touched_at on touchpoint insert
CREATE OR REPLACE FUNCTION bump_prospect_last_touched() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE prospects SET last_touched_at = NEW.occurred_at WHERE id = NEW.prospect_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_prospect_touchpoints_bump
  AFTER INSERT ON prospect_touchpoints
  FOR EACH ROW EXECUTE FUNCTION bump_prospect_last_touched();

-- RLS: admin-only
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_socials ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospects_admin_all ON prospects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY prospect_socials_admin_all ON prospect_socials
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
CREATE POLICY prospect_touchpoints_admin_all ON prospect_touchpoints
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

## API Contracts

### `POST /api/prospects/from-audit`
Auth: admin (createServerSupabaseClient → role check).
Request:
```ts
const RequestSchema = z.object({
  source: z.enum(['brand_audit','prospect_audit']),
  source_id: z.string().uuid(),
});
```
Response (200):
```ts
{ prospect: { id: string; brand_name: string; lifecycle_state: 'audited' } }
```
Behavior: look up source row, extract brand name + website + handles, INSERT prospect with `source` + `source_ref_id` set, INSERT prospect_socials, INSERT state_change touchpoint ("Saved from audit"), return new prospect. Idempotent: if a prospect already exists with `source` + `source_ref_id` matching, return that one (no dupe).
Errors: 400 invalid input, 401 unauthorized, 404 source not found, 409 already saved (returns existing record).

### `GET /api/prospects`
Auth: admin.
Query: `?state=<lifecycle_state>&q=<search>` (both optional).
Response (200):
```ts
{
  prospects: Array<{ id; brand_name; lifecycle_state; primary_handle; primary_platform; last_touched_at; owner_user_id; socials: Array<{ platform; handle }> }>;
  counts: Record<LifecycleState, number>;
}
```

### `GET /api/prospects/[id]`
Auth: admin.
Response (200):
```ts
{
  prospect: ProspectRow;
  socials: ProspectSocialRow[];
  touchpoints: ProspectTouchpointRow[];   // ordered occurred_at DESC, limit 200
}
```
Errors: 404 not found.

### `PATCH /api/prospects/[id]`
Auth: admin.
Request:
```ts
const RequestSchema = z.object({
  lifecycle_state: z.enum(['discovered','audited','in_outreach','demo_scheduled','converted','lost']).optional(),
  brand_name: z.string().min(1).optional(),
  website_url: z.string().url().optional().nullable(),
  niche: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  owner_user_id: z.string().uuid().optional().nullable(),
  archived_at: z.union([z.string().datetime(), z.null()]).optional(),
});
```
Behavior: on `lifecycle_state` change, ALSO insert a `prospect_touchpoints` row of kind `state_change` with body `"State: <from> → <to>"`.
Response (200): `{ prospect: ProspectRow }`.
Errors: 400, 404.

### `POST /api/prospects/[id]/touchpoints`
Auth: admin.
Request:
```ts
const RequestSchema = z.object({
  kind: z.enum(['note','email_sent','email_received','meeting','demo','loom','dm','phone']),
  body: z.string().min(1).max(4000),
  occurred_at: z.string().datetime().optional(),  // defaults to now()
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```
Response (200): `{ touchpoint: ProspectTouchpointRow }`.

## LLM Prompts

None in this PRD. SPY-03 owns LLM analysis.

## UI Components

### `app/admin/prospects/page.tsx`
List view. Server component.
- Page header: "Prospects" + subtitle "Sales pipeline" + "+ New prospect" CTA (links to SPY-02 onboarding flow, stub for now).
- Top row: 6 `SectionPanel` mini-cards, one per lifecycle state, count + click-to-filter.
- Table: `<ProspectsTable rows={...} />`.
- Empty state when no rows: IconCard "No prospects yet. Save one from an audit to start."

### `app/admin/prospects/[id]/page.tsx`
Detail view. Server component fetches; client subcomponents for state mutations.

Sections (top to bottom):
1. Header: brand_name (H1), niche (subtitle), primary handle + platform pill.
2. Lifecycle pill (dropdown, client component).
3. Owner + last touched row.
4. Tabs: Overview / Audit / Analysis / Competitors / Touchpoints (later PRDs fill 2-4; v1 enables Overview + Touchpoints).
5. Overview: socials list, website link, notes (editable inline).
6. Touchpoints: timeline list + "Add note" textarea.

### `components/prospects/save-as-prospect-button.tsx`
Client component, takes `{ source: 'brand_audit'|'prospect_audit'; sourceId: string; existingProspectId?: string }`.
- If `existingProspectId` set: render disabled "Saved as prospect →" link to detail.
- Else: button "Save as prospect" → POST /api/prospects/from-audit → router.push(`/admin/prospects/${id}`).
- Toast on error.

Mount points:
- `app/admin/prospect-audits/[id]/page.tsx` — top-right of header.
- `app/admin/brand-audits/[id]/page.tsx` — top-right of header.
(verify file paths in T08.)

### `components/prospects/lifecycle-pill.tsx`
Client. Props: `{ prospectId; state; onChange }`. Renders accent-text pill; click opens dropdown with the 6 states; on select PATCHes `/api/prospects/[id]`.

### `components/prospects/touchpoint-list.tsx`
Server-renderable. Props: `{ touchpoints: ProspectTouchpointRow[] }`. Vertical timeline, kind icon + body + relative time.

### `components/prospects/add-touchpoint-form.tsx`
Client. Textarea + kind select (default `note`) + submit; POSTs `/api/prospects/[id]/touchpoints`.

### `components/layout/admin-sidebar.tsx` (modify)
Add "Prospects" entry under Intelligence section above "Viral Formats". Badge shows in-outreach count (fetched server-side in the layout).

## File Map

Create:
- `supabase/migrations/277_prospects.sql`
- `app/api/prospects/from-audit/route.ts`
- `app/api/prospects/route.ts`
- `app/api/prospects/[id]/route.ts`
- `app/api/prospects/[id]/touchpoints/route.ts`
- `app/admin/prospects/page.tsx`
- `app/admin/prospects/[id]/page.tsx`
- `components/prospects/save-as-prospect-button.tsx`
- `components/prospects/lifecycle-pill.tsx`
- `components/prospects/touchpoint-list.tsx`
- `components/prospects/add-touchpoint-form.tsx`
- `components/prospects/prospects-table.tsx`
- `lib/prospects/types.ts` (TS interfaces)
- `lib/prospects/queries.ts` (helpers: getProspect, listProspects, etc.)
- `tasks/ralph/spy-01-prospect-scaffolding/progress.txt`

Modify:
- `components/layout/admin-sidebar.tsx`
- `app/admin/prospect-audits/[id]/page.tsx` (mount Save-as-prospect button)
- `app/admin/brand-audits/[id]/page.tsx` (mount Save-as-prospect button)
- `lib/supabase/types.ts` (regenerated)

## Env Vars

None new.

## Edge Cases

- **Source audit lacks brand_name.** `prospect_audits` may have only `tiktok_url`. Extract handle from URL, use handle as fallback brand_name (`@whoever`).
- **Duplicate save click.** Idempotency: `(source, source_ref_id)` UNIQUE-ish check at API layer (no DB constraint to allow re-saves after archive; resolve in app code).
- **State transition order.** Don't enforce monotonic transitions in DB; strategist may legitimately move backward (e.g. demo_scheduled → in_outreach if demo cancels).
- **Owner change.** On owner change, write a touchpoint of kind `state_change` with body `"Owner: <from> → <to>"`. (Same kind reused; differentiate via body parsing or metadata.kind_subtype.)
- **Archived prospect re-saved from same audit.** Unarchive (set `archived_at = NULL`) and return.

## Test Plan

Unit (Vitest):
- `lib/prospects/queries.ts` listProspects: filters by state, returns counts.
- `lib/prospects/extract-from-audit.ts`: shape conversion from `prospect_audits.prospect_data` JSON to prospects insert payload.

Integration:
- `POST /api/prospects/from-audit` against fixture audit row, asserts prospect + socials + touchpoint rows created.
- `PATCH /api/prospects/[id]` lifecycle change writes touchpoint.

E2E (Playwright):
- Audit detail → click "Save as prospect" → land on /admin/prospects/[id] → state pill defaults to "audited".
- Add a note → appears in timeline.

Manual QA:
- `/admin/prospects` list filters by state click.
- Sidebar badge updates when in_outreach prospect added/removed.

## Architecture Wiring

- Mirrors `brand_audits` (170) RLS shape.
- `prospect_audits` (084) is preserved; this PRD doesn't drop it. SPY-02+ writes to both for transition period; SPY-10 sunsets `prospect_audits`.
- Sidebar entry pattern from `feedback_sidebar_title_case.md`.
- Touchpoints list pattern mirrors editing project comment thread (`components/editing/` if extant).

## Done When

- Migration 277 applied.
- All 5 API routes return correct shapes for happy path + 401/404.
- `/admin/prospects` list + `/admin/prospects/[id]` detail render and mutate correctly.
- "Save as prospect" on brand_audit + prospect_audit detail pages works end-to-end.
- Sidebar "Prospects" entry with live in_outreach badge.
- E2E test green.
- No TS errors, no lint warnings.
- progress.txt fully `[x]`.
