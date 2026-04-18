-- Migration 112: per-analysis scope for Nerd conversations
--
-- Drawer chats on individual analyses (Organic Social audits, TikTok Shop
-- searches, topic searches) need a stable conversation per (user, scope).
-- Strategy Lab conversations keep scope_* null and continue to be keyed
-- purely by id — so this migration is additive and backward-compatible.

alter table nerd_conversations
  add column if not exists scope_type text
    check (scope_type in ('audit', 'tiktok_shop_search', 'topic_search')),
  add column if not exists scope_id uuid;

-- One drawer thread per user × scope. Strategy Lab threads leave both
-- columns null and are unaffected by this constraint.
create unique index if not exists idx_nerd_conversations_user_scope
  on nerd_conversations (user_id, scope_type, scope_id)
  where scope_type is not null and scope_id is not null;

-- Help lookups when opening a drawer: "find my thread for this scope".
create index if not exists idx_nerd_conversations_scope
  on nerd_conversations (scope_type, scope_id)
  where scope_type is not null and scope_id is not null;
