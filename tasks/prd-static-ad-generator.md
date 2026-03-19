# PRD: Static Ad Generator Engine

## Introduction

Build a static ad creative generation engine that sits downstream of Brand DNA. Admins select a client (with an existing Brand DNA kit or provide a URL for ephemeral brand analysis), pick from a curated library of 200+ Kandy ad template styles, and the system generates brand-customized ad creatives using Gemini 3.1 Flash Image Preview.

Nativz already owns **1,000+ Kandy ad templates** across industry verticals (General, Health & Beauty, Fashion, Digital Products) in both feed and story formats. Each template collection contains finalized example pages (real brand ads) alongside blank template versions. The **finalized examples** serve as visual style references — the AI analyzes their layout, composition, and style, then recreates them with the client's brand identity.

The output is a masonry gallery of generated creatives per client, stored in Cortex with favorites, downloads, filtering, and version history.

**Why this matters:** Nativz currently outsources static ad creation or does it manually. This engine turns Brand DNA (which already captures colors, fonts, logos, products, tone) into an assembly line for on-brand ad creatives — hundreds of variations from a single session.

## Architecture Decision: Why Gemini Image Generation (Not Template Autofill)

We evaluated three approaches during discovery:

1. **Canva MCP autofill** — Canva's `start-editing-transaction` and `Autofill` APIs require the Enterprise-only Connect API ($$$). Our Canva plan doesn't expose these tools.
2. **Figma MCP text replacement** — Figma MCP is read-only (design-to-code). No text editing capability. Figma REST API also lacks text replacement. Starter plan = 6 calls/month.
3. **Gemini image generation from reference** — No plan/API gates. Scales with existing OpenRouter budget. Produces fully custom, on-brand ads using Kandy finalized examples as style references.

**Chosen approach**: Export finalized Kandy example pages as PNGs → AI pre-analyzes each into a structured JSON prompt (one-time) → User picks template style + enters brand/product/offer details → Gemini generates custom ad image.

**Future upgrade path**: If Nativz moves to Canva Enterprise, we can add a direct autofill pipeline as an additional generation engine alongside Gemini.

## Template Library Structure

The Kandy template files in Canva are multi-page designs (~200 pages each). The page pattern (starting from page 11 after intro pages):

- **Even pages** = Finalized examples (real brand ads — RYZE, Vessi, Blissy, Echos, etc.)
- **Odd pages** = Blank templates (same layout with placeholder text: "Headline", "BenefitOne", etc.)

We use the **finalized example pages** as reference images for Gemini. These produce better image generation prompts because they show the complete, polished result rather than a skeleton with placeholders.

### Source Collections (Canva)

| Collection | Design ID | Pages | Format | Vertical |
|---|---|---|---|---|
| General (Feed) | `DAHEUJpZcXU` | 213 | 1:1 | general |
| General 2.0 | `DAG-Oz6D5X8` | 212 | 1:1 | general |
| Health & Beauty | `DAG-l_m8QIs` | 213 | 1:1 | health_beauty |
| Health & Beauty 3.0 | `DAG7Dp0HUfM` | 212 | 1:1 | health_beauty |
| Digital Products | `DAHCdETJvlo` | 212 | 1:1 | digital_products |
| Story Examples | `DAG7DhlKWBI` | 212 | 9:16 | general |
| Fashion Story | `DAG6LVI2cik` | 212 | 9:16 | fashion |

### Figma Source Files (Alternate Export Source)

| Collection | File Key | Vertical |
|---|---|---|
| General (with examples) | `3LAKeiInhSq3xxdX2X7hUH` | general |
| Health & Beauty | `ltDisvGAKUWHUgwesveD1y` | health_beauty |
| Fashion | `spyOUe38ZT8kCWZMOnlPHA` | fashion |
| Digital Products (50) | `SyC5SFXbLXgWO1eJgGKihP` | digital_products |

## Goals

- Generate batches of static ad creatives from Brand DNA + Kandy template styles + offers
- Pre-analyze all Kandy finalized examples into reusable JSON prompt schemas (one-time setup)
- Allow uploading additional winning ads and extracting reusable JSON prompt schemas from them
- Browse and select from 200+ pre-analyzed template styles in a visual gallery
- Store generated creatives in a searchable, filterable masonry gallery per client
- Support multiple aspect ratios (1:1 feed, 9:16 story, 4:5 portrait)
- Accept user inputs: product/service to advertise, offer (optional), aspect ratio
- Generate varied on-screen text (headlines, CTAs) from Brand DNA context
- Support ephemeral brand context from URL (no Brand DNA saved) for one-off generation

## User Stories

### US-001: Upload winning ads for prompt extraction
**Description:** As an admin, I want to upload screenshots of winning ads so that the system reverse-engineers them into reusable JSON prompt templates I can use to generate new creatives.

**Acceptance Criteria:**
- [ ] Upload zone accepts PNG, JPG, WebP images (drag-and-drop or file picker)
- [ ] Batch upload: up to 20 ads at once
- [ ] Each uploaded ad is analyzed by Gemini Vision to extract a structured JSON prompt schema:
  - `layout`: text position (top/center/bottom), image placement, CTA position, visual hierarchy
  - `composition`: background type (solid/gradient/image/product-shot), overlay style, border treatment
  - `typography`: headline style (size weight, case), subheadline, CTA text style, font pairing notes
  - `color_strategy`: dominant colors, contrast approach, accent usage
  - `imagery_style`: product-focused, lifestyle, abstract/tech, illustration, 3D render
  - `emotional_tone`: urgency, trust, aspiration, exclusivity, social proof
  - `cta_style`: button shape, position, text pattern (verb + noun)
  - `content_blocks`: ordered list of content elements (logo, headline, subtext, image, CTA, social proof badge)
  - `ad_category`: type of ad (product hero, comparison, social proof, sale/discount, feature callout, lifestyle, testimonial)
- [ ] Admin can preview the extracted JSON prompt, edit it, and save it with a name
- [ ] Saved prompts are stored per client in `ad_prompt_templates` table
- [ ] Typecheck/lint passes

### US-002: Kandy template catalog
**Description:** As an admin, I want to browse the pre-analyzed Kandy template library as a visual gallery so that I can pick template styles for ad generation.

**Acceptance Criteria:**
- [ ] Template catalog page shows all Kandy finalized example images as visual cards
- [ ] Cards grouped by vertical sections: General, Health & Beauty, Fashion, Digital Products
- [ ] Each card shows: template thumbnail (the finalized example PNG), ad category badge, format badge (feed/story)
- [ ] Filter by: vertical, ad category (product hero, comparison, sale, etc.), format (feed/story)
- [ ] Click a card to see the full-size image + the pre-analyzed JSON prompt
- [ ] Templates can be favorited for quick access during generation
- [ ] Typecheck/lint passes

### US-003: Configure ad generation batch
**Description:** As an admin, I want to configure a batch of ads by selecting template styles, entering my product/service details, and optionally adding an offer so that I can generate multiple brand-customized variations at once.

**Acceptance Criteria:**
- [ ] Generation form includes:
  - **Brand DNA source**: dropdown of clients with active Brand DNA, OR "Use URL" with URL input field
  - **Template styles**: multi-select from the Kandy catalog + any custom uploaded templates (at least 1 required)
  - **Product/service**: text input describing what to advertise (e.g., "Organic mushroom matcha powder", "SaaS project management tool")
  - **Offer**: optional text input (e.g., "20% off first month", "Free trial", "Buy 2 get 1 free")
  - **Aspect ratio**: radio group — 1:1 (1080x1080), 9:16 (1080x1920), 4:5 (1080x1350)
  - **Number of variations**: slider or input (1-20 per template)
  - **On-screen text**: toggle between "AI generate" (auto-generates headlines/CTAs from brand context + product) and "Manual" (admin types headline, subheadline, CTA)
- [ ] "Preview prompt" button shows the assembled prompt before generation
- [ ] "Generate" button starts the batch
- [ ] Form validates: Brand DNA exists (or URL provided), at least 1 template selected, product/service provided
- [ ] Typecheck/lint passes

### US-004: Ephemeral brand context from URL
**Description:** As an admin, I want to paste a URL and get temporary brand context for ad generation without saving a full Brand DNA kit, so that I can generate ads for prospects or one-off clients.

**Acceptance Criteria:**
- [ ] When "Use URL" is selected in the generation form, a URL input appears
- [ ] System runs a lightweight brand extraction (colors, fonts, logo, tone — reuses Brand DNA crawl engine)
- [ ] Extracted context is used only for this generation session — NOT stored as a brand_guideline entry
- [ ] Ephemeral context is cached for 30 minutes in case the admin wants to generate again
- [ ] Progress indicator shows extraction status
- [ ] Typecheck/lint passes

### US-005: Gemini image generation engine
**Description:** As the system, I need to generate static ad images using Gemini 3.1 Flash Image Preview so that admins get AI-generated creative variations styled after the selected Kandy templates.

**Acceptance Criteria:**
- [ ] Uses `google/gemini-3.1-flash-image-preview` via OpenRouter (existing pattern)
- [ ] Prompt assembly merges:
  - The pre-analyzed JSON prompt schema from the selected template (layout, composition, typography, etc.)
  - Brand DNA context (colors as hex, fonts, logo description, design style, products)
  - Product/service description from user input
  - Offer text (if provided)
  - On-screen text (AI-generated or manual)
  - Aspect ratio dimensions
- [ ] Prompt includes the finalized example image as a visual reference alongside the JSON description
- [ ] Each generation returns an image file stored in Supabase Storage `ad-creatives/{client_id}/{batch_id}/`
- [ ] Handles generation failures gracefully — skip failed images, continue batch, report failures at end
- [ ] Respects rate limits (queue with configurable concurrency, default 3 parallel)
- [ ] Typecheck/lint passes

### US-006: Pre-analyze Kandy templates (one-time setup)
**Description:** As a developer, I need to batch-export all finalized Kandy example pages and pre-analyze them into JSON prompt schemas so that the template catalog is ready for users.

**Acceptance Criteria:**
- [ ] Script exports finalized example pages (even pages starting from 11) from each Canva collection as PNGs via Canva MCP `export-design`
- [ ] Each exported PNG is uploaded to Supabase Storage `kandy-templates/{collection_id}/`
- [ ] Each PNG is analyzed by Gemini Vision to extract the JSON prompt schema (same schema as US-001)
- [ ] Results stored in `kandy_templates` table with: image URL, JSON prompt, vertical, format, ad category
- [ ] Script is idempotent — can be re-run to add new collections without duplicating existing entries
- [ ] Progress output shows: exporting collection X page Y... analyzing... saved.
- [ ] Typecheck/lint passes

### US-007: Generation progress and batch tracking
**Description:** As an admin, I want to see real-time progress of my ad generation batch so that I know what's happening and when it will finish.

**Acceptance Criteria:**
- [ ] Batch job record created in `ad_generation_batches` table with status tracking
- [ ] Progress UI shows: total creatives requested, completed count, failed count, current step
- [ ] Individual creative status: queued → generating → completed / failed
- [ ] Polling every 3 seconds for progress updates
- [ ] Batch completes when all creatives are done (or failed)
- [ ] Failed creatives show error reason and "Retry" button
- [ ] Typecheck/lint passes

### US-008: Creative gallery with masonry layout
**Description:** As an admin, I want to browse all generated creatives for a client in a masonry gallery so that I can review, favorite, and download them.

**Acceptance Criteria:**
- [ ] Gallery page at `/admin/clients/[slug]/ad-creatives` shows all generated creatives
- [ ] Masonry grid layout — mixed aspect ratios display naturally
- [ ] Each creative card shows: the generated image, hover overlay with action buttons
- [ ] Action buttons on hover: favorite (heart), delete (trash), download (arrow)
- [ ] Filter tabs at top: All, Favorites, by aspect ratio, by template style
- [ ] Filter by batch, by date range
- [ ] Click a creative to open a detail modal: full-size image, metadata (template style used, offer, product/service, created date), download button, favorite toggle
- [ ] Bulk select mode: select multiple creatives for bulk download (ZIP) or bulk delete
- [ ] Empty state: "No creatives yet — generate your first batch" with CTA button
- [ ] Typecheck/lint passes

### US-009: Download individual and bulk creatives
**Description:** As an admin, I want to download individual creatives or bulk download selections as a ZIP so that I can use them in ad platforms.

**Acceptance Criteria:**
- [ ] Individual download: click download button → browser downloads the image file (original resolution)
- [ ] Bulk download: select multiple creatives → "Download selected" button → generates ZIP file → browser downloads ZIP
- [ ] ZIP filename: `{client_name}-creatives-{date}.zip`
- [ ] Download tracks count in `ad_generation_batches` metadata for analytics
- [ ] Typecheck/lint passes

### US-010: AI-generated on-screen text
**Description:** As an admin, I want the system to automatically generate headline, subheadline, and CTA text for my ads using Brand DNA context so that I don't have to write copy manually for every variation.

**Acceptance Criteria:**
- [ ] When "AI generate" is selected for on-screen text, system generates copy using Claude
- [ ] Prompt includes: Brand DNA verbal identity (tone, pillars, vocabulary), product/service info, offer
- [ ] Generates per creative: 1 headline (max 8 words), 1 subheadline (max 15 words), 1 CTA (max 4 words)
- [ ] Variations across the batch — not the same copy on every creative
- [ ] Admin can preview generated copy before confirming generation
- [ ] Copy follows brand voice attributes from Brand DNA
- [ ] Typecheck/lint passes

### US-011: Database schema for ad generation system
**Description:** As a developer, I need the database tables to store templates, generation batches, and generated creatives.

**Acceptance Criteria:**
- [ ] `kandy_templates` table:
  - `id` uuid PK
  - `collection_name` text (e.g., "General Feed", "Health & Beauty 3.0")
  - `canva_design_id` text (source Canva design)
  - `page_index` int (page number within the Canva design)
  - `image_url` text (exported PNG in Supabase Storage)
  - `prompt_schema` jsonb (pre-analyzed JSON prompt from Gemini Vision)
  - `vertical` text ('general' | 'health_beauty' | 'fashion' | 'digital_products')
  - `format` text ('feed' | 'story')
  - `ad_category` text ('product_hero' | 'comparison' | 'social_proof' | 'sale_discount' | 'feature_callout' | 'lifestyle' | 'testimonial' | 'other')
  - `aspect_ratio` text ('1:1' | '9:16')
  - `is_favorite` bool (default false)
  - `is_active` bool (default true)
  - `created_at` timestamptz
- [ ] `ad_prompt_templates` table (user-uploaded winning ads):
  - `id` uuid PK
  - `client_id` uuid FK → clients (nullable — null = global/shared template)
  - `name` text (template name)
  - `reference_image_url` text (original uploaded ad)
  - `prompt_schema` jsonb (the extracted JSON prompt)
  - `aspect_ratio` text ('1:1' | '9:16' | '4:5')
  - `ad_category` text
  - `tags` text[] (imagery_style, emotional_tone, etc.)
  - `created_by` uuid FK → auth.users
  - `created_at` timestamptz
  - `updated_at` timestamptz
- [ ] `ad_generation_batches` table:
  - `id` uuid PK
  - `client_id` uuid FK → clients
  - `status` text ('queued' | 'generating' | 'completed' | 'failed' | 'partial')
  - `config` jsonb (aspect_ratio, num_variations, product_service, offer, on_screen_text, template_ids)
  - `total_count` int
  - `completed_count` int (default 0)
  - `failed_count` int (default 0)
  - `brand_context_source` text ('brand_dna' | 'ephemeral_url')
  - `ephemeral_url` text (if using URL instead of Brand DNA)
  - `created_by` uuid FK → auth.users
  - `created_at` timestamptz
  - `completed_at` timestamptz
- [ ] `ad_creatives` table:
  - `id` uuid PK
  - `batch_id` uuid FK → ad_generation_batches
  - `client_id` uuid FK → clients
  - `template_id` uuid (FK → kandy_templates OR ad_prompt_templates)
  - `template_source` text ('kandy' | 'custom')
  - `image_url` text (Supabase Storage URL)
  - `aspect_ratio` text
  - `prompt_used` text (the full prompt sent to Gemini)
  - `on_screen_text` jsonb ({ headline, subheadline, cta })
  - `product_service` text
  - `offer` text
  - `is_favorite` bool (default false)
  - `metadata` jsonb (generation time, model version, etc.)
  - `created_at` timestamptz
- [ ] RLS: admin users can read/write all, portal users read-only for their org
- [ ] Migration file created and passes
- [ ] Typecheck/lint passes

### US-012: API routes for ad generation
**Description:** As a developer, I need API routes for the ad generation system.

**Acceptance Criteria:**
- [ ] **Kandy template catalog:**
  - `GET /api/ad-creatives/templates` — list all Kandy templates with filtering (vertical, ad_category, format, favorites)
  - `GET /api/ad-creatives/templates/[id]` — get single template with full prompt schema
  - `PATCH /api/ad-creatives/templates/[id]` — toggle favorite
- [ ] **Custom prompt templates (per client):**
  - `POST /api/clients/[id]/ad-creatives/templates` — upload winning ads, extract JSON prompts, save templates
  - `GET /api/clients/[id]/ad-creatives/templates` — list custom templates for a client
  - `PATCH /api/clients/[id]/ad-creatives/templates/[templateId]` — update template name/schema
  - `DELETE /api/clients/[id]/ad-creatives/templates/[templateId]` — delete a template
- [ ] **Generation:**
  - `POST /api/clients/[id]/ad-creatives/generate` — start a generation batch (accepts config from US-003)
  - `GET /api/clients/[id]/ad-creatives/batches` — list generation batches
  - `GET /api/clients/[id]/ad-creatives/batches/[batchId]` — get batch status + progress
  - `POST /api/clients/[id]/ad-creatives/ephemeral-context` — run lightweight brand extraction from URL, return temporary context
- [ ] **Creative gallery:**
  - `GET /api/clients/[id]/ad-creatives` — list creatives with pagination, filtering (favorites, aspect ratio, batch)
  - `PATCH /api/clients/[id]/ad-creatives/[creativeId]` — toggle favorite
  - `DELETE /api/clients/[id]/ad-creatives/[creativeId]` — delete a creative (also removes from Storage)
  - `POST /api/clients/[id]/ad-creatives/bulk-download` — accepts creative IDs, returns ZIP download URL
- [ ] All routes: Zod validation, auth check, proper error responses
- [ ] Typecheck/lint passes

### US-013: Navigation and entry points
**Description:** As an admin, I want to access the ad generator from the client sidebar and have a clear workflow from Brand DNA to ad creation.

**Acceptance Criteria:**
- [ ] "Ad creatives" link added to client sub-navigation (alongside Brand DNA, knowledge, etc.)
- [ ] Client's Brand DNA page gets a "Generate ads" CTA button that links to the ad generator
- [ ] Ad creatives page has tabs: "Gallery" (all creatives), "Templates" (Kandy catalog + custom), "Generate" (new batch form)
- [ ] Breadcrumb: Home > Clients > [Client] > Ad creatives
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: System must analyze uploaded ad images using Gemini Vision and extract structured JSON prompt schemas
- FR-2: System must store pre-analyzed Kandy templates with reference images and JSON prompts in `kandy_templates`
- FR-3: System must generate static ad images using Gemini 3.1 Flash Image Preview via OpenRouter
- FR-4: System must support 3 aspect ratios: 1:1 (1080x1080), 9:16 (1080x1920), 4:5 (1080x1350)
- FR-5: System must accept product/service description and optional offer text as user inputs
- FR-6: System must generate varied on-screen text (headline, subheadline, CTA) using Claude AI when "AI generate" is selected
- FR-7: System must support ephemeral brand context from a URL without saving to the knowledge graph
- FR-8: System must store generated creatives in Supabase Storage with metadata in `ad_creatives` table
- FR-9: System must display creatives in a masonry gallery with filtering, favorites, and bulk actions
- FR-10: System must support individual and bulk (ZIP) download of creatives
- FR-11: System must track batch generation progress and display real-time status
- FR-12: System must handle generation failures gracefully — skip failures, continue batch, report at end
- FR-13: System must read Brand DNA context via `getBrandContext()` for prompt assembly
- FR-14: System must rate-limit Gemini API calls (max 3 concurrent per batch)
- FR-15: System must include the finalized example image as visual reference in the Gemini prompt alongside the JSON description

## Non-Goals (Out of Scope)

- No video ad generation (static images only — video is a separate future feature)
- No direct publishing to ad platforms (Meta Ads, Google Ads) — export/download only
- No A/B test tracking or ad performance analytics (that's the ad platform's job)
- No Canva autofill (requires Enterprise plan — future upgrade path)
- No Figma text replacement (Figma MCP is read-only)
- No automated scheduling of ad campaigns
- No dynamic/personalized ads (e.g., user-specific content injection at serve time)
- No client portal access to the ad generator (admin-only for now)
- No 16:9 landscape format (rarely used for ads — can add later)

## Design Considerations

- **Gallery layout**: masonry grid — cards have rounded corners, slight shadow, hover overlay with action buttons (heart, trash, download)
- **Dark theme**: `bg-background` canvas, `bg-surface` cards, brand accent for hover states and CTAs
- **Template catalog**: visual card grid grouped by vertical sections with filter bar
- **Generation form**: clean card-based layout, each config section as a collapsible card (Brand source, Templates, Product/Offer, Copy, Format)
- **Progress UI**: similar to Brand DNA generation progress — step indicators with animated transitions
- **Hover overlay**: semi-transparent dark overlay with centered action buttons
- **Detail modal**: full-width image with metadata sidebar, similar to an image lightbox
- **Empty states**: always include guidance and a CTA to generate or upload

## Technical Considerations

### Dependencies on Brand DNA
- Requires Brand DNA engine to be implemented (Stage 1-2 of brand-dna PRD minimum)
- Uses `getBrandContext()` for prompt assembly
- Reuses Brand DNA crawl engine for ephemeral URL extraction
- Brand DNA provides: colors, fonts, logos, products, design style, tone, messaging pillars

### Image generation
- Model: `google/gemini-3.1-flash-image-preview` via OpenRouter
- Prompt includes both the JSON prompt schema AND the finalized example image as visual reference
- Output: PNG images at target resolution per aspect ratio
- Storage: Supabase Storage bucket `ad-creatives`
- Folder structure: `{client_id}/{batch_id}/{creative_id}.png`
- Kandy template images stored in: `kandy-templates/{vertical}/{template_id}.png`

### One-time template setup
- Export finalized example pages from Canva collections via Canva MCP `export-design`
- Each collection has ~100 finalized examples (even pages after intro section)
- Analyze each with Gemini Vision → structured JSON prompt
- Store in `kandy_templates` table + Supabase Storage
- Total: ~200-400 templates across all collections
- Script should be re-runnable for adding new collections

### Performance
- Batch generation is async with progress polling (not SSE — matches existing pattern)
- Gemini rate limiting: max 3 concurrent requests per batch, configurable
- ZIP generation for bulk download: server-side using `archiver` or similar
- Gallery pagination: 24 creatives per page, infinite scroll or "Load more"
- Template catalog images lazy-loaded with blur placeholder

### Storage costs
- Kandy template PNGs: ~200-400 images × ~300KB = 60-120MB (one-time)
- Each generated creative: ~500KB-2MB depending on resolution
- A batch of 20 creatives ≈ 10-40MB
- Supabase Storage pricing applies — monitor usage per client

## Success Metrics

- Admins can generate a batch of 20 on-brand ad creatives in under 5 minutes
- Template catalog loads in under 2 seconds with 200+ template thumbnails
- Gallery loads in under 2 seconds for clients with 200+ creatives
- At least 50% of generated creatives are usable without further editing (admin qualitative review)
- JSON prompt extraction from winning ads produces reusable templates across 3+ generation sessions

## Open Questions (Resolved)

- ~~Should we use Canva autofill?~~ → No. Requires Enterprise plan. Using Gemini image generation instead.
- ~~Should we use Figma text replacement?~~ → No. Figma MCP is read-only. Starter plan = 6 calls/month.
- ~~How to identify finalized vs blank template pages?~~ → Even pages from page 11 onward = finalized examples, odd pages = blank templates (confirmed visually).

## Open Questions (Remaining)

- Should we support custom aspect ratios beyond the 3 presets, or are those sufficient for now?
- Should generated creatives be visible in the knowledge graph, or is the gallery a separate system?
- Should there be a "regenerate single creative" action that keeps the same config but re-rolls?
- How many Gemini image generation calls per day does the OpenRouter quota support? Need to set batch size limits accordingly.
- Should the template catalog page live under a global admin route (`/admin/ad-templates`) or be embedded within each client's ad creatives section?

---

# Implementation Stages

## Stage 1: Database + Template Infrastructure

> Set up tables, storage buckets, types, and the Kandy template export/analysis pipeline.

| # | Task | Description |
|---|------|-------------|
| 1.1 | Create migration for ad generation tables | Create `kandy_templates`, `ad_prompt_templates`, `ad_generation_batches`, and `ad_creatives` tables as specified in US-011. Add RLS policies: admins full access, portal users read-only on `ad_creatives` scoped by `organization_id`. Add indexes on `client_id`, `batch_id`, `is_favorite`, `vertical`, `ad_category`. |
| 1.2 | Create Supabase Storage buckets | Set up `ad-creatives` bucket (generated ads) and `kandy-templates` bucket (template reference images). RLS: authenticated users can read, admins can write. |
| 1.3 | Build TypeScript types for ad system | Create `/lib/ad-creatives/types.ts` with interfaces: `KandyTemplate`, `AdPromptSchema`, `AdPromptTemplate`, `AdGenerationBatch`, `AdGenerationConfig`, `AdCreative`, `OnScreenText`. |
| 1.4 | Build Kandy template export script | Create `/scripts/export-kandy-templates.ts`. For each Canva collection: export finalized example pages (even pages from 11+) as PNGs via Canva MCP `export-design`. Upload each PNG to Supabase Storage `kandy-templates/{vertical}/`. Create `kandy_templates` records with image URLs. Idempotent — skips already-exported pages. |
| 1.5 | Build Kandy template analysis script | Create `/scripts/analyze-kandy-templates.ts`. For each `kandy_templates` record without a `prompt_schema`: send the image to Gemini Vision to extract the structured JSON prompt schema. Update the record with the analyzed prompt. Batch with concurrency control (3 parallel). Progress logging. |
| 1.6 | Build winning ad upload + JSON extraction | Create `/lib/ad-creatives/extract-prompt.ts`. Function `extractAdPrompt(imageUrl: string)` sends the image to Gemini Vision with a structured extraction prompt. Returns the full JSON prompt schema. Parse response with Zod for type safety. |

---

## Stage 2: Generation Engine — Gemini + Copy Generation

> Build the Gemini image generation pipeline and AI copy generation.

| # | Task | Description |
|---|------|-------------|
| 2.1 | Build prompt assembler | Create `/lib/ad-creatives/assemble-prompt.ts`. Function `assembleImagePrompt(config: { brandContext, promptSchema, templateImageUrl, productService, offer, onScreenText, aspectRatio })` merges Brand DNA context + JSON prompt template + reference image + product details + offer + copy into a Gemini image generation prompt. Include explicit hex colors, logo description, text content, aspect ratio dimensions. |
| 2.2 | Build Gemini image generation function | Create `/lib/ad-creatives/generate-image.ts`. Function `generateAdImage(prompt: string, referenceImageUrl: string, aspectRatio: string)` calls Gemini 3.1 Flash Image Preview via OpenRouter with both the text prompt and reference image. Returns image buffer. Handles retries (max 2), timeouts (60s), and rate limiting. |
| 2.3 | Build AI copy generator | Create `/lib/ad-creatives/generate-copy.ts`. Function `generateAdCopy(brandContext, productService, offer, count)` calls Claude to generate `count` unique sets of { headline, subheadline, cta }. Uses Brand DNA verbal identity for tone/vocabulary. Varies copy across the batch. |
| 2.4 | Build batch orchestrator | Create `/lib/ad-creatives/orchestrate-batch.ts`. Function `runGenerationBatch(batchId: string)` reads batch config, resolves brand context (Brand DNA or ephemeral), generates copy if needed, then generates images with concurrency control (max 3 parallel). Updates `ad_generation_batches` progress after each creative. Stores completed images in Supabase Storage and creates `ad_creatives` records. Handles partial failures. |
| 2.5 | Build generation API route | Create `POST /api/clients/[id]/ad-creatives/generate`. Validates config with Zod. Creates `ad_generation_batches` record. Runs `runGenerationBatch()` via `after()` for background processing. Returns `{ batchId, status: 'queued' }`. |
| 2.6 | Build batch status API route | Create `GET /api/clients/[id]/ad-creatives/batches/[batchId]`. Returns batch status, progress counts, and list of completed/failed creative IDs. |
| 2.7 | Build ephemeral brand context route | Create `POST /api/clients/[id]/ad-creatives/ephemeral-context`. Accepts `{ url: string }`. Runs lightweight Brand DNA extraction (reuse crawl + extract-visuals + analyze-verbal). Returns temporary brand context. Cache in-memory for 30 minutes. |

---

## Stage 3: Template Catalog UI + Custom Templates

> Build the Kandy template browser, custom template upload, and template management.

| # | Task | Description |
|---|------|-------------|
| 3.1 | Build Kandy template list API | Create `GET /api/ad-creatives/templates`. Returns all active Kandy templates with filtering (vertical, ad_category, format, is_favorite). Pagination support. `PATCH /api/ad-creatives/templates/[id]` for toggling favorite. |
| 3.2 | Build Kandy template catalog page | Create `/app/admin/ad-creatives/templates/page.tsx`. Visual card grid grouped by vertical sections. Each card: template thumbnail, ad category badge, format badge (feed/story), favorite star. Filter bar: vertical dropdown, ad category dropdown, format toggle, favorites-only toggle. |
| 3.3 | Build template detail view | Click a catalog card → modal showing: full-size finalized example image, the pre-analyzed JSON prompt (collapsible), ad category, format, vertical. "Use this template" CTA that links to generation form with template pre-selected. |
| 3.4 | Build custom template CRUD API routes | Create routes: `POST/GET /api/clients/[id]/ad-creatives/templates`, `PATCH/DELETE .../templates/[templateId]`. POST accepts image upload + calls `extractAdPrompt()`. GET returns all custom templates for client. |
| 3.5 | Build custom template upload UI | Within the templates tab, "Upload winning ad" button opens upload zone. Drag-and-drop or file picker. Shows extraction progress. Preview extracted JSON prompt. Save with name. |
| 3.6 | Build combined template selector component | Reusable component for the generation form. Shows both Kandy templates and custom templates in a single selectable grid. Selected templates show blue border + checkmark. "Selected (N)" count. Quick filter tabs. |

---

## Stage 4: Gallery UI + Downloads

> Build the creative gallery, detail views, and download system.

| # | Task | Description |
|---|------|-------------|
| 4.1 | Build creatives list API route | Create `GET /api/clients/[id]/ad-creatives`. Supports pagination (`page`, `limit`), filtering (`favorite`, `aspect_ratio`, `batch_id`, `template_id`), sorting (`created_at desc` default). Returns creatives with image URLs and metadata. |
| 4.2 | Build masonry gallery component | Create `/components/ad-creatives/creative-gallery.tsx`. CSS grid masonry layout. Cards with rounded corners, `bg-surface` background. Images lazy-loaded. Responsive: 4 columns desktop, 2 mobile. |
| 4.3 | Build creative card with hover overlay | Create `/components/ad-creatives/creative-card.tsx`. Shows image, on hover shows semi-transparent dark overlay with action buttons: heart (favorite toggle), trash (delete with confirmation), download (direct download). Favorite state shown as filled/outline heart. |
| 4.4 | Build filter bar | Create `/components/ad-creatives/filter-bar.tsx`. Tabs: All, Favorites. Dropdowns: aspect ratio, template style. Date range picker. Filter state in URL search params. |
| 4.5 | Build creative detail modal | Click a card → modal with: full-size image, metadata sidebar (template style used, offer, product/service, on-screen text, aspect ratio, created date, batch link). Download button. Favorite toggle. Previous/next navigation. |
| 4.6 | Build bulk select mode | Checkbox on each card when bulk mode active. "Select all" toggle. Bottom action bar: "Download selected (N)" and "Delete selected (N)". |
| 4.7 | Build bulk download endpoint | Create `POST /api/clients/[id]/ad-creatives/bulk-download`. Accepts `{ creativeIds: string[] }`. Fetches images from Storage, creates ZIP using `archiver`, uploads ZIP to Storage, returns temporary download URL. |
| 4.8 | Build favorite + delete endpoints | `PATCH /api/clients/[id]/ad-creatives/[creativeId]` — toggle favorite. `DELETE /api/clients/[id]/ad-creatives/[creativeId]` — delete creative + Storage file. |

---

## Stage 5: Generation Form + Page Assembly

> Build the generation configuration form and assemble the full ad creatives page.

| # | Task | Description |
|---|------|-------------|
| 5.1 | Build generation form page | Create `/app/admin/clients/[slug]/ad-creatives/generate/page.tsx`. Card-based form layout with sections: Brand source, Template styles, Product & Offer, Copy, Format. Each section as a collapsible card. "Preview prompt" and "Generate" buttons at bottom. |
| 5.2 | Build brand source selector | Component for selecting Brand DNA client (dropdown with completeness badge) or "Use URL" mode with URL input + extraction trigger. Shows extracted brand summary (logo, colors, name) when ready. |
| 5.3 | Build product/offer inputs | Product/service text input (required) with placeholder examples. Offer text input (optional) with common offer chips ("% off", "Free shipping", "Buy X get Y", "Free trial"). |
| 5.4 | Build on-screen text configuration | Toggle: "AI generate" or "Manual". Manual mode: headline, subheadline, CTA text inputs. AI mode: shows "Copy will be generated based on brand voice + product details" message. Preview button shows sample generated copy. |
| 5.5 | Build generation progress page | After clicking Generate, redirect to progress view. Shows batch status with step indicators, completed/failed counts, thumbnail grid of completed creatives filling in as they generate. "View gallery" button when complete. |
| 5.6 | Assemble ad creatives page with tabs | Create `/app/admin/clients/[slug]/ad-creatives/page.tsx` with tabs: Gallery (default — masonry grid), Templates (Kandy catalog + custom), Generate (new batch form). Tab state in URL. |
| 5.7 | Add navigation entry point | Add "Ad creatives" to client sub-navigation. Add "Generate ads" CTA on Brand DNA page. Add creative count badge on nav link. |
| 5.8 | Build empty states | Gallery empty: illustration + "Generate your first batch" CTA. Templates empty: "Upload winning ads to get started" with upload dropzone. No Brand DNA: "Set up Brand DNA first" with link to Brand DNA page. |
