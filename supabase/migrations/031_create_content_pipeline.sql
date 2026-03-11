-- Content production pipeline — mirrors Monday.com "Content Calendars" board
-- Each row = one client for one month

CREATE TABLE IF NOT EXISTS content_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  month_label TEXT NOT NULL,                -- e.g. "March 2026"
  month_date DATE NOT NULL,                 -- first of month, e.g. 2026-03-01
  agency TEXT,                              -- "Nativz" or "AC"

  -- Monday.com sync
  monday_item_id TEXT UNIQUE,               -- Monday.com item ID for sync

  -- Team assignments (stored as display names; we can link to team_members later)
  strategist TEXT,
  videographer TEXT,
  editing_manager TEXT,
  editor TEXT,
  smm TEXT,                                 -- Social Media Manager

  -- Pipeline statuses
  assignment_status TEXT DEFAULT 'can_assign'
    CHECK (assignment_status IN ('can_assign', 'assigned', 'need_shoot')),

  raws_status TEXT DEFAULT 'need_to_schedule'
    CHECK (raws_status IN ('need_to_schedule', 'waiting_on_shoot', 'uploaded')),

  editing_status TEXT DEFAULT 'not_started'
    CHECK (editing_status IN ('not_started', 'editing', 'edited', 'em_approved', 'revising', 'blocked', 'scheduled', 'done')),

  client_approval_status TEXT DEFAULT 'not_sent'
    CHECK (client_approval_status IN ('not_sent', 'waiting_on_approval', 'client_approved', 'needs_revision', 'revised', 'sent_to_paid_media')),

  boosting_status TEXT DEFAULT 'not_boosting'
    CHECK (boosting_status IN ('not_boosting', 'working_on_it', 'done')),

  -- Due dates
  shoot_date DATE,
  strategy_due_date DATE,
  raws_due_date DATE,
  smm_due_date DATE,
  calendar_sent_date DATE,

  -- Links
  edited_videos_folder_url TEXT,
  raws_folder_url TEXT,
  later_calendar_link TEXT,
  project_brief_url TEXT,

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_content_pipeline_client ON content_pipeline(client_id);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_month ON content_pipeline(month_date DESC);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_monday ON content_pipeline(monday_item_id);

-- RLS
ALTER TABLE content_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline"
  ON content_pipeline FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage pipeline"
  ON content_pipeline FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
