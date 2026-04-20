-- Per-track status-change timestamps for stall detection.
--
-- `updated_at` tells us when a row last changed *anything*; we need per-track
-- granularity so the summary can flag "this item's editing status has been
-- the same for 4 days" without getting reset every time someone edits notes
-- or reassigns the editor.
--
-- jsonb blob keyed by status-column name: `assignment_status`,
-- `raws_status`, `editing_status`, `client_approval_status`, `boosting_status`.
-- Values are ISO timestamp strings set by the PATCH + advance routes. Empty
-- object is the safe default — callers treat a missing key as "never
-- stamped" and fall back to `updated_at`.

alter table content_pipeline
  add column if not exists stage_changed_at jsonb not null default '{}'::jsonb;

-- Backfill: every status field gets stamped with updated_at so the first
-- stall query after migration isn't polluted by epoch zero.
update content_pipeline
set stage_changed_at = jsonb_build_object(
  'assignment_status', to_jsonb(updated_at),
  'raws_status', to_jsonb(updated_at),
  'editing_status', to_jsonb(updated_at),
  'client_approval_status', to_jsonb(updated_at),
  'boosting_status', to_jsonb(updated_at)
)
where stage_changed_at = '{}'::jsonb;
