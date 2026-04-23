-- 146_onboarding_email_blocks.sql — rich block composer for email templates
-- ----------------------------------------------------------------------------
-- Adds blocks JSONB on onboarding_email_templates. When present, the
-- renderer composes the email from structured blocks (hero, paragraph,
-- cta, features, callout, divider, signature) instead of interpreting
-- markdown. Null blocks => existing markdown body stays the source.
--
-- Zero-migration path: existing templates keep working untouched; authors
-- opt in per-template via the \u201cSwitch to rich blocks\u201d button.

ALTER TABLE onboarding_email_templates
  ADD COLUMN IF NOT EXISTS blocks JSONB;
