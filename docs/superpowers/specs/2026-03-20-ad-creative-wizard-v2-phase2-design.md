# Ad Creative Wizard v2 — Phase 2: Template Library Overhaul

> Phase 2 of 3. Follows Phase 1 (Wizard UX + Brand polish). Phase 3 (Generation refinement) follows.

## Problem

The template library is limited:
- Only Kandy templates available, all named "Story Examples" or "Digital Products" with no brand context
- No way to scrape templates from competitors' ad libraries
- Can't pull images from Instagram/Facebook post URLs
- Uploaded templates don't appear immediately after upload (fixed in Phase 1 at the component level, but the template data model needs enhancement)
- Templates aren't organized by brand/source — hard to browse when you have hundreds

## Solution

Enhance the template library with brand-organized collections, an ad library scraper (Playwright-based), social media post image extraction, and a template management system.

---

## 1. Brand-Organized Template Collections

### Data model change

Add `source_brand` text column to `kandy_templates` table. Templates are grouped by this field in the UI. Values:
- `"Kandy - General Feed"`, `"Kandy - Story Examples"`, etc. for Kandy collections
- `"Nike"`, `"Apple"`, etc. for scraped ad library templates
- `"Upload"` for user-uploaded templates
- `null` for legacy templates (treated as "Uncategorized")

### UI

The template grid (already built in Phase 1) adds a brand/collection grouping layer:
- Top level: grouped by `source_brand`
- Within each brand: sub-grouped by aspect ratio (existing Phase 1 behavior)
- Collapsible brand sections with count badges
- Search bar to filter across all brands

---

## 2. Ad Library Scraper

### Flow

1. User clicks "Import from Ad Library" button in template section
2. Pastes a Meta Ad Library URL (e.g., `facebook.com/ads/library/?active_status=all&advertiser_id=12345`)
3. System queues a background Playwright scrape job
4. Job opens the Ad Library page, scrolls to load all ads, downloads each static image
5. Images uploaded to Supabase Storage as templates
6. Templates appear in library grouped under the advertiser's brand name

### Technical approach

- **Playwright headless** running server-side via the existing Playwright config
- Background job pattern: POST starts the job, UI polls for status
- Each scraped image is analyzed by Gemini Vision (reuse existing `extractAdPrompt` function) to get a prompt_schema
- Rate limiting: max 1 concurrent scrape job per user
- Store job status in `ad_library_scrape_jobs` table (new)

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/ad-creatives/templates/scrape-library` | POST | Start ad library scrape job |
| `GET /api/ad-creatives/templates/scrape-library/[jobId]` | GET | Poll job status |

---

## 3. Social Media Post Image Extraction

### Flow

1. User clicks "Import from URL" in template section
2. Pastes an Instagram or Facebook post URL
3. System extracts the primary image from the post
4. Image saved as a template with `source_brand` set to the account name

### Technical approach

- Instagram: fetch the post page, extract `og:image` meta tag (works for public posts)
- Facebook: similar OG tag extraction
- No Playwright needed — simple server-side HTML fetch
- Reuse `extractMeta` from `scrape-brand.ts`

### API route

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/ad-creatives/templates/import-url` | POST | Extract image from social post URL |

---

## 4. Template Management

### Wipe and re-import

- Admin action: "Clear all templates" button (with confirmation)
- Deletes all rows from `kandy_templates` and removes from Storage
- Then user can bulk-upload the new organized set

### Template editing

- Click a template to see its detail view
- Edit `source_brand`, `ad_category`, `vertical`, `aspect_ratio`
- Delete individual templates

### API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `DELETE /api/ad-creatives/templates/clear-all` | DELETE | Wipe all templates |
| `PATCH /api/ad-creatives/templates/[id]` | PATCH | Edit template metadata |

---

## 5. Database Changes

### Migration: `052_template_source_brand_and_scrape_jobs.sql`

```sql
-- Add source_brand to kandy_templates
ALTER TABLE kandy_templates
  ADD COLUMN IF NOT EXISTS source_brand text DEFAULT NULL;

-- Backfill existing templates with collection_name as source_brand
UPDATE kandy_templates SET source_brand = collection_name WHERE source_brand IS NULL;

-- Ad library scrape jobs
CREATE TABLE IF NOT EXISTS ad_library_scrape_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  library_url text NOT NULL,
  advertiser_name text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scraping', 'completed', 'failed')),
  total_found int DEFAULT 0,
  imported_count int DEFAULT 0,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE ad_library_scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage scrape jobs"
  ON ad_library_scrape_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## Non-goals (Phase 2)

- Prompt editor (Phase 3)
- Brand media library (Phase 3)
- Interactive vs auto mode (Phase 3)
- Video ad template support
- Template favoriting (already works)

---

## Success criteria

- Templates grouped by source brand in the UI
- Ad Library URL paste → templates appear after scrape completes
- Instagram/Facebook post URL → template extracted
- "Clear all templates" works with confirmation
- Existing Kandy templates backfilled with source_brand
