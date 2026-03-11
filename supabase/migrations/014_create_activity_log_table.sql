-- Unified activity feed for dashboard

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('search', 'client', 'idea', 'shoot', 'report')),
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- RLS: all authenticated users can read activity; service role writes via logActivity helper
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read activity"
  ON activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activity"
  ON activity_log FOR INSERT TO authenticated WITH CHECK (true);
