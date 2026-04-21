-- Expand nerd_conversations.scope_type CHECK to allow 'social_analytics'
-- so the Ask-the-Nerd floating drawer on the Analytics dashboard can persist
-- one thread per (user, client) — matching the existing Trend Finder flow.

alter table nerd_conversations
  drop constraint if exists nerd_conversations_scope_type_check;

alter table nerd_conversations
  add constraint nerd_conversations_scope_type_check
    check (
      scope_type is null
      or scope_type in ('audit', 'tiktok_shop_search', 'topic_search', 'social_analytics')
    );
