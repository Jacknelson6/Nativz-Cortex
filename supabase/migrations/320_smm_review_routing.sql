-- CUP-02: SMM review routing
--
-- Adds the per-client SMM reviewer assignment + the dedup timestamp on
-- content_drops that the notify-smm-review dispatcher uses to suppress
-- repeat fires inside a short window.
--
-- notifications.type is a free-text column (not enum-backed), so no ALTER
-- TYPE is needed for the new 'drop_smm_review_ready' type — the dispatcher
-- just writes that string directly.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS smm_reviewer_user_id uuid
    REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN clients.smm_reviewer_user_id IS
  'Per-client SMM reviewer override. When set, the notify-smm-review dispatcher routes the in-app + chat notification to this user instead of the env-level fallback list.';

ALTER TABLE content_drops
  ADD COLUMN IF NOT EXISTS last_smm_review_notified_at timestamptz;

COMMENT ON COLUMN content_drops.last_smm_review_notified_at IS
  'Stamped by notify-smm-review when the dispatcher fires for this drop. Used as a 60s dedup window so rapid re-handoffs do not spam reviewers. Cleared/refreshed on a rejection-then-resubmit per dispatcher logic.';

CREATE INDEX IF NOT EXISTS clients_smm_reviewer_user_id_idx
  ON clients(smm_reviewer_user_id)
  WHERE smm_reviewer_user_id IS NOT NULL;
