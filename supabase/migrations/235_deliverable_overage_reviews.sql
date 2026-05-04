-- =============================================================================
-- 235_deliverable_overage_reviews.sql
-- Phase 7 of the service-capacity-accounting PRD.
--
-- Tracks the admin decision the first time a (client, service, period) goes
-- over scope. Two terminal states only ('noted' = "we'll handle it manually",
-- 'top_up_opened' = "I clicked through to the credit pack flow"). One row per
-- (client, service, period); subsequent overages within the same period
-- surface the existing decision rather than re-prompting.
--
-- Admin-only RLS (no portal viewer policy) - this is an internal accounting
-- concept and never exposed on the client-facing portal.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS deliverable_overage_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service text NOT NULL CHECK (service IN ('editing', 'smm', 'blogging')),
  period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('noted', 'top_up_opened')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  UNIQUE (client_id, service, period_id)
);

CREATE INDEX IF NOT EXISTS idx_overage_reviews_period
  ON deliverable_overage_reviews (period_id);

CREATE INDEX IF NOT EXISTS idx_overage_reviews_client
  ON deliverable_overage_reviews (client_id);

ALTER TABLE deliverable_overage_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all" ON deliverable_overage_reviews;

CREATE POLICY "admin_all" ON deliverable_overage_reviews
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  );

COMMENT ON TABLE deliverable_overage_reviews IS
  'Admin decision log for over-scope deliverable periods. One row per '
  '(client, service, period). Two decision values: noted (handled manually) '
  'or top_up_opened (admin clicked through to the credit pack flow). '
  'Surfaced by the over-scope pill on DeliverableProgress, ServiceCapacityPanel, '
  'and the accounting period detail editing tab.';

COMMIT;
