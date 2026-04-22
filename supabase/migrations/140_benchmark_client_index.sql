-- Index lookup for the Competitor Intelligence landing page — "active watches
-- for client X" needs to be fast when we render per-client summary chips.

create index if not exists idx_client_benchmarks_client_active
  on client_benchmarks (client_id)
  where is_active = true;
