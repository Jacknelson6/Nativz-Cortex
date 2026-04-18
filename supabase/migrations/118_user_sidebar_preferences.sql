-- Per-user sidebar visibility preferences. Each string is a nav item
-- href (e.g. "/admin/tasks"). Items listed here are hidden from that
-- user's sidebar — the default (empty array) shows everything.

alter table users
  add column if not exists hidden_sidebar_items text[] not null default '{}';
