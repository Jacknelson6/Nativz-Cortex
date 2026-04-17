-- 110_ad_creatives_v2.sql
-- Foundation tables for Ad Creatives v2: the compositor-first ad generation
-- pipeline. See morning-ads/CORTEX-MIGRATION-PRD.md for full rationale.
--
-- Thesis: AI should only generate what's safe to get slightly wrong (scenes,
-- backgrounds). Code should composite what has to be pixel-exact (logos,
-- product photos, typography).
--
-- v2 runs alongside v1 (strangler). This migration adds:
--   1. brand_ad_templates   — per-client activated layouts (code-registered renderers)
--   2. brand_fonts          — uploaded font files per client for compositor typography
--   3. brand_scene_photos   — Gemini-generated scene library, reusable across concepts
--   4. Storage buckets for the above
--
-- v1 tables (ad_prompt_templates, ad_creatives, ad_generation_batches) are
-- left untouched. Deprecation happens in a later migration once all clients
-- are migrated to v2.

-- ---------------------------------------------------------------------------
-- 1. brand_ad_templates
-- ---------------------------------------------------------------------------
create table if not exists public.brand_ad_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Layout slug — references a code-registered renderer in
  -- lib/ad-creatives-v2/layouts/registry.ts. Examples:
  --   'weston-navy-editorial', 'weston-photo-hero-bottom',
  --   'goldback-headline-statement', 'goldback-stat-hero', etc.
  layout_slug text not null,
  -- Human-readable display name (what the admin sees)
  display_name text not null,
  -- Activation flag — inactive templates stay in the DB for history but
  -- won't appear in batch-creation UI
  is_active boolean not null default true,
  -- Optional per-client overrides for the code-registered layout (colors,
  -- font aliases, margins). Empty object means use defaults.
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, layout_slug)
);

create index if not exists brand_ad_templates_client_active_idx
  on public.brand_ad_templates (client_id, is_active);

comment on table public.brand_ad_templates is
  'Per-client registered layouts for the v2 ad generation pipeline. Layout slug references a code-registered renderer; overrides JSON allows client-specific tuning without duplicating code.';

-- ---------------------------------------------------------------------------
-- 2. brand_fonts
-- ---------------------------------------------------------------------------
create table if not exists public.brand_fonts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Family alias used in the compositor (e.g., 'Borax', 'PlayfairDisplay',
  -- 'Montserrat'). Not the full family name — just the stable key the
  -- compositor references.
  family_alias text not null,
  -- CSS-weight number (400, 500, 700, 900)
  weight integer not null check (weight between 100 and 950),
  italic boolean not null default false,
  -- Path in Supabase Storage bucket `brand-fonts` (e.g. `<client_id>/borax-medium.otf`)
  storage_path text not null,
  font_format text not null check (font_format in ('otf', 'ttf', 'woff', 'woff2')),
  -- Attestation that the client has the right to use this font for
  -- server-side ad generation. Set to true by the upload flow when the
  -- uploader checks the license box.
  license_attested boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_id, family_alias, weight, italic)
);

create index if not exists brand_fonts_client_idx
  on public.brand_fonts (client_id);

comment on table public.brand_fonts is
  'Per-client font files uploaded for compositor-rendered typography. The compositor registers these at render time via @napi-rs/canvas GlobalFonts.registerFromPath.';

-- ---------------------------------------------------------------------------
-- 3. brand_scene_photos
-- ---------------------------------------------------------------------------
create table if not exists public.brand_scene_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Stable slug for referencing a scene (e.g., 'modern-home-exterior-dusk')
  slug text not null,
  -- Display name for admin UI
  display_name text not null,
  -- The exact prompt used to generate this scene (enables regeneration
  -- with the same aesthetic)
  prompt text not null,
  -- Storage path in bucket `brand-scene-photos` (e.g. `<client_id>/<slug>.png`)
  storage_path text not null,
  -- Optional tags for admin filtering (e.g., 'exterior', 'after', 'investor')
  tags text[] not null default '{}'::text[],
  -- Optional model override if a specific scene was generated with a
  -- non-default model (defaults to null = whatever GEMINI_IMAGE_MODEL is set to)
  gemini_model text,
  created_at timestamptz not null default now(),
  unique (client_id, slug)
);

create index if not exists brand_scene_photos_client_idx
  on public.brand_scene_photos (client_id);

create index if not exists brand_scene_photos_tags_idx
  on public.brand_scene_photos using gin (tags);

comment on table public.brand_scene_photos is
  'Reusable library of Gemini-generated scene photos per client. Photos are generated once, cached in Supabase Storage, and referenced by multiple concepts in the compositor pipeline.';

-- ---------------------------------------------------------------------------
-- 4. Storage buckets
-- ---------------------------------------------------------------------------
-- Buckets are private (admin-only access). v2 API routes use the admin
-- Supabase client, which bypasses RLS, so no public policies are needed.
insert into storage.buckets (id, name, public)
values
  ('brand-fonts', 'brand-fonts', false),
  ('brand-scene-photos', 'brand-scene-photos', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger for brand_ad_templates
-- ---------------------------------------------------------------------------
create or replace function public.bump_brand_ad_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_ad_templates_bump_updated_at on public.brand_ad_templates;
create trigger brand_ad_templates_bump_updated_at
  before update on public.brand_ad_templates
  for each row execute function public.bump_brand_ad_templates_updated_at();
