-- 133_ad_concepts.sql — Text-first ad concepts (morning-ads style)
-- ----------------------------------------------------------------------------
-- Phase 2 of the Ad Generator rebuild introduces a chat intake that produces
-- structured concept rows — headline, body copy, visual description, source
-- grounding, image prompt — well before any pixels are rendered. That's a
-- different shape than the existing `ad_creatives` table (which requires a
-- non-null image_url and targets compositor output), so we add a sibling
-- table `ad_concepts` and let the two paths coexist.
--
-- Image generation is a per-concept follow-up action: approve the text, then
-- fire Gemini image gen on the stored prompt. `image_storage_path` is null
-- until that happens.
--
-- Batches keep using the existing `ad_generation_batches` table — its
-- `config` jsonb is roomy enough for the user's prompt + asset/template
-- selection, and the status/count fields already match what the new UI
-- wants to poll on.

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES ad_generation_batches(id) ON DELETE SET NULL,

  -- Stable per-client slug so chat revision commands work ("regenerate
  -- concept-7 without product photo"). Assigned server-side from a
  -- monotonic counter; unique within (client_id, slug).
  slug TEXT NOT NULL,

  -- Which of the 15 morning-ads templates this concept leans on. Free text
  -- so new templates (including image-extracted ones from ad_prompt_templates)
  -- can slot in without a schema change. The UI shows this as a pill on
  -- each card.
  template_name TEXT NOT NULL,

  -- Optional link to the extracted template spec this concept was composed
  -- against. Null for built-in morning-ads templates; populated when the
  -- chat agent references a user-uploaded template.
  template_id UUID REFERENCES ad_prompt_templates(id) ON DELETE SET NULL,

  -- The actual creative copy. body_copy and visual_description can be null
  -- for pure-headline templates (stat callouts, etc.).
  headline TEXT NOT NULL,
  body_copy TEXT,
  visual_description TEXT,

  -- Where the concept draws its authenticity — verbatim quote, reviewer
  -- name, winning-ad reference, objection from comments, etc. Mandatory
  -- per the morning-ads skill's "no invented claims" rule.
  source_grounding TEXT NOT NULL,

  -- Structured image prompt for Gemini image gen. Stored even if we
  -- haven't rendered the image yet so admins can inspect + edit before
  -- firing image generation.
  image_prompt TEXT NOT NULL,

  -- Populated after a successful Gemini render. Relative path inside the
  -- existing `ad-creatives` bucket.
  image_storage_path TEXT,

  -- Review state. Admins can also nudge these from the chat ("approve all
  -- testimonial-stacks", "delete rejected").
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Order within the batch. Lets the UI render concepts in stable order
  -- even if a row arrives slightly out of sequence from the model's
  -- streaming response.
  position INT NOT NULL DEFAULT 0,

  -- Free-form admin notes — one-off revision hints ("tighten headline"),
  -- reviewer comments swept in from the share link, etc.
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (client_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ad_concepts_client ON ad_concepts(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_concepts_batch ON ad_concepts(batch_id);
CREATE INDEX IF NOT EXISTS idx_ad_concepts_client_status ON ad_concepts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ad_concepts_client_created ON ad_concepts(client_id, created_at DESC);

-- updated_at bump trigger
CREATE OR REPLACE FUNCTION set_ad_concepts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ad_concepts_updated_at ON ad_concepts;
CREATE TRIGGER trg_ad_concepts_updated_at
  BEFORE UPDATE ON ad_concepts
  FOR EACH ROW
  EXECUTE FUNCTION set_ad_concepts_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- Admin-only for Phase 2. Share-link review (Phase 3) will issue short-lived
-- signed URLs hitting a dedicated route that bypasses RLS with service role,
-- so we don't need a viewer policy on the table itself.
ALTER TABLE ad_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can select ad_concepts"
  ON ad_concepts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can insert ad_concepts"
  ON ad_concepts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can update ad_concepts"
  ON ad_concepts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

CREATE POLICY "admins can delete ad_concepts"
  ON ad_concepts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = TRUE)
    )
  );

-- ----------------------------------------------------------------------------
-- Per-client slug counter
-- ----------------------------------------------------------------------------
-- Slugs are numeric within a client (concept-001, concept-002). Using a
-- dedicated counters table keeps this out of application code and
-- guarantees monotonicity across concurrent generation batches — two
-- simultaneous "make 20 ads" requests get 1-20 and 21-40, not overlapping
-- 1-20 sets. Atomic increment via INSERT ... ON CONFLICT DO UPDATE.
CREATE TABLE IF NOT EXISTS ad_concept_slug_counters (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  next_slug INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ad_concept_slug_counters ENABLE ROW LEVEL SECURITY;

-- Service-role-only: the generation route uses createAdminClient(), which
-- bypasses RLS. Authenticated admins never touch this counter directly.
CREATE POLICY "no direct read on slug counters"
  ON ad_concept_slug_counters FOR SELECT
  TO authenticated
  USING (FALSE);

-- Reserve a contiguous range of slugs for a batch. Returns the first slug
-- in the range; the caller uses first..first+count-1.
CREATE OR REPLACE FUNCTION reserve_ad_concept_slugs(p_client_id UUID, p_count INT)
RETURNS INT AS $$
DECLARE
  v_first INT;
BEGIN
  IF p_count < 1 THEN
    RAISE EXCEPTION 'count must be >= 1';
  END IF;

  INSERT INTO ad_concept_slug_counters (client_id, next_slug)
  VALUES (p_client_id, p_count + 1)
  ON CONFLICT (client_id) DO UPDATE
    SET next_slug = ad_concept_slug_counters.next_slug + p_count,
        updated_at = NOW()
  RETURNING next_slug - p_count INTO v_first;

  RETURN v_first;
END;
$$ LANGUAGE plpgsql;
