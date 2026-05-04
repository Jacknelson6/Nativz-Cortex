-- Seed a stable "Unattributed" team_member used by the editing auto-populate
-- engine when a deliverable consume row has no editor_user_id. The PRD's
-- failure-mode spec (prd-service-capacity-accounting.md §7) requires the
-- engine to surface those rows as a re-attributable group rather than
-- silently dropping them.
--
-- Idempotent: ON CONFLICT DO NOTHING so re-running the migration does not
-- clobber a manually-renamed row.

INSERT INTO team_members (id, full_name, email, role, is_active)
VALUES (
  '00000000-0000-0000-0000-0000000000ba',
  'Unattributed',
  'unattributed@nativz.internal',
  'system',
  false
)
ON CONFLICT (id) DO NOTHING;
