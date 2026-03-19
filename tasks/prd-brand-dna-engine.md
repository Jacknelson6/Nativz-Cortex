# PRD: Brand DNA Engine — Client Onboarding Redesign

## Introduction

Restructure client onboarding in Nativz Cortex around a **Brand DNA Engine** — an AI-powered system that ingests a brand's URL (and supplementary files), crawls it deeply, and produces a comprehensive **Brand Guideline Document** that becomes the single source of truth for all downstream content generation.

Today, client profiles are shallow form fields (industry, target_audience, brand_voice) manually filled by admins. The knowledge graph, ideas system, search prompts, and pillar generator each assemble their own partial context from these fields. The result: every tool builds a slightly different picture of the brand, and none have the full picture.

Brand DNA replaces this with a structured, AI-generated brand brief that captures everything about a brand in its current form — logos, colors, fonts, tone, products, design philosophy, imagery style, and competitive positioning. All other Cortex tools (topic search, idea generation, pillar creation, scripts, social audit) then pull from this single document instead of each scraping together their own partial context.

**Inspiration reference:** Tools like Holo that let you drop a URL and get a full marketing kit. But our output is the brand guideline itself — the input document that makes every other Cortex tool produce better, more on-brand work.

## Goals

- Replace the current manual client profile form with an AI-driven Brand DNA onboarding flow
- Generate a comprehensive brand guideline from a single URL drop (+ optional file uploads)
- Capture visual identity (logos, colors, fonts, screenshots), verbal identity (tone, voice, messaging), product catalog, and design philosophy in one structured document
- Make this guideline the authoritative context source for ALL downstream AI tools
- Allow admins to review, edit, and lock sections of the generated guideline before it goes live
- Enable client portal users to VIEW their Brand DNA and provide feedback/approvals
- Support iterative refinement — re-crawl, re-analyze, merge new uploads without losing manual edits

## User Stories

### US-001: URL drop triggers full brand crawl
**Description:** As an admin, I want to paste a client's website URL and have the system crawl it comprehensively so that I get a complete picture of their brand without manual data entry.

**Acceptance Criteria:**
- [ ] Input field accepts a URL on the new client onboarding page
- [ ] System crawls the homepage + up to 30 internal pages (about, products, team, contact, blog)
- [ ] Crawl captures: page text, meta descriptions, OG images, product images, logos, color palette from CSS/images, font families from CSS
- [ ] Progress indicator shows crawl status (pages found, pages crawled, extracting...)
- [ ] Crawl completes within 60 seconds for a typical 20-page site
- [ ] Crawl results are stored in `client_knowledge_entries` as `web_page` type entries
- [ ] Typecheck/lint passes

### US-002: Visual identity extraction from crawled pages
**Description:** As an admin, I want the system to automatically extract a brand's visual identity (logos, colors, fonts, design style) from their website so that the brand guideline captures their look and feel.

**Acceptance Criteria:**
- [ ] System detects logo images from `<link rel="icon">`, OG images, header images, and common logo selectors
- [ ] System extracts primary and secondary color palette from CSS custom properties, computed styles, and dominant image colors
- [ ] System identifies font families from CSS (display font, body font, monospace if used)
- [ ] System captures 3-5 representative screenshots of key pages (homepage hero, product page, about page) using Cloudflare Browser Rendering or Playwright
- [ ] System detects design style attributes: light/dark theme, rounded vs sharp corners, minimal vs rich, illustration-heavy vs photo-heavy
- [ ] All extracted visual assets stored in Supabase Storage with URLs in the brand guideline
- [ ] Typecheck/lint passes

### US-003: Verbal identity extraction from crawled content
**Description:** As an admin, I want the system to analyze a brand's written content to extract their tone of voice, messaging pillars, and communication style so the guideline captures how they talk.

**Acceptance Criteria:**
- [ ] AI analyzes homepage hero copy, about page, product descriptions, and blog posts
- [ ] Extracts: primary tone (e.g., "conversational and empowering"), voice attributes (e.g., "uses second person, short sentences, action verbs")
- [ ] Identifies messaging pillars (3-5 recurring themes across content)
- [ ] Extracts common phrases, power words, and vocabulary patterns
- [ ] Identifies what the brand does NOT say (formality level, jargon avoidance, etc.)
- [ ] Detects target audience signals from content language
- [ ] Stores analysis as structured JSON in brand guideline metadata
- [ ] Typecheck/lint passes

### US-004: Product/service catalog extraction
**Description:** As an admin, I want the system to identify and catalog all products/services from the website so the brand guideline includes what the brand actually sells.

**Acceptance Criteria:**
- [ ] AI identifies product/service pages from navigation structure and page content
- [ ] Extracts: product name, description (2-3 sentences), price if visible, main product image URL, category
- [ ] Groups products into categories if structure exists
- [ ] Identifies the primary offer (most prominently featured product/service)
- [ ] Stores product catalog as structured array in brand guideline metadata
- [ ] Handles both e-commerce (many products) and service businesses (few offerings)
- [ ] Typecheck/lint passes

### US-005: Brand DNA document generation
**Description:** As an admin, I want the system to compile all extracted data into a single structured Brand Guideline document so I have a complete, editable brief of the brand.

**Acceptance Criteria:**
- [ ] AI generates a comprehensive markdown document with these sections:
  - Brand overview (who, what, why — 3-4 paragraphs)
  - Visual identity (logos with URLs, color palette with hex codes, typography, design notes)
  - Verbal identity (tone of voice, messaging pillars, vocabulary, what to avoid)
  - Product/service catalog (name, description, image, category per item)
  - Target audience (demographics, psychographics, pain points derived from content)
  - Competitive positioning (how the brand differentiates, inferred from messaging)
  - Content style guide (recommended formats, platforms, posting cadence from observed patterns)
- [ ] Document stored as `client_knowledge_entries` with `type: 'brand_guideline'` (new type)
- [ ] Document includes inline image references (`![Logo](url)`, `![Product](url)`)
- [ ] Document includes a metadata JSON sidecar with all structured data (colors array, fonts array, products array, etc.)
- [ ] Previous brand guideline (if any) marked as `superseded_by` the new one
- [ ] Typecheck/lint passes

### US-006: File upload for supplementary brand assets
**Description:** As an admin, I want to upload files (logos, PDFs, brand guides, docs) alongside the URL crawl so that the Brand DNA captures assets not available on the website.

**Acceptance Criteria:**
- [ ] Upload zone accepts: images (PNG, JPG, SVG, WebP), PDFs, markdown files, DOCX, plain text
- [ ] Images are stored in Supabase Storage and linked to the client's brand guideline
- [ ] PDFs and DOCX files are parsed for text content (using existing PDF/doc parsing if available, or a new extraction utility)
- [ ] Markdown files are imported directly as knowledge entries
- [ ] Uploaded logos are identified as such and added to the visual identity section
- [ ] All uploaded files are stored as `client_knowledge_entries` with `source: 'uploaded'`
- [ ] Upload supports drag-and-drop and file picker
- [ ] Max 20 files per upload batch, max 50MB per file
- [ ] Typecheck/lint passes

### US-007: Admin review and edit interface for Brand DNA
**Description:** As an admin, I want to review the generated brand guideline section by section, edit any part, and lock sections I've verified so that the guideline is accurate before it drives content generation.

**Acceptance Criteria:**
- [ ] Brand DNA page shows the guideline as a card-per-section layout (not one long document)
- [ ] Each section (visual identity, verbal identity, products, etc.) has an edit button
- [ ] Editing uses a markdown editor with live preview
- [ ] Sections can be marked as "verified" (green checkmark) or "needs review" (amber)
- [ ] Manual edits are preserved on re-generation — system shows diff and asks which to keep
- [ ] Section-level last-edited timestamp shown
- [ ] Overall Brand DNA completeness percentage shown (based on which sections have content)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-008: Re-crawl and refresh Brand DNA
**Description:** As an admin, I want to re-crawl a client's website and refresh the Brand DNA without losing my manual edits so that the guideline stays current as the brand evolves.

**Acceptance Criteria:**
- [ ] "Refresh" button on the Brand DNA page triggers a new crawl
- [ ] System generates a new draft guideline from fresh crawl data
- [ ] Diff view shows what changed between old and new versions per section
- [ ] Admin can accept/reject changes per section
- [ ] Manually edited/verified sections are NOT auto-overwritten — shown as conflicts
- [ ] Version history maintained (previous versions accessible)
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-009: Brand DNA feeds into topic search prompts
**Description:** As an admin, I want topic searches for a client to automatically use their Brand DNA as context so that research results are tailored to the brand.

**Acceptance Criteria:**
- [ ] `buildTopicResearchPrompt()` reads brand guideline content instead of raw client fields
- [ ] `buildClientStrategyPrompt()` reads brand guideline content instead of raw client fields
- [ ] Brand preferences (tone_keywords, topics_to_avoid, etc.) are extracted from the guideline's verbal identity section
- [ ] Product catalog from guideline is included in client strategy prompts
- [ ] Visual identity data is NOT sent to text-only prompts (saves tokens)
- [ ] Backward compatible — clients without Brand DNA still work with existing client fields
- [ ] Typecheck/lint passes

### US-010: Brand DNA feeds into idea/pillar generation
**Description:** As an admin, I want idea and pillar generation to pull from the Brand DNA so that generated content is consistent with the brand guideline.

**Acceptance Criteria:**
- [ ] `generateVideoIdeas()` in `/lib/knowledge/idea-generator.ts` reads brand guideline instead of assembling partial context
- [ ] Pillar generation in `/api/clients/[id]/pillars/generate` reads brand guideline including preferences
- [ ] Strategy generation in `/api/clients/[id]/pillars/generate-strategy` reads brand guideline
- [ ] Product catalog from guideline informs idea generation ("make video ideas about these products")
- [ ] Verbal identity from guideline constrains tone in generated scripts
- [ ] Backward compatible — clients without Brand DNA still work
- [ ] Typecheck/lint passes

### US-011: New client onboarding flow replaces old form
**Description:** As an admin, I want the "Add client" flow to be the Brand DNA wizard instead of the old form so that every new client starts with a rich brand guideline.

**Acceptance Criteria:**
- [ ] "Add client" button opens the Brand DNA onboarding wizard (not the old profile form)
- [ ] Wizard step 1: Enter client name + paste website URL (required) + optional file uploads
- [ ] Wizard step 2: System crawls and extracts — admin sees progress
- [ ] Wizard step 3: Generated Brand DNA shown for review — admin can edit sections
- [ ] Wizard step 4: Confirm — creates the client record + brand guideline + all knowledge entries
- [ ] Old client profile form still accessible as "Edit profile" for existing clients
- [ ] Clients created through Brand DNA have `onboarded_via: 'brand_dna'` flag
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-012: Client portal Brand DNA view
**Description:** As a client portal user, I want to see my brand's DNA guideline so that I can review what Nativz knows about my brand and provide feedback.

**Acceptance Criteria:**
- [ ] Portal route `/portal/brand` shows the brand guideline in read-only mode
- [ ] Client sees all sections: visual identity, verbal identity, products, audience, positioning
- [ ] Client can leave comments/feedback on each section (stored as notes or a feedback mechanism)
- [ ] Client can flag a section as "incorrect" which notifies the admin
- [ ] No edit capability for portal users — view and comment only
- [ ] Typecheck/lint passes
- [ ] Verify in browser using dev-browser skill

### US-013: Unified brand context builder function
**Description:** As a developer, I need a single function that assembles the complete brand context from a client's Brand DNA so that every AI prompt gets the same, comprehensive context.

**Acceptance Criteria:**
- [ ] New function `getBrandContext(clientId)` in `/lib/knowledge/brand-context.ts`
- [ ] Returns structured object: `{ overview, visualIdentity, verbalIdentity, products, audience, positioning, contentStyle, preferences }`
- [ ] Reads from `brand_guideline` type knowledge entry first, falls back to raw client fields
- [ ] Includes a `toPromptBlock()` method that formats for AI prompt injection (text-only, no images)
- [ ] Includes a `toFullContext()` method that returns everything including image URLs
- [ ] Used by all prompt builders: topic search, client strategy, idea generation, pillar generation
- [ ] Result is cached per client for 5 minutes to avoid repeated DB reads within a session
- [ ] Typecheck/lint passes

## Functional Requirements

- FR-1: System must crawl a website URL and extract text, images, meta tags, CSS colors, CSS fonts, and page screenshots
- FR-2: System must generate a structured Brand Guideline document from crawled data using Claude AI
- FR-3: Brand Guideline must be stored as a `client_knowledge_entries` record with `type: 'brand_guideline'`
- FR-4: Brand Guideline metadata must include structured arrays for: colors, fonts, products, logos, screenshots
- FR-5: System must accept file uploads (images, PDFs, DOCX, MD, TXT) and incorporate them into the guideline
- FR-6: Uploaded files must be stored in Supabase Storage with references in the guideline
- FR-7: Admin must be able to edit any section of the guideline in a markdown editor
- FR-8: Manual edits must be preserved when re-generating from a fresh crawl
- FR-9: All prompt-building functions must read brand context from the guideline via `getBrandContext()`
- FR-10: The onboarding wizard must create both the `clients` record and the brand guideline in one flow
- FR-11: Client portal users must be able to view their brand guideline in read-only mode
- FR-12: System must support re-crawling and showing diffs against the existing guideline
- FR-13: System must extract product/service catalog from website pages
- FR-14: System must detect visual identity (logos, colors, fonts, design style) from CSS and images
- FR-15: System must analyze verbal identity (tone, messaging pillars, vocabulary) from page content
- FR-16: Brand DNA completeness must be tracked as a percentage per client
- FR-17: All clients created via Brand DNA must have `onboarded_via: 'brand_dna'` in their record

## Non-Goals (Out of Scope)

- No actual image generation (static ad mockups, social post images) — this PRD produces the guideline, not the campaign assets
- No AI-generated email copy, social posts, or ad frameworks — those are downstream tools that consume the guideline
- No Figma/Canva integration for design output
- No automated competitor crawling (only the client's own site)
- No social media account connection during onboarding (that stays in Connected Accounts)
- No automated scheduling or publishing
- No real-time website monitoring for brand changes (re-crawl is manual)
- No fixing of existing knowledge graph gaps unrelated to Brand DNA (another agent handles that)

## Technical Considerations

### New database objects
- New knowledge entry type: `brand_guideline` (add to type enum/validation)
- New column on `clients`: `onboarded_via TEXT DEFAULT 'manual'`
- New column on `clients`: `brand_dna_status TEXT DEFAULT 'none'` (values: `none`, `generating`, `draft`, `active`)
- Supabase Storage bucket: `brand-assets` for uploaded logos, screenshots, product images

### Key dependencies
- Existing website crawler (`lib/knowledge/scraper.ts`) — extend, don't replace
- Existing knowledge entry system (`client_knowledge_entries`) — new type, same table
- Existing brand profile generation (`lib/knowledge/brand-profile.ts`) — superseded by Brand DNA
- Cloudflare Browser Rendering or Playwright — for page screenshots and CSS extraction
- Supabase Storage — for file uploads and extracted images

### Integration points
- All prompt builders (`lib/prompts/`) must be updated to use `getBrandContext()`
- The `formatBrandPreferencesBlock()` function should read from guideline verbal identity
- Client onboarding flow (`components/onboard/`) gets a new wizard path
- Sidebar navigation gets "Brand DNA" item under each client

### Performance
- Website crawl should be async with progress updates (Server-Sent Events or polling)
- Brand guideline generation should complete within 90 seconds after crawl
- `getBrandContext()` result should be cached (5min TTL) to avoid repeated reads
- File uploads should be chunked for large PDFs

## Design Considerations

- Brand DNA page should feel like a premium, magazine-style brand board — not a form
- Each section as a card: visual identity card shows actual colors/fonts, product card shows images
- Use the dark theme with the brand's own colors as accents where possible
- The onboarding wizard should feel like onboarding to a product, not filling out a form
- Screenshots and product images should be displayed in a grid, not as a list of URLs
- The edit experience should be inline (click section to edit) not a separate edit page

## Success Metrics

- New client onboarding time reduced from 30+ minutes of manual form-filling to under 5 minutes (URL paste + review)
- Brand DNA completeness > 80% after initial crawl for sites with standard structure
- All downstream AI tools (search, ideas, pillars, scripts) produce more on-brand output (qualitative review)
- Zero regression in existing client profiles — backward compatible
- Client portal users can view their brand without admin explanation

## Open Questions

- Should Brand DNA auto-regenerate when the knowledge graph redesign lands, or should it be a manual trigger?
- Should we store extracted colors/fonts as a separate `brand_asset` knowledge entry or only within the guideline metadata?
- How should Brand DNA interact with the existing `preferences` field on `clients` — migrate preferences into the guideline, or keep both?
- For very large e-commerce sites (500+ products), should we cap product extraction or paginate?

---

# Implementation Stages

## Stage 1: Foundation — Database, Storage, and Brand Context Function

> Set up the data layer, storage bucket, new knowledge entry type, and the unified brand context function that all downstream tools will consume.

| # | Task | Description |
|---|------|-------------|
| 1.1 | Add `brand_guideline` knowledge entry type | Create migration adding `'brand_guideline'` to the allowed `type` values in `client_knowledge_entries`. Update `lib/knowledge/types.ts` to add the `BrandGuidelineMetadata` interface with fields: `colors: { hex: string; name: string; role: 'primary'|'secondary'|'accent'|'neutral' }[]`, `fonts: { family: string; role: 'display'|'body'|'mono'; weight?: string }[]`, `logos: { url: string; variant: 'primary'|'dark'|'light'|'icon' }[]`, `screenshots: { url: string; page: string; description: string }[]`, `products: { name: string; description: string; price?: string; imageUrl?: string; category?: string }[]`, `design_style: { theme: 'light'|'dark'; corners: 'rounded'|'sharp'; density: 'minimal'|'rich'; imagery: 'photo'|'illustration'|'mixed' }`, `generated_from: string[]`, `version: number`, `superseded_by?: string`. |
| 1.2 | Add client onboarding columns | Create migration adding `onboarded_via TEXT DEFAULT 'manual'` and `brand_dna_status TEXT DEFAULT 'none'` columns to the `clients` table. Add CHECK constraint: `brand_dna_status IN ('none', 'generating', 'draft', 'active')`. |
| 1.3 | Create `brand-assets` Supabase Storage bucket | Create migration or setup script for a `brand-assets` storage bucket. Configure RLS: authenticated users can read all, admins can write. Set up folder structure convention: `{client_id}/logos/`, `{client_id}/screenshots/`, `{client_id}/products/`, `{client_id}/uploads/`. |
| 1.4 | Build `getBrandContext()` function | Create `/lib/knowledge/brand-context.ts`. Function `getBrandContext(clientId: string)` queries `client_knowledge_entries` for the active `brand_guideline` (most recent, not superseded). If found, parse content + metadata into structured `BrandContext` type. If not found, fall back to reading raw `clients` table fields (backward compat). Return typed object with `overview`, `visualIdentity`, `verbalIdentity`, `products`, `audience`, `positioning`, `contentStyle`. |
| 1.5 | Add `toPromptBlock()` method to BrandContext | On the `BrandContext` return type, add a `toPromptBlock()` method that serializes the context into an XML-tagged string suitable for AI prompt injection. Exclude image URLs and binary data. Include: brand overview, tone of voice, messaging pillars, product names/descriptions, target audience, topics to avoid, competitor positioning. Format as `<brand_dna>...</brand_dna>` block. |
| 1.6 | Add `toFullContext()` method to BrandContext | Add `toFullContext()` method that returns the complete context including all image URLs, color hex codes, font names, screenshot URLs, product image URLs. This is for UI rendering, not for AI prompts. |
| 1.7 | Add in-memory cache for `getBrandContext()` | Wrap `getBrandContext()` with a per-client TTL cache (5 minute expiry). Use a simple `Map<string, { data: BrandContext; expiry: number }>` in module scope. Cache key is `clientId`. Invalidate on brand guideline update (export an `invalidateBrandContext(clientId)` function). |
| 1.8 | Create `BrandContext` TypeScript types | In `/lib/knowledge/brand-context.ts` or a separate types file, define the full `BrandContext` interface, `VisualIdentity`, `VerbalIdentity`, `ProductItem`, `AudienceProfile`, `DesignStyle` types. Ensure all fields are nullable (brand guideline may not have every section populated). |
| 1.9 | Wire `getBrandContext()` into `buildTopicResearchPrompt()` | Modify `/lib/prompts/topic-research.ts` to accept an optional `brandContext: BrandContext` parameter. When provided, use `brandContext.toPromptBlock()` as the brand context block instead of manually assembling from `clientContext` fields. Keep backward compat — if `brandContext` is null, use existing `clientContext` logic. |
| 1.10 | Wire `getBrandContext()` into `buildClientStrategyPrompt()` | Same as 1.9 but for `/lib/prompts/client-strategy.ts`. Replace manual context assembly with `brandContext.toPromptBlock()` when available. Include product catalog in client strategy prompt since it's especially relevant for brand analysis. |
| 1.11 | Wire `getBrandContext()` into idea generator | Modify `/lib/knowledge/idea-generator.ts` `generateVideoIdeas()` to call `getBrandContext(clientId)` and use `toPromptBlock()` in the system prompt. Replace the manual assembly of client fields, brand profile, knowledge entries, and preferences with the unified brand context. |
| 1.12 | Wire `getBrandContext()` into pillar generator | Modify `/api/clients/[id]/pillars/generate/route.ts` `processGeneration()` to call `getBrandContext(clientId)` and use `toPromptBlock()`. This fixes the existing gap where pillar generation ignores `preferences`. |

---

## Stage 2: Website Crawl Engine — Deep Extraction Pipeline

> Build the enhanced website crawler that extracts visual identity, verbal identity, and product catalog from a URL.

| # | Task | Description |
|---|------|-------------|
| 2.1 | Extend website crawler with visual extraction config | Modify `/lib/knowledge/scraper.ts` `crawlClientWebsite()` to accept an options object: `{ extractVisuals?: boolean; extractProducts?: boolean; maxPages?: number; captureScreenshots?: boolean }`. Default `maxPages` to 30. When `extractVisuals` is true, the crawler stores raw CSS and meta tags alongside page content. Keep existing behavior as default for backward compat. |
| 2.2 | Build CSS color palette extractor | Create `/lib/brand-dna/extract-colors.ts`. Function `extractColorPalette(pages: CrawledPage[])` scans CSS custom properties (`--color-*`, `--bg-*`, etc.), `background-color`, `color` declarations, and brand-related class names. Deduplicates, clusters similar colors, and assigns roles (primary = most frequent accent, secondary, neutral = background/text). Returns `BrandColor[]` array. Uses color-distance algorithm to avoid near-duplicates. |
| 2.3 | Build CSS font extractor | Create `/lib/brand-dna/extract-fonts.ts`. Function `extractFontFamilies(pages: CrawledPage[])` scans `font-family` declarations, `@import` and `<link>` tags for Google Fonts / custom fonts. Identifies role by usage context: `<h1-h3>` → display, `<p, body>` → body, `<code, pre>` → mono. Returns `BrandFont[]` array. |
| 2.4 | Build logo detection extractor | Create `/lib/brand-dna/extract-logos.ts`. Function `extractLogos(pages: CrawledPage[])` checks: `<link rel="icon">`, `<link rel="apple-touch-icon">`, OG image meta tags, `<img>` elements with `alt` containing "logo" or class/id containing "logo", `<header>` first image, and SVG elements in the header. Downloads detected logos to Supabase Storage `brand-assets/{clientId}/logos/`. Returns `BrandLogo[]` array with storage URLs and variant classifications. |
| 2.5 | Build page screenshot capture | Create `/lib/brand-dna/capture-screenshots.ts`. Function `capturePageScreenshots(urls: string[], clientId: string)` uses Cloudflare Browser Rendering (or Playwright fallback) to capture full-page screenshots of: homepage, about page, first product/service page, contact page, blog index. Stores screenshots in Supabase Storage `brand-assets/{clientId}/screenshots/`. Returns `BrandScreenshot[]` array. Captures at 1440px viewport width. |
| 2.6 | Build verbal identity analyzer | Create `/lib/brand-dna/analyze-verbal.ts`. Function `analyzeVerbalIdentity(pages: CrawledPage[])` sends homepage hero copy + about page + first 3 product descriptions to Claude. Prompt asks for: primary tone (1-2 words), voice attributes (5-7 characteristics), messaging pillars (3-5 themes), vocabulary patterns (frequent words/phrases), avoidance patterns (what the brand doesn't do), formality level (1-10 scale). Returns structured `VerbalIdentity` object. |
| 2.7 | Build product catalog extractor | Create `/lib/brand-dna/extract-products.ts`. Function `extractProductCatalog(pages: CrawledPage[], clientId: string)` uses AI to identify product/service pages from page content and navigation structure. For each product: extracts name, description (2-3 sentences), price if visible, primary image URL (downloaded to Storage). Groups into categories. Handles both e-commerce (many SKUs — cap at 50 most prominent) and service businesses (few offerings). Returns `ProductItem[]` array. |
| 2.8 | Build design style detector | Create `/lib/brand-dna/detect-design-style.ts`. Function `detectDesignStyle(pages: CrawledPage[], screenshots: BrandScreenshot[])` analyzes CSS for: border-radius values (→ rounded vs sharp), background colors (→ light vs dark theme), whitespace/padding ratios (→ minimal vs rich), image usage patterns (→ photo vs illustration). Returns `DesignStyle` object. Primarily CSS-driven with AI fallback for ambiguous cases. |
| 2.9 | Build orchestrator: `generateBrandDNA()` | Create `/lib/brand-dna/generate.ts`. Main function `generateBrandDNA(clientId: string, websiteUrl: string, options?: { uploadedFileIds?: string[] })` orchestrates the full pipeline: (1) crawl website, (2) extract colors/fonts/logos in parallel, (3) capture screenshots, (4) analyze verbal identity, (5) extract products, (6) detect design style, (7) compile all into Brand DNA document. Updates `clients.brand_dna_status` to `'generating'` at start, `'draft'` on completion, `'none'` on failure. Returns the created knowledge entry ID. |
| 2.10 | Build Brand DNA document compiler | Create `/lib/brand-dna/compile-document.ts`. Function `compileBrandDocument(data: BrandDNARawData)` takes all extracted data and generates the final markdown document via Claude. Prompt instructs: write a comprehensive brand guideline with sections for overview, visual identity, verbal identity, products, audience, positioning, content style. Includes inline image references. Also builds the metadata JSON sidecar. Returns `{ content: string; metadata: BrandGuidelineMetadata }`. |
| 2.11 | Add progress tracking for Brand DNA generation | Create a `brand_dna_jobs` table (migration) with columns: `id`, `client_id`, `status` (queued/crawling/extracting/analyzing/compiling/completed/failed), `progress_pct`, `step_label`, `error_message`, `created_at`, `completed_at`. The `generateBrandDNA()` orchestrator updates this table at each step. Clients poll `GET /api/clients/[id]/brand-dna/status` for progress. |
| 2.12 | Build file upload processor | Create `/lib/brand-dna/process-uploads.ts`. Function `processUploadedFiles(clientId: string, files: UploadedFile[])` handles: images → store in Storage + classify as logo/product/other, PDFs → extract text via pdf-parse or similar, DOCX → extract text, MD/TXT → import directly as knowledge entries. Returns structured data that feeds into `compileBrandDocument()` as supplementary context. |

---

## Stage 3: API Routes — Brand DNA CRUD and Generation Endpoints

> Build all the API routes for creating, reading, updating, and regenerating Brand DNA.

| # | Task | Description |
|---|------|-------------|
| 3.1 | `POST /api/clients/[id]/brand-dna/generate` | Create route that accepts `{ websiteUrl: string }` in body. Validates client exists and user is admin. Sets `brand_dna_status = 'generating'`. Creates a `brand_dna_jobs` record. Calls `generateBrandDNA()` via `after()` for background processing. Returns `{ jobId: string, status: 'generating' }`. Zod validation on input. |
| 3.2 | `GET /api/clients/[id]/brand-dna/status` | Create route that returns the latest `brand_dna_jobs` record for the client: `{ status, progress_pct, step_label, error_message }`. Used by the UI to poll generation progress. |
| 3.3 | `GET /api/clients/[id]/brand-dna` | Create route that returns the active brand guideline for a client. Reads from `client_knowledge_entries` where `type = 'brand_guideline'` and not superseded. Returns `{ content, metadata, created_at, updated_at, version }`. Returns 404 if no guideline exists. |
| 3.4 | `PATCH /api/clients/[id]/brand-dna` | Create route for updating brand guideline content. Accepts `{ content?: string, metadata?: Partial<BrandGuidelineMetadata>, section?: string, sectionContent?: string }`. If `section` is provided, updates only that section in the markdown. If `content` is provided, replaces the full document. Calls `invalidateBrandContext(clientId)` after update. Zod validation. |
| 3.5 | `POST /api/clients/[id]/brand-dna/refresh` | Create route that triggers a re-crawl and re-generation. Creates a new draft guideline from fresh data. Does NOT overwrite the active guideline — instead stores as a `brand_dna_draft` record. Returns the draft ID for diff comparison. |
| 3.6 | `GET /api/clients/[id]/brand-dna/diff` | Create route that compares the active guideline with the latest draft. Returns a section-by-section diff: `{ section: string, active: string, draft: string, changed: boolean }[]`. Used by the UI to show what changed on refresh. |
| 3.7 | `POST /api/clients/[id]/brand-dna/apply-draft` | Create route that applies selected sections from a draft to the active guideline. Accepts `{ sections: string[] }` — list of section names to update from the draft. Merges selected sections, keeps unselected sections from active. Supersedes the old active guideline, marks the draft as applied. |
| 3.8 | `POST /api/clients/[id]/brand-dna/upload` | Create route for file uploads. Accepts `multipart/form-data` with files. Validates file types (images, PDFs, DOCX, MD, TXT) and sizes (max 50MB each, max 20 files). Stores files in Supabase Storage. Creates `client_knowledge_entries` for each file with `source: 'uploaded'`. Returns array of created entry IDs. These can be passed to the generate route to include in guideline compilation. |
| 3.9 | `POST /api/clients/[id]/brand-dna/section/[section]/verify` | Create route that marks a section as "verified" by the admin. Stores `verified_at` and `verified_by` in the guideline metadata for that section. Used by the review UI to track which sections have been checked. |
| 3.10 | `GET /api/clients/[id]/brand-dna/versions` | Create route that returns version history for the brand guideline. Lists all `brand_guideline` entries for the client (including superseded ones) with `{ id, version, created_at, superseded_at }`. Used for version history UI. |
| 3.11 | Portal route: `GET /api/portal/brand-dna` | Create portal-scoped route that returns the active brand guideline for the authenticated portal user's organization. Scoped by `organization_id`. Returns same shape as admin route but with `readonly: true` flag. |
| 3.12 | Portal route: `POST /api/portal/brand-dna/feedback` | Create portal route for client feedback on brand guideline sections. Accepts `{ section: string, feedback: string, flagged_incorrect: boolean }`. Creates a notification for the admin team. Stores feedback as a `client_knowledge_entries` record with `type: 'note'` and `source: 'portal_feedback'` linked to the guideline. |

---

## Stage 4: Onboarding Wizard UI — The New Client Creation Flow

> Build the multi-step onboarding wizard that replaces the old "Add client" form with the Brand DNA generation experience.

| # | Task | Description |
|---|------|-------------|
| 4.1 | Create wizard shell component | Create `/components/brand-dna/onboard-wizard.tsx` — a multi-step modal/page component. 4 steps: (1) URL + name input, (2) Crawl progress, (3) Review Brand DNA, (4) Confirm + create. Use the existing `WizardShell` component from research wizard as a base. Dark theme with brand-accent colors. Step indicator at top (numbered circles with connecting lines). |
| 4.2 | Build Step 1: URL + name input | In the wizard, step 1 shows: client name input (required), website URL input (required, validated as URL), file upload dropzone (optional — drag-and-drop or click), list of uploaded files with remove buttons. "Start analysis" button triggers generation. Clean, centered layout with large inputs. URL input auto-detects and shows favicon next to it. |
| 4.3 | Build Step 2: Crawl progress visualization | After clicking "Start analysis", step 2 shows a progress visualization. Poll `/api/clients/[id]/brand-dna/status` every 2 seconds. Show: progress bar (0-100%), current step label ("Crawling website...", "Extracting colors and fonts...", "Analyzing tone of voice...", "Building product catalog...", "Compiling brand guideline..."), animated icons per step (check when done, spinner when active), estimated time remaining. Use the `EncryptedText` component for the step label reveal effect. |
| 4.4 | Build Step 3: Brand DNA review — section cards | Step 3 shows the generated Brand DNA as a grid of section cards. Each card shows: section icon + title, preview of content (first 3 lines), verification status (unverified/verified), edit button, images/colors where applicable. Cards: Brand Overview, Visual Identity (shows color swatches + font names), Verbal Identity (shows tone + pillars), Products (shows product grid with images), Target Audience, Competitive Positioning, Content Style Guide. |
| 4.5 | Build Visual Identity card with live previews | The Visual Identity section card renders: color swatches as actual colored circles with hex code labels, font family names with sample text rendered in that font (if Google Font, load it), logo images in a row, design style badges (e.g., "Dark theme", "Rounded corners", "Photo-heavy"). This card is the most visual — it should look like a mini brand board. |
| 4.6 | Build Product Catalog card with image grid | The Products section card renders: a 2-3 column grid of product cards, each showing product image (if extracted), product name, short description, price if available. "Show all" expandable if > 6 products. Empty state: "No products detected — add manually or upload a product catalog." |
| 4.7 | Build section editor modal | When admin clicks "Edit" on any section card, open a modal with: section title, markdown editor (use existing editor component or `textarea` with preview toggle), live preview pane showing rendered markdown, "Save" and "Cancel" buttons. For Visual Identity, also show color picker for editing individual colors and a font selector. Save calls `PATCH /api/clients/[id]/brand-dna` with the section content. |
| 4.8 | Build Step 4: Confirm + create client | Step 4 shows a summary: client name, website URL, Brand DNA completeness percentage, number of products found, number of pages crawled, list of uploaded files. "Create client" button creates the `clients` record (via existing API) with `onboarded_via: 'brand_dna'` and `brand_dna_status: 'active'`, then redirects to the client's profile page. Back button returns to step 3 for more edits. |
| 4.9 | Update "Add client" entry point | Modify the admin sidebar or clients page "Add client" button to open the new Brand DNA onboarding wizard instead of the old form. Keep the old form accessible via a "Quick add (manual)" link for cases where a URL isn't available. Route: `/admin/clients/new` renders the onboarding wizard. |
| 4.10 | Build file upload dropzone component | Create `/components/brand-dna/file-dropzone.tsx` — a reusable drag-and-drop file upload area. Accepts: images, PDFs, DOCX, MD, TXT. Shows file thumbnails for images, file icons for documents. Shows upload progress per file. Validates file type and size before upload. Calls `/api/clients/[id]/brand-dna/upload` for each file. Returns array of uploaded entry IDs. |
| 4.11 | Build Brand DNA completeness indicator | Create `/components/brand-dna/completeness-badge.tsx`. Reads the brand guideline metadata and calculates completeness: each section (7 total) is either present (has content > 50 chars) or missing. Shows as a circular progress badge: "85% complete" with a ring indicator. Used in both the onboarding wizard and the client profile page. Colors: green > 80%, amber 50-80%, red < 50%. |
| 4.12 | Handle error states in onboarding | Build error handling for: crawl failure (site unreachable, blocked by robots.txt, timeout), generation failure (AI error), partial extraction (some sections couldn't be filled). Show clear error messages with retry options. Allow admin to proceed with partial Brand DNA and fill gaps manually. Never block client creation on a failed crawl. |

---

## Stage 5: Brand DNA Profile Page, Portal View, and Integration Polish

> Build the standalone Brand DNA page for existing clients, the portal read-only view, and polish all integration points.

| # | Task | Description |
|---|------|-------------|
| 5.1 | Build admin Brand DNA page | Create `/app/admin/clients/[slug]/brand-dna/page.tsx` — the full Brand DNA view for existing clients. Shows the same section cards as the onboarding wizard step 3, but with additional controls: "Refresh" button (triggers re-crawl), "Upload files" button, version history dropdown, completeness badge, last-updated timestamp. If no Brand DNA exists, shows a CTA: "Generate Brand DNA" with URL input. |
| 5.2 | Add Brand DNA link to client sidebar/navigation | Add "Brand DNA" link to the client sub-navigation (wherever client tabs/links are: profile, knowledge, analytics, affiliates). Show a small completeness badge next to the link. If Brand DNA doesn't exist, show "(not set up)" in muted text. |
| 5.3 | Build re-crawl diff review UI | When admin clicks "Refresh" on the Brand DNA page, show a split/diff view per section after the re-crawl completes. Left side: current active content. Right side: newly generated content. Changed sections highlighted. Admin can check/uncheck sections to accept or reject changes. "Apply selected changes" button calls `/api/clients/[id]/brand-dna/apply-draft`. |
| 5.4 | Build version history panel | Slide-out panel or modal showing all previous versions of the Brand DNA. Each version shows: version number, creation date, who generated it, whether it was superseded or applied. Click a version to view its content in read-only mode. "Restore this version" button sets it as active and supersedes the current one. |
| 5.5 | Build portal Brand DNA view | Create `/app/portal/brand/page.tsx` — read-only Brand DNA view for client portal users. Shows all section cards without edit buttons. Each section has a "Leave feedback" button that opens a small textarea + "Flag as incorrect" checkbox. Feedback calls `/api/portal/brand-dna/feedback`. Clean, polished layout — this is what the client sees of their brand in Cortex. |
| 5.6 | Build portal feedback notification | When a portal user submits feedback or flags a section, create a notification for admin users: "Client feedback on Brand DNA — [Client Name] flagged [Section] as incorrect". Link goes to the admin Brand DNA page scrolled to that section. Show the feedback text inline on the admin view. |
| 5.7 | Update existing client profile form | Add a "Brand DNA" section to the existing client profile form (`components/clients/client-profile-form.tsx`). If Brand DNA exists: show completeness badge + "View Brand DNA" link. If not: show "Generate Brand DNA" button with URL input inline. Don't remove existing fields — they serve as fallback for clients without Brand DNA. |
| 5.8 | Backward compatibility testing | Verify all existing flows work for clients WITHOUT Brand DNA: topic search, client strategy search, idea generation, pillar generation, strategy generation. The `getBrandContext()` function must gracefully fall back to raw client fields. Write or verify integration tests for each prompt builder with and without brand guideline. |
| 5.9 | Update search processing routes to use `getBrandContext()` | Modify both `/api/search/route.ts` and `/api/search/[id]/process/route.ts` to call `getBrandContext(clientId)` when a client is attached. Pass `brandContext.toPromptBlock()` to the prompt builders. This replaces the manual context assembly in both routes, unifying them. Remove the duplicated knowledge entry fetching logic from both routes — `getBrandContext()` handles it. |
| 5.10 | Performance optimization: cache Brand DNA in search flow | In the search processing flow, `getBrandContext()` is called once per search. Verify the 5-minute cache works correctly under concurrent searches for the same client. Add cache hit/miss logging. Ensure `invalidateBrandContext()` is called after any brand guideline update (PATCH, apply-draft, new generation). |
| 5.11 | Add Brand DNA status to admin dashboard | On the admin dashboard or clients list page, show Brand DNA status for each client: green dot = active, amber = draft, gray = none. Add a "Clients without Brand DNA" filter to help admins identify clients that need onboarding. |
| 5.12 | Migration path for existing clients | Create a one-time utility or admin action: "Generate Brand DNA for existing client" that takes an existing client's `website_url` and generates a Brand DNA, pre-populating the guideline with any existing client fields (industry, target_audience, brand_voice, etc.) so nothing is lost. This is NOT automatic — admin triggers it per client. |
