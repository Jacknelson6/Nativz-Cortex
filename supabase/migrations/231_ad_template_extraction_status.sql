-- 231_ad_template_extraction_status.sql
--
-- Phase 2 of the Ad Generator wires async vision extraction onto every
-- uploaded reference template. The upload route inserts the row with
-- extraction_status='pending' and an empty prompt_schema, then a
-- background worker calls Gemini to fill in the JSON spec and flips
-- the status to 'ready' (or 'failed' with an error string the UI can
-- surface in a retry banner). The frontend polling loop in
-- ad-template-library.tsx keys off this column instead of inferring
-- pending from `prompt_schema = {}`.

alter table public.ad_prompt_templates
  add column if not exists extraction_status text not null default 'pending'
    check (extraction_status in ('pending','ready','failed')),
  add column if not exists extraction_error text null;

-- Backfill: anything that already has a non-empty schema is ready;
-- everything else stays pending and the worker will pick it up next
-- time the row is touched (or admins can re-upload).
update public.ad_prompt_templates
   set extraction_status = 'ready'
 where extraction_status = 'pending'
   and prompt_schema is not null
   and prompt_schema <> '{}'::jsonb;

-- Lets the worker (and future cron sweeps) cheaply find pending rows
-- per client without scanning the full table.
create index if not exists ad_prompt_templates_client_status_idx
  on public.ad_prompt_templates (client_id, extraction_status);
