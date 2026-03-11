-- Create meetings table for biweekly client meetings and scheduling hub

create table meetings (
  id               uuid        primary key default gen_random_uuid(),
  client_id        uuid        references clients(id) on delete cascade,
  title            text        not null,
  scheduled_at     timestamptz not null,
  duration_minutes int         not null default 30,
  location         text,
  google_event_id  text,
  recurrence_rule  text,
  created_by       uuid        references auth.users(id),
  attendees        jsonb       default '[]'::jsonb,
  notes            text,
  status           text        not null default 'scheduled'
                               check (status in ('scheduled', 'completed', 'cancelled')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_meetings_client_id on meetings(client_id);
create index idx_meetings_scheduled_at on meetings(scheduled_at);
create index idx_meetings_google_event_id on meetings(google_event_id) where google_event_id is not null;

alter table meetings enable row level security;

create policy "Authenticated users can read meetings"
  on meetings for select
  to authenticated
  using (true);

create policy "Authenticated users can insert meetings"
  on meetings for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update meetings"
  on meetings for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete meetings"
  on meetings for delete
  to authenticated
  using (true);
