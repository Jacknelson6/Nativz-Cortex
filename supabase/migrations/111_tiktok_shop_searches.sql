-- Migration 111: TikTok Shop creator insights
--
-- Global category searches: admin runs a TikTok Shop category search,
-- gets back a ranked list of creators enriched with GMV / engagement /
-- demographics. Searches are global (any admin can see any search) but
-- stamped with `created_by` for audit and optionally linked to a client
-- so portal users — once TikTok Shop is enabled for their brand — can
-- see searches that were run for them.
--
-- Creator snapshots cache the last lemur enrichment per username so the
-- creator deep-dive page loads instantly and we don't re-run the actor
-- ($0.005 per call) every time the same creator is viewed.

-- -----------------------------------------------------------------------
-- tiktok_shop_searches
-- -----------------------------------------------------------------------
create table if not exists tiktok_shop_searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),

  -- Search params
  max_products int not null default 10 check (max_products between 1 and 10),
  max_affiliates_per_product int not null default 20,
  min_followers int,
  market_country_code text not null default 'US',

  -- Lifecycle
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,

  -- Optional client link: admins can attach a search to a specific brand
  -- later for portal visibility. Null = global-only.
  client_id uuid references clients(id) on delete set null,

  -- Progress counters (updated during run so polling can show progress)
  products_found int not null default 0,
  creators_found int not null default 0,
  creators_enriched int not null default 0,

  -- Full payload: { products[], creators[] (ranked, with composite_score) }
  results jsonb
);

create index if not exists idx_tiktok_shop_searches_created_at
  on tiktok_shop_searches (created_at desc);
create index if not exists idx_tiktok_shop_searches_client_id
  on tiktok_shop_searches (client_id)
  where client_id is not null;
create index if not exists idx_tiktok_shop_searches_status
  on tiktok_shop_searches (status)
  where status in ('queued', 'running');

-- -----------------------------------------------------------------------
-- tiktok_shop_creator_snapshots — per-username enrichment cache
-- -----------------------------------------------------------------------
create table if not exists tiktok_shop_creator_snapshots (
  username text primary key,
  nickname text,
  avatar_url text,
  region text,
  bio text,
  -- Full lemur response so the creator deep-dive can show everything
  -- without re-calling the actor.
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_tiktok_shop_creator_snapshots_fetched_at
  on tiktok_shop_creator_snapshots (fetched_at desc);

-- -----------------------------------------------------------------------
-- updated_at trigger for tiktok_shop_searches
-- -----------------------------------------------------------------------
create or replace function set_tiktok_shop_searches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tiktok_shop_searches_updated_at on tiktok_shop_searches;
create trigger trg_tiktok_shop_searches_updated_at
before update on tiktok_shop_searches
for each row execute function set_tiktok_shop_searches_updated_at();

-- -----------------------------------------------------------------------
-- RLS: admin-only for both tables. Portal access comes later when we
-- gate by client_id + feature_flags.can_view_tiktok_shop.
-- -----------------------------------------------------------------------
alter table tiktok_shop_searches enable row level security;
alter table tiktok_shop_creator_snapshots enable row level security;

drop policy if exists tiktok_shop_searches_admin_all on tiktok_shop_searches;
create policy tiktok_shop_searches_admin_all on tiktok_shop_searches
  for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'super_admin')
    )
  );

drop policy if exists tiktok_shop_creator_snapshots_admin_all on tiktok_shop_creator_snapshots;
create policy tiktok_shop_creator_snapshots_admin_all on tiktok_shop_creator_snapshots
  for all
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('admin', 'super_admin')
    )
  );
