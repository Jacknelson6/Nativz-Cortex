-- ============================================================
-- VFF-06: Format taxonomy seed + proposal queue
-- ============================================================

ALTER TABLE viral_formats
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS example_video_id UUID REFERENCES viral_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viral_formats_archived
  ON viral_formats(archived_at)
  WHERE archived_at IS NULL;

-- Proposal queue
CREATE TABLE IF NOT EXISTS format_taxonomy_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('hook_type', 'structure', 'archetype', 'pacing')),
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  proposed_description TEXT,
  evidence_video_id UUID REFERENCES viral_videos(id) ON DELETE SET NULL,
  proposal_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  merged_into_format_id UUID REFERENCES viral_formats(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_format_proposals_kind_slug
  ON format_taxonomy_proposals(kind, lower(slug))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_format_proposals_status
  ON format_taxonomy_proposals(status);

DROP TRIGGER IF EXISTS trg_format_proposals_updated ON format_taxonomy_proposals;
CREATE TRIGGER trg_format_proposals_updated
  BEFORE UPDATE ON format_taxonomy_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE format_taxonomy_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS format_proposals_admin_all ON format_taxonomy_proposals;
CREATE POLICY format_proposals_admin_all ON format_taxonomy_proposals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));

-- ============================================================
-- Seed: 47 entries (15 + 15 + 10 + 7)
-- ============================================================

INSERT INTO viral_formats (kind, slug, display_name, description, aliases, is_seeded) VALUES
-- hook_type (15)
('hook_type', 'curiosity_gap', 'Curiosity gap', 'Open with a missing piece of information the viewer needs', ARRAY['mystery_open','tease_open'], true),
('hook_type', 'controversial_claim', 'Controversial claim', 'Open with a bold or polarizing statement', ARRAY['hot_take','spicy_open'], true),
('hook_type', 'problem_setup', 'Problem setup', 'Open by naming a pain point the viewer recognizes', ARRAY['pain_point_open','struggle_open'], true),
('hook_type', 'comparison_hook', 'Comparison hook', 'Open by contrasting two things side by side', ARRAY['versus_open','this_vs_that'], true),
('hook_type', 'transformation_promise', 'Transformation promise', 'Open by promising a before-after change', ARRAY['glow_up_open','results_promise'], true),
('hook_type', 'listicle_promise', 'Listicle promise', 'Open with "N things" or "N ways"', ARRAY['top_n','n_ways'], true),
('hook_type', 'fear_appeal', 'Fear appeal', 'Open by warning the viewer about a risk', ARRAY['warning_open','danger_open'], true),
('hook_type', 'social_proof_open', 'Social proof open', 'Open with numbers, awards, or names that lend credibility', ARRAY['credentials_open','authority_open'], true),
('hook_type', 'statistic_shock', 'Statistic shock', 'Open with a surprising number', ARRAY['stat_open','number_open'], true),
('hook_type', 'pov_drop', 'POV drop', 'Open with a "POV:" frame to put viewer in a role', ARRAY['pov_open','first_person_open'], true),
('hook_type', 'question_open', 'Question open', 'Open with a direct question to the viewer', ARRAY['rhetorical_open'], true),
('hook_type', 'quote_open', 'Quote open', 'Open by quoting someone (real or fictional)', ARRAY['quoted_open'], true),
('hook_type', 'day_in_life_open', 'Day in life open', 'Open by stating "a day in the life of"', ARRAY['ditl_open','behind_routine'], true),
('hook_type', 'demo_open', 'Demo open', 'Open by showing the product or action in motion', ARRAY['show_dont_tell'], true),
('hook_type', 'behind_scenes_open', 'Behind the scenes open', 'Open by exposing process or context normally hidden', ARRAY['bts_open'], true),

-- structure (15)
('structure', 'listicle', 'Listicle', 'Numbered or counted enumeration', ARRAY['list_video','enumeration'], true),
('structure', 'comparison', 'Comparison', 'A-vs-B structure throughout', ARRAY['side_by_side'], true),
('structure', 'narrative_arc', 'Narrative arc', 'Beginning, middle, resolution', ARRAY['story_arc'], true),
('structure', 'before_after', 'Before / after', 'Transformation framing', ARRAY['transformation_split'], true),
('structure', 'problem_solution', 'Problem / solution', 'Pain point first, answer second', ARRAY['pain_then_fix'], true),
('structure', 'pov_story', 'POV story', 'First-person scenario throughout', ARRAY['pov_narrative'], true),
('structure', 'demo_walkthrough', 'Demo walkthrough', 'Step-by-step product or process demo', ARRAY['how_to_demo'], true),
('structure', 'day_in_life', 'Day in the life', 'Chronological day montage', ARRAY['ditl'], true),
('structure', 'reaction_breakdown', 'Reaction breakdown', 'Reacting to and dissecting other content', ARRAY['react_video','breakdown'], true),
('structure', 'q_and_a', 'Q and A', 'Question, then answer cadence', ARRAY['ama','interview_qa'], true),
('structure', 'talking_head_explainer', 'Talking head explainer', 'Single speaker explaining a concept', ARRAY['explainer'], true),
('structure', 'on_screen_text_only', 'On-screen text only', 'No voiceover, text drives the content', ARRAY['text_video'], true),
('structure', 'voiceover_b_roll', 'Voiceover with b-roll', 'Voiceover narration over cutaway footage', ARRAY['vo_broll'], true),
('structure', 'interview_format', 'Interview format', 'Interviewer plus interviewee structure', ARRAY['interview'], true),
('structure', 'montage', 'Montage', 'Music-led cuts, minimal narration', ARRAY['music_montage'], true),

-- archetype (10)
('archetype', 'talking_head', 'Talking head', 'Person facing camera, speaking', ARRAY['face_to_camera'], true),
('archetype', 'b_roll_voiceover', 'B-roll voiceover', 'Cutaway footage with VO', ARRAY['broll_vo'], true),
('archetype', 'on_screen_text_overlay', 'On-screen text overlay', 'Text driven, footage secondary', ARRAY['text_overlay'], true),
('archetype', 'reaction_split_screen', 'Reaction split screen', 'Side-by-side original and reaction', ARRAY['duet','split_react'], true),
('archetype', 'ugc_testimonial', 'UGC testimonial', 'User-style customer story', ARRAY['ugc','testimonial'], true),
('archetype', 'screen_recording', 'Screen recording', 'Screen capture of an app, web, game', ARRAY['screencap','desktop_capture'], true),
('archetype', 'interview', 'Interview', 'Two-person on-camera interview', ARRAY['1on1'], true),
('archetype', 'animation', 'Animation', 'Animated or motion-graphic driven', ARRAY['mograph','animated'], true),
('archetype', 'mixed_media', 'Mixed media', 'Combines two or more archetypes', ARRAY['hybrid'], true),
('archetype', 'ai_generated', 'AI generated', 'Image or video generated by AI tools', ARRAY['ai_video','gen_ai'], true),

-- pacing (7)
('pacing', 'fast_cuts', 'Fast cuts', 'Sub-second cut cadence', ARRAY['rapid_cuts'], true),
('pacing', 'slow_burn', 'Slow burn', 'Long takes, gradual reveal', ARRAY['long_take'], true),
('pacing', 'escalating', 'Escalating', 'Energy ramps through the video', ARRAY['build_up'], true),
('pacing', 'even_tempo', 'Even tempo', 'Steady cut cadence throughout', ARRAY['steady'], true),
('pacing', 'hook_heavy', 'Hook heavy', 'Front-loaded; energy crashes after the hook', ARRAY['front_loaded'], true),
('pacing', 'climax_back', 'Climax at back', 'Hook subtle, payoff at end', ARRAY['payoff_back'], true),
('pacing', 'sustained_tension', 'Sustained tension', 'Tension held throughout', ARRAY['tension_throughout'], true)

ON CONFLICT (kind, slug) DO NOTHING;
