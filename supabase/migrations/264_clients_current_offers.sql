-- Free-text "current offers / promos" surfaced in the redesigned onboarding
-- brand-basics screen. Lives directly on `clients` so the strategist sees it
-- alongside other brand context, instead of buried inside step_state JSONB.
-- Mirror of the in-product "what you're running right now" field.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS current_offers text;

COMMENT ON COLUMN public.clients.current_offers IS
  'Free-text current offers / promotions captured during onboarding brand basics.';
