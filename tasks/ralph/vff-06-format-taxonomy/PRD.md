# PRD: VFF · 06 · Format taxonomy

> Viral Format Finder · 06/10 · 2026-05-10

## Purpose & Value

Define the controlled vocabulary the LLM picks from in VFF-05 and the UI groups by in VFF-07. Without it, every Gemini run invents its own labels and the library becomes ungroupable. This PRD seeds 4 dimensions (hook_type, structure, archetype, pacing) with ~45 entries, adds a proposal queue for off-taxonomy LLM picks, and ships an admin CRUD page for strategists to evolve the taxonomy.

## Problem

If `hook_type` is free text, the system collects 200 variants of "curiosity gap" and the Netflix rows cannot aggregate them. Format intelligence requires SHARED labels across videos so a strategist can say "show me POV hooks" and get a coherent row.

## Primary User

Internal strategists (browse + edit). Future agents (Nerd, Goodjin) read the taxonomy via the same table.

## SMART Goals

- Taxonomy seeded with 40-60 entries across 4 dimensions on day 1.
- >=95% of analyzed videos (VFF-05) match an existing slug; <=5% trigger a proposal queue entry.
- Taxonomy edit cycle (add slug → live in next VFF-05 cron tick) <=5 min.
- Proposal review surface lists pending entries; admin approves/rejects in <=10s/entry.

## User Stories

- **US-01** — As a strategist, I open `/admin/formats/taxonomy` and see every slug grouped by dimension with description + example video count.
- **US-02** — As an admin, I add / edit / archive a slug; the next VFF-05 cron run picks up the change.
- **US-03** — As an admin, when the LLM proposes a slug not in the taxonomy, I see it on `/admin/formats/taxonomy?tab=proposals` and can approve, reject, or merge into an existing slug.
- **US-04** — As the system (VFF-05), when an analysis output uses a slug not in `viral_formats`, I write a `format_taxonomy_proposals` row.

## In Scope

- Migration 276 seeding initial taxonomy + adding `format_taxonomy_proposals` table.
- Initial seed: 47 entries (15 hook_type + 15 structure + 10 archetype + 7 pacing).
- Admin route: `app/admin/formats/taxonomy/page.tsx` with two tabs: "Slugs" and "Proposals."
- CRUD API:
  - `GET /api/admin/formats/taxonomy` (list)
  - `POST /api/admin/formats/taxonomy` (create)
  - `PATCH /api/admin/formats/taxonomy/[id]` (rename, edit description, archive)
  - `GET /api/admin/formats/taxonomy/proposals` (list)
  - `POST /api/admin/formats/taxonomy/proposals/[id]/approve` (creates a `viral_formats` row, optionally merges existing `viral_video_formats` rows pointing at the proposal slug)
  - `POST /api/admin/formats/taxonomy/proposals/[id]/reject` (status='rejected')
  - `POST /api/admin/formats/taxonomy/proposals/[id]/merge` (body: `target_slug`; rewrites `viral_video_formats` rows pointing at proposal slug to target)
- Alias support: `viral_formats.aliases TEXT[]` column (ADD COLUMN in migration 276) for LLM fuzzy matching.
- VFF-05 prompt uses `display_name (aliases)` in the taxonomy CSV.

## Out of Scope

- Multi-language taxonomy (English only v1).
- Per-brand taxonomy overrides (global v1).
- Auto-merging similar proposals (admin manual review).
- Archive cascading (archived slugs render with a faded badge but remain valid for existing analyses).

## Resolved Decisions

- **D-01** — Archived slug behavior on existing analyses? **→ Kept as-is, badge greys.** Rationale: rewriting history confuses strategists; archive is a "stop suggesting" flag.
- **D-02** — Slug aliases? **→ Yes, `aliases TEXT[]`.** Rationale: helps LLM map fuzzy outputs without taxonomy churn.
- **D-03** — Per-dimension hard cap? **→ No hard cap; soft warning at 30.** Rationale: ranges differ across dimensions; archetype caps at 12 naturally, hook_type can grow.
- **D-04** — Proposal de-duplication? **→ Unique constraint on `(kind, lowercase(slug))`; second proposal of the same slug increments a `proposal_count` integer.** Rationale: avoids 50 duplicate rows when the LLM hits the same gap.
- **D-05** — Approve action retroactive? **→ Default no, with a "Also retag existing analyses with proposal slug" checkbox.** Rationale: most approvals are minor; retroactive retag is opt-in.
- **D-06** — Who can edit taxonomy? **→ super_admin only (admins read; super_admin writes).** Rationale: taxonomy is a global product surface; protect from accidental edits.
- **D-07** — Display name vs slug? **→ Slug is snake_case immutable id; display_name is human label.** Rationale: matches existing pattern in `clients.industry` enum and many other Cortex tables.

## Data Model

### Migration `276_format_taxonomy_seed.sql`

```sql
-- ============================================================
-- VFF-06: Format taxonomy seed + proposal queue
-- ============================================================

-- aliases column for LLM fuzzy matching
ALTER TABLE viral_formats
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS example_video_id UUID REFERENCES viral_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viral_formats_archived
  ON viral_formats(archived_at)
  WHERE archived_at IS NULL;

-- Proposal queue
CREATE TABLE IF NOT EXISTS format_taxonomy_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('hook_type', 'structure', 'archetype', 'pacing')),
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  proposed_description TEXT,
  evidence_video_id UUID REFERENCES viral_videos(id) ON DELETE SET NULL,
  proposal_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  merged_into_format_id UUID REFERENCES viral_formats(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_format_proposals_kind_slug
  ON format_taxonomy_proposals(kind, lower(slug))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_format_proposals_status
  ON format_taxonomy_proposals(status);

CREATE TRIGGER trg_format_proposals_updated
  BEFORE UPDATE ON format_taxonomy_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE format_taxonomy_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY format_proposals_admin_all ON format_taxonomy_proposals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

-- ============================================================
-- Seed: 47 entries (15 + 15 + 10 + 7)
-- ============================================================

INSERT INTO viral_formats (kind, slug, display_name, description, aliases, is_seeded) VALUES
-- hook_type (15)
('hook_type', 'curiosity_gap', 'Curiosity gap', 'Open with a missing piece of information the viewer needs', ARRAY['mystery_open','tease_open'], true),
('hook_type', 'controversial_claim', 'Controversial claim', 'Open with a bold or polarizing statement', ARRAY['hot_take','spicy_open'], true),
('hook_type', 'problem_setup', 'Problem setup', 'Open by naming a pain point the viewer recognizes', ARRAY['pain_point_open','struggle_open'], true),
('hook_type', 'comparison_hook', 'Comparison hook', 'Open by contrasting two things side by side', ARRAY['versus_open','this_vs_that'], true),
('hook_type', 'transformation_promise', 'Transformation promise', 'Open by promising a before-after change', ARRAY['glow_up_open','results_promise'], true),
('hook_type', 'listicle_promise', 'Listicle promise', 'Open with "N things" or "N ways"', ARRAY['top_n','n_ways'], true),
('hook_type', 'fear_appeal', 'Fear appeal', 'Open by warning the viewer about a risk', ARRAY['warning_open','danger_open'], true),
('hook_type', 'social_proof_open', 'Social proof open', 'Open with numbers, awards, or names that lend credibility', ARRAY['credentials_open','authority_open'], true),
('hook_type', 'statistic_shock', 'Statistic shock', 'Open with a surprising number', ARRAY['stat_open','number_open'], true),
('hook_type', 'pov_drop', 'POV drop', 'Open with a "POV:" frame to put viewer in a role', ARRAY['pov_open','first_person_open'], true),
('hook_type', 'question_open', 'Question open', 'Open with a direct question to the viewer', ARRAY['rhetorical_open'], true),
('hook_type', 'quote_open', 'Quote open', 'Open by quoting someone (real or fictional)', ARRAY['quoted_open'], true),
('hook_type', 'day_in_life_open', 'Day in life open', 'Open by stating "a day in the life of"', ARRAY['ditl_open','behind_routine'], true),
('hook_type', 'demo_open', 'Demo open', 'Open by showing the product or action in motion', ARRAY['show_dont_tell'], true),
('hook_type', 'behind_scenes_open', 'Behind the scenes open', 'Open by exposing process or context normally hidden', ARRAY['bts_open'], true),

-- structure (15)
('structure', 'listicle', 'Listicle', 'Numbered or counted enumeration', ARRAY['list_video','enumeration'], true),
('structure', 'comparison', 'Comparison', 'A-vs-B structure throughout', ARRAY['side_by_side'], true),
('structure', 'narrative_arc', 'Narrative arc', 'Beginning, middle, resolution', ARRAY['story_arc'], true),
('structure', 'before_after', 'Before / after', 'Transformation framing', ARRAY['transformation_split'], true),
('structure', 'problem_solution', 'Problem / solution', 'Pain point → answer', ARRAY['pain_then_fix'], true),
('structure', 'pov_story', 'POV story', 'First-person scenario throughout', ARRAY['pov_narrative'], true),
('structure', 'demo_walkthrough', 'Demo walkthrough', 'Step-by-step product or process demo', ARRAY['how_to_demo'], true),
('structure', 'day_in_life', 'Day in the life', 'Chronological day montage', ARRAY['ditl'], true),
('structure', 'reaction_breakdown', 'Reaction breakdown', 'Reacting to and dissecting other content', ARRAY['react_video','breakdown'], true),
('structure', 'q_and_a', 'Q and A', 'Question, then answer cadence', ARRAY['ama','interview_qa'], true),
('structure', 'talking_head_explainer', 'Talking head explainer', 'Single speaker explaining a concept', ARRAY['explainer'], true),
('structure', 'on_screen_text_only', 'On-screen text only', 'No voiceover, text drives the content', ARRAY['text_video'], true),
('structure', 'voiceover_b_roll', 'Voiceover with b-roll', 'Voiceover narration over cutaway footage', ARRAY['vo_broll'], true),
('structure', 'interview_format', 'Interview format', 'Interviewer + interviewee structure', ARRAY['interview'], true),
('structure', 'montage', 'Montage', 'Music-led cuts, minimal narration', ARRAY['music_montage'], true),

-- archetype (10)
('archetype', 'talking_head', 'Talking head', 'Person facing camera, speaking', ARRAY['face_to_camera'], true),
('archetype', 'b_roll_voiceover', 'B-roll voiceover', 'Cutaway footage with VO', ARRAY['broll_vo'], true),
('archetype', 'on_screen_text_overlay', 'On-screen text overlay', 'Text driven, footage secondary', ARRAY['text_overlay'], true),
('archetype', 'reaction_split_screen', 'Reaction split screen', 'Side-by-side original + reaction', ARRAY['duet','split_react'], true),
('archetype', 'ugc_testimonial', 'UGC testimonial', 'User-style customer story', ARRAY['ugc','testimonial'], true),
('archetype', 'screen_recording', 'Screen recording', 'Screen capture of an app, web, game', ARRAY['screencap','desktop_capture'], true),
('archetype', 'interview', 'Interview', 'Two-person on-camera interview', ARRAY['1on1'], true),
('archetype', 'animation', 'Animation', 'Animated or motion-graphic driven', ARRAY['mograph','animated'], true),
('archetype', 'mixed_media', 'Mixed media', 'Combines two or more archetypes', ARRAY['hybrid'], true),
('archetype', 'ai_generated', 'AI generated', 'Image / video generated by AI tools', ARRAY['ai_video','gen_ai'], true),

-- pacing (7)
('pacing', 'fast_cuts', 'Fast cuts', 'Sub-second cut cadence', ARRAY['rapid_cuts'], true),
('pacing', 'slow_burn', 'Slow burn', 'Long takes, gradual reveal', ARRAY['long_take'], true),
('pacing', 'escalating', 'Escalating', 'Energy ramps through the video', ARRAY['build_up'], true),
('pacing', 'even_tempo', 'Even tempo', 'Steady cut cadence throughout', ARRAY['steady'], true),
('pacing', 'hook_heavy', 'Hook heavy', 'Front-loaded; energy crashes after the hook', ARRAY['front_loaded'], true),
('pacing', 'climax_back', 'Climax at back', 'Hook subtle, payoff at end', ARRAY['payoff_back'], true),
('pacing', 'sustained_tension', 'Sustained tension', 'Tension held throughout', ARRAY['tension_throughout'], true)

ON CONFLICT (kind, slug) DO NOTHING;
```

## API Contracts

### `GET /api/admin/formats/taxonomy`
Auth: admin (read).
Query (Zod):
```ts
const QuerySchema = z.object({
  include_archived: z.coerce.boolean().default(false),
  kind: z.enum(['hook_type','structure','archetype','pacing']).optional(),
});
```
Response (200):
```ts
{
  formats: Array<{
    id: string;
    kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
    slug: string;
    display_name: string;
    description: string | null;
    aliases: string[];
    is_seeded: boolean;
    archived_at: string | null;
    example_video_id: string | null;
    video_count: number;
  }>;
}
```
Errors: 401, 403, 500.

### `POST /api/admin/formats/taxonomy`
Auth: super_admin only.
Request:
```ts
const CreateSchema = z.object({
  kind: z.enum(['hook_type','structure','archetype','pacing']),
  slug: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  display_name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  aliases: z.array(z.string().min(1).max(40)).max(8).default([]),
});
```
Response (200): created format row.
Errors: 400, 401, 403, 409 (duplicate slug for kind), 500.

### `PATCH /api/admin/formats/taxonomy/[id]`
Auth: super_admin.
Request:
```ts
const PatchSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),
  description: z.string().max(280).optional(),
  aliases: z.array(z.string().min(1).max(40)).max(8).optional(),
  archived: z.boolean().optional(),
  example_video_id: z.string().uuid().nullable().optional(),
});
```
Response (200): updated row.
Errors: 400, 401, 403, 404, 500.

### `GET /api/admin/formats/taxonomy/proposals`
Auth: admin.
Query:
```ts
const ProposalQuerySchema = z.object({
  status: z.enum(['pending','approved','rejected','merged']).default('pending'),
  kind: z.enum(['hook_type','structure','archetype','pacing']).optional(),
});
```
Response (200):
```ts
{
  proposals: Array<{
    id: string;
    kind: string;
    slug: string;
    display_name: string;
    proposed_description: string | null;
    evidence_video_id: string | null;
    proposal_count: number;
    status: string;
    created_at: string;
  }>;
}
```

### `POST /api/admin/formats/taxonomy/proposals/[id]/approve`
Auth: super_admin.
Request:
```ts
const ApproveSchema = z.object({
  display_name: z.string().min(1).max(60).optional(),  // override
  description: z.string().max(280).optional(),
  retag_existing: z.boolean().default(false),
});
```
Behavior: creates a `viral_formats` row with the (possibly overridden) display_name + description; if `retag_existing`, rewrites `viral_video_formats` rows pointing at the proposal slug to the new format_id; updates proposal status to `'approved'`.
Response (200): `{ proposal_id, created_format_id }`.

### `POST /api/admin/formats/taxonomy/proposals/[id]/reject`
Auth: super_admin.
Request: `{ reason?: string }`.
Response (200): updated proposal row.

### `POST /api/admin/formats/taxonomy/proposals/[id]/merge`
Auth: super_admin.
Request:
```ts
const MergeSchema = z.object({
  target_format_id: z.string().uuid(),
});
```
Behavior: rewrites `viral_video_formats` rows pointing at proposal slug to `target_format_id`; updates proposal status to `'merged'` + `merged_into_format_id`.
Response (200): `{ proposal_id, target_format_id, rows_rewritten: number }`.

## LLM Prompts

None new in this PRD. VFF-05's prompt consumes this taxonomy (verified by passing CSV of `display_name (aliases)` into the prompt template).

## UI Components

### `app/admin/formats/taxonomy/page.tsx`
Two-tab page.

Tabs: "Slugs" (default), "Proposals."

**Slugs tab layout:**
- Four columns (one per dimension), each header is the dimension display name (e.g. "Hook types").
- Each column is a vertical list of slug rows; each row shows: display_name, slug as muted text, video count badge, alias chips, archive icon, edit button.
- Column footer: "+ Add slug" (super_admin only; disabled for admin).

**Proposals tab layout:**
- Filter: status dropdown (default pending).
- Card per proposal: kind badge, slug, display_name, proposed_description, evidence thumbnail (links to detail), proposal_count, three action buttons: "Approve" (opens dialog), "Reject," "Merge into…" (opens dialog with autocomplete of existing slugs in the same kind).

Copy:
- H1: "Format taxonomy"
- Subtitle: "Slugs feed the analysis pipeline and the discovery rows."
- Tabs: "Slugs", "Proposals"
- Column headers: "Hook types", "Structures", "Archetypes", "Pacing"
- Add slug button: "+ Add slug"
- Empty proposals: "No proposals waiting."
- Approve confirm: "Add this slug to the taxonomy?" + checkbox "Also retag existing analyses pointing at this slug"
- Reject button: "Reject"
- Merge button: "Merge into…"

States: loading skeleton, empty proposals, saving (spinner inline on buttons), error toast.

Tokens: `bg-surface` cards, `accent-text` on primary actions, sentence-case copy.

### `components/formats/taxonomy-column.tsx`
Props:
```ts
type Props = {
  kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
  title: string;
  rows: TaxonomyRow[];
  canEdit: boolean;
  onCreate?: () => void;
  onEdit?: (id: string) => void;
  onArchive?: (id: string) => void;
};
```

### `components/formats/proposal-card.tsx`
Props:
```ts
type Props = {
  proposal: TaxonomyProposal;
  canReview: boolean;
  onApprove: (id: string, opts: { display_name?: string; retag_existing: boolean }) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onMerge: (id: string, target_format_id: string) => Promise<void>;
};
```

## File Map

Create:
- `supabase/migrations/276_format_taxonomy_seed.sql`
- `app/admin/formats/taxonomy/page.tsx`
- `components/formats/taxonomy-column.tsx`
- `components/formats/proposal-card.tsx`
- `app/api/admin/formats/taxonomy/route.ts` (GET + POST)
- `app/api/admin/formats/taxonomy/[id]/route.ts` (PATCH)
- `app/api/admin/formats/taxonomy/proposals/route.ts` (GET)
- `app/api/admin/formats/taxonomy/proposals/[id]/approve/route.ts`
- `app/api/admin/formats/taxonomy/proposals/[id]/reject/route.ts`
- `app/api/admin/formats/taxonomy/proposals/[id]/merge/route.ts`
- `tasks/ralph/vff-06-format-taxonomy/progress.txt`

Modify:
- `lib/supabase/types.ts` (regenerate)
- `lib/analytics/types.ts` (export `TaxonomyRow`, `TaxonomyProposal`)

## Env Vars

None new.

## Edge Cases

- **VFF-05 references an aliased slug.** Prompt CSV includes aliases; if model picks an alias as the slug, VFF-05 normalizes alias → canonical slug before inserting into `viral_video_formats`.
- **Approve a proposal whose slug already exists.** Return 409.
- **Archive a slug currently in use.** Allowed; existing `viral_video_formats` rows remain valid; new analyses still see it in the constrained enum BUT it is excluded from the active list by default (`include_archived=false`).
- **Merge with a target in a different kind.** Reject 400.
- **Duplicate proposals (same kind+slug).** Increment `proposal_count` instead of new row (unique partial index handles).
- **Delete an example video.** `example_video_id ON DELETE SET NULL` clears the FK.
- **Super_admin role missing.** Code checks `user.role IN ('super_admin')` for write; falls back to 403 for admin role.

## Test Plan

Unit: none (mostly CRUD; covered by integration).

Integration:
- Apply migration 276 on staging; `select count(*) from viral_formats` >= 47.
- POST a new slug, GET list shows it.
- Approve a seeded proposal (manually inserted for the test) → `viral_formats` gains a row.
- Merge proposal into existing format; verify `viral_video_formats` rewritten.

E2E (Playwright): basic flow on `/admin/formats/taxonomy`:
- See 4 columns rendered.
- Switch to Proposals tab, approve one (after VFF-05 inserts test fixture).

Manual QA:
- Verify alias chips render.
- Archive a slug; reload; faded in list.
- Try Add Slug as `admin` (not super_admin) — button disabled or 403 on POST.

## Architecture Wiring

- Reuses `viral_formats` table from VFF-01; adds `aliases`, `archived_at`, `example_video_id` columns.
- Proposal table is the bridge between LLM creativity and curated taxonomy; VFF-05 writes, VFF-06 surfaces, admin decides.
- Read endpoints use `createServerSupabaseClient()` to respect RLS; write endpoints use `createAdminClient()` after role check.

## Done When

- Migration 276 applied; 47 seed entries in `viral_formats`.
- `/admin/formats/taxonomy` renders 4 columns + proposals tab.
- One approve, one reject, one merge action verified end-to-end.
- VFF-05 prompt confirmed to consume the alias-augmented taxonomy CSV.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
