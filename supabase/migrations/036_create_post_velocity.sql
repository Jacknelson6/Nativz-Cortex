-- Hourly snapshots of post metrics for velocity/viral detection
CREATE TABLE IF NOT EXISTS post_velocity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_metric_id uuid NOT NULL REFERENCES post_metrics(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  views_count integer NOT NULL DEFAULT 0,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  shares_count integer NOT NULL DEFAULT 0,
  engagement integer NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_velocity_post_metric ON post_velocity(post_metric_id, checked_at DESC);
CREATE INDEX idx_post_velocity_client ON post_velocity(client_id, checked_at DESC);
