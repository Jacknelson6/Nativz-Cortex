-- 107_activate_content_lab.sql
-- Flip can_use_nerd -> true for every active client so the portal Content Lab
-- (and the legacy /portal/nerd surface that shares the same flag) is
-- available to viewers. Existing explicit `false` values are overwritten
-- because the product decision is "activate for all clients now".
--
-- Idempotent: re-running is a no-op once every active row has can_use_nerd=true.

update public.clients
   set feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object('can_use_nerd', true)
 where is_active = true
   and coalesce((feature_flags->>'can_use_nerd')::boolean, false) = false;
