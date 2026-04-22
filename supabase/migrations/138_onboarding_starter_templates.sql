-- 138_onboarding_starter_templates.sql — Seed starter onboarding content.
-- ----------------------------------------------------------------------------
-- Without this seed the first admin lands on /admin/onboarding with an empty
-- page and has to invent every phase / checklist / email from scratch. This
-- migration gives SMM, Paid Media, and Editing each a reusable service
-- template plus 4 email templates (welcome / kickoff / access handoff /
-- week-1 check-in) so every new tracker has something sane to apply.
--
-- Idempotent: guarded by NOT EXISTS checks keyed on (is_template=true,
-- service, template_name) for service templates and (service, name) for
-- email templates. Safe to run multiple times.

-- ─── Service template helper ─────────────────────────────────────────────
-- Inline DO block so we can capture the freshly-inserted tracker id and
-- wire up child rows (phases + groups + items) in one transaction.

DO $$
DECLARE
  smm_tpl UUID;
  paid_tpl UUID;
  edit_tpl UUID;
  smm_access_grp UUID;
  smm_brand_grp UUID;
  paid_access_grp UUID;
  paid_assets_grp UUID;
  edit_access_grp UUID;
  edit_style_grp UUID;
BEGIN

-- ── 1. SMM service template ─────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM onboarding_trackers
  WHERE is_template = true AND service = 'SMM' AND template_name = 'Social standard launch'
) THEN
  INSERT INTO onboarding_trackers (service, is_template, template_name, status)
  VALUES ('SMM', true, 'Social standard launch', 'active')
  RETURNING id INTO smm_tpl;

  INSERT INTO onboarding_phases (tracker_id, name, description, what_we_need, sort_order, actions) VALUES
    (smm_tpl, 'Kickoff & strategy', 'A 30-minute call to align on goals, voice, and the first month of content.', 'Pick a time that works — we''ll send a calendar invite after.', 0, '[]'::jsonb),
    (smm_tpl, 'Access & handoff', 'Grants so we can publish, read analytics, and respond to comments on your behalf.', 'Add us as a manager on each platform (instructions coming in an email).', 1, '[]'::jsonb),
    (smm_tpl, 'Brand & voice workshop', 'A short async doc so we write like you — no generic agency-speak.', 'Fill out a 10-minute questionnaire (we''ll send the link).', 2, '[]'::jsonb),
    (smm_tpl, 'First content plan', 'First 2 weeks of topics, hooks, and scripts for your review.', 'Approve, tweak, or redirect — whatever''s fastest.', 3, '[]'::jsonb),
    (smm_tpl, 'Launch week', 'We publish, caption, and respond. You watch things go live.', 'Nothing from you — kick back.', 4, '[]'::jsonb);

  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (smm_tpl, 'Access', 0) RETURNING id INTO smm_access_grp;
  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (smm_tpl, 'Brand', 1) RETURNING id INTO smm_brand_grp;

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (smm_access_grp, 'TikTok account access', 'Add us as a manager via TikTok Business Center.', 'client', 0),
    (smm_access_grp, 'Instagram account access', 'Add us via Meta Business Suite.', 'client', 1),
    (smm_access_grp, 'Meta Business Manager', 'Grant Admin role in Business Manager.', 'client', 2),
    (smm_access_grp, 'Google Analytics', 'Add our email as a Viewer.', 'client', 3);

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (smm_brand_grp, 'Brand guide PDF', 'Send over your current brand guide if you have one.', 'client', 0),
    (smm_brand_grp, 'Voice & tone doc', 'We''ll draft it from your kickoff call.', 'agency', 1),
    (smm_brand_grp, 'Do / don''t list', 'Things to never say + things to lean into.', 'agency', 2);
END IF;

-- ── 2. Paid Media service template ──────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM onboarding_trackers
  WHERE is_template = true AND service = 'Paid Media' AND template_name = 'Paid standard launch'
) THEN
  INSERT INTO onboarding_trackers (service, is_template, template_name, status)
  VALUES ('Paid Media', true, 'Paid standard launch', 'active')
  RETURNING id INTO paid_tpl;

  INSERT INTO onboarding_phases (tracker_id, name, description, what_we_need, sort_order, actions) VALUES
    (paid_tpl, 'Strategy call', 'Map the funnel, the offers, and which audiences are worth testing first.', 'A 45-minute call — bring anyone who owns the numbers.', 0, '[]'::jsonb),
    (paid_tpl, 'Ad account access', 'Access to Meta, Google, and any other live channels.', 'Grant our Business Manager access to your ad accounts.', 1, '[]'::jsonb),
    (paid_tpl, 'Pixel + conversion audit', 'Verify tracking actually works before we spend anything.', 'Grant access to Shopify / Klaviyo / GA4 so we can audit.', 2, '[]'::jsonb),
    (paid_tpl, 'Creative kickoff', 'First round of static + video ads against your best-performing hooks.', 'Hand over product images, testimonials, and any UGC.', 3, '[]'::jsonb),
    (paid_tpl, 'Campaign launch', 'We start spend, watch the early signal, and iterate daily.', 'Nothing — we''ll Slack you when it''s live.', 4, '[]'::jsonb);

  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (paid_tpl, 'Access', 0) RETURNING id INTO paid_access_grp;
  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (paid_tpl, 'Assets', 1) RETURNING id INTO paid_assets_grp;

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (paid_access_grp, 'Meta Business Manager', 'Grant our BM admin access to your ad account.', 'client', 0),
    (paid_access_grp, 'Google Ads', 'Accept our MCC link request.', 'client', 1),
    (paid_access_grp, 'Shopify / store pixel', 'Collaborator access so we can verify tracking.', 'client', 2),
    (paid_access_grp, 'Klaviyo / checkout access', 'Viewer role is fine — we just need to audit events.', 'client', 3);

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (paid_assets_grp, 'Brand assets', 'Logos, fonts, color codes — the usual.', 'client', 0),
    (paid_assets_grp, 'Product images', 'Highest-res we can get. Drop a Drive folder link.', 'client', 1),
    (paid_assets_grp, 'Testimonials / UGC', 'Anything real from your actual customers.', 'client', 2);
END IF;

-- ── 3. Editing service template ─────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM onboarding_trackers
  WHERE is_template = true AND service = 'Editing' AND template_name = 'Editing standard launch'
) THEN
  INSERT INTO onboarding_trackers (service, is_template, template_name, status)
  VALUES ('Editing', true, 'Editing standard launch', 'active')
  RETURNING id INTO edit_tpl;

  INSERT INTO onboarding_phases (tracker_id, name, description, what_we_need, sort_order, actions) VALUES
    (edit_tpl, 'Kickoff & editing brief', 'Align on cadence, format, tone, and what great looks like.', 'A 30-minute call plus a few reference edits you love.', 0, '[]'::jsonb),
    (edit_tpl, 'Footage + brand kit access', 'Where the raw footage lives + where finished edits go back.', 'Share a Dropbox / Drive folder and grant us edit access.', 1, '[]'::jsonb),
    (edit_tpl, 'First edit review', 'A sample edit from your footage so we can calibrate voice.', 'Give notes — detailed and blunt is best.', 2, '[]'::jsonb),
    (edit_tpl, 'Pipeline & cadence set', 'Recurring delivery dates, revision windows, and approval flow.', 'Confirm your review window (we recommend 48 hours).', 3, '[]'::jsonb),
    (edit_tpl, 'Ongoing delivery', 'We ship to your schedule; you review inside Frame.io.', 'Stay on your review cadence.', 4, '[]'::jsonb);

  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (edit_tpl, 'Access', 0) RETURNING id INTO edit_access_grp;
  INSERT INTO onboarding_checklist_groups (tracker_id, name, sort_order) VALUES
    (edit_tpl, 'Style', 1) RETURNING id INTO edit_style_grp;

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (edit_access_grp, 'Dropbox / Google Drive folder', 'Where raw footage lives — we need edit access.', 'client', 0),
    (edit_access_grp, 'Frame.io project', 'We''ll set this up and add your reviewers.', 'agency', 1),
    (edit_access_grp, 'Approved music library', 'If you have a licensed library, send it over.', 'client', 2);

  INSERT INTO onboarding_checklist_items (group_id, task, description, owner, sort_order) VALUES
    (edit_style_grp, 'Reference edit', 'Point at a piece of content you''d call perfect.', 'client', 0),
    (edit_style_grp, 'Lower-third template', 'We''ll draft from your brand guide if you don''t have one.', 'agency', 1),
    (edit_style_grp, 'Color grade reference', 'Even a screenshot works — tell us the mood.', 'client', 2);
END IF;

END $$;

-- ─── Email templates ─────────────────────────────────────────────────────
-- 4 per service × 3 services = 12 rows. Uses markdown-lite recognised by
-- buildUserEmailHtml: # heading, ## subheading, - bullets, **bold**,
-- [link](url), --- divider. Placeholders: {{client_name}},
-- {{contact_first_name}}, {{service}}, {{share_url}}.

-- Helper trick: insert only if (service, name) pair missing.

INSERT INTO onboarding_email_templates (service, name, subject, body, sort_order)
SELECT v.service, v.name, v.subject, v.body, v.sort_order
FROM (VALUES
  -- SMM ────────────────────────────────────────────────────────────────
  ('SMM', 'Welcome & next steps',
   'You''re in, {{client_name}} — here''s what happens next',
E'# You''re in, {{contact_first_name}}.\n\nWe''re kicking off **{{service}}** for {{client_name}} and we''re pumped. Here''s the plan.\n\n## This week\n- A 30-minute kickoff call to align on goals and voice\n- Access handoff for your social accounts\n- First round of strategy for your review\n\n## Your onboarding home base\nEverything lives at one link — phases, checklist, and exactly what we need from you.\n\n[Open onboarding →]({{share_url}})\n\n---\n\nQuestions? Just reply. We''re around.\n\n– Nativz',
   0),

  ('SMM', 'Kickoff call reminder',
   'Quick heads up — kickoff call coming up',
E'Hi {{contact_first_name}},\n\nQuick reminder that our **{{service}} kickoff call** is coming up. A few things to have handy:\n\n- Your top goal for the next 90 days\n- One thing a current piece of your content does well\n- One thing that''s not working\n- Anyone else you want on the call\n\nWe''ll align on voice, cadence, and the first content plan. Then we sprint.\n\n[Open your onboarding checklist →]({{share_url}})\n\n---\n\nSee you then.\n\n– Nativz',
   1),

  ('SMM', 'Access handoff request',
   'Two things we need from you this week',
E'Hey {{contact_first_name}},\n\nWe''re almost ready to start publishing. Two quick access grants so we can:\n\n- Post on your behalf\n- Read the analytics we''re optimising\n\n## What we need\n- **TikTok** — add us via Business Center\n- **Instagram** — add us via Meta Business Suite\n- **Meta Business Manager** — admin role\n- **Google Analytics** — viewer is fine\n\nStep-by-step instructions are linked inside your onboarding page.\n\n[Open access checklist →]({{share_url}})\n\n---\n\nTakes about 10 minutes total. Thanks {{contact_first_name}}.\n\n– Nativz',
   2),

  ('SMM', 'Week-1 check-in',
   'Week 1 recap + what''s next',
E'{{contact_first_name}} — quick week-1 note.\n\nHere''s where we are on your **{{service}}** launch and what''s coming next.\n\n## Done this week\n- Kickoff call\n- Access handoff\n- First content plan approved\n\n## Next week\n- First 5 pieces go live\n- Analytics dashboard turned on\n- Week-2 review call\n\n[See everything on one page →]({{share_url}})\n\n---\n\nReply if anything looks off.\n\n– Nativz',
   3),

  -- Paid Media ─────────────────────────────────────────────────────────
  ('Paid Media', 'Welcome & next steps',
   'Kicking off paid for {{client_name}}',
E'# Welcome aboard, {{contact_first_name}}.\n\n**{{service}}** for {{client_name}} starts now. Here''s how the first two weeks look.\n\n## This week\n- Strategy call — funnel, offers, audience priorities\n- Ad account + pixel access handoff\n- Tracking audit so we know the numbers are trustworthy\n\n## Next week\n- First creative concepts in review\n- Campaigns built, ready for approval\n- Spend goes live\n\n[Open your onboarding home base →]({{share_url}})\n\n---\n\n– Nativz',
   0),

  ('Paid Media', 'Kickoff call reminder',
   'Paid kickoff — what to bring',
E'Hey {{contact_first_name}},\n\nOur **paid kickoff** is coming up. A short list of what to have ready:\n\n- Top line: what does a great quarter look like?\n- Current CPA / ROAS targets (or ballpark)\n- Your best-performing creative so far\n- Anything that''s *actively* not working\n\nWe''ll map the first 90 days on that call.\n\n[Open onboarding →]({{share_url}})\n\n---\n\nSee you there.\n\n– Nativz',
   1),

  ('Paid Media', 'Access handoff request',
   'Access we need before we can spend',
E'Hi {{contact_first_name}},\n\nTo start running ads for {{client_name}} we need a handful of grants. None of it takes more than 10 minutes.\n\n## Required\n- **Meta Business Manager** — Admin on ad account\n- **Google Ads** — accept our MCC request\n- **Shopify / storefront** — collaborator access for pixel audit\n- **Klaviyo / checkout** — viewer access to verify events\n\nIf you''re not sure where to click, our onboarding page has step-by-steps.\n\n[Access checklist →]({{share_url}})\n\n---\n\n– Nativz',
   2),

  ('Paid Media', 'Week-1 check-in',
   'Week 1 — where paid stands',
E'{{contact_first_name}},\n\nWeek 1 of **{{service}}** is in the books. Quick pulse check.\n\n## Shipped\n- Strategy locked\n- Access + pixel audit done\n- First creative concepts approved\n\n## Next\n- Campaigns go live Monday\n- Daily read-outs start end of week\n- First optimisation call next Friday\n\n[Full progress here →]({{share_url}})\n\n---\n\n– Nativz',
   3),

  -- Editing ────────────────────────────────────────────────────────────
  ('Editing', 'Welcome & next steps',
   '{{client_name}} — editing pipeline kicks off',
E'# Welcome, {{contact_first_name}}.\n\nWe''re kicking off **{{service}}** for {{client_name}}. Here''s the rhythm for the first two weeks.\n\n## This week\n- Editing brief + reference edits\n- Raw footage access handoff\n- First sample edit from your own footage\n\n## Next week\n- Your notes, our revision\n- Pipeline + cadence locked in\n- First real deliveries start\n\n[Open onboarding home →]({{share_url}})\n\n---\n\n– Nativz',
   0),

  ('Editing', 'Kickoff call reminder',
   'Editing kickoff — a few things to bring',
E'Hi {{contact_first_name}},\n\nBefore our **{{service}} kickoff**, a few things that make this call 10x more useful:\n\n- 2-3 reference edits you''d call perfect\n- Format targets (vertical, horizontal, length)\n- Cadence goal — how many pieces per week\n- Your review window (we recommend 48h)\n\n[Kickoff checklist →]({{share_url}})\n\n---\n\nTalk soon.\n\n– Nativz',
   1),

  ('Editing', 'Access handoff request',
   'Footage access + Frame.io setup',
E'Hey {{contact_first_name}},\n\nTo start editing we need:\n\n## From you\n- Edit access to your Dropbox or Google Drive footage folder\n- Your licensed music library (if you have one)\n- A reference edit you''d call perfect\n\n## From us\n- We''ll set up your Frame.io project and add your reviewers\n- We''ll draft a lower-third template if you don''t have one\n\nEverything is laid out on your onboarding page.\n\n[Access checklist →]({{share_url}})\n\n---\n\n– Nativz',
   2),

  ('Editing', 'Week-1 check-in',
   'Editing pipeline — week 1 recap',
E'{{contact_first_name}},\n\nWeek 1 of **{{service}}** for {{client_name}} is done. Here''s where we are.\n\n## Shipped\n- Kickoff + editing brief\n- Access to raw footage\n- First sample edit delivered\n\n## Next\n- Your notes → our revision → final\n- Cadence locked (we recommend 48h reviews)\n- First recurring deliveries start next week\n\n[See progress →]({{share_url}})\n\n---\n\n– Nativz',
   3)
) AS v(service, name, subject, body, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM onboarding_email_templates t
  WHERE t.service = v.service AND t.name = v.name
);
