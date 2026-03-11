ALTER TABLE client_review_links ADD COLUMN IF NOT EXISTS post_ids UUID[] DEFAULT '{}';
