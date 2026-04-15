-- 108_moodboard_text_items.sql
-- Lets a moodboard item be a plain text block (no URL, no platform scrape).
-- Portal notes need this so a viewer can drop a sentence of context next to
-- a scraped TikTok without having to manufacture a dummy URL.
--
-- Schema changes:
--   - type CHECK expanded to include 'text'
--   - url is no longer NOT NULL (text items have no source URL)
--   - new text_content column holds the body of text items
--
-- Legacy video/image/website items keep their NOT-NULL url via the new
-- ownership CHECK below (type='text' ⇒ text_content required; otherwise
-- url required).

alter table public.moodboard_items
  drop constraint if exists moodboard_items_type_check;

alter table public.moodboard_items
  add constraint moodboard_items_type_check
  check (type in ('video', 'image', 'website', 'text'));

alter table public.moodboard_items
  alter column url drop not null;

alter table public.moodboard_items
  add column if not exists text_content text;

alter table public.moodboard_items
  drop constraint if exists moodboard_items_content_chk;

alter table public.moodboard_items
  add constraint moodboard_items_content_chk
  check (
    (type = 'text' and text_content is not null and length(btrim(text_content)) > 0)
    or
    (type <> 'text' and url is not null)
  );
