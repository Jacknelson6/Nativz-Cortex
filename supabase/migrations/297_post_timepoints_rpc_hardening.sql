-- ============================================================
-- ZNA-06 follow-up: lock down delete_expired_post_timepoints().
-- Migration 287 created the function as SECURITY DEFINER but
-- didn't revoke the default PUBLIC execute grant, which means
-- any authenticated user could call it via PostgREST. The
-- function is only called by the cron sampler (service role),
-- so revoke from everyone else.
-- ============================================================

REVOKE EXECUTE ON FUNCTION delete_expired_post_timepoints() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_expired_post_timepoints() FROM anon;
REVOKE EXECUTE ON FUNCTION delete_expired_post_timepoints() FROM authenticated;
GRANT  EXECUTE ON FUNCTION delete_expired_post_timepoints() TO service_role;
