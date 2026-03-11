-- Add health_score column to clients table
-- Allowed values: 'not_good', 'fair', 'good', 'great', 'excellent'

alter table clients
  add column health_score text default null
  check (health_score in ('not_good', 'fair', 'good', 'great', 'excellent'));
