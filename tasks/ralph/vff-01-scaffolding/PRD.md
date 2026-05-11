# PRD: VFF · 01 · Scaffolding (tables, RLS, sidebar, empty state)

> Viral Format Finder · 01/10 · 2026-05-10

## Purpose & Value

Stand up the bones for the Viral Format Finder: database tables, RLS, a sidebar entry under Intelligence, a route shell, and a respectable empty state. After this PRD, nothing is functional, but every subsequent VFF PRD has a place to land code without inventing structure.

## Problem

A new product surface needs structure before features. Without tables, RLS, a route, and a sidebar entry, every downstream PRD ends up making structural decisions ad hoc, leading to drift. Foundations first.

## Primary User
Internal: future Claude iterations executing VFF-02 onward. External: strategist who sees the sidebar entry and an empty-state "Coming soon" tile.

## SMART Goals
- 5 core VFF tables exist with RLS enabled and admin-only policies.
- Sidebar shows "Viral formats" under Intelligence, route `/admin/formats` renders without crash.
- Empty state matches `IconCard` pattern + Nativz tokens; passes visual QA against `confirm-platforms` baseline.
- Migration 273 applies cleanly on a fresh DB reset.

## User Stories
- **US-01** — As an internal dev, I can `\d viral_formats` (and 4 siblings) in psql and see expected columns.
- **US-02** — As Jack, I click "Viral formats" in the admin sidebar and see a friendly empty state explaining what's coming.
- **US-03** — As a portal viewer, I do NOT see this nav item (admin-only for v1).

## In Scope
- Migration `273_viral_format_finder_scaffolding.sql` (5 tables, indexes, RLS).
- `app/admin/formats/page.tsx` empty-state route.
- Sidebar entry in `components/layout/admin-sidebar.tsx` under Intelligence.
- `lib/analytics/types.ts` introducing VFF TS types matching tables.
- `lib/supabase/types.ts` regeneration step.

## Out of Scope
- Brand-format context (VFF-02).
- Any data flowing in (VFF-03+).
- Portal access (deferred, admin-only v1).

## Resolved Decisions
- **D-01** — Where does VFF live in the sidebar? **→ Intelligence section.** Rationale: it's a discovery/research surface, not a creation tool.
- **D-02** — Admin-only or portal-too? **→ Admin-only v1.** Rationale: strategist tool; portal exposure comes after the product is proven.
- **D-03** — Five tables or one fat one? **→ Five normalized tables.** Rationale: formats and videos are many-to-many; collections need their own join table; junk videos need to be persisted for dedup without polluting the analyzed set.
- **D-04** — RLS policy shape? **→ "Admins manage all" for v1, mirroring `brand_audits` migration 170.** Rationale: simple, matches existing pattern; portal policies added when portal access is opened.
- **D-05** — Table name prefix? **→ `viral_*`.** Rationale: clear product namespace; doesn't collide with `formats`, `videos`, or any platform-specific table.

## Data Model

### Migration `273_viral_format_finder_scaffolding.sql`

```sql
-- ============================================================
-- VFF-01: Viral Format Finder scaffolding
-- 5 tables: viral_formats, viral_videos, viral_video_formats,
--           viral_collections, viral_collection_videos
-- ============================================================

-- Format slugs (hook_type, structure, archetype, pacing). Seed in VFF-06.
CREATE TABLE IF NOT EXISTS viral_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('hook_type', 'structure', 'archetype', 'pacing')),
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_seeded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_viral_formats_kind_slug
  ON viral_formats(kind, slug);
CREATE INDEX IF NOT EXISTS idx_viral_formats_kind ON viral_formats(kind);

-- Sourced + (optionally) analyzed short-form videos.
CREATE TABLE IF NOT EXISTS viral_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'youtube')),
  source_url TEXT NOT NULL,
  source_url_hash TEXT NOT NULL,                   -- sha256 hex of canonical URL
  external_post_id TEXT,
  creator_handle TEXT,
  creator_display_name TEXT,
  thumbnail_source_url TEXT,                       -- platform-provided, may expire
  thumbnail_storage_url TEXT,                      -- Supabase Storage persistent
  thumbnail_persisted_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  views_count INTEGER,
  likes_count INTEGER,
  comments_count INTEGER,
  shares_count INTEGER,
  posted_at TIMESTAMPTZ,
  raw_payload JSONB DEFAULT '{}'::jsonb,           -- apify response slice
  analysis_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'rejected', 'failed')),
  reject_reason TEXT,                              -- populated by VFF-04
  analyzed_at TIMESTAMPTZ,
  title TEXT,                                      -- LLM-extracted, see VFF-05
  engagement_hook_descriptor TEXT,                 -- the ≤8-word LLM hook line
  why_it_works TEXT,
  retention_pattern TEXT,
  embedding VECTOR(1536),                          -- gemini-embedding-001
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_viral_videos_platform_hash
  ON viral_videos(platform, source_url_hash);
CREATE INDEX IF NOT EXISTS idx_viral_videos_status ON viral_videos(analysis_status);
CREATE INDEX IF NOT EXISTS idx_viral_videos_posted_at ON viral_videos(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_viral_videos_creator ON viral_videos(creator_handle);

-- Embedding index added after first batch lands (HNSW); leave as comment for now.
-- CREATE INDEX idx_viral_videos_embedding ON viral_videos USING hnsw (embedding vector_cosine_ops);

-- Many-to-many: a video can carry several format tags.
CREATE TABLE IF NOT EXISTS viral_video_formats (
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  format_id UUID NOT NULL REFERENCES viral_formats(id) ON DELETE CASCADE,
  confidence NUMERIC,                              -- 0..1 from VFF-05
  source TEXT NOT NULL DEFAULT 'llm'
    CHECK (source IN ('llm', 'human', 'seed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, format_id)
);
CREATE INDEX IF NOT EXISTS idx_viral_video_formats_format
  ON viral_video_formats(format_id);

-- Strategist-curated collections (e.g. "Worth stealing", per-brand pin lists).
CREATE TABLE IF NOT EXISTS viral_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,   -- null = global collection
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_viral_collections_client
  ON viral_collections(client_id);

CREATE TABLE IF NOT EXISTS viral_collection_videos (
  collection_id UUID NOT NULL REFERENCES viral_collections(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  PRIMARY KEY (collection_id, video_id)
);

-- updated_at trigger reuses shared function `set_updated_at()` from earlier migrations.
CREATE TRIGGER trg_viral_formats_updated
  BEFORE UPDATE ON viral_formats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_viral_videos_updated
  BEFORE UPDATE ON viral_videos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: admin-only v1 (mirrors brand_audits)
ALTER TABLE viral_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_video_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_collection_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY viral_formats_admin_all ON viral_formats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY viral_videos_admin_all ON viral_videos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY viral_video_formats_admin_all ON viral_video_formats
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY viral_collections_admin_all ON viral_collections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

CREATE POLICY viral_collection_videos_admin_all ON viral_collection_videos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

**Notes:**
- `set_updated_at()` exists from migration 002 (verify).
- pgvector extension: confirm `CREATE EXTENSION IF NOT EXISTS vector;` was run in an earlier migration. If not, add it before the `viral_videos` CREATE.

## API Contracts

None in this PRD. Routes land in VFF-03+.

## LLM Prompts

None in this PRD.

## UI Components

### `app/admin/formats/page.tsx`
Purpose: empty-state shell for Viral Format Finder.
Server component, no state, no data fetching.

Layout:
```
<PageShell>
  <PageHeader title="Viral formats" subtitle="Discovery surface for short-form video formats" />
  <IconCard icon={SparklesIcon} title="Coming soon" body="Format discovery is being wired in. Check back after the next deploy.">
    <ul className="text-sm text-muted">
      <li>Brand-aware short-form video discovery</li>
      <li>Hook + structure + archetype tagging</li>
      <li>One-click handoff into Content Lab</li>
    </ul>
  </IconCard>
</PageShell>
```

Copy:
- H1: "Viral formats"
- Subtitle: "Discovery surface for short-form video formats"
- Card title: "Coming soon"
- Card body: "Format discovery is being wired in. Check back after the next deploy."
- Bullets exact as above (sentence case).

States: single empty state; no loading, no error (server component, static).

Tokens: `bg-background` page, `bg-surface` card via `IconCard`. Accent swatch h-9 w-9.

### `components/layout/admin-sidebar.tsx` (modify)
Add entry under Intelligence section, between "Brand audit" and "Content Lab":

```tsx
{
  label: 'Viral Formats',                         // Title Case per sidebar exception
  href: '/admin/formats',
  icon: SparklesIcon,
  badge: { label: 'New', tone: 'accent' },        // remove after 30 days
}
```

## File Map

Create:
- `supabase/migrations/273_viral_format_finder_scaffolding.sql`
- `app/admin/formats/page.tsx`
- `lib/analytics/types.ts` (new dir; `ViralFormat`, `ViralVideo`, `ViralVideoFormat`, `ViralCollection`, `ViralCollectionVideo` types matching schema)
- `tasks/ralph/vff-01-scaffolding/progress.txt` (this PRD's task list)

Modify:
- `components/layout/admin-sidebar.tsx` (add nav entry)
- `lib/supabase/types.ts` (regenerated from `supabase gen types typescript`)

## Env Vars

None new. `pgvector` extension must be enabled on Supabase (likely already; verify in T03).

## Edge Cases

- **pgvector not installed.** `CREATE EXTENSION IF NOT EXISTS vector;` at the top of migration; harmless if already installed.
- **`set_updated_at()` not defined.** If grep of `supabase/migrations/` shows no definition, inline the function. (Verify in T02.)
- **`super_admin` role.** Some legacy migrations only check `admin`; mirror current policy (170 brand_audits is the latest, check its role guard).
- **Sidebar group ordering.** Intelligence section may need explicit `order` prop; do not reorder existing entries.
- **Portal viewers.** Confirm portal `viewer` role does NOT see the entry. Check sidebar renderer's role gate.

## Test Plan

Unit:
- None (schema-only PRD).

Integration:
- `npx supabase db reset --linked` (or branch DB reset if available) confirms migration applies cleanly.
- `select count(*) from viral_formats;` returns 0 (table exists, no rows yet).

Manual QA:
- Sign in as Jack, click sidebar → /admin/formats → empty state renders.
- Sign in as a `viewer` (e.g. one of Claire's portal users), confirm no "Viral Formats" entry.
- Screenshot the empty state and side-by-side against `confirm-platforms` audit screen to confirm token parity (font scale, spacing, card density).

## Architecture Wiring

- Mirrors `brand_audits` (migration 170) for table + RLS shape.
- Sidebar entry follows existing Intelligence-section conventions (Title Case label per `feedback_sidebar_title_case.md`).
- `IconCard` per `project_section_card_design_system.md`.

## Done When

- Migration 273 applied on staging branch and shows in `list_migrations`.
- `/admin/formats` renders empty state for admin; redirects (or hides nav) for viewer.
- Visual QA Jack-approved against confirm-platforms baseline.
- No TS errors, no lint warnings.
- progress.txt fully `[x]`.
