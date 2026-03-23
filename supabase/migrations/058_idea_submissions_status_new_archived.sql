-- Idea submissions: only `new` and `archived` (drop reviewed/accepted triage states).

DO $body$
DECLARE
  cname text;
BEGIN
  IF to_regclass('public.idea_submissions') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.idea_submissions
  SET status = 'new'
  WHERE status IN ('reviewed', 'accepted');

  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.idea_submissions'::regclass
      AND con.contype = 'c'
      AND (con.conname ILIKE '%status%' OR pg_get_constraintdef(con.oid) ILIKE '%status%in (%')
  LOOP
    EXECUTE format('ALTER TABLE public.idea_submissions DROP CONSTRAINT %I', cname);
  END LOOP;

  ALTER TABLE public.idea_submissions
    ADD CONSTRAINT idea_submissions_status_check
    CHECK (status IN ('new', 'archived'));
END $body$;
