-- Link payroll_entries back to the surface that generated them (content pipeline,
-- shooter payouts, affiliate webhooks, etc.) so auto-creation flows can dedupe
-- idempotently instead of stacking duplicates on every status advance.

alter table payroll_entries
  add column if not exists source text,
  add column if not exists source_id uuid;

-- Partial unique index — only enforced when both columns are set, so existing
-- hand-entered rows (source IS NULL) aren't affected.
create unique index if not exists payroll_entries_source_unique
  on payroll_entries (source, source_id)
  where source is not null and source_id is not null;

create index if not exists payroll_entries_source_idx
  on payroll_entries (source, source_id)
  where source is not null;
