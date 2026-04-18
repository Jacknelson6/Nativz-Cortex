-- Migration 113: production update broadcasts
--
-- Admin-authored "here's what we shipped" emails sent to portal users,
-- plus an in-app record so the same updates can render in a changelog
-- feed later. Audience can target all portal users, a single agency
-- (nativz | anderson), or a specific client.

create table if not exists production_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_markdown text not null,
  -- Audience filter — nulls below widen the reach:
  --   audience_agency = 'nativz' | 'anderson' | null (both)
  --   audience_client_id = null (all clients for that agency)
  audience_agency text check (audience_agency in ('nativz', 'anderson')),
  audience_client_id uuid references clients(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  sent_at timestamptz,
  recipient_count integer not null default 0,
  failure_reason text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_updates_created_at
  on production_updates (created_at desc);

create index if not exists idx_production_updates_audience_client
  on production_updates (audience_client_id)
  where audience_client_id is not null;

alter table production_updates enable row level security;

-- Admins can read and write everything.
create policy "Admins manage production_updates"
  on production_updates for all
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid()
      and u.role in ('admin', 'super_admin')
    )
  );

-- Viewers (portal users) read only 'sent' updates, scoped to their org's
-- agency + client. Mirrors the send-time filtering on the API side so
-- the in-app changelog will match what they received by email.
create policy "Viewers read scoped production_updates"
  on production_updates for select
  using (
    status = 'sent'
    and exists (
      select 1
      from users u
      join organizations o on o.id = u.organization_id
      left join clients c on c.organization_id = o.id
      where u.id = auth.uid()
      and u.role = 'viewer'
      and (
        audience_agency is null
        or lower(coalesce(c.agency, '')) like '%' || audience_agency || '%'
        or (audience_agency = 'anderson' and lower(coalesce(c.agency, '')) = 'ac')
      )
      and (audience_client_id is null or audience_client_id = c.id)
    )
  );
