-- Adds the unique constraint that the process route's upsert
-- (onConflict: 'search_id,platform,platform_id') depends on. Without
-- it, every batched upsert into topic_search_videos was silently
-- rejected by Postgres, leaving the SourceBrowser fallback path empty
-- and the grid blank whenever the bulk platform_data write also failed
-- (200+ sources blow PostgREST's row-size limit).
ALTER TABLE public.topic_search_videos
ADD CONSTRAINT topic_search_videos_search_platform_id_unique
UNIQUE (search_id, platform, platform_id);
