-- 127_banners.sql — in-app banners + announcements for Notifications Hub
--
-- Banners render in the Cortex app shell (admin + portal) at the top of
-- every page after login. Filtered by agency (nativz / anderson / both),
-- role (admin / viewer / both), and optional per-client scope.
--
-- Dismissals are tracked per-user in banner_dismissals so "dismiss" is
-- durable across devices and sessions — localStorage alone would lose
-- state every time a user switches laptops or clears site data.

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,

  -- Style drives color + base variant (amber warning, blue info, violet event, etc.)
  -- Icon is the lucide icon name to render at the leading edge.
  style text not null default 'info'
    check (style in ('info', 'warning', 'success', 'error', 'event', 'promo')),
  icon text not null default 'info'
    check (icon in ('info', 'alert', 'calendar', 'sparkles', 'gift', 'check', 'bell')),

  link_url text,
  link_text text,

  -- When to display. start_at defaults to now so "create and show immediately"
  -- is the common case; end_at null = no auto-expiry.
  start_at timestamptz not null default now(),
  end_at timestamptz,
  -- Event date is the date the banner *is about* (e.g. "webinar on 4/25"),
  -- separate from the show-window. Null when not an event banner.
  event_at timestamptz,

  position text not null default 'top'
    check (position in ('top', 'sidebar', 'modal')),
  priority int not null default 0,

  -- Target filters. Null = no restriction (shown to everyone matching other filters).
  target_agency text check (target_agency in ('nativz', 'anderson')),
  target_role text check (target_role in ('admin', 'viewer')),
  target_client_id uuid references public.clients(id) on delete cascade,

  active boolean not null default true,
  dismissible boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.banners is
  'In-app banners + announcements for the Cortex shell. Targeted by agency/role/client; users can dismiss durable via banner_dismissals.';

create index if not exists banners_active_time_idx
  on public.banners (active, start_at, end_at)
  where active = true;

create index if not exists banners_target_idx
  on public.banners (target_agency, target_role, target_client_id);

drop trigger if exists banners_set_updated_at on public.banners;
create trigger banners_set_updated_at
  before update on public.banners
  for each row execute function public.set_updated_at();

-- Per-user dismissal ledger — durable so dismissing stays dismissed across
-- devices and browser sessions. Primary key enforces one-row-per-user-per-banner.
create table if not exists public.banner_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  banner_id uuid not null references public.banners(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, banner_id)
);

create index if not exists banner_dismissals_user_idx
  on public.banner_dismissals (user_id);

-- RLS
alter table public.banners enable row level security;
alter table public.banner_dismissals enable row level security;

-- Admins see and manage everything.
drop policy if exists banners_admin_all on public.banners;
create policy banners_admin_all on public.banners
  for all to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );

-- Viewers (portal users) can read any currently-live banner — agency/role/client
-- filtering happens in the API layer because RLS doesn't know the viewer's
-- accessible clients cheaply. The table-level policy just enforces the
-- time-window gate so nobody can read draft/expired rows.
drop policy if exists banners_viewer_read_active on public.banners;
create policy banners_viewer_read_active on public.banners
  for select to authenticated
  using (
    active = true
    and start_at <= now()
    and (end_at is null or end_at > now())
  );

-- Users manage their own dismissal rows; admins can read all for analytics.
drop policy if exists banner_dismissals_own on public.banner_dismissals;
create policy banner_dismissals_own on public.banner_dismissals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists banner_dismissals_admin_read on public.banner_dismissals;
create policy banner_dismissals_admin_read on public.banner_dismissals
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('admin', 'super_admin')
    )
  );
