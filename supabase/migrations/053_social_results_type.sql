-- Add 'social_results' to the presentations type check constraint
ALTER TABLE presentations DROP CONSTRAINT IF EXISTS presentations_type_check;
ALTER TABLE presentations ADD CONSTRAINT presentations_type_check
  CHECK (type = ANY (ARRAY[
    'slides'::text,
    'tier_list'::text,
    'social_audit'::text,
    'benchmarks'::text,
    'prospect_audit'::text,
    'social_results'::text
  ]));
