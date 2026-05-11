-- 306_onboarding_admin_overrides_and_completion.sql
--
-- Admin-side enhancements to the onboarding tracker:
--   * admin_step_overrides: jsonb map of { [screen_key]: { checked: bool,
--     by: uuid, at: timestamptz } }. Lets an admin tick off a step
--     manually (e.g. they got the answer in person on a call) without
--     forcing the client to re-walk the public stepper. Renders as
--     a checkbox in the detail page.
--   * completion_requirements: jsonb bag of admin-side pre-completion
--     fields that gate the "mark complete" action. Shape (all optional
--     until we surface them in UI):
--       video_count: int          -- # of videos in the package
--       boosting_budget_cents: int -- monthly boost budget for SMM
--       paid_media_webhook_ack: bool -- confirms clients.paid_media_webhook_url is filled
--       editing_webhook_ack: bool    -- confirms clients.chat_webhook_url is filled
--       notes: text
--   These mirror live `clients` columns where applicable; the jsonb is
--   the per-onboarding scratchpad so an admin can record progress
--   before the live client row is updated.

ALTER TABLE public.onboardings
  ADD COLUMN IF NOT EXISTS admin_step_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.onboardings
  ADD COLUMN IF NOT EXISTS completion_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.onboardings.admin_step_overrides IS
  'Per-screen-key admin override flags. Shape: { [screen_key]: { checked: bool, by: uuid, at: timestamptz } }. UI treats a screen as "done" if the client walked through it OR an admin manually ticked it.';

COMMENT ON COLUMN public.onboardings.completion_requirements IS
  'Admin-side scratchpad of pre-completion fields (video_count, boosting_budget_cents, paid_media_webhook_ack, editing_webhook_ack, notes). The "mark complete" action checks these against kind-specific rules.';
