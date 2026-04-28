-- ──────────────────────────────────────────────────────────────────────
-- 187: Add internal "Create team chat space + webhook" onboarding step
-- ──────────────────────────────────────────────────────────────────────
-- Per-client Google Chat webhooks (migration 186) need a setup step in the
-- onboarding blueprint so we don't forget to create the space + paste the
-- webhook URL into the integrations table for each new client.
--
-- Owner: agency (internal). Only added to tiers that get a content calendar
-- (studio, full-social). Essentials is editing-only — no calendar, no chat.
-- ──────────────────────────────────────────────────────────────────────

UPDATE proposal_templates
SET tier_intake_blueprint = jsonb_set(
  tier_intake_blueprint,
  '{tiers,studio,segments}',
  (tier_intake_blueprint->'tiers'->'studio'->'segments') || jsonb_build_array(
    jsonb_build_object(
      'kind', 'agency_setup',
      'title', 'Internal team setup',
      'groups', jsonb_build_array(
        jsonb_build_object(
          'name', 'Notifications',
          'items', jsonb_build_array(
            jsonb_build_object(
              'key', 'create_chat_space_webhook',
              'task', 'Create team chat space + paste webhook',
              'owner', 'agency',
              'kind', 'simple_check',
              'required', true,
              'description', 'Create a Google Chat space for the client, add an incoming webhook, and paste the URL into Cortex → client → settings → integrations → Google Chat.'
            )
          )
        )
      )
    )
  )
),
updated_at = now()
WHERE agency = 'anderson'
  AND source_folder = 'content-editing-packages'
  AND tier_intake_blueprint->'tiers'->'studio' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(tier_intake_blueprint->'tiers'->'studio'->'segments') seg
    WHERE seg->>'kind' = 'agency_setup'
  );

UPDATE proposal_templates
SET tier_intake_blueprint = jsonb_set(
  tier_intake_blueprint,
  '{tiers,full-social,segments}',
  (tier_intake_blueprint->'tiers'->'full-social'->'segments') || jsonb_build_array(
    jsonb_build_object(
      'kind', 'agency_setup',
      'title', 'Internal team setup',
      'groups', jsonb_build_array(
        jsonb_build_object(
          'name', 'Notifications',
          'items', jsonb_build_array(
            jsonb_build_object(
              'key', 'create_chat_space_webhook',
              'task', 'Create team chat space + paste webhook',
              'owner', 'agency',
              'kind', 'simple_check',
              'required', true,
              'description', 'Create a Google Chat space for the client, add an incoming webhook, and paste the URL into Cortex → client → settings → integrations → Google Chat.'
            )
          )
        )
      )
    )
  )
),
updated_at = now()
WHERE agency = 'anderson'
  AND source_folder = 'content-editing-packages'
  AND tier_intake_blueprint->'tiers'->'full-social' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(tier_intake_blueprint->'tiers'->'full-social'->'segments') seg
    WHERE seg->>'kind' = 'agency_setup'
  );
