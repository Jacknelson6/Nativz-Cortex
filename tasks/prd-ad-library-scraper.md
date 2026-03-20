# PRD: Ad Library Scraper & Bulk Template Import

## Introduction

Extend the static ad generator's template system to support bulk import of competitor ad templates. Users can either drag-and-drop up to 50 ad images at once, or paste an ad library URL (Meta Ad Library or similar) to scrape and import static ad images as custom templates.

This sits alongside the existing single-template upload flow in the Templates tab and feeds into the same `ad_prompt_templates` table + Gemini Vision extraction pipeline.

## Problem

Users want to import competitor ad templates at scale. Currently they upload individual winning ads one at a time via the template upload form. When analyzing a competitor's ad library, they may want to import dozens of ads in a single session. The manual one-by-one upload creates unnecessary friction.

## Goals

- Allow bulk upload of up to 50 ad images via drag-and-drop or file picker
- Show real-time progress as each image is uploaded, analyzed, and saved
- Accept an ad library URL and scrape visible ad images from the page
- Each imported image follows the same pipeline: upload to Supabase Storage, analyze with Gemini Vision (`extractAdPrompt()`), save as `ad_prompt_templates` record
- Integrate seamlessly into the existing Templates tab UI

## Non-Goals

- No Playwright browser automation (Meta actively blocks headless browsers)
- No Meta Ad Library API integration (requires access token + app review)
- No automatic scheduling of scrapes
- No duplicate detection across imports (future enhancement)
- No client portal access (admin-only)

## Solution

### 1. Bulk upload (primary flow)

User clicks "Bulk import" in the Templates tab, which opens a drag-and-drop zone accepting multiple images (up to 50, max 10 MB each). A progress grid shows each image's status as it processes through the pipeline:

1. **Upload**: Image validated (magic bytes) and uploaded to Supabase Storage `ad-creatives/{client_id}/`
2. **Analyze**: Gemini Vision extracts the JSON prompt schema via `extractAdPrompt()`
3. **Save**: `ad_prompt_templates` record created with the extracted schema

The UI shows a thumbnail grid with per-image status indicators (uploading, analyzing, complete, failed).

### 2. Ad library link scraper (stretch)

User pastes a URL (Meta Ad Library, competitor landing page, or any URL with ad images). The system:

1. Fetches the page HTML via server-side `fetch`
2. Extracts all `<img>` and `<source>` URLs from the HTML
3. Filters to images likely to be ads (dimensions > 200x200 based on width/height attributes, or images from known CDN patterns)
4. Downloads each qualifying image, uploads to storage, creates template records
5. Returns count of imported ads

Note: This approach works for pages that render images in the initial HTML. SPAs that load images via JavaScript (like Meta Ad Library) will return limited results. For those cases, users should download the images manually and use bulk upload.

## User Stories

### US-001: Bulk upload ad images

**As an admin**, I want to drag-and-drop multiple ad images at once so that I can import competitor templates in bulk without uploading them one by one.

**Acceptance Criteria:**
- [ ] Drag-and-drop zone accepts PNG, JPG, WebP (up to 50 files, max 10 MB each)
- [ ] Progress grid shows thumbnail + status for each file (uploading / analyzing / complete / failed)
- [ ] Each file is uploaded to Supabase Storage, analyzed by Gemini Vision, saved as `ad_prompt_templates`
- [ ] Failed files show error message and "Retry" button
- [ ] Summary shows total imported / failed count when complete
- [ ] Typecheck passes

### US-002: Scrape ad images from URL

**As an admin**, I want to paste a URL containing ad images so that the system imports all visible ads from the page.

**Acceptance Criteria:**
- [ ] URL input field with "Scrape" button
- [ ] Server fetches page HTML and extracts image URLs
- [ ] Filters images by size attributes (width/height > 200) and known CDN patterns
- [ ] Downloads qualifying images, uploads to storage, creates template records
- [ ] Returns count of found vs imported images
- [ ] Handles errors gracefully (invalid URL, timeout, no images found)
- [ ] Typecheck passes

## API Routes

### `POST /api/clients/[id]/ad-creatives/templates/bulk`

Accepts FormData with multiple image files. For each file:
1. Validates file type (magic bytes) and size
2. Uploads to Supabase Storage
3. Creates `ad_prompt_templates` record with empty `prompt_schema`
4. Runs `extractAdPrompt()` in background via `after()`

**Request:** `multipart/form-data` with fields:
- `files` — multiple image files
- `ad_category` — category for all imported templates

**Response:** `{ templates: Array<{ id: string, name: string, status: 'extracting' }>, failed: Array<{ name: string, error: string }> }`

### `POST /api/clients/[id]/ad-creatives/templates/scrape`

Accepts JSON body with a URL. Fetches the page, extracts image URLs, downloads qualifying images, and creates template records.

**Request:** `{ url: string }`

**Response:** `{ found: number, imported: number, templates: Array<{ id: string, name: string }>, errors: string[] }`

## Technical Considerations

- **Rate limiting**: Bulk upload uses the existing `rateLimitByUser` with 'ai' type. The scrape endpoint has its own rate limit (3 req/min) to prevent abuse.
- **Background processing**: `extractAdPrompt()` runs via `after()` for each uploaded image. Templates are immediately visible with empty `prompt_schema` and update asynchronously.
- **Storage**: Same bucket (`ad-creatives`) and path pattern (`{client_id}/{uuid}.{ext}`) as existing template uploads.
- **Scrape limitations**: Server-side `fetch` only gets static HTML. JavaScript-rendered content (React/Angular SPAs) won't be captured. This is acceptable — bulk upload is the primary flow.
- **Image download**: Scraper downloads images with a 10-second timeout per image. Skips images that fail to download. Validates downloaded content with magic bytes before storing.

## Implementation Tasks

| # | Task | Description |
|---|------|-------------|
| 1 | Bulk upload API route | `POST /api/clients/[id]/ad-creatives/templates/bulk` — multi-file upload with validation, storage, and background extraction |
| 2 | Scrape API route | `POST /api/clients/[id]/ad-creatives/templates/scrape` — URL fetch, image extraction, download, and import |
| 3 | Bulk import UI component | Drag-and-drop zone + progress grid component at `components/ad-creatives/bulk-template-import.tsx` |
| 4 | Integration | Add bulk import to the Templates tab in `ad-creatives-view.tsx`, add "Bulk import" button to template catalog |

## Success Metrics

- Users can import 20+ ad templates in under 2 minutes via bulk upload
- Scrape endpoint extracts at least 5 images from a typical ad library page with static HTML
- Zero storage leaks (failed imports clean up uploaded files)
