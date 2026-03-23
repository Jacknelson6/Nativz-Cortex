-- Default OpenRouter model for new agency_settings rows when ai_model is not set explicitly.
ALTER TABLE agency_settings
  ALTER COLUMN ai_model SET DEFAULT 'nvidia/nemotron-3-super-120b-a12b:free';
