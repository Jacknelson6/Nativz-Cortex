-- Prevent duplicate platform legs on the same post. Lets us safely use
-- ON CONFLICT DO NOTHING when adding a new platform to an existing post,
-- and protects the cross-platform "copy" feature from double-firing if
-- the user clicks rapidly.
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_post_platforms_post_profile_uniq
  ON scheduled_post_platforms (post_id, social_profile_id);
