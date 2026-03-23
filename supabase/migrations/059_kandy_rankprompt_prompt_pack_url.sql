-- Per-template RankPrompt prompt pack: one JSON file in Storage, URL on the row (ties to reference image).

ALTER TABLE kandy_templates
ADD COLUMN IF NOT EXISTS rankprompt_prompt_pack_url text;

COMMENT ON COLUMN kandy_templates.rankprompt_prompt_pack_url IS
  'Public URL to JSON in kandy-templates bucket (prompt-packs/rankprompt/{id}.json): prompt_schema + RankPrompt brand DNA + assembled_image_prompt.';
