-- 318: Agency-tag hardening (post-Victory incident).
--
-- Root cause: clients.agency was a nullable text column with no constraint.
-- getBrandFromAgency() silently fell back to 'nativz' on null, so an AC
-- client (Victory Used Cars) received Nativz-branded onboarding emails.
-- This migration tightens the column to a required, validated tag and
-- adds the same column to prospects (which forwards into clients on
-- conversion).
--
-- Migration is split into three concerns:
--   1. Backfill clients.agency for the 8 nulls + 1 lowercase
--   2. Add CHECK + NOT NULL to clients.agency
--   3. Add agency column to prospects (NOT NULL with CHECK, backfilled
--      to 'Nativz' for legacy rows since no prospect existed for the
--      AC brand before this incident)
--
-- Backfill mapping (sourced from session context; admin should audit
-- post-deploy and reclassify any incorrect entries via the brand profile):
--   Victory Used Cars   -> 'Anderson Collaborative'  (explicit confirmation)
--   Nike (Demo)         -> 'Nativz' (case-fix from 'nativz')
--   All other 7 nulls   -> 'Nativz' (conservative default; AC is the
--                          younger brand and would have been tagged)

-- 1. Backfill clients.agency for the known mismatches.
update public.clients
set agency = 'Anderson Collaborative'
where lower(name) = 'victory used cars'
  and (agency is null or agency = '');

update public.clients
set agency = 'Nativz'
where agency = 'nativz';

-- Default-fill any remaining nulls to Nativz. If a deeper audit reclassifies
-- specific brands to AC, run a targeted UPDATE against the slug or id.
update public.clients
set agency = 'Nativz'
where agency is null
   or trim(agency) = '';

-- 2. Lock down clients.agency with CHECK + NOT NULL.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'clients_agency_check'
  ) then
    alter table public.clients drop constraint clients_agency_check;
  end if;
end $$;

alter table public.clients
  add constraint clients_agency_check
  check (agency in ('Nativz', 'Anderson Collaborative'));

alter table public.clients
  alter column agency set not null;

-- 3. Add agency column to prospects. Defaulted to 'Nativz' so we can
-- mark NOT NULL safely without a separate backfill step; future inserts
-- always carry an explicit value from the API layer (RequestSchema enum
-- in /api/prospects/onboard + /api/prospects/from-audit). Default is
-- dropped after the column is in place so a missing API payload errors
-- loud rather than silently inheriting 'Nativz'.
alter table public.prospects
  add column if not exists agency text not null default 'Nativz';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'prospects_agency_check'
  ) then
    alter table public.prospects drop constraint prospects_agency_check;
  end if;
end $$;

alter table public.prospects
  add constraint prospects_agency_check
  check (agency in ('Nativz', 'Anderson Collaborative'));

alter table public.prospects
  alter column agency drop default;

comment on column public.clients.agency is
  'Required brand tag. Must be "Nativz" or "Anderson Collaborative". Drives email branding, share-link host, PDF theme. Set at client creation (POST /api/clients, /api/clients/onboard) and carried from the prospect on conversion. Post-Victory incident hardening.';

comment on column public.prospects.agency is
  'Required brand tag forwarded into clients.agency on conversion. Must be "Nativz" or "Anderson Collaborative". Captured at prospect creation (POST /api/prospects/onboard, /api/prospects/from-audit).';
