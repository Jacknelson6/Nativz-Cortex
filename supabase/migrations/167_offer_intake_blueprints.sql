-- 167_offer_intake_blueprints.sql — Tier-aware onboarding intake.
-- ----------------------------------------------------------------------------
-- Pivot: proposals become reusable, anyone-with-link templates. The proposal
-- record is a per-client signature receipt; the chosen tier drives
-- instantiation of the onboarding flow + segments + checklist items from a
-- blueprint stored on the proposal_template.
--
-- This migration adds:
--   1. proposal_templates.tier_intake_blueprint (jsonb)
--      Per-tier shape:
--        { tiers: { <tier_id>: { segments: [{ kind, title, groups: [...] }] } } }
--   2. onboarding_checklist_items extensions (kind, template_key, required,
--      data, dont_have, submitted_at) so items can carry structured intake
--      data (Drive URLs, OAuth state, email lists) and the public intake
--      form can render type-specific UI.
--   3. onboarding_flows.template_id + tier_id so we know what was signed.
--   4. Seed: AC "Content Editing Packages" blueprint for Essentials, Studio,
--      and Full Social tiers.

-- ──────────────────────────────────────────────────────────────────────
-- 1. proposal_templates: tier intake blueprint
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_templates
  ADD COLUMN IF NOT EXISTS tier_intake_blueprint jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN proposal_templates.tier_intake_blueprint IS
  'Per-tier onboarding intake blueprint. Shape: { tiers: { <tier_id>: { segments: [{ kind, title, groups: [{ name, items: [{ key, task, owner, kind, required, description, ... }] }] }] } } }. Instantiated into onboarding_flow + segments + trackers + groups + items on proposal sign.';

-- ──────────────────────────────────────────────────────────────────────
-- 2. onboarding_checklist_items: structured intake data
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE onboarding_checklist_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'simple_check',
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dont_have boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE onboarding_checklist_items
  DROP CONSTRAINT IF EXISTS onboarding_checklist_items_kind_check;

ALTER TABLE onboarding_checklist_items
  ADD CONSTRAINT onboarding_checklist_items_kind_check
    CHECK (kind IN (
      'simple_check',       -- plain checkbox
      'drive_link',         -- paste a Google Drive (or other shareable) URL
      'oauth_socials',      -- one item per platform; OAuth connect flow + dont_have
      'email_list',         -- list of emails to provision Cortex accounts
      'schedule_meeting',   -- Calendly / scheduling link
      'text_response',      -- plain text answer
      'agency_followup'     -- spawned when client toggles dont_have on a kind needing team handoff
    ));

COMMENT ON COLUMN onboarding_checklist_items.kind IS
  'Item type — drives intake form UI. drive_link, oauth_socials, email_list, schedule_meeting, text_response, agency_followup, simple_check.';
COMMENT ON COLUMN onboarding_checklist_items.template_key IS
  'Stable key from the blueprint (e.g. "raw_footage", "connect_instagram"). Used to re-instantiate or merge if the blueprint evolves.';
COMMENT ON COLUMN onboarding_checklist_items.data IS
  'Kind-specific payload. drive_link: { url }. oauth_socials: { platform, social_profile_id?, connected_at? }. email_list: { emails: [], provisioned_at? }. schedule_meeting: { scheduling_url?, scheduled_for? }. text_response: { value }.';
COMMENT ON COLUMN onboarding_checklist_items.dont_have IS
  'Client checked "we do not have" — paired with kind oauth_socials, signals the team should create the account.';

CREATE INDEX IF NOT EXISTS onboarding_checklist_items_template_key_idx
  ON onboarding_checklist_items (template_key) WHERE template_key IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 3. onboarding_flows: template + tier provenance
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE onboarding_flows
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES proposal_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier_id text;

CREATE INDEX IF NOT EXISTS onboarding_flows_template_idx
  ON onboarding_flows (template_id) WHERE template_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Seed: AC Content Editing Packages blueprint
-- ──────────────────────────────────────────────────────────────────────

UPDATE proposal_templates
SET tier_intake_blueprint = $blueprint${
  "tiers": {
    "essentials": {
      "segments": [
        {
          "kind": "editing",
          "title": "Editing kickoff",
          "groups": [
            {
              "name": "Footage & assets",
              "items": [
                { "key": "raw_footage", "task": "Share raw footage", "owner": "client", "kind": "drive_link", "required": true, "description": "Drop a Google Drive link with the raw footage we'll edit." },
                { "key": "brand_assets", "task": "Share brand assets", "owner": "client", "kind": "drive_link", "required": false, "description": "Logos, fonts, color guides — anything we should match." },
                { "key": "style_examples", "task": "Share style examples", "owner": "client", "kind": "drive_link", "required": false, "description": "Links to edits you love. We'll match the vibe." }
              ]
            }
          ]
        }
      ]
    },
    "studio": {
      "segments": [
        {
          "kind": "editing",
          "title": "Editing kickoff",
          "groups": [
            {
              "name": "Footage & assets",
              "items": [
                { "key": "raw_footage", "task": "Share raw footage", "owner": "client", "kind": "drive_link", "required": true, "description": "Drop a Google Drive link with the raw footage we'll edit." },
                { "key": "brand_assets", "task": "Share brand assets", "owner": "client", "kind": "drive_link", "required": false, "description": "Logos, fonts, color guides — anything we should match." },
                { "key": "style_examples", "task": "Share style examples", "owner": "client", "kind": "drive_link", "required": false, "description": "Links to edits you love. We'll match the vibe." }
              ]
            }
          ]
        },
        {
          "kind": "social",
          "title": "Social production",
          "groups": [
            {
              "name": "First shoot",
              "items": [
                { "key": "schedule_shoot", "task": "Schedule your first shoot", "owner": "client", "kind": "schedule_meeting", "required": true, "description": "Pick a time for our team to come capture footage." }
              ]
            },
            {
              "name": "Social accounts",
              "items": [
                { "key": "connect_instagram", "task": "Connect Instagram", "owner": "client", "kind": "oauth_socials", "platform": "instagram", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." },
                { "key": "connect_tiktok", "task": "Connect TikTok", "owner": "client", "kind": "oauth_socials", "platform": "tiktok", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." }
              ]
            },
            {
              "name": "Cortex access",
              "items": [
                { "key": "cortex_account_emails", "task": "Add teammates to Cortex", "owner": "client", "kind": "email_list", "required": false, "description": "Email addresses for anyone on your team who needs Cortex access. We'll send them logins." }
              ]
            }
          ]
        }
      ]
    },
    "full-social": {
      "segments": [
        {
          "kind": "editing",
          "title": "Editing kickoff",
          "groups": [
            {
              "name": "Footage & assets",
              "items": [
                { "key": "raw_footage", "task": "Share raw footage", "owner": "client", "kind": "drive_link", "required": true, "description": "Drop a Google Drive link with the raw footage we'll edit." },
                { "key": "brand_assets", "task": "Share brand assets", "owner": "client", "kind": "drive_link", "required": false, "description": "Logos, fonts, color guides — anything we should match." },
                { "key": "style_examples", "task": "Share style examples", "owner": "client", "kind": "drive_link", "required": false, "description": "Links to edits you love. We'll match the vibe." }
              ]
            }
          ]
        },
        {
          "kind": "social",
          "title": "Full social production",
          "groups": [
            {
              "name": "First shoot",
              "items": [
                { "key": "schedule_shoot", "task": "Schedule your first shoot", "owner": "client", "kind": "schedule_meeting", "required": true, "description": "Pick a time for our team to come capture footage." }
              ]
            },
            {
              "name": "Social accounts",
              "items": [
                { "key": "connect_instagram", "task": "Connect Instagram", "owner": "client", "kind": "oauth_socials", "platform": "instagram", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." },
                { "key": "connect_tiktok", "task": "Connect TikTok", "owner": "client", "kind": "oauth_socials", "platform": "tiktok", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." },
                { "key": "connect_facebook", "task": "Connect Facebook", "owner": "client", "kind": "oauth_socials", "platform": "facebook", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." },
                { "key": "connect_youtube", "task": "Connect YouTube", "owner": "client", "kind": "oauth_socials", "platform": "youtube", "required": true, "description": "Authorize posting and analytics. If you don't have one yet, mark \"we don't have\" and our team will create it." }
              ]
            },
            {
              "name": "Cortex access",
              "items": [
                { "key": "cortex_account_emails", "task": "Add teammates to Cortex", "owner": "client", "kind": "email_list", "required": false, "description": "Email addresses for anyone on your team who needs Cortex access. We'll send them logins." }
              ]
            }
          ]
        }
      ]
    }
  }
}$blueprint$::jsonb,
    updated_at = now()
WHERE agency = 'anderson' AND source_folder = 'content-editing-packages';
