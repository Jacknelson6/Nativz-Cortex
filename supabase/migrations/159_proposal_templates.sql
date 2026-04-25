-- 159_proposal_templates.sql
-- Pivot proposals from inline-markdown editor to "generator for external host":
-- Cortex clones a template folder from the docs repos (nativz-docs, ac-docs)
-- into a per-prospect slug, customizes client.json, and commits. The docs repo
-- serves the signed branded HTML + Cloudflare Pages Functions handle sign+PDF.
--
-- What this migration adds:
--   1. proposal_templates — catalog of branded template folders available to generate.
--   2. proposals.template_id / external_repo / external_folder / external_url /
--      published_at / agency — tracks the per-prospect committed folder.
--   3. Seed the AC "Content Editing Packages" template (Essentials / Studio / Full Social).
--
-- Old columns kept (body_markdown, scope_statement, terms_markdown, sent_snapshot,
-- proposal_packages, proposal_deliverables) so existing rows continue to render
-- during the cutover. They can be dropped in a follow-up after a stable period.

begin;

create table if not exists proposal_templates (
  id uuid primary key default gen_random_uuid(),
  -- 'anderson' or 'nativz' — which docs repo + brand this template belongs to.
  agency text not null check (agency in ('anderson','nativz')),
  -- Human-readable name surfaced in admin UI ("Content Editing Packages").
  name text not null,
  description text,
  -- "owner/repo" of the source docs repo (e.g. "Anderson-Collaborative/ac-docs").
  source_repo text not null,
  -- Folder path inside the source repo to clone (e.g. "content-editing-packages").
  source_folder text not null,
  -- Public host root, used to construct the final URL (e.g. "https://docs.andersoncollaborative.com").
  public_base_url text not null,
  -- Display-only cached tier summary for the admin picker. Source of truth is
  -- still the source_folder/client.json — this is just for UI.
  tiers_preview jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency, source_folder)
);
create index if not exists proposal_templates_active_idx on proposal_templates(active);

alter table proposals
  add column if not exists template_id uuid references proposal_templates(id) on delete set null,
  add column if not exists agency text check (agency in ('anderson','nativz')),
  add column if not exists external_repo text,           -- "owner/repo"
  add column if not exists external_folder text,         -- unique per-proposal slug inside the repo
  add column if not exists external_url text,            -- final public URL on the docs host
  add column if not exists published_at timestamptz,     -- when the folder was committed to GitHub
  add column if not exists signer_legal_entity text,     -- prefilled into client.json for the autofill pill
  add column if not exists signer_address text;

create index if not exists proposals_template_idx on proposals(template_id);
create index if not exists proposals_external_folder_idx on proposals(external_folder);

-- RLS: admins only (same pattern as existing proposal tables).
alter table proposal_templates enable row level security;

drop policy if exists proposal_templates_admin_all on proposal_templates;
create policy proposal_templates_admin_all on proposal_templates
  for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and (u.role in ('admin','super_admin') or u.is_super_admin = true)
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and (u.role in ('admin','super_admin') or u.is_super_admin = true)
    )
  );

-- Seed: the live AC content-editing-packages template (already deployed at
-- docs.andersoncollaborative.com/content-editing-packages/). Cortex clones
-- this folder per prospect.
insert into proposal_templates (agency, name, description, source_repo, source_folder, public_base_url, tiers_preview)
values (
  'anderson',
  'Content Editing Packages',
  'Monthly retainers for edited social video + Cortex intelligence. Essentials ($1,500/mo), Studio ($2,500/mo), Full Social ($4,450/mo). Billed month-to-month, 3-month minimum.',
  'Anderson-Collaborative/ac-docs',
  'content-editing-packages',
  'https://docs.andersoncollaborative.com',
  '[
    {"id":"essentials","name":"Essentials","monthly_cents":150000,"cadence":"month"},
    {"id":"studio","name":"Studio","monthly_cents":250000,"cadence":"month"},
    {"id":"full-social","name":"Full Social","monthly_cents":445000,"cadence":"month"}
  ]'::jsonb
)
on conflict (agency, source_folder) do update
  set name = excluded.name,
      description = excluded.description,
      public_base_url = excluded.public_base_url,
      tiers_preview = excluded.tiers_preview,
      updated_at = now();

commit;
