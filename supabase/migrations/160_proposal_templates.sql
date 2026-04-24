-- 160_proposal_templates.sql
-- Pivot proposals from inline-markdown editor to "generator for external host":
-- Cortex clones a template folder from the docs repos (nativz-docs, ac-docs)
-- into a per-prospect slug, customizes client.json, and commits. The docs repo
-- serves the branded HTML + Cloudflare Pages Functions handle sign+PDF+Stripe.
--
-- Idempotent — safe to re-run. (The DB already has this applied via MCP
-- `apply_migration`; this file exists so source control has the DDL.)

begin;

create table if not exists proposal_templates (
  id uuid primary key default gen_random_uuid(),
  agency text not null check (agency in ('anderson','nativz')),
  name text not null,
  description text,
  source_repo text not null,           -- "owner/repo" (e.g. "Anderson-Collaborative/ac-docs")
  source_folder text not null,         -- folder inside the repo to clone
  public_base_url text not null,       -- docs host root (e.g. "https://docs.andersoncollaborative.com")
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
  add column if not exists external_repo text,
  add column if not exists external_folder text,
  add column if not exists external_url text,
  add column if not exists published_at timestamptz,
  add column if not exists signer_legal_entity text,
  add column if not exists signer_address text;

create index if not exists proposals_template_idx on proposals(template_id);
create index if not exists proposals_external_folder_idx on proposals(external_folder);

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

-- Seed AC content-editing-packages (already deployed at docs.andersoncollaborative.com/content-editing-packages/).
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
