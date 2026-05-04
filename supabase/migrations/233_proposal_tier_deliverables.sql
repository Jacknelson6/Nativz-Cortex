-- 233_proposal_tier_deliverables.sql
-- Phase 2 of service-capacity-accounting PRD.
-- Extends proposal_templates.tiers_preview jsonb array shape so each tier
-- carries a per-service monthly deliverable count. Used by
-- lib/clients/get-service-capacity.ts to resolve "how many videos / smm posts /
-- blogs is this client owed this period" without inventing a new table.
--
-- Shape per tier (additive, existing fields untouched):
--   {
--     "id": "essentials",
--     "name": "Essentials",
--     "monthly_cents": 150000,
--     "cadence": "month",
--     "deliverables": { "editing": 4, "smm": 0, "blogging": 0 }
--   }
--
-- Backfills the 3 Anderson "content-editing-packages" tiers:
--   Essentials  -> editing 4
--   Studio      -> editing 8
--   Full Social -> editing 12
-- SMM + blogging default to 0 on these tiers (they're editing-only packages).

begin;

with seeded as (
  select id, tiers_preview
  from proposal_templates
  where agency = 'anderson'
    and source_folder = 'content-editing-packages'
)
update proposal_templates pt
set tiers_preview = (
  select jsonb_agg(
    case
      when (tier->>'id') = 'essentials' then
        tier || jsonb_build_object('deliverables', jsonb_build_object('editing', 4, 'smm', 0, 'blogging', 0))
      when (tier->>'id') = 'studio' then
        tier || jsonb_build_object('deliverables', jsonb_build_object('editing', 8, 'smm', 0, 'blogging', 0))
      when (tier->>'id') = 'full-social' then
        tier || jsonb_build_object('deliverables', jsonb_build_object('editing', 12, 'smm', 0, 'blogging', 0))
      else
        tier || jsonb_build_object('deliverables', coalesce(tier->'deliverables', jsonb_build_object('editing', 0, 'smm', 0, 'blogging', 0)))
    end
  )
  from jsonb_array_elements(seeded.tiers_preview) as tier
),
updated_at = now()
from seeded
where pt.id = seeded.id;

-- For every other template, leave shape backwards-compatible by adding an
-- empty deliverables object only where it's missing. Idempotent.
update proposal_templates pt
set tiers_preview = (
  select jsonb_agg(
    case
      when tier ? 'deliverables' then tier
      else tier || jsonb_build_object('deliverables', jsonb_build_object('editing', 0, 'smm', 0, 'blogging', 0))
    end
  )
  from jsonb_array_elements(pt.tiers_preview) as tier
),
updated_at = now()
where jsonb_typeof(pt.tiers_preview) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(pt.tiers_preview) as t
    where not (t ? 'deliverables')
  );

commit;
