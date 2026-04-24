-- 158_proposals_hardening.sql — fixes from session-2 code review:
--   1. UNIQUE INDEX on client_contracts.external_id (the Cortex sign flow
--      upserts on this; without the index the upsert silently duplicates).
--   2. proposals.sent_snapshot — a frozen copy of content at send time, so
--      the signer always sees what they agreed to even if admin edits later.
--   3. Mark external_id values from the 'cortex' provider as the canonical
--      key (filtering on provider keeps the partial-unique narrow).
begin;

-- 1. Unique index — partial so null/legacy rows from other providers don't collide.
create unique index if not exists client_contracts_external_id_unique
  on client_contracts(external_id)
  where external_id is not null and external_provider = 'cortex';

-- 2. Snapshot column. Populated on first send and read by the public page
--    for any status other than 'draft'.
alter table proposals
  add column if not exists sent_snapshot jsonb;

commit;
