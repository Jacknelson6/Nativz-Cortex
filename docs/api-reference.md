# Nativz Cortex — API Reference

> **For AI agents:** This document describes every API endpoint that exists on disk. Auto-generated from `app/api/**/route.ts` by `scripts/generate-api-docs.ts` — do not edit by hand. Re-run the script after adding/removing routes or tweaking a JSDoc block.

**639 endpoints across 32 sections.**

## Authentication

Three distinct auth patterns are used:

- **Supabase session cookie** — the default for admin + portal routes. Read via `createServerSupabaseClient()` / `supabase.auth.getUser()`.
- **API key (Bearer token)** — `/api/v1/*` and other external-agent endpoints. Validated via `validateApiKey(request)`.
- **Shared-link token** — `/api/shared/*` and read-only public surfaces. Token is in the path.

---

## Auth & Account

_Authentication, session, profile, avatar upload, impersonation._

### `PATCH /api/account`

Update the authenticated user's profile. Can update display name, avatar URL, job title, and/or password. Password changes go through Supabase Auth; profile fields are updated in the users table.

**Auth:** Required (any authenticated user)

**Body:**

```
full_name - Updated display name
avatar_url - Updated avatar URL (nullable)
job_title - Updated job title (nullable)
password - New password (min 6 chars)
```

**Returns:**

```
{{ success: true }}
```

### `DELETE /api/account/delete`

Permanently delete the authenticated user's account and associated data. Removes: user profile from `users` table, auth account from Supabase Auth. Does NOT cascade-delete client data (clients belong to the org, not the user). SOC 2 P6.1 — Right to Erasure

**Auth:** Required (any authenticated user)

**Body:**

```
{ confirmation: "DELETE MY ACCOUNT" } — required safety phrase
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/account/sidebar-preferences`

### `PATCH /api/account/sidebar-preferences`

### `POST /api/account/upload-avatar`

Upload a profile avatar image to Supabase Storage (client-logos bucket). Accepts JPEG, PNG, or WebP images up to 2 MB. Returns the public URL of the uploaded file.

**Auth:** Required (any authenticated user)

**Body:**

```
file - Image file (multipart/form-data; JPEG | PNG | WebP; max 2 MB)
```

**Returns:**

```
{{ url: string }} Public URL of the uploaded avatar
```

### `POST /api/auth/forgot-password`

Server-side password reset that bypasses Supabase's built-in email. Uses admin.auth.admin.generateLink() to create the recovery URL, then sends the email directly via Resend.

### `POST /api/auth/logout`

Sign out the current user via Supabase Auth. Always redirects to the unified login page at /login.

**Auth:** None required (no-op if not authenticated)

**Returns:**

```
{{ redirectTo: string }} Redirect path for the client to navigate to
```

### `POST /api/auth/send-email`

### `DELETE /api/impersonate`

### `POST /api/impersonate`

### `GET /api/impersonate/status`

---

## API Keys

_Create, list, and revoke API keys for external access._

### `GET /api/api-keys`

List all API keys for the authenticated user. Returns key metadata but NOT the actual plaintext key (which is only shown once at creation time).

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ keys: ApiKey[] }} Array of API key metadata records
```

### `POST /api/api-keys`

Create a new API key for the authenticated user. Generates a secure random key, stores only a bcrypt hash and prefix in the database, and returns the plaintext key once — it cannot be recovered later.

**Auth:** Required (any authenticated user)

**Body:**

```
name - Human-readable key name (required, max 100 chars)
scopes - Array of allowed scope strings (tasks | clients | shoots | scheduler | search | team | calendar; at least one required)
expires_at - Optional ISO datetime for key expiration
```

**Returns:**

```
{{ key: ApiKey & { plaintext: string } }} Key metadata plus the one-time plaintext (201)
```

### `DELETE /api/api-keys/:id`

Revoke or permanently delete an API key. Only the key's owner can perform this action. By default, sets is_active=false (revoke). Pass permanent=true to hard-delete the record.

**Auth:** Required (key owner only)

**Query params:**

```
id - API key UUID
permanent - If 'true', permanently delete the record; otherwise just revoke (default: false)
```

**Returns:**

```
{{ revoked: true } | { deleted: true }}
```

---

## Search & Research

_Topic research pipeline — start searches, process results, share findings._

### `POST /api/history/shorten-titles`

Batch-shorten long history titles for the UI (max 50 characters each) via LLM. Falls back to mechanical truncation for any id the model omits.

**Auth:** Required

### `GET /api/research/folders`

### `POST /api/research/folders`

### `DELETE /api/research/folders/:id`

### `PATCH /api/research/folders/:id`

### `DELETE /api/research/folders/:id/items`

### `GET /api/research/folders/:id/items`

### `POST /api/research/folders/:id/items`

### `GET /api/research/history`

Fetch paginated research history items (topic searches, idea generations, etc.). Supports cursor-based pagination.

**Auth:** Required (any authenticated user)

**Query params:**

```
limit - Number of items to return (default: 20, max: 50)
type - Filter by item type (HistoryItemType)
client_id - Filter by client UUID
cursor - Pagination cursor (ISO datetime of last item's created_at)
include_ideas - Set to "false" to omit idea generations when `type` is omitted (topic search sidebar)
```

**Returns:**

```
{{ items: HistoryItem[] }}
```

### `DELETE /api/search/:id`

Topic searches admins may delete (includes stuck in-flight rows; completed stays protected). */ const DELETABLE_TOPIC_SEARCH_STATUSES = new Set([ 'failed', 'pending_subtopics', 'pending', 'processing', 'completed', ]); /** DELETE /api/search/[id] Permanently delete a topic search record. Allowed when the search is **failed**, stuck in **pending_subtopics**, stuck **pending** / **processing**, or otherwise safe to remove. **Completed** rows stay protected.

**Auth:** Required (admin)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/search/:id`

Fetch a single topic search record by ID including all results, metrics, and SERP data.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{TopicSearch} Full search record
```

### `PATCH /api/search/:id`

- **Rename:** `{ query: string }` — update the topic search title (1–500 chars). Admin only. - **Approve / reject:** `{ action: 'approve' | 'reject' }` — portal visibility for the report. Do not send `query` and `action` in the same request.

**Auth:** Required (admin)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
Rename: `{ success: true, query }` · Approve/reject: `{ success: true, action }`
```

### `POST /api/search/:id/expand`

Generate related/expanded topic suggestions from a completed search. Uses the search query, trending topics, and AI summary to suggest adjacent research directions.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{ suggestions: { topic, angle, searchQuery }[] }
```

### `POST /api/search/:id/explain-emotion`

AI explanation for why a given emotion appears in the research mix.

**Auth:** Required (signed-in user)

**Body:**

```
emotion — Must match an emotion label from this search’s emotions array
```

### `POST /api/search/:id/generate-ideas`

Match UI topic name to stored topic (trim + case-insensitive; then loose substring). Strict equality failed when models or copy edits introduced invisible whitespace drift. / function findTopicIndex(topics: TrendingTopic[], topicName: string): number { const want = topicName.trim().toLowerCase(); const exact = topics.findIndex((t) => t.name.trim().toLowerCase() === want); if (exact >= 0) return exact; return topics.findIndex( (t) => { const n = t.name.trim().toLowerCase(); return n.includes(want) || want.includes(n); }, ); } /** Parse `{ "ideas": [...] }` from model output; fall back to array slice if JSON is noisy. / function parseIdeasFromCompletion(text: string): VideoIdea[] { try { const parsed = parseAIResponseJSON<{ ideas: VideoIdea[] }>(text); return parsed.ideas ?? []; } catch { const key = '"ideas"'; const idx = text.indexOf(key); if (idx === -1) return []; const bracket = text.indexOf('[', idx); if (bracket === -1) return []; let depth = 0; let end = -1; for (let i = bracket; i < text.length; i++) { const c = text[i]; if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { end = i; break; } } } if (end === -1) return []; try { const arr = JSON.parse(text.slice(bracket, end + 1)) as unknown[]; return arr.filter((x): x is VideoIdea => Boolean(x && typeof x === 'object' && 'title' in x && typeof (x as VideoIdea).title === 'string'), ); } catch { return []; } } } const requestSchema = z.object({ topic_name: z.string().min(1), existing_ideas: z.array(z.string()).default([]), }); /** POST /api/search/[id]/generate-ideas Generate 4 additional video ideas for a specific trending topic within a search. Avoids duplicating any existing ideas provided in the request. Appends the new ideas to the search's raw_ai_response for the matching topic.

**Auth:** Required (any authenticated user)

**Body:**

```
topic_name - Name of the trending topic to generate ideas for (required)
existing_ideas - Array of existing idea titles to avoid repeating (default: [])
```

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{{ ideas: VideoIdea[] }} 4 new video ideas
```

### `POST /api/search/:id/notify`

### `POST /api/search/:id/plan-subtopics`

Propose up to 10 keyword phrases for the research gameplan (llm_v1 pipeline only).

### `POST /api/search/:id/process`

Vercel Pro / Fluid can use 800s — heavy multi-platform runs often exceed 5 minutes. */ export const maxDuration = 800; /** How long a processing lease is considered active before another worker may reclaim (ms). */ const PROCESS_LEASE_MS = 15 * 60 * 1000; /** POST /api/search/[id]/process Research pipeline: 1. Plan subtopics from the user query 2. Research each subtopic in parallel (SearXNG SERP + LLM synthesis) 3. Merge subtopic reports into final output (topics, emotions, breakdowns) 4. Normalize + validate with Zod 5. Save results

**Auth:** Required — checks user access to the search

**Body:**

```
None (search ID from URL)
```

**Returns:**

```
{ status: 'completed' | 'processing' } or error
```

### `DELETE /api/search/:id/share`

Revoke the public share link for a search by deleting all share records.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{{ shared: false }}
```

### `GET /api/search/:id/share`

Check if a search has an active share link and return its details.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Topic search UUID
```

**Returns:**

```
{{ shared: false } | { shared: true, token: string, url: string, expires_at: string | null }}
```

### `POST /api/search/:id/share`

Create a new public share link for a completed search. Deletes any existing links before generating a fresh 48-char hex token.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Topic search UUID (must be in 'completed' status)
```

**Returns:**

```
{{ shared: true, token: string, url: string }}
```

### `POST /api/search/:id/sources/extract-frames`

FFmpeg keyframes + vision clip breakdown for a TikTok source on this search (persisted).

### `POST /api/search/:id/sources/insights`

AI hook + frame breakdown for a platform source (uses transcript).

### `POST /api/search/:id/sources/rescript`

Brand rescript of a topic-search platform source transcript. Uses search.client_id when body client_id is omitted and the search has a client.

### `POST /api/search/:id/sources/transcribe`

Fetch transcript (+ segments for TikTok) for a topic-search video source and persist on the search row.

### `GET /api/search/:id/steps`

Returns the current pipeline_state.steps array for real-time stepper UI.

### `PATCH /api/search/:id/subtopics`

When true, move to processing so /process can run */ start_processing: z.boolean().optional(), /** Minimum view count filter for video scraping */ minViews: z.number().int().min(0).optional(), /** Time range filter — accepts both platform-native (today, week, month, year) and app-level (last_7_days, etc.) values */ timeRange: z.string().max(50).optional(), }); /** PATCH /api/search/[id]/subtopics Save confirmed subtopics; optionally mark ready for POST /process.

### `GET /api/search/:id/videos`

Returns scraped videos and hook patterns for a topic search. Query params: sort=views|outlier_score|recent, platform=tiktok|youtube|instagram, token=<share_token>

### `GET /api/search/platforms`

Returns which search platforms are configured (have valid API keys). Used by the search form to show availability indicators.

### `POST /api/search/start`

Per-platform volumes are NOT part of the request anymore. They come from `scraper_settings` (admin UI at /admin/settings/ai). The legacy `volume` field is accepted and ignored for clients still sending it. / const searchSchema = z.object({ query: z.string().min(1, 'Search query is required').max(500), source: z.string().default('all'), time_range: z.string().default('last_3_months'), language: z.string().default('all'), country: z.string().default('us'), client_id: z.string().uuid().nullable().optional(), search_mode: z.enum(['general', 'client_strategy']).default('general'), platforms: z.array(z.enum(['web', 'reddit', 'youtube', 'tiktok'])).default(['web']), // Accepted but unused — kept so existing clients don't 400. Remove once // all callers (internal UI + any seed scripts) stop sending it. volume: z.string().optional(), }); /** POST /api/search/start Create a new topic search record with status 'processing' and return its ID immediately, without running the AI pipeline. Intended for streaming/async UX patterns where the actual search processing is triggered separately via /api/search/[id]/process.

**Auth:** Required (any authenticated user)

**Body:**

```
query - Search query string (required, max 500 chars)
source - Content source filter (default: 'all')
time_range - Time range filter (default: 'last_3_months')
language - Language filter (default: 'all')
country - Country filter (default: 'us')
client_id - Optional client UUID
search_mode - Search mode ('general' | 'client_strategy', default: 'general')
```

**Returns:**

```
{{ id: string }} UUID of the newly created search record
```

### `POST /api/search/suggest-topics`

### `POST /api/topic-plans`

### `GET /api/topic-plans/:id`

### `GET /api/topic-plans/:id/docx`

### `GET /api/topic-plans/:id/pdf`

---

## Clients & Onboarding

_Client CRUD, onboarding, URL analysis, contacts, assignments._

### `GET /api/clients`

List all clients. Admins see all clients; portal users (viewers) see only active clients belonging to their organization.

**Auth:** Required (admin or viewer)

**Returns:**

```
{Client[]} Array of client records
```

### `POST /api/clients`

Create a new client. Sets default feature flags (can_search, can_view_reports). The slug must be unique across all clients.

**Auth:** Required (admin)

**Body:**

```
name - Client display name (required)
slug - URL-safe unique identifier, lowercase alphanumeric with hyphens (required)
industry - Client industry (required)
organization_id - Organization UUID; defaults to creator's organization
target_audience - Description of target audience
brand_voice - Brand voice description
topic_keywords - Array of topic keyword strings
logo_url - URL to client logo image
website_url - Client website URL
```

**Returns:**

```
{Client} Created client record (201)
```

### `DELETE /api/clients/:id`

Permanently delete a client and related rows (moodboards, todos, searches, ideas, strategies, invites, shoot events when present, then client). Also removes the client folder from the Obsidian vault (non-blocking).

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/clients/:id`

Fetch a single client's full profile including portal contacts and strategy. Supports lookup by UUID or slug.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID or slug
```

**Returns:**

```
{{ client: Client, portalContacts: User[], strategy: ClientStrategy | null }}
```

### `PATCH /api/clients/:id`

Update allowed client fields. After update, syncs the client profile to the Obsidian vault (non-blocking). Only a specific whitelist of fields can be updated.

**Auth:** Required (admin)

**Body:**

```
industry - Updated industry
target_audience - Updated target audience description
brand_voice - Updated brand voice description
topic_keywords - Updated topic keywords array
feature_flags - Updated feature flag object
is_active - Active/inactive status
logo_url - Updated logo URL
website_url - Updated website URL
description - Client description
services - Array of service strings
health_score - Health score value
agency - Agency name
google_drive_branding_url - Google Drive branding folder URL
google_drive_calendars_url - Google Drive calendars folder URL
monthly_boosting_budget - Monthly ad boosting budget
preferences - Client preferences object
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{Client} Updated client record
```

### `GET /api/clients/:id/analytics/summary`

Rollup for the client Overview page. One call; tiles render in parallel with no further round-trips. Sections: - social connected platforms + posts/30d - affiliate 30d revenue/referrals (if UpPromote connected) - benchmarking followers + delta + competitor count - paidMedia null until backend lands - pipeline ideas awaiting / scheduled in 14d / days since last post - activity last 5 events (ideas, posts, searches) Auth: admin sees all; viewer must have user_client_access for the client.

### `GET /api/clients/:id/assignments`

List all team member assignments for a client, ordered by lead status (leads first). Each assignment includes the full team member record.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{ClientAssignment[]} Array of assignments with team_member relation
```

### `POST /api/clients/:id/assignments`

Assign a team member to a client with an optional role and lead designation.

**Auth:** Required (admin)

**Body:**

```
team_member_id - Team member UUID to assign (required)
role - Role/responsibility on this client account (max 100 chars)
is_lead - Whether this is a lead assignment (default: false)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{ClientAssignment} Created assignment with team_member relation (201)
```

### `DELETE /api/clients/:id/assignments/:assignmentId`

Remove a team member assignment from a client. Validates that the assignment belongs to the specified client before deleting.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
assignmentId - Assignment UUID to remove
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/clients/:id/brand-dna`

Return the active brand guideline for a client.

**Auth:** Required

**Returns:**

```
{{ content, metadata, created_at, updated_at, version, id }}
```

### `PATCH /api/clients/:id/brand-dna`

Update the active brand guideline. Can update full content, metadata, or a single section.

**Auth:** Required (admin)

**Body:**

```
content - Full markdown replacement
metadata - Partial metadata merge
section - Section heading to update (e.g., "Visual identity")
sectionContent - New content for the specified section
```

### `POST /api/clients/:id/brand-dna/abort-stuck`

Mark the latest in-flight Brand DNA job as failed and clear `clients.brand_dna_status` from `generating` so the user can start again. By default only allowed when the job looks stale (no row updates for BRAND_DNA_JOB_STALE_MS).

**Auth:** Required (admin)

### `POST /api/clients/:id/brand-dna/apply-draft`

Apply selected sections from the latest draft to the active guideline. Merges chosen sections from the newest version into the previous active version.

**Auth:** Required (admin)

**Body:**

```
sections - Array of section headings to accept from the draft
```

### `GET /api/clients/:id/brand-dna/diff`

Compare the two most recent brand guidelines (active vs previous) section by section.

**Auth:** Required

**Returns:**

```
{{ sections: { heading, active, previous, changed }[] }}
```

### `POST /api/clients/:id/brand-dna/generate`

Kick off Brand DNA generation for a client. Creates a job record and processes in background.

**Auth:** Required (admin)

**Body:**

```
websiteUrl - URL to crawl
uploadedContent - Optional text from uploaded files
```

**Returns:**

```
{{ jobId: string, status: 'generating' }}
```

### `POST /api/clients/:id/brand-dna/refresh`

Re-crawl and re-generate Brand DNA. Creates a new draft without overwriting the active guideline. The active guideline stays untouched until the admin applies the draft via /apply-draft.

**Auth:** Required (admin)

**Returns:**

```
{{ jobId: string, status: 'generating' }}
```

### `POST /api/clients/:id/brand-dna/section/:section/verify`

Mark a Brand DNA section as verified by the admin.

**Auth:** Required (admin)

**Query params:**

```
section - Section heading (URL-encoded)
```

### `GET /api/clients/:id/brand-dna/status`

Poll the latest Brand DNA generation job status for a client.

**Auth:** Required

**Returns:**

```
{{ status, progress_pct, step_label, error_message, is_stale?, stale_hint? }}
```

### `POST /api/clients/:id/brand-dna/upload`

Large image batches (up to 40 × storage + DB) can exceed 60s on cold starts. */ export const maxDuration = 120; /** POST /api/clients/[id]/brand-dna/upload Upload files (images, PDFs, docs, markdown) for Brand DNA enrichment. Files are stored in Supabase Storage and created as knowledge entries.

**Auth:** Required (admin)

**Body:**

```
multipart/form-data with files
```

**Returns:**

```
{{ entryIds: string[], textContent: string }}
```

### `GET /api/clients/:id/brand-dna/versions`

Return version history for the brand guideline.

**Auth:** Required

**Returns:**

```
{{ versions: { id, version, created_at, superseded_by }[] }}
```

### `POST /api/clients/:id/brand-essence/generate`

Generate tagline / value proposition / mission statement from existing brand data. Does NOT save — returns suggestions. Admin picks what to keep and PATCHes via /api/clients/[id]/brand-profile.

### `GET /api/clients/:id/brand-profile`

Return all the brand-profile fields in one shot. Readable by admins and viewers scoped to the client.

### `PATCH /api/clients/:id/brand-profile`

Update one or many brand-profile fields. Only fields included in the body get updated — omit to leave untouched, pass null to clear.

**Auth:** Admin only.

### `GET /api/clients/:id/contacts`

List all contacts for a client, ordered by primary status (primary first) then name.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{Contact[]} Array of contact records
```

### `POST /api/clients/:id/contacts`

Create a new contact for a client. If the contact is marked as primary, any existing primary contact for the client is first demoted.

**Auth:** Required (admin)

**Body:**

```
name - Contact name (required, max 200 chars)
email - Contact email
phone - Contact phone (max 50 chars)
role - Contact role/job title (max 100 chars)
project_role - Contact's role on the project (max 100 chars)
avatar_url - Contact avatar URL
is_primary - Whether this is the primary contact (default: false)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{Contact} Created contact record (201)
```

### `DELETE /api/clients/:id/contacts/:contactId`

Permanently delete a contact from a client.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
contactId - Contact UUID to delete
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/clients/:id/contacts/:contactId`

Update a contact's details for a client. If is_primary is set to true, demotes any existing primary contact first.

**Auth:** Required (admin)

**Body:**

```
name - Optional contact name
email - Optional email (nullable)
phone - Optional phone (nullable)
role - Optional job title (nullable)
project_role - Optional project role (nullable)
avatar_url - Optional avatar URL (nullable)
is_primary - Optional: if true, demotes existing primary contact
```

**Query params:**

```
id - Client UUID
contactId - Contact UUID
```

**Returns:**

```
{Contact} Updated contact record
```

### `GET /api/clients/:id/contracts`

### `POST /api/clients/:id/contracts`

### `DELETE /api/clients/:id/contracts/:contractId`

### `PATCH /api/clients/:id/contracts/:contractId`

### `POST /api/clients/:id/contracts/:contractId/confirm`

### `PATCH /api/clients/:id/contracts/:contractId/external`

### `GET /api/clients/:id/contracts/:contractId/signed-url`

### `GET /api/clients/:id/knowledge`

List knowledge base entries for a client, optionally filtered by type.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
type - Filter by entry type (brand_asset | brand_profile | document | web_page | note | idea | meeting_note)
```

**Returns:**

```
{{ entries: KnowledgeEntry[] }}
```

### `POST /api/clients/:id/knowledge`

Create a new knowledge base entry for a client. Entries are embedded for semantic search automatically via the createKnowledgeEntry helper.

**Auth:** Required (admin)

**Body:**

```
type - Entry type (brand_asset | brand_profile | document | web_page | note | idea | meeting_note)
title - Entry title (required)
content - Entry content (default: '')
metadata - Additional metadata key-value pairs
source - How the entry was created (manual | scraped | generated | imported, default: manual)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }} Created knowledge entry (201)
```

### `DELETE /api/clients/:id/knowledge/:entryId`

Permanently delete a knowledge entry and its embedding.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
entryId - Knowledge entry UUID to delete
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/clients/:id/knowledge/:entryId`

Fetch a single knowledge entry by ID, scoped to the specified client.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
entryId - Knowledge entry UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }}
```

### `PATCH /api/clients/:id/knowledge/:entryId`

Update a knowledge entry's title, content, or metadata. Also re-generates the embedding on update (handled by updateKnowledgeEntry).

**Auth:** Required (admin)

**Body:**

```
title - Optional new title
content - Optional new content
metadata - Optional metadata object
```

**Query params:**

```
id - Client UUID
entryId - Knowledge entry UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }}
```

### `POST /api/clients/:id/knowledge/:entryId/decompose`

Re-run meeting decomposition for a `meeting` or `meeting_note` entry (creates decision + action_item nodes and `produced` links). Idempotent-friendly: may create duplicates if run repeatedly — prefer fresh meetings or dedupe in UI.

### `POST /api/clients/:id/knowledge/brand-profile`

Generate (or regenerate) a brand profile knowledge entry for the client using AI. Aggregates existing knowledge entries and client data to produce a structured profile.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }} The created or updated brand profile entry
```

### `POST /api/clients/:id/knowledge/generate-ideas`

Generate AI video ideas for a client based on their knowledge base, brand profile, and an optional concept prompt.

**Auth:** Required (any authenticated user)

**Body:**

```
concept - Optional concept or theme to focus ideas around
count - Number of ideas to generate (default: 10, min: 1, max: 50)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ ideas: VideoIdea[] }}
```

### `GET /api/clients/:id/knowledge/graph`

Fetch the knowledge graph for a client — nodes (entries, contacts, searches) and edges (knowledge links) for visualization in the knowledge graph UI.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ nodes: GraphNode[], edges: GraphEdge[] }}
```

### `POST /api/clients/:id/knowledge/import-meeting`

Import a meeting transcript as a structured knowledge entry for a client. Uses AI to extract key information, action items, and entities from the transcript, then creates a `meeting` entry plus extracted `decision` / `action_item` nodes (with `produced` links).

**Auth:** Required (any authenticated user)

**Body:**

```
transcript - Raw meeting transcript text (required)
meetingDate - Optional ISO date string for the meeting
attendees - Optional array of attendee names
source - Optional source label (e.g. 'zoom', 'google_meet')
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{KnowledgeEntry} The created knowledge entry
```

### `DELETE /api/clients/:id/knowledge/links`

Permanently delete a knowledge link by its ID.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
id - Knowledge link UUID to delete (required)
```

**Returns:**

```
{{ success: true }}
```

### `POST /api/clients/:id/knowledge/links`

Create a directional knowledge link between two entities within a client's knowledge graph. Links connect entries, contacts, searches, strategies, or idea submissions.

**Auth:** Required (admin)

**Body:**

```
source_id - UUID of the source entity (required)
source_type - Type of the source: 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission'
target_id - UUID of the target entity (required)
target_type - Type of the target: 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission'
label - Relationship label (default: 'related_to')
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ link: KnowledgeLink }} Created link record (201)
```

### `POST /api/clients/:id/knowledge/scrape`

Crawl the client's website and create web_page knowledge entries for each discovered page. Respects the client's configured website_url. Returns 409 if a crawl is already in progress.

**Auth:** Required (admin)

**Body:**

```
maxPages - Max pages to crawl (default: 50, max: 100)
maxDepth - Max link depth to follow (default: 3, max: 5)
```

**Query params:**

```
id - Client UUID (client must have website_url set)
```

**Returns:**

```
{{ message: string, count: number }}
```

### `GET /api/clients/:id/monthly-gift-ads/settings`

### `PATCH /api/clients/:id/monthly-gift-ads/settings`

### `GET /api/clients/:id/pillars`

List all content pillars for a client, ordered by sort_order ascending.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ pillars: ContentPillar[] }}
```

### `POST /api/clients/:id/pillars`

Create a new content pillar for a client. The sort_order is automatically set to append at the end of the existing pillars list.

**Auth:** Required (any authenticated user)

**Body:**

```
name - Pillar name (required)
description - Pillar description
emoji - Emoji icon for the pillar
example_series - Array of example series/show names
formats - Array of video format strings
hooks - Array of hook/angle strings
frequency - Posting frequency suggestion
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ pillar: ContentPillar }} Created pillar record
```

### `DELETE /api/clients/:id/pillars/:pillarId`

Permanently delete a content pillar for a client.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
pillarId - Content pillar UUID to delete
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/clients/:id/pillars/:pillarId`

Update a content pillar's details. Any combination of fields may be provided.

**Auth:** Required (any authenticated user)

**Body:**

```
name - Optional pillar name
description - Optional description
emoji - Optional single emoji
example_series - Optional array of recurring series names
formats - Optional array of content format strings
hooks - Optional array of opening-line hooks
frequency - Optional posting frequency description
sort_order - Optional integer sort order
```

**Query params:**

```
id - Client UUID
pillarId - Content pillar UUID
```

**Returns:**

```
{{ pillar: ContentPillar }}
```

### `POST /api/clients/:id/pillars/:pillarId/reroll`

Regenerate a single content pillar in place using AI, preserving its ID and sort order. Considers sibling pillars to avoid duplication and optionally accepts a direction prompt.

**Auth:** Required (any authenticated user)

**Body:**

```
direction - Optional natural language direction to guide generation
```

**Query params:**

```
id - Client UUID
pillarId - Content pillar UUID to regenerate
```

**Returns:**

```
{{ pillar: ContentPillar }} Updated pillar with new AI-generated content
```

### `POST /api/clients/:id/pillars/generate`

Kick off an async AI generation of content pillars for a client. Creates a generation record immediately and returns its ID, then processes in background via after(). Poll GET /api/clients/[id]/pillars/generate/[generationId] for status.

**Auth:** Required (any authenticated user)

**Body:**

```
count - Number of pillars to generate (default: 5, min: 1, max: 10)
direction - Optional natural language direction to guide generation
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ id: string, status: 'processing' }} Generation record ID for polling
```

### `POST /api/clients/:id/pillars/generate-strategy`

Run the full AI strategy pipeline in background via after(). Generates content pillars, then video ideas per pillar, then spoken-word scripts — in three sequential phases. Returns a pipeline run ID for polling. Replaces all existing pillars for the client.

**Auth:** Required (any authenticated user)

**Body:**

```
direction - Optional natural language direction for generation
pillar_count - Number of pillars to generate (default: 5, min: 1, max: 10)
ideas_per_pillar - Number of ideas per pillar (default: 5, min: 1, max: 10)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ id: string, status: 'processing' }} Pipeline run ID for polling
```

### `GET /api/clients/:id/pillars/generate-strategy/:runId`

Poll the status of a strategy pipeline run. Returns the full run record including current_phase (pillars → ideas → scripts → done) and status.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
runId - Pipeline run UUID
```

**Returns:**

```
{{ run: StrategyPipelineRun }}
```

### `GET /api/clients/:id/pillars/generate/:generationId`

Poll the status of a pillar generation job. When status is 'completed', also returns all current pillars for the client so the UI can display results immediately.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Client UUID
generationId - Generation job UUID
```

**Returns:**

```
{{ generation: PillarGeneration, pillars: ContentPillar[] | null }}
```

### `POST /api/clients/:id/pillars/reorder`

Update the sort_order of content pillars by providing the desired array of pillar IDs. The index of each ID in the array becomes its new sort_order.

**Auth:** Required (any authenticated user)

**Body:**

```
pillar_ids - Ordered array of pillar UUIDs (required)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/clients/:id/portal-users`

### `DELETE /api/clients/:id/portal-users/:userId`

### `PATCH /api/clients/:id/portal-users/:userId`

### `POST /api/clients/:id/promote-onboarding`

### `GET /api/clients/:id/social-slots`

Return one slot per platform (IG, TT, FB, YT). If no row exists for a platform, returns `{ status: 'unset' }`. This guarantees the UI always has four slots to render, even for brand-new clients.

**Auth:** Admin OR a viewer with access to this client (portal can read

### `PATCH /api/clients/:id/social-slots`

Upsert a single slot. One of three operations based on `status`: - `linked` + `handle` → set the manual-paste handle - `no_account` → declare absent (clears handle/tokens) - `unset` → delete the row entirely Never touches the access_token_ref or late_account_id columns for linked slots — those are owned by the OAuth flow, and overwriting them here would kick out a connected account.

**Auth:** Admin only.

### `GET /api/clients/:id/strategy`

Fetch the most recently generated content strategy for a client. Portal users (viewers) can only access strategies for clients in their organization.

**Auth:** Required (admin or viewer in client's organization)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{ClientStrategy} Most recent client strategy record
```

### `POST /api/clients/:id/strategy`

Generate a full content strategy for a client using AI. Gathers SERP data for the client's industry and topic keywords, builds a comprehensive onboarding strategy prompt, calls Claude AI, and saves the resulting strategy (pillars, platform strategy, video ideas, competitive landscape, next steps, etc.) to the database. Syncs to Obsidian vault (non-blocking).

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ strategyId: string, status: 'completed', tokens_used: number, estimated_cost: number }}
```

### `GET /api/clients/:id/summary`

Returns an aggregated summary of a client's current state: - Basic info (name, industry, agency, services) - Team assignments (who's working on this client) - Pipeline status for the current month - Upcoming shoots - Latest research searches - Idea generation count Use when: You need a full picture of a client in one call — dashboards, AI agent context building, or client profile pages.

### `DELETE /api/clients/:id/uppromote`

Disconnect the UpPromote integration for a client by clearing the stored API key.

**Auth:** Required (admin)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ success: true }}
```

### `POST /api/clients/:id/uppromote`

Connect an UpPromote affiliate integration for a client. Validates the API key against UpPromote, saves it to the client record, and triggers an initial non-blocking affiliate sync.

**Auth:** Required (admin)

**Body:**

```
api_key - UpPromote API key to validate and save (required)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ success: true, message: string }}
```

### `GET /api/clients/:id/webhook-settings`

### `PUT /api/clients/:id/webhook-settings`

### `POST /api/clients/analyze-url`

Pull the first plausible social handle for a platform from raw HTML. `regex` must have a global flag and at least one capturing group that contains the handle; `reject` is a list of path segments that look like handles but aren't (e.g. Instagram's /p, /explore). Returns null when no match passes the reject list. We walk all matches (not just the first) because real sites often link to `/share` or `/dialog` before the actual profile — we want to skip those and land on the real handle. / function extractHandle(html: string, regex: RegExp, reject: string[]): string | null { const rejectSet = new Set(reject.map((r) => r.toLowerCase())); const matches = html.matchAll(regex); for (const m of matches) { // YouTube regex has four capture groups (one per URL shape); grab the first non-empty one. const handle = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim(); if (!handle) continue; if (rejectSet.has(handle.toLowerCase())) continue; // Length sanity check — handles above 50 chars are almost certainly // URL fragments we mis-captured (e.g. tracking params). if (handle.length > 50) continue; return handle; } return null; } /** POST /api/clients/analyze-url Analyze a website URL to auto-populate client onboarding fields. Fetches the website HTML, extracts a logo (apple-touch-icon, OG image, Twitter card image, Clearbit, or Google favicon), strips the HTML to plain text, and uses Claude AI to infer industry, target audience, brand voice, and topic keywords.

**Auth:** Required (admin)

**Body:**

```
url - Valid website URL to analyze (required)
```

**Returns:**

```
{{ industry: string, target_audience: string, brand_voice: string, topic_keywords: string[], logo_url: string | null }}
```

### `GET /api/clients/assignments/strategists`

Returns a flat list of { client_id, strategist_name, strategist_id } for all clients that have a team member assigned with role containing "Strategist". Used by the calendar to show strategist names on events.

### `POST /api/clients/backfill-industry`

One-time admin utility: analyze website content for all active clients whose industry is 'General' or null, then use Claude AI to infer a specific industry and update the DB. Skips clients without a website URL. Non-destructive — only updates if AI returns a specific industry (not 'General').

**Auth:** Required (admin)

**Returns:**

```
{{ message: string, results: { name: string, industry: string, status: string }[] }}
```

### `GET /api/clients/monday-cache`

Fetch and cache Monday.com client data (5-minute in-memory TTL). Returns all parsed Monday.com client records for fast access without hitting the Monday.com API on every request.

**Auth:** Required (admin)

**Returns:**

```
{ParsedMondayClient[]} Array of all parsed Monday.com client records
```

### `POST /api/clients/onboard`

Full client onboarding flow that provisions across four systems in parallel: 1. Cortex DB — creates organization + client records 2. Obsidian Vault — syncs client profile markdown 3. Monday.com — creates board item with service/agency/POC columns 4. Late — creates social media scheduling profile (if SMM service included) Auto-generates a URL-safe slug from the client name (with collision handling). Returns the outcome for each system independently; only the Cortex DB failure is fatal.

**Auth:** Required (admin)

**Body:**

```
name - Client display name (required)
website_url - Client website URL (required)
industry - Industry category (required)
target_audience - Target audience description
brand_voice - Brand voice description
topic_keywords - Array of content topic keywords
logo_url - Logo image URL (nullable)
services - Array of service strings (e.g. ['SMM', 'Paid Media', 'Editing', 'Affiliates'])
agency - Agency name override
```

**Returns:**

```
{{ cortex: SystemResult, vault: SystemResult, monday: SystemResult, late: SystemResult }}
```

### `POST /api/clients/preferences`

Update a client's content preferences (tone, topics, competitors, seasonal priorities). Portal users (viewers) can only update clients in their organization and only if the client has the can_edit_preferences feature flag enabled.

**Auth:** Required (admin or viewer)

**Body:**

```
client_id - Client UUID (required)
preferences.tone_keywords - Array of tone descriptors (max 20)
preferences.topics_lean_into - Array of topics to emphasize (max 30)
preferences.topics_avoid - Array of topics to avoid (max 30)
preferences.competitor_accounts - Array of competitor account names (max 20)
preferences.seasonal_priorities - Array of seasonal content priorities (max 20)
```

**Returns:**

```
{{ success: true }}
```

### `POST /api/clients/upload-logo`

Upload a client logo image to Supabase Storage (client-logos bucket). Accepts JPEG, PNG, or WebP images up to 2 MB. Returns the public URL.

**Auth:** Required (admin)

**Body:**

```
file - Image file (multipart/form-data; JPEG | PNG | WebP; max 2 MB)
```

**Returns:**

```
{{ url: string }} Public URL of the uploaded logo
```

### `GET /api/clients/vault/:id`

Fetch a client's Obsidian vault profile by slug. The URL segment is named `id` (not `slug`) because Next 15's App Router refuses to compile when dynamic segments in the same subtree use different names — `app/api/clients/[id]` already claims `id`. The handler still resolves a client slug string.

**Auth:** Required (any authenticated user)

**Returns:**

```
Client vault profile object
```

---

## Knowledge Base

_Knowledge entries, semantic search, website scraping, meeting imports._

### `GET /api/knowledge/graph`

Get graph data (lightweight nodes + edges derived from connections arrays). When a specific client_id is provided, also includes that client's knowledge entries (scraped pages, brand profile, meetings) from client_knowledge_entries as additional graph nodes.

**Query params:**

```
kind - Filter by kind(s), comma-separated
domain - Filter by domain(s), comma-separated
client_id - Filter by client (use "agency" for client_id IS NULL)
limit - Max nodes (default 2000)
```

### `GET /api/knowledge/nodes`

List knowledge nodes with optional filters.

**Query params:**

```
kind - Filter by kind(s), comma-separated
domain - Filter by domain(s), comma-separated
client_id - Filter by client (use "agency" for client_id IS NULL)
q - Full-text search query
limit - Max results (default 100)
offset - Pagination offset (default 0)
```

### `POST /api/knowledge/nodes`

Create a new knowledge node.

### `DELETE /api/knowledge/nodes/:id`

Delete a knowledge node.

### `GET /api/knowledge/nodes/:id`

Get a single knowledge node with full content.

### `PUT /api/knowledge/nodes/:id`

Update a knowledge node.

### `POST /api/knowledge/search`

Semantic search over knowledge nodes using Gemini embeddings. Falls back to FTS if embedding generation fails.

### `POST /api/knowledge/sync`

When true, sync every entry in KNOWLEDGE_GRAPH_SYNC_SOURCES (legacy default counts as one). */ all: z.boolean().optional(), }); /** POST /api/knowledge/sync Trigger GitHub → Supabase incremental sync for the knowledge graph. Auth: admin role OR x-sync-secret header matching SYNC_SECRET env var. Body: { repo?: string, all?: boolean } — default single repo is KNOWLEDGE_GRAPH_GITHUB_REPO; set all: true to sync every configured source (see KNOWLEDGE_GRAPH_SYNC_SOURCES).

### `POST /api/knowledge/webhook`

---

## Ideas & Content

_Video idea generation, scripts, concepts, moodboards._

### `GET /api/ideas`

List idea submissions. Admins can filter by client; portal users (viewers) see only ideas for clients in their organization. Returns up to 100 results, ordered by most recent.

**Auth:** Required (admin or viewer)

**Query params:**

```
client_id - (Admin only) Filter by client UUID
```

**Returns:**

```
{IdeaSubmission[]} Array of idea submissions
```

### `POST /api/ideas`

Submit a new idea. Portal users must specify a client_id and the client must have the can_submit_ideas feature flag enabled. Syncs the idea to the Obsidian vault and sends notifications: admins are notified of portal submissions, portal users are notified of admin-submitted ideas.

**Auth:** Required (admin or viewer)

**Body:**

```
client_id - Client UUID (required for portal users; optional for admins)
title - Idea title (required, max 300 chars)
description - Idea description (max 2000 chars)
source_url - Source URL that inspired the idea
category - Category ('trending' | 'content_idea' | 'request' | 'trending_topic' | 'other', default: 'other')
```

**Returns:**

```
{IdeaSubmission} Created idea record (201)
```

### `DELETE /api/ideas/:id`

Permanently delete an idea submission.

**Auth:** Required (admin)

**Query params:**

```
id - Idea submission UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/ideas/:id`

### `PATCH /api/ideas/:id`

Poll the status of an idea generation job. Returns the generation record including status, generated ideas (if completed), and any error message.

**Auth:** Required (admin)

**Body:**

```
status - New status ('new' | 'archived')
admin_notes - Internal admin notes (max 2000 chars)
```

**Query params:**

```
id - Idea generation UUID
id - Idea submission UUID
```

**Returns:**

```
{{ id: string, status: 'processing' | 'completed' | 'failed', ideas: GeneratedIdeaResult[] | null, error_message: string | null, completed_at: string | null }}
/
// ── GET — poll generation status ──
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('idea_generations')
    .select('id, client_id, status, ideas, error_message, completed_at')
    .eq('id', id)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Org-scope check for non-admin users
  if (data.client_id) {
    const access = await assertUserCanAccessClient(admin, user.id, data.client_id);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
  }
  return NextResponse.json(data);
}
const ideaTriageSchema = z.object({
  status: z.enum(['new', 'archived']).optional(),
  admin_notes: z.string().max(2000).optional().nullable(),
});
/**
PATCH /api/ideas/[id]
Update an idea submission — set status to `new` or `archived`, and/or admin notes.
Records the reviewer ID and timestamp when status changes.
{IdeaSubmission} Updated idea submission record
```

### `POST /api/ideas/generate`

Start an asynchronous AI idea generation job. Returns a generation ID immediately; the actual generation runs in the background via Next.js `after()`. Supports three modes: client-based (uses brand profile, strategy, past searches), URL-based (scrapes website), and search-based (uses research SERP data). For pillar-based generation, makes one AI call per pillar to produce focused, on-pillar ideas.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID for brand context (required unless url or search_id provided)
url - Website URL to scrape for brand context (alternative to client_id)
concept - Optional concept direction to guide generation
count - Number of ideas to generate (1-200, default: 10)
reference_video_ids - Array of reference video UUIDs to inspire style
search_id - Topic search UUID to ground ideas in research data
pillar_ids - Array of content pillar UUIDs for pillar-based generation
ideas_per_pillar - Number of ideas per pillar (1-20, required with pillar_ids)
```

**Returns:**

```
{{ id: string, status: 'processing' }} Generation record ID for polling
```

### `POST /api/ideas/generate-script`

Generate a spoken-word video script for a given idea using Claude AI. Uses the client's brand profile, target audience, and optional reference video transcripts as style guides. Calibrates word count to target video length (default 60s ≈ 130 wpm). Saves the resulting script to the idea_scripts table.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID for brand context (required)
title - Video idea title (required)
why_it_works - Reason bullets (string or string array)
content_pillar - Content pillar/category name
reference_video_ids - Reference video UUIDs to match style and tone
idea_entry_id - Optional idea submission UUID to link the script to
cta - Desired call-to-action for the script ending
video_length_seconds - Target video length in seconds (10-180, default: 60)
target_word_count - Explicit word count override (10-500)
hook_strategies - Hook style keys (negative | curiosity | controversial | story | authority | question | listicle | fomo | tutorial)
```

**Returns:**

```
{{ script: string, scriptId: string | null, usage: TokenUsage, estimatedCost: number }}
```

### `POST /api/ideas/reject`

Record a rejected AI-generated idea for a client. Saves the idea to the rejected_ideas table so it can be used to improve future generation quality and avoid re-surfacing ideas.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID the idea was generated for (required)
title - Idea title (required)
description - Optional idea description
hook - Optional hook text
content_pillar - Optional content pillar label
generation_context - Optional metadata about the generation run (key-value pairs)
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/ideas/saved`

List all saved ideas from the knowledge base. Returns knowledge entries of type 'idea' across all clients (admin) or org-scoped clients (viewer), ordered by creation date descending (max 200).

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ ideas: KnowledgeEntry[] }} Array of saved idea entries
```

### `DELETE /api/moodboard/boards/:id/strokes`

Either ?stroke_id=<uuid> to remove one stroke, or no query to clear all.

### `GET /api/moodboard/boards/:id/strokes`

Returns all strokes for a board, oldest first so paint order is preserved.

### `POST /api/moodboard/boards/:id/strokes`

Append a stroke. One row per stroke — point-per-row would be chatty.

### `GET /api/moodboard/notes-boards`

Returns every non-archived board the caller can open from the Notes dashboard, including personal boards they own, team boards, and client boards they have access to. Grouped client-side by the `scope` field.

### `POST /api/moodboard/notes-boards`

### `GET /api/moodboard/personal`

Returns the caller's personal moodboard along with all items, notes, and edges on it. Auto-creates an empty personal board on first call so the Notes page can mount without a separate onboarding step.

**Auth:** Required (any authenticated user)

**Returns:**

```
{ board, items, notes, edges }
```

---

## Reference Videos

_Reference video uploads + processing for AI analysis._

### `GET /api/reference-videos`

List reference videos, optionally filtered by client. Returns up to 50 videos ordered by creation date descending.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Filter by client UUID (optional)
```

**Returns:**

```
{{ videos: ReferenceVideo[] }}
```

### `POST /api/reference-videos`

Create a new reference video record for a client with status 'pending'. The video will be analyzed by `/api/reference-videos/[id]/process` after creation.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID (required)
url - Video URL (optional)
title - Video title (optional)
platform - Platform name e.g. 'tiktok', 'instagram' (optional)
```

**Returns:**

```
{{ video: ReferenceVideo }}
```

### `POST /api/reference-videos/:id/process`

Analyze a reference video by running Groq Whisper transcription and Gemini visual analysis in parallel. Saves transcript, segments, and visual_analysis to the record. Sets status to 'completed' on success or 'failed' if both steps fail. Logs usage costs to the ai_usage table.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Reference video UUID
```

**Returns:**

```
{{ video: ReferenceVideo }}
```

---

## Todos

_Personal todo management._

### `GET /api/todos`

List personal todos for the authenticated user. Supports optional filters for completion status and due-today. Results are always scoped to the authenticated user.

**Auth:** Required (any authenticated user)

**Query params:**

```
completed - Filter by completion state: 'true' | 'false' (omit for all)
due_today - If 'true', return only todos due today
```

**Returns:**

```
{Todo[]} Array of todo records ordered by creation date descending
```

### `POST /api/todos`

Create a new todo. Admins may assign a todo to any user via the user_id field; non-admins are restricted to creating todos for themselves only.

**Auth:** Required (any authenticated user; admin required to assign to another user)

**Body:**

```
title - Todo title (required)
description - Optional notes
due_date - Optional due date (ISO date string)
client_id - Optional client UUID to associate the todo with
priority - Optional priority level: 'low' | 'medium' | 'high'
user_id - Admin-only: UUID of the user to assign the todo to
```

**Returns:**

```
{Todo} Created todo record (201)
```

### `DELETE /api/todos/:id`

Permanently delete a personal todo. RLS ensures users can only delete their own todos.

**Auth:** Required (any authenticated user; RLS-enforced ownership)

**Query params:**

```
id - Todo UUID
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/todos/:id`

Update a personal todo. RLS ensures users can only modify their own todos. Automatically sets completed_at when toggling is_completed.

**Auth:** Required (any authenticated user; RLS-enforced ownership)

**Body:**

```
title - Optional new title
description - Optional notes (nullable)
is_completed - Optional completion toggle
due_date - Optional new due date (nullable)
client_id - Optional client association (nullable)
priority - Optional priority: 'low' | 'medium' | 'high' (nullable)
```

**Query params:**

```
id - Todo UUID
```

**Returns:**

```
{Todo} Updated todo record
```

---

## Pipeline

_Content production pipeline — status, advancement, assignments._

### `GET /api/pipeline`

### `POST /api/pipeline`

### `DELETE /api/pipeline/:id`

Permanently delete a content pipeline item.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Content pipeline item UUID
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/pipeline/:id`

Update one or more status fields or metadata on a content pipeline item. Allows setting any combination of the five status tracks plus team assignments, dates, folder URLs, and notes.

**Auth:** Required (any authenticated user)

**Body:**

```
assignment_status - 'can_assign' | 'assigned' | 'need_shoot'
raws_status - 'need_to_schedule' | 'waiting_on_shoot' | 'uploaded'
editing_status - 'not_started' | 'editing' | 'edited' | 'em_approved' | 'revising' | 'blocked' | 'scheduled' | 'done'
client_approval_status - 'not_sent' | 'waiting_on_approval' | 'client_approved' | 'needs_revision' | 'revised' | 'sent_to_paid_media'
boosting_status - 'not_boosting' | 'working_on_it' | 'done'
strategist - Strategist name
videographer - Videographer name
editing_manager - Editing manager name
editor - Editor name
smm - Social media manager name
shoot_date - Shoot date (YYYY-MM-DD)
strategy_due_date - Strategy due date
raws_due_date - Raws due date
smm_due_date - SMM due date
calendar_sent_date - Date calendar was sent
edited_videos_folder_url - URL to edited videos folder
raws_folder_url - URL to raws folder
later_calendar_link - Later.com calendar link
project_brief_url - Project brief URL
notes - General notes
agency - Agency override
```

**Query params:**

```
id - Content pipeline item UUID
```

**Returns:**

```
{ContentPipelineItem} Updated pipeline item
```

### `POST /api/pipeline/:id/advance`

### `GET /api/pipeline/summary`

Generate an AI-powered summary of the current month's content pipeline. Returns editing and approval status counts, AI insight bullets, and suggested action tasks. Caches the AI response for 5 minutes and reuses it when pipeline state hasn't changed (detected via MD5 hash).

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ total: number, doneCount: number, editingCounts: Record<string, { count: number, clients: string[] }>, approvalCounts: Record<string, { count: number, clients: string[] }>, aiBullets: string[], suggestedTasks: { title: string, description: string, priority: string }[], monthLabel: string }}
```

### `POST /api/pipeline/sync`

Parse month label like "March 2026" into a date "2026-03-01" */ function parseMonthLabel(label: string): string | null { const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, }; const parts = label.toLowerCase().trim().split(/\s+/); const monthName = parts[0]; const year = parts[1] ? parseInt(parts[1]) : new Date().getFullYear(); const monthNum = months[monthName]; if (!monthNum) return null; return `${year}-${String(monthNum).padStart(2, '0')}-01`; } /** POST /api/pipeline/sync Sync the content pipeline from a Monday.com board (board ID 9232769015). Reads all groups (month buckets) and items, maps column values to pipeline fields, and upserts into the content_pipeline table by monday_item_id. Supports syncing a specific group via group_id.

**Auth:** Required (any authenticated user; caller provides the Monday.com API token)

**Body:**

```
api_token - Monday.com API token (required)
group_id - Optional: sync only this specific group/month
```

**Returns:**

```
{{ success: true, synced: number, skipped: number }}
```

---

## Shoots & Calendar

_Shoot scheduling, planning, Google Calendar integration._

### `GET /api/calendar/events`

Returns Google Calendar events for each scheduling_people row in the given window. Events are fetched via service-account / domain-wide delegation; each person's multiple workspace emails are unioned and deduped before being returned. Response: { calendars: { [personId]: { name, color, connection_type: 'team', events[], errors? } } }

### `GET /api/calendar/gaps`

### `POST /api/calendar/invite`

Generate a calendar invite link for a contact. Creates a calendar_connections record with a 32-char hex token and 30-day expiry, returning the shareable URL for the client to connect their Google Calendar.

**Auth:** Required (admin)

**Body:**

```
contact_id - Contact UUID to generate the invite for (required)
```

**Returns:**

```
{{ token: string, url: string }} Invite token and full shareable URL
```

### `GET /api/calendar/people`

Returns the configurable list of stakeholders for team availability + the unified calendar overlay. Each row is one logical person; their multiple workspace emails (e.g. jake@nativz.io and jake@andersoncollaborative.com) are returned as a string[]. Admins only.

### `POST /api/calendar/people`

Create a new person + their email aliases. Admins only. Emails are lowercased and validated against the authorized workspace domains client- side too, but final domain check happens at calendar fetch time.

### `DELETE /api/calendar/people/:id`

Soft-delete: flips is_active=false instead of removing the row, so any historical scheduling links (event members, etc.) keep their FK target.

### `PATCH /api/calendar/people/:id`

Update one person's attributes and optionally replace their email aliases. Email replacement is atomic: we delete the existing rows then insert the new set inside a best-effort sequence — if the insert fails we re-insert the old list so we don't strand a person with no emails.

### `POST /api/calendar/sync`

Sync the authenticated admin's Google Calendar with Cortex. Fetches upcoming events (60 days) via Google OAuth, identifies shoot events and creates/updates shoot_events records, and pulls changes to Cortex meetings (time shifts, title changes, cancellations).

**Auth:** Required (admin)

**Returns:**

```
{{ totalEvents, shoots: { found, created, updated, matched }, meetings: { synced, updated, cancelled } }}
```

### `GET /api/shoots`

List shoot events, ordered by shoot date ascending. Supports filtering by client, status, and date range. Each result includes the associated client record.

**Auth:** Required (admin)

**Query params:**

```
client_id - Filter by client UUID
status - Filter by scheduled_status value
date_from - Only return shoots on or after this date (YYYY-MM-DD)
date_to - Only return shoots on or before this date (YYYY-MM-DD)
```

**Returns:**

```
{ShootEvent[]} Array of shoot events with client relation
```

### `POST /api/shoots`

Create shoot events for one or more clients on the same date. Creates one shoot_events row per client. If Google Calendar is connected via OAuth, automatically creates Google Calendar events with client contacts and team member attendees.

**Auth:** Required (admin)

**Body:**

```
title - Shoot title (required)
shoot_date - Shoot date/datetime string (required)
location - Shoot location
notes - Shoot notes
client_ids - Array of client UUIDs (at least one required)
```

**Returns:**

```
{{ success: true, count: number, calendar: { shootId: string, eventId?: string, error?: string }[] }}
```

### `DELETE /api/shoots/:id`

Soft-cancel a shoot event by setting its scheduled_status to 'cancelled'. The record is retained in the database.

**Auth:** Required (admin)

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/shoots/:id`

Fetch a single shoot event by ID, including the associated client record.

**Auth:** Required (admin)

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{ShootEvent} Shoot event with client relation
```

### `PATCH /api/shoots/:id`

Update a shoot event's title, client, date, location, notes, or scheduled status.

**Auth:** Required (admin)

**Body:**

```
title - Updated title
client_id - Updated client UUID (nullable)
shoot_date - Updated shoot date string
location - Updated location (nullable)
notes - Updated notes (nullable)
scheduled_status - New status ('scheduled' | 'completed' | 'cancelled')
```

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{ShootEvent} Updated shoot event with client relation
```

### `PATCH /api/shoots/:id/footage`

### `GET /api/shoots/:id/plan`

Fetch a shoot event along with its generated plan data and associated client info.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{ShootEvent} Shoot event including plan_data, plan_status, and client relation
```

### `POST /api/shoots/:id/plan`

Generate an AI shoot plan for a shoot event. Gathers live SERP data for the client's industry/keywords, pulls client content memory, then uses Claude AI to produce a structured ShootPlan (shot list, concepts, talking points, etc.). Saves the plan to the shoot event and syncs it to the Obsidian vault (non-blocking).

**Auth:** Required (admin)

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{{ shootId: string, status: 'generated', plan: ShootPlan }}
```

### `GET /api/shoots/content-calendar`

### `POST /api/shoots/ideate`

### `POST /api/shoots/reschedule`

### `POST /api/shoots/schedule`

### `POST /api/shoots/sync`

Fetch upcoming Google Calendar events (next 90 days) via the user's Google OAuth token, filter for shoot-related events by keyword (shoot, film, content day, production), and upsert into shoot_events matching on google_event_id. Client names are inferred from the event title by fuzzy matching against active Cortex clients.

**Auth:** Required (admin with Google Calendar connected)

**Returns:**

```
{{ synced: number, skipped: number, total_calendar_events: number, shoot_events_found: number }}
```

---

## Ad Creatives

_AI ad creative generation + template management._

### `POST /api/ad-creatives-v2/batches`

Creates an ad_generation_batches row with the concept array stashed in config.v2_concepts, then runs the v2 orchestrator in the background via after(). Returns the batch row immediately.

**Auth:** Required (admin)

### `GET /api/ad-creatives-v2/batches/:id`

Returns batch status + progress + list of rendered creatives. Admin-only. Used by polling UIs to wait for batch completion.

### `POST /api/ad-creatives-v2/batches/:id`

### `POST /api/ad-creatives-v2/generate-scene`

Generates a single scene photo via Gemini, uploads it to `brand-scene-photos`, and inserts a brand_scene_photos row. Idempotent by (client_id, slug) — existing rows return 200 with `regenerated: true`.

**Auth:** Required (admin)

### `POST /api/ad-creatives-v2/render`

Renders a single concept via the v2 compositor-first pipeline and returns the PNG buffer directly. Intended for admin preview + ad-hoc rendering; batch orchestration lives in a separate route (Slice 2).

**Auth:** Required (admin)

**Body:**

```
ConceptSpec — see lib/ad-creatives-v2/types.ts
```

**Returns:**

```
PNG binary (image/png)
```

### `POST /api/ad-creatives/agent-stream`

SSE endpoint that runs the ad generator agent and forwards every `AdAgentEvent` the run emits as `data: <json>\n\n` chunks. The browser consumes this stream via `fetch` + `ReadableStream` (not `EventSource`, because we need to send a POST body) and parses each SSE frame back into an `AdAgentEvent` to drive the live transcript. Persistence model: - The user brief lands in `ad_generator_messages` before the run starts. - The final agent narration lands as one assistant message after `batch_complete`. Tool boundaries and per-render progress are intentionally NOT persisted — they're ephemeral activity, not a permanent chat record.

### `POST /api/ad-creatives/command`

Runs a slash command against a client's concept set. Returns a summary string the UI can render as the assistant turn, the updated concepts (so the gallery can react), and the persisted messages.

### `GET /api/ad-creatives/concept-comments`

Batched comment fetch for the admin gallery. Pass `?conceptIds=a,b,c` (comma-separated) and get back { commentsByConcept: { [id]: Comment[] } }. Keeps the gallery to one comment round-trip at mount regardless of concept count.

### `DELETE /api/ad-creatives/concepts/:id`

### `PATCH /api/ad-creatives/concepts/:id`

### `POST /api/ad-creatives/concepts/:id/render`

### `POST /api/ad-creatives/generate`

### `GET /api/ad-creatives/messages`

Read the persisted chat history for a client's Ad Generator. The UI fetches this on mount so refreshing the page doesn't lose the current session's turns. Limit capped at 200 — the chat is meant to be a recent-turns scroll, not a full audit log. Batches remain queryable via /api/ad-creatives/concepts.

### `POST /api/ad-creatives/reference-ads/sync`

### `GET /api/ad-creatives/share-links`

List live share tokens for a client. Used by the admin Share tab to show existing links and let admins revoke them.

### `POST /api/ad-creatives/share-links`

Admin creates a share token for the current client's concept gallery. Returns the opaque token string and the constructed public URL.

### `DELETE /api/ad-creatives/share-links/:id`

Revoke a share token. Sets revoked_at rather than deleting so we keep the audit trail ("who shared what, when, when revoked") without orphaning any comments that arrived through the link.

---

## Analyze

_Video analysis boards, AI insights, scripts, PDFs, chat._

### `GET /api/analysis/boards`

List all moodboard boards, ordered by updated_at descending. Includes item counts and up to 4 thumbnail URLs per board for grid previews. Excludes archived boards by default.

**Auth:** Required (admin)

**Query params:**

```
show_archived - Pass 'true' to include archived boards (optional)
topic_search_id - Filter boards linked to a topic search (optional)
```

**Returns:**

```
{MoodboardBoard[]} Boards with client_name, item_count, and thumbnails
```

### `POST /api/analysis/boards`

Create a new moodboard board. If a template_id is provided, pre-populates the board with notes from the selected template.

**Auth:** Required (admin)

**Body:**

```
name - Board name (required, max 200 chars)
description - Board description (optional)
client_id - Associated client UUID (optional)
template_id - Template ID to pre-populate notes from (optional)
```

**Returns:**

```
{MoodboardBoard} Created board record
```

### `DELETE /api/analysis/boards/:id`

Permanently delete a moodboard board. Cascades to all items, notes, and comments.

**Auth:** Required (admin)

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/analysis/boards/:id`

Fetch a single moodboard board with all its items and notes.

**Auth:** Required (admin)

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{MoodboardBoard & { items: MoodboardItem[], notes: MoodboardNote[] }}
```

### `PATCH /api/analysis/boards/:id`

Update a moodboard board's name, description, client association, or archived status.

**Auth:** Required (admin)

**Body:**

```
name - Updated board name (optional)
description - Updated description (optional)
client_id - Updated client UUID or null (optional)
archived - Set true to archive, false to unarchive (optional)
```

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{MoodboardBoard} Updated board record
```

### `POST /api/analysis/boards/:id/duplicate`

Deep-clone a moodboard board, including all items, notes, edges, tags, and item-tag associations. Edge node IDs are re-mapped to the new item/note IDs. The new board is named "[Original Name] (Copy)".

**Auth:** Required (admin)

**Query params:**

```
id - Source board UUID to duplicate
```

**Returns:**

```
{MoodboardBoard} Newly created board record
```

### `PATCH /api/analysis/boards/:id/positions`

Batch-update canvas positions (and optional dimensions) for items and notes on a board. All updates run in parallel. Returns 207 with error details if any individual update fails. Also bumps the board's updated_at timestamp.

**Auth:** Required (admin)

**Body:**

```
items - Array of { id, position_x, position_y, width?, height? } for items (optional)
notes - Array of { id, position_x, position_y, width? } for notes (optional)
```

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{{ success: true }} or {{ success: false, errors: string[] }} with 207
```

### `GET /api/analysis/boards/:id/search`

Full-text search for items within a board. Searches across title, transcript, concept_summary, hook, and author_name using case-insensitive ILIKE. Returns matching item IDs for the client to highlight/filter.

**Auth:** Required (admin)

**Query params:**

```
id - Board UUID
q - Search query string (required)
```

**Returns:**

```
{{ item_ids: string[] }}
```

### `DELETE /api/analysis/boards/:id/share`

Remove all share links for a board, effectively disabling public access.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{{ shared: false }}
```

### `GET /api/analysis/boards/:id/share`

Get the current share link status for a board. Returns the most recently created share link with its URL, password protection status, and expiry.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{{ shared: false }} or {{ shared: true, id, token, url, hasPassword, expires_at, created_at }}
```

### `POST /api/analysis/boards/:id/share`

Create (or replace) a public share link for a board. Replaces any existing share link. Generates a 48-char hex token; optionally SHA-256 hashes a password and sets an expiry date.

**Auth:** Required (any authenticated user)

**Body:**

```
password - Optional plaintext password (SHA-256 hashed before storage)
expires_at - Optional ISO 8601 expiry timestamp
```

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{{ shared: true, id, token, url, hasPassword, expires_at, created_at }}
```

### `GET /api/analysis/boards/:id/tags`

List all tags defined on a board, ordered alphabetically by name.

**Auth:** Required (admin)

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{MoodboardTag[]}
```

### `POST /api/analysis/boards/:id/tags`

Create a new tag on a board. Returns 409 if a tag with the same name already exists on this board.

**Auth:** Required (admin)

**Body:**

```
name - Tag name, 1–50 chars (required)
color - Hex color (#rrggbb, default '#6366f1')
```

**Query params:**

```
id - Board UUID
```

**Returns:**

```
{MoodboardTag} Created tag record
```

### `POST /api/analysis/boards/from-topic-search`

Create a moodboard from high-engagement video URLs found in a completed topic search, link the board via source_topic_search_id, optionally kick off video processing in the background.

### `POST /api/analysis/chat`

Stream AI creative strategy chat grounded in selected moodboard content. Fetches item analysis data (transcripts, hooks, pacing, insights) and optionally client brand context (via @mention slugs) and sticky note text. Returns a streaming text/plain response via Server-Sent Events using the Cortex AI persona backed by Claude Sonnet via OpenRouter.

**Auth:** Required (any authenticated user)

**Body:**

```
board_id - Board UUID (required)
item_ids - Array of item UUIDs to include as context (required, may be empty)
messages - Conversation history [{role, content}] — at least 1 message (required)
note_contents - Sticky note text strings to include as context (optional)
client_slugs - Client slugs to inject brand context via @ mentions (optional)
model - OpenRouter model override (optional; default platform OpenRouter model)
```

**Returns:**

```
{ReadableStream<string>} Streamed AI text response
```

### `GET /api/analysis/comments`

List all comments on a moodboard item, ordered oldest first. Includes commenter name and avatar from the users join.

**Auth:** Required (admin)

**Query params:**

```
item_id - Moodboard item UUID (required)
```

**Returns:**

```
{MoodboardComment[]} Comments with users(full_name, avatar_url)
```

### `POST /api/analysis/comments`

Add a comment to a moodboard item. Supports optional video timestamp for timestamped comments. Also bumps the parent board's updated_at.

**Auth:** Required (admin)

**Body:**

```
item_id - Moodboard item UUID (required)
content - Comment text, 1–5000 chars (required)
video_timestamp - Timestamp in seconds for timestamped comments (optional)
```

**Returns:**

```
{MoodboardComment} Created comment with users(full_name, avatar_url)
```

### `DELETE /api/analysis/comments/:id`

Delete a moodboard comment. Admins can delete any comment. Also bumps the parent board's updated_at timestamp.

**Auth:** Required (admin)

**Query params:**

```
id - Comment UUID
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/analysis/comments/:id`

Edit the content of a moodboard comment. Only the original author can edit their own comment (enforced server-side by user_id check).

**Auth:** Required (admin; must be comment author)

**Body:**

```
content - Updated comment text, 1–5000 chars (required)
```

**Query params:**

```
id - Comment UUID
```

**Returns:**

```
{MoodboardComment} Updated comment with users(full_name, avatar_url)
```

### `GET /api/analysis/edges`

List all edges (connections) for a moodboard board, ordered oldest first.

**Auth:** Required (any authenticated user)

**Query params:**

```
board_id - Board UUID (required)
```

**Returns:**

```
{MoodboardEdge[]}
```

### `POST /api/analysis/edges`

Create a directed edge between two canvas nodes on a moodboard. Edges can connect any node types (items, notes) by their node ID. Supports label, line style (solid/dashed/dotted), and color.

**Auth:** Required (admin)

**Body:**

```
board_id - Board UUID (required)
source_node_id - Source node ID string (required)
target_node_id - Target node ID string (required)
source_handle - Handle identifier on source node (optional)
target_handle - Handle identifier on target node (optional)
label - Edge label text (optional, max 200 chars)
style - Line style: 'solid' | 'dashed' | 'dotted' (default 'solid')
color - Hex color string (default '#888888')
```

**Returns:**

```
{MoodboardEdge} Created edge record
```

### `DELETE /api/analysis/edges/:id`

Permanently delete a canvas edge (connection between two nodes).

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Edge UUID
```

**Returns:**

```
{{ success: true }}
```

### `PUT /api/analysis/edges/:id`

Update an edge's label, line style, or color. Applies only the provided fields.

**Auth:** Required (any authenticated user)

**Body:**

```
label - Edge label text (optional, nullable, max 200 chars)
style - Line style: 'solid' | 'dashed' | 'dotted' (optional)
color - Hex color string (optional, max 20 chars)
```

**Query params:**

```
id - Edge UUID
```

**Returns:**

```
{MoodboardEdge} Updated edge record
```

### `POST /api/analysis/items`

Legacy: add to an existing moodboard. */ board_id: z.string().uuid('Invalid board ID').optional(), /** Inline analysis from topic search results — creates or reuses a board per search. */ topic_search_id: z.string().uuid().optional(), /** Required for video/image/website; omitted for text. */ url: z.string().url('Invalid URL').optional(), type: z.enum(['video', 'image', 'website', 'text']), title: z.string().max(500).optional().nullable(), /** Required for text; ignored otherwise. Trimmed before insert. */ text_content: z.string().max(20_000).optional(), position_x: z.number().optional().default(0), position_y: z.number().optional().default(0), width: z.number().optional(), height: z.number().optional(), }) .refine( (d) => (Boolean(d.board_id) && !d.topic_search_id) || (!d.board_id && Boolean(d.topic_search_id)), { message: 'Provide exactly one of board_id or topic_search_id', path: ['board_id'] }, ) .refine( (d) => (d.type === 'text' ? Boolean(d.text_content?.trim()) : Boolean(d.url)), { message: 'text_content is required for text items; url is required otherwise', path: ['type'] }, ); /** POST /api/analysis/items Add a new item to a moodboard. Fetches quick metadata (thumbnail, title, author, stats) from the source platform (TikTok, YouTube, Instagram, Facebook, or generic website) and saves the item immediately. Then auto-triggers background processing: transcription for videos, insights extraction for websites.

**Auth:** Required (admin)

**Body:**

```
board_id - Board UUID (optional if topic_search_id is set)
topic_search_id - Topic search UUID — ensures a per-search analysis board (optional if board_id is set)
url - Source URL (required)
type - 'video' | 'image' | 'website' (required)
title - Optional title override
position_x - Canvas X position (default 0)
position_y - Canvas Y position (default 0)
width - Canvas width in pixels (optional)
height - Canvas height in pixels (optional)
```

**Returns:**

```
{MoodboardItem} Created item record
```

### `DELETE /api/analysis/items/:id`

Permanently delete a moodboard item. Also touches the parent board's updated_at.

**Auth:** Required (admin)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/analysis/items/:id`

Fetch a single moodboard item by ID.

**Auth:** Required (admin)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{MoodboardItem} Full item record
```

### `PATCH /api/analysis/items/:id`

Update a moodboard item's position, size, title, replication brief, or curation status. Also touches the parent board's updated_at.

**Auth:** Required (admin)

**Body:**

```
position_x - Updated canvas X position (optional)
position_y - Updated canvas Y position (optional)
width - Updated canvas width (optional)
height - Updated canvas height (optional)
title - Updated item title (optional)
replication_brief - Brief for replicating this video (optional)
status - 'none' | 'replicate' | 'adapt' | 'archived' (optional)
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{MoodboardItem} Updated item record
```

### `GET /api/analysis/items/:id/analysis/pdf`

### `POST /api/analysis/items/:id/analyze`

AI analysis of a moodboard video item. Uses Claude to analyze the transcript, platform stats, and context to produce hook scoring, pacing analysis, content themes, winning elements, and improvement areas. Optionally accepts MediaPipe client-side analysis results to merge with the LLM output for more accurate pacing and hook scores.

**Auth:** Required (any authenticated user)

**Body:**

```
mediapipeResults - Optional MediaPipe analysis from client (pacing, hook, contentClassification)
```

**Query params:**

```
id - Moodboard item UUID (must be type 'video')
```

**Returns:**

```
{MoodboardItem} Updated item record with VideoAnalysis fields populated
```

### `GET /api/analysis/items/:id/brief/pdf`

Generate and download a PDF of the item's replication brief using react-pdf. Returns 400 if no brief has been generated yet.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
PDF file download (Content-Disposition: attachment)
```

### `POST /api/analysis/items/:id/extract-frames`

Download a video from URL to a temp file / function probeDurationSec(videoPath: string): Promise<number | null> { return new Promise((resolve) => { Ffmpeg.ffprobe(videoPath, (err, metadata) => { if (err || metadata?.format?.duration == null) { resolve(null); return; } resolve(Number(metadata.format.duration)); }); }); } async function downloadVideo(url: string): Promise<string> { const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }, signal: AbortSignal.timeout(30000), }); if (!res.ok) throw new Error(`Failed to download video: ${res.status}`); const buffer = Buffer.from(await res.arrayBuffer()); const tempPath = join(tmpdir(), `nativz-frame-${randomUUID()}.mp4`); await writeFile(tempPath, buffer); return tempPath; } const DEFAULT_FRAME_INTERVAL = 3; // seconds between frames for short videos const MAX_FRAMES = 30; // cap total frames so 3-min+ TikToks don't blow past the 120s Vercel ceiling /** Choose a frame interval that keeps the total count ≤ MAX_FRAMES. Short videos stay at the 3s baseline; longer ones stretch to 5s/6s/etc. / function chooseFrameInterval(durationSec: number): number { const base = DEFAULT_FRAME_INTERVAL; const needed = Math.ceil(durationSec / base); if (needed <= MAX_FRAMES) return base; return Math.max(base, Math.ceil(durationSec / MAX_FRAMES)); } /** Extract frames from a video file at a dynamic interval in 9:16 portrait. Interval scales with duration so Jack's 3-minute TikToks don't try to extract 60 frames and hit the serverless timeout. / async function extractFramesFromFile( videoPath: string, outputDir: string, duration: number, ): Promise<{ paths: string[]; timestamps: number[] }> { const interval = chooseFrameInterval(duration); const timestamps: number[] = []; for (let t = 0; t < duration && timestamps.length < MAX_FRAMES; t += interval) { timestamps.push(t); } if (timestamps.length === 0) { throw new Error('No timestamps to extract'); } const extractFrame = (ts: number, index: number): Promise<string> => { return new Promise((res, rej) => { const outputPath = join(outputDir, `frame-${index}.jpg`); // Scale to 360x640 (9:16 portrait), crop to fit if source is different ratio Ffmpeg(videoPath) .seekInput(ts) .frames(1) .outputOptions(['-q:v', '2', '-vf', 'scale=360:640:force_original_aspect_ratio=increase,crop=360:640']) .output(outputPath) .on('end', () => res(outputPath)) .on('error', (err) => rej(err)) .run(); }); }; const paths: string[] = []; const validTimestamps: number[] = []; for (let i = 0; i < timestamps.length; i++) { try { const path = await extractFrame(timestamps[i], i); paths.push(path); validTimestamps.push(timestamps[i]); } catch (err) { console.error(`Failed to extract frame at ${timestamps[i]}s:`, err); } } return { paths, timestamps: validTimestamps }; } /** Get a direct video URL for the item / async function getVideoUrl(item: { url: string; platform: string | null; metadata?: Record<string, unknown> | null }): Promise<string | null> { const platform = item.platform; if (platform === 'tiktok') { const meta = await getTikTokMetadata(item.url); return meta?.video_url ?? null; } if (platform === 'instagram') { return getInstagramVideoUrl(item.url); } // For other platforms, we don't have a reliable way to get direct video URLs return null; } /** POST /api/analysis/items/[id]/extract-frames Download a TikTok video and extract frames every 3 seconds using ffmpeg, scaled to 360x640 (9:16 portrait). Uploads frames to the moodboard-frames storage bucket and saves VideoFrame[] to the item record.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID (must be type 'video' and platform 'tiktok')
```

**Returns:**

```
{MoodboardItem} Updated item record with frames array
```

### `POST /api/analysis/items/:id/insights`

Extract marketing insights from a website moodboard item. Fetches and parses the page HTML, then uses AI to produce a structured PageInsights object including summary, key headlines, value propositions, design notes, and actionable insights for the content team.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID (must be type 'website')
```

**Returns:**

```
{MoodboardItem} Updated item record with page_insights and content_themes
```

### `POST /api/analysis/items/:id/process`

Run the full video processing pipeline for a moodboard item (transcription + AI analysis). Only applicable to items with type 'video'. Delegates to processVideoItem() helper.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{MoodboardItem} Updated item record after processing
```

### `POST /api/analysis/items/:id/replicate`

Generate a full production-ready replication brief for a moodboard video item. The brief includes concept adaptation, a rewritten hook, scene-by-scene script outline, shot list, music direction, caption suggestions, pacing notes, and CTA. Saves to replication_brief.

**Auth:** Required (any authenticated user)

**Body:**

```
format - Target format (e.g. 'TikTok', 'Instagram Reel') (required)
client_id - Client UUID for brand context (optional)
notes - Adaptation notes (optional)
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ brief: string }}
```

### `POST /api/analysis/items/:id/reprocess`

Reset a moodboard video item's analysis data and run the full processing pipeline again. Clears all analysis fields (hook, transcript, themes, etc.) before re-running processVideoItem().

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID (must be type 'video')
```

**Returns:**

```
{MoodboardItem} Updated item record after reprocessing
```

### `POST /api/analysis/items/:id/rescript`

AI-rescript a moodboard video for a specific brand. Uses the item's hook, transcript, and winning elements as a structural template, then rewrites the spoken word script for the target brand. Saves the rescript and replication_brief to the item.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID for brand voice context (optional)
brand_voice - Brand voice override (optional)
product - Product or service being promoted (optional)
target_audience - Target audience description (optional)
notes - Additional adaptation notes (optional)
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ rescript: { script, client_id, brand_voice, product, target_audience, generated_at } }}
```

### `DELETE /api/analysis/items/:id/tags`

Remove a tag from a moodboard item.

**Auth:** Required (admin)

**Body:**

```
tag_id - Tag UUID to remove (required)
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/analysis/items/:id/tags`

List all tags applied to a moodboard item.

**Auth:** Required (admin)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{MoodboardTag[]}
```

### `POST /api/analysis/items/:id/tags`

Apply a tag to a moodboard item. Returns 409 if the tag is already applied.

**Auth:** Required (admin)

**Body:**

```
tag_id - Tag UUID to apply (required)
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ success: true }}
```

### `POST /api/analysis/items/:id/thumbnail`

Upload a client-side selected thumbnail for a moodboard item. Accepts scored thumbnail candidates from client-side processing along with the selected frame as a data URL. Uploads the thumbnail to moodboard-thumbnails storage, stores candidate metadata (without dataUrls), and updates thumbnail_url on the item.

**Auth:** Required (any authenticated user)

**Body:**

```
candidates - Array of up to 10 scored thumbnail candidates (timestampMs, score, reasons, dataUrl)
bestTimestampMs - Timestamp of the selected best thumbnail (ms)
thumbnailDataUrl - Base64 data URL (data:image/...) of the selected thumbnail
```

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ thumbnail_url: string }}
```

### `POST /api/analysis/items/:id/transcribe`

Extract a transcript for a moodboard video item. Supports TikTok (via tikwm + scraper) and YouTube (via timedtext API). If the item has no title or a generic one, AI generates a short catchy title from the transcript. Saves transcript, segments, and title.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID (must be type 'video')
```

**Returns:**

```
{MoodboardItem} Updated item record with transcript
```

### `GET /api/analysis/items/:id/video-url`

Return a direct (playable) video URL for a moodboard item. Platform page URLs (TikTok, Instagram, etc.) cannot be loaded in a <video> element, so this endpoint resolves the underlying CDN video URL for client-side use (e.g. frame extraction, thumbnail selection). Currently supports TikTok; returns 400 for other platforms without a direct CDN URL.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Moodboard item UUID
```

**Returns:**

```
{{ videoUrl: string }}
```

### `POST /api/analysis/items/batch-tags`

Fetch all tags for a batch of moodboard items in a single query. Returns a map of item_id → MoodboardTag[]. Useful for efficiently loading tag state for a full board without N+1 queries.

**Auth:** Required (admin)

**Body:**

```
item_ids - Array of 1–200 moodboard item UUIDs
```

**Returns:**

```
{Record<string, MoodboardTag[]>} Map of item UUID to tag array
```

### `POST /api/analysis/notes`

Create a sticky note on a moodboard. Notes are colored canvas annotations with a position. Also bumps the parent board's updated_at timestamp.

**Auth:** Required (admin)

**Body:**

```
board_id - Board UUID (required)
content - Note text content (optional, max 5000 chars, default '')
color - Note color: 'yellow' | 'blue' | 'green' | 'pink' | 'white' (default 'yellow')
position_x - Canvas X position (default 0)
position_y - Canvas Y position (default 0)
```

**Returns:**

```
{MoodboardNote} Created note record
```

### `DELETE /api/analysis/notes/:id`

Permanently delete a moodboard sticky note. Also bumps the parent board's updated_at timestamp.

**Auth:** Required (admin)

**Query params:**

```
id - Note UUID
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/analysis/notes/:id`

Update a moodboard sticky note's content, color, or position. Applies only the provided fields. Also bumps the parent board's updated_at timestamp.

**Auth:** Required (admin)

**Body:**

```
content - Note text (optional, max 5000 chars)
color - Note color: 'yellow' | 'blue' | 'green' | 'pink' | 'white' (optional)
position_x - Canvas X position (optional)
position_y - Canvas Y position (optional)
width - Note width in pixels (optional, nullable)
```

**Query params:**

```
id - Note UUID
```

**Returns:**

```
{MoodboardNote} Updated note record
```

### `DELETE /api/analysis/tags/:id`

Permanently delete a tag. Cascades to all moodboard_item_tags associations.

**Auth:** Required (admin)

**Query params:**

```
id - Tag UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/analysis/templates`

Return the list of built-in board templates. Templates include pre-defined sticky note layouts for common use cases (competitor analysis, content inspiration, campaign planning). Used when creating a new board from a template.

**Auth:** None (public — no sensitive data)

**Returns:**

```
{BoardTemplate[]}
```

---

## Organic Social

_Organic social audits + share links._

### `DELETE /api/analyze-social`

### `GET /api/analyze-social`

### `POST /api/analyze-social`

### `GET /api/analyze-social/:id`

### `POST /api/analyze-social/:id/attach-to-client`

Phase 1 of competitor benchmarking. An admin attaches a completed audit to a client so Phase 2's weekly cron can track the audit's competitor list on an ongoing basis. Admin-only — portal viewers see a "contact your team" placeholder on the report page and never reach this route. We still enforce the role check server-side as defense-in-depth.

### `POST /api/analyze-social/:id/detect-socials`

Phase 1: Scrape the website, extract social links + business context. Returns detected platforms so the user can confirm/add before full processing.

### `POST /api/analyze-social/:id/find-competitor-socials`

Searches each platform for each competitor's social profile. Returns candidates with similarity scores so the confirm-platforms UI can show disambiguation pickers for ambiguous matches. Runs TT + IG + YT in parallel per competitor, competitors in parallel. Admin-only (audit is admin-only).

### `POST /api/analyze-social/:id/process`

Platforms we can actually scrape today. Anything else the user adds gets surfaced on the report as "no scraper yet" rather than silently dropped. Add a platform to this set the moment its scraper + `switch` case land. / // LinkedIn intentionally excluded — not a short-form video platform. // Facebook re-enabled on `cleansyntax/facebook-profile-posts-scraper` for // profile metadata + `apify/facebook-reels-scraper` for Reels (short-form). const SUPPORTED_SCRAPE_PLATFORMS = new Set<AuditPlatform>([ 'tiktok', 'instagram', 'youtube', 'facebook', ]); /** POST /api/analyze-social/[id]/process — Run the full audit pipeline Flow: 1. Scrape the prospect's website → extract business context + social links 2a. Scrape each social platform in parallel (TikTok, Instagram, etc.) 2b. Competitor discovery + scraping — runs in parallel with 2a 3. AI generates the 6-card scorecard 4. Persist scraped images to Supabase Storage (so report survives CDN expiry) 5. Store results

### `POST /api/analyze-social/:id/resume`

Used when the website scrape didn't find social profiles.

### `DELETE /api/analyze-social/:id/share`

Revoke the public share link for an audit by deleting all share records.

**Auth:** Required (admin)

**Query params:**

```
id - Prospect audit UUID
```

**Returns:**

```
{{ shared: false }}
```

### `GET /api/analyze-social/:id/share`

Check if an audit has an active share link and return its details.

**Auth:** Required (admin)

**Query params:**

```
id - Prospect audit UUID
```

**Returns:**

```
{{ shared: false } | { shared: true, token: string, url: string, expires_at: string | null }}
```

### `POST /api/analyze-social/:id/share`

Create a new public share link for a completed audit. Deletes any existing links before generating a fresh 48-char hex token.

**Auth:** Required (admin)

**Query params:**

```
id - Prospect audit UUID (must be in 'completed' status)
```

**Returns:**

```
{{ shared: true, token: string, url: string }}
```

### `POST /api/analyze-social/:id/suggest-competitors`

Runs the LLM competitor-discovery step (website + industry → ranked list) without scraping. The confirm-platforms UI uses this to pre-fill the user-editable competitor inputs.

---

## Analytics

_Social analytics, benchmarking, competitors, ecom tracking._

### `GET /api/analytics/client-series`

### `GET /api/analytics/meta`

### `GET /api/benchmarks`

Phase 3 — powers the audit-derived benchmarking section on /admin/analytics. Returns every active `client_benchmarks` row for the client, each with the latest snapshot per (platform, username) and the full snapshot history (sorted asc) so the chart can plot a timeline. Auth: admin full access; portal viewers must have `user_client_access` for the requested client. RLS handles the viewer path when we use the server client; we double-check server-side for clear error codes.

### `POST /api/benchmarks/track-competitor`

Appends a competitor profile (from an audit) to the brand's single active baseline benchmark — the row created by /api/spying/baseline with `audit_id: null`. Idempotent: re-tracking a competitor already in the snapshot is a no-op + returns `already_tracked`. If the brand has no baseline benchmark yet, returns 412 with `needs_baseline: true` so the UI can route to the Spy hub for that brand to run the onboarding gate. Admin-only — benchmark rows belong to the agency view, never the portal.

### `POST /api/benchmarks/watch`

a single client_benchmarks row, created fresh (no audit origin). Used by the /spying/watch wizard.

### `DELETE /api/ecom-competitors`

**Auth:** Required (admin)

### `GET /api/ecom-competitors`

**Auth:** Required (admin)

### `POST /api/ecom-competitors`

**Auth:** Required (admin)

**Body:**

```
client_id, domain, platform?, display_name?
```

### `POST /api/ecom-competitors/:id/refresh`

for a single competitor now and persist a new snapshot.

**Auth:** Required (admin)

### `DELETE /api/meta-ad-tracker/pages`

**Auth:** Required (admin)

### `GET /api/meta-ad-tracker/pages`

creatives (most-recent-first, capped at 6 per page).

**Auth:** Required (admin)

### `POST /api/meta-ad-tracker/pages`

**Auth:** Required (admin)

### `POST /api/meta-ad-tracker/pages/:id/refresh`

library URL via Apify now and upsert each creative on (tracked_page_id, ad_archive_id) so we keep one row per ad and move `last_seen_at` forward on repeat scrapes.

**Auth:** Required (admin)

---

## The Nerd AI

_AI assistant with tool-calling + @mention context._

### `GET /api/nerd/artifacts`

GET — list artifacts, optionally filtered by client_id

### `POST /api/nerd/artifacts`

POST — save a new artifact

### `DELETE /api/nerd/artifacts/:id`

DELETE — remove an artifact

### `GET /api/nerd/artifacts/:id`

GET — fetch a single artifact by ID

### `POST /api/nerd/chat`

Content type — pdf_text for extracted PDF content, image for base64, text for plain text files */ type: z.enum(['pdf_text', 'image', 'text']), /** Original filename */ name: z.string().max(256), /** Extracted text content (for pdf_text/text) or base64 data URL (for image) */ content: z.string().max(500_000), }); const chatSchema = z.object({ messages: z .array(z.object({ role: z.enum(['user', 'assistant', 'tool']), content: z.string(), tool_call_id: z.string().optional(), })) .min(1), /** Parsed @mentions from the latest user message */ mentions: z.array(mentionSchema).optional(), /** If a pending action was confirmed or cancelled */ actionConfirmation: z.object({ toolName: z.string(), arguments: z.record(z.string(), z.unknown()), confirmed: z.boolean(), }).optional(), /** Conversation ID for persistence — if omitted, creates a new conversation */ conversationId: z.string().uuid().optional(), /** Portal mode — set by portal client, scopes to the mentioned client only */ portalMode: z.boolean().optional(), /** Optional frontend context for first message (e.g. opened from Strategy Lab) */ sessionHint: z.string().max(500).optional(), /** IDs of topic searches to attach as context for the LLM */ searchContext: z.array(z.string().uuid()).max(5).optional(), /** Mixed-type analyses attached to this chat session. Unlike `searchContext` (which dumps full topic-search blocks into the system prompt), `scopeContext` injects only a compact index of what's available and lets the agent pull detail on demand via tools like `get_audit_summary` and `get_topic_search_summary`. This is the progressive-context primitive the Strategy Lab + per-analysis drawer use. Portal users currently have no drawer / Strategy Lab surface that populates this field, so the server ignores it for them as defense-in-depth. / scopeContext: z .array( z.object({ type: z.enum(['topic_search', 'audit', 'social_analytics']), id: z.string().uuid(), }), ) .max(10) .optional(), /** Explicit Nerd surface mode. When 'strategy-lab' (or the legacy alias 'content-lab'), the chat route appends the Strategy Lab scripting addendum (behavioural rules + preloaded scripting skills from nerd_skills) to the base system prompt. Used by components/content-lab/content-lab-nerd-chat.tsx and the portal. / mode: z.enum(['content-lab', 'strategy-lab']).optional(), /** File attachments — client-side extracted content (PDF text, image base64, plain text) */ attachments: z.array(attachmentSchema).max(10).optional(), }); // --------------------------------------------------------------------------- // System prompt // --------------------------------------------------------------------------- /** Admin-mode system prompt. Brand-aware so an AC-domain user is told they live inside "Anderson Collaborative Cortex" — never leaks the other agency's name if a viewer asks "what agency am I using?". / function buildAdminSystemPrompt(brandName: string): string { return `You are "The Nerd" — the in-house social media marketing strategist for ${brandName}, a creative agency. You live inside ${brandName} Cortex, the agency's internal platform. You are THE expert on: - Social media marketing strategy (Instagram, TikTok, YouTube, Facebook) - Short-form video content (hooks, pacing, trends, virality) - Content pillar frameworks and editorial calendars - Platform-specific best practices and algorithm behavior - Audience growth, engagement optimization, and paid media amplification - Brand voice development and content positioning You have full access to every client in the ${brandName} portfolio and can take actions on their behalf using tools. Each client has a **knowledge vault** — an Obsidian-style knowledge base with structured entries (brand profiles, web pages, meeting notes, documents, ideas). The vault is semantically indexed — use **search_knowledge_base** with a natural language query to find the most relevant entries. Do NOT try to load all entries at once; always search first, then drill deeper if needed. You can also save useful information using create_knowledge_note, save hard client corrections using create_client_constraint, and import meeting transcripts using import_meeting_notes. KNOWLEDGE SEARCH PATTERN (QMD): 1. **Query** — use search_knowledge_base with a descriptive query to find relevant context 2. **Match** — review the returned entries and identify the most relevant ones 3. **Decide** — answer using the matched context, or search again with a refined query if needed Never load all knowledge entries into your response. The vault may contain hundreds of entries across meeting notes, brand profiles, web pages, and documents. Semantic search will find what you need. TOOL USAGE RULES: - You have tools to manage tasks, schedule posts, view analytics, manage clients, shoots, moodboards, knowledge vaults, and more. - Use tools proactively when the user's request implies an action (e.g., "create a task" → use create_task tool). - When referring to clients or team members, users use @mentions. The system resolves these to IDs for you. - For READ tools (listing, viewing): execute immediately and summarize results naturally. - For WRITE tools (creating, updating): describe what you'll do, then call the tool. The frontend will show a confirmation card. - For DESTRUCTIVE tools: tell the user to do it manually via the UI and provide a link. - After a tool call completes, summarize the result in natural language. Don't just dump JSON. - If a tool fails, explain the error clearly and suggest alternatives. - You can call multiple tools in sequence if the user's request requires it. - For Strategy Lab / analysis-board questions, prefer the dedicated board + video tools before guessing from limited context. VIDEO ANALYSIS IN CHAT (same capabilities as the former analysis UI, without sidebar navigation): - When the user pastes a **video URL** (TikTok, YouTube, Instagram Reel, or direct .mp4/.webm) or wants transcript / hook / rescript work, use **add_video_url_for_analysis** (optional client_id when a client is @mentioned), then **run_hook_analysis_for_video** after the transcript exists, and **generate_video_rescript** when they want a brand adaptation of the script. Use **transcribe_analysis_item** only to retry or refresh transcription. - If they **only upload or share a video without instructions**, guide them conversationally through the same steps the product UI would: confirm you have the video, offer transcript first, then ask in natural language whether they want hook analysis (e.g. "Want me to break down the hook and score it?" not button labels like "Generate hooks"). - Never present fake UI buttons; use short questions or bullet options in prose. - For affiliate questions, use affiliate tools before giving recommendations from memory. BEHAVIOR RULES: - Be direct, opinionated, and actionable. You're a senior strategist, not a generic chatbot. - Lead with the insight, not the preamble. Skip "Great question!" / "Absolutely!" / "Here's what I think" — jump straight to the answer. - Reference specific client data when answering questions about brands. ALWAYS search the client's knowledge vault (search_knowledge_base) before giving brand-specific advice — don't rely on memory or assumptions about their positioning. - When a client correction changes what future AI should generate ("we don't do that", "don't mention that", "we no longer offer that", "never use that CTA"), save it with create_client_constraint so future Trend Finder, topic plan, and script generation avoids it. - Use markdown formatting: headers, bullets, bold for emphasis. Keep it scannable. - When you don't have data for something, say so — don't fabricate metrics. - If analytics data is provided, analyze it with strategic insight, not just number recitation. Lead with the "so what" — what should change based on these numbers. - When using @mentions, match the names the user provided to the resolved IDs in the system context. - Be specific. "Post more Reels" is useless. "Post 4 Reels/week using hook type X because your completion rate on Reels is 2x your carousel rate" is useful. Ground recommendations in data or the client's vault. - Every response the user asks for should be structured as a shareable deliverable — clear title, scannable sections, actionable next steps. The user can export any message as a PDF, so write as if your output will be printed and handed to a client. - End outputs with the final deliverable. Never append closing offers like "I can also create..." or "If you want, I can..." — deliver the complete request without upselling additional work. - When the user asks for content pillars, each pillar gets ONE sentence of justification (≤15 words), labeled "Why:" or "Justification:". No multi-paragraph explanations. - When posting cadence is requested, specify it per-pillar in a table or list. Don't bury cadence in aggregate weekly totals. - When diagnosing performance, cap root causes at 4 and prioritized tests at 3–4. Follow the diagnosis with a one-sentence severity assessment (e.g., "This is a hook problem, not a topic problem") so the user knows what to focus on first. VISUALS AND REPORTS (markdown): - When a diagram, flowchart, Gantt, or process map would help more than text, use a fenced **mermaid** code block (\`\`\`mermaid ... \`\`\`). - For compact HTML/CSS/SVG layouts (side-by-side comparisons, SVG bar charts, styled summaries), use a fenced **html** code block (\`\`\`html ... \`\`\`). Keep markup self-contained; avoid relying on external scripts — the UI renders sanitized HTML in a sandboxed frame. - For long-form deliverables, use clear headings and bullets; users can export the assistant reply as a PDF or print from the chat. - Prefer visuals over walls of text. A mermaid flowchart of a content strategy is more useful than a paragraph describing it. An html comparison table is more useful than listing pros and cons in paragraphs. SHORT-FORM VIDEO SCRIPT FORMAT (strict — when user asks for a TikTok / Reel / Shorts script): - Open IMMEDIATELY with the quoted hook on line 1. No preamble, no style notes, no metadata before the hook. - Format the body as numbered beats: \`1.\`, \`2.\`, \`3.\`, etc. Exactly ONE sentence per beat. Never use prose paragraphs for beat-by-beat scripts. - Pattern interrupts must be embedded INSIDE the dialogue/narration itself (typically beat 4-5) — a content shift, a tonal reversal, or an unexpected statement. Never use stage directions in brackets like [RECORD SCRATCH] or [PAUSE] — this is a spoken script, not a shot list. - Each numbered beat MUST be exactly ONE complete sentence. If a beat is combining multiple ideas, split it or pick the strongest. - End with a direct CTA as the final beat — a statement or command, not a rhetorical question. For Gen Z / skeptical audiences, make it ironic or self-aware. Examples: "Sleep is the real flex." / "Choose your actual recovery arc." Avoid "Follow for more" / "Want X or Y?" - End the script cleanly after the CTA. Never append meta-commentary like "I can also make..." or "Let me know if you want..." unless the user explicitly asks. AGENCY KNOWLEDGE GRAPH: You have access to the agency knowledge graph — 9,857 nodes covering SOPs, skills, patterns, methodology, meeting notes, client profiles, and more. When asked about processes, best practices, or "how do we do X", ALWAYS search the knowledge graph first using search_agency_knowledge before answering from your own knowledge. The graph contains ${brandName}'s actual documented procedures. - Use search_agency_knowledge to find relevant nodes by semantic search - Use get_knowledge_node to read the full content of a specific node - Use list_knowledge_by_kind to browse all nodes of a type (e.g. all SOPs, all skills) - Use create_agency_knowledge_note to save new knowledge from conversations`; } /** Portal-specific system prompt — scoped to a single client */ function buildPortalSystemPrompt(clientName: string, brandName: string): string { return `You are "The Nerd" — a social media marketing strategist working with ${clientName}. You live inside ${brandName} Cortex, the agency's client portal. You are THE expert on: - Social media marketing strategy (Instagram, TikTok, YouTube, Facebook) - Short-form video content (hooks, pacing, trends, virality) - Content pillar frameworks and editorial calendars - Platform-specific best practices and algorithm behavior - Audience growth, engagement optimization, and paid media amplification - Brand voice development and content positioning You are helping ${clientName} with their social media strategy. You have access to their knowledge vault and brand data. Each client has a **knowledge vault** — an Obsidian-style knowledge base with structured entries (brand profiles, web pages, meeting notes, documents, ideas). The vault is semantically indexed — use **search_knowledge_base** with a natural language query to find the most relevant entries. Do NOT try to load all entries at once; always search first, then drill deeper if needed. KNOWLEDGE SEARCH PATTERN (QMD): 1. **Query** — use search_knowledge_base with a descriptive query to find relevant context 2. **Match** — review the returned entries and identify the most relevant ones 3. **Decide** — answer using the matched context, or search again with a refined query if needed Never load all knowledge entries into your response. The vault may contain hundreds of entries. Semantic search will find what you need. TOOL USAGE RULES: - You have read-only tools to search knowledge and view client information. - Use tools proactively when the user's request implies a lookup (e.g., "what's our brand voice" → use search_knowledge_base). - For READ tools (listing, viewing): execute immediately and summarize results naturally. - After a tool call completes, summarize the result in natural language. Don't just dump JSON. - If a tool fails, explain the error clearly and suggest alternatives. BEHAVIOR RULES: - Be direct, opinionated, and actionable. You're a senior strategist, not a generic chatbot. - Reference specific client data when answering questions about the brand. - Use markdown formatting: headers, bullets, bold for emphasis. Keep it scannable. - When you don't have data for something, say so — don't fabricate metrics. - If analytics data is provided, analyze it with strategic insight, not just number recitation.`; } /** Tools that portal (viewer) users are allowed to use. ⚠️ Adding a tool here WITHOUT adding a caller-org check inside its handler is a cross-org data leak. The admin Supabase client bypasses RLS, so every handler that accepts a client_id / entry_id / search_id from the caller must look up the caller's organization_id and reject when the resource belongs to another org. Current gates (keep this block in sync with the handlers): - search_knowledge_base → requireClientAccess in knowledge.ts - query_client_knowledge → requireClientAccess in knowledge.ts - get_knowledge_entry → requireClientAccess on entry.client_id - get_client_details → inline role/org check in clients.ts - generate_video_ideas → requireClientAccess in knowledge.ts - extract_topic_signals → filter search_ids by caller org - create_topic_plan → inline role/org check before insert / const PORTAL_ALLOWED_TOOLS = new Set([ 'search_knowledge_base', 'query_client_knowledge', 'get_knowledge_entry', 'get_client_details', 'generate_video_ideas', 'extract_topic_signals', 'create_topic_plan', // Portal drawer + Strategy Lab — portal users can summarize their own // topic searches (ownership enforced at scopeContext filter + already in // get_search_results by RLS). `get_topic_search_summary` is the compact // markdown variant the drawer leans on. All "spy" tools (audit / TT Shop // summaries, live market lookups) stay off this list — admin-only. 'get_topic_search_summary', 'get_search_results', ]); // --------------------------------------------------------------------------- // Context builders // --------------------------------------------------------------------------- interface ClientRow { id: string; name: string; slug: string; industry: string | null; target_audience: string | null; brand_voice: string | null; topic_keywords: string[] | null; website_url: string | null; agency: string | null; services: string[] | null; preferences: Record<string, unknown> | null; health_score: string | null; logo_url: string | null; } interface SocialProfileRow { id: string; client_id: string; platform: string; username: string; } interface StrategyRow { client_id: string; executive_summary: string | null; content_pillars: unknown; } function buildClientSummary(c: ClientRow, profiles: SocialProfileRow[], strategy: StrategyRow | null): string { const parts: string[] = []; parts.push(`### ${c.name} (slug: ${c.slug}, id: ${c.id})`); if (c.agency) parts.push(`Agency: ${c.agency}`); if (c.industry) parts.push(`Industry: ${c.industry}`); if (c.services?.length) parts.push(`Services: ${c.services.join(', ')}`); if (c.target_audience) parts.push(`Target Audience: ${c.target_audience}`); if (c.brand_voice) parts.push(`Brand Voice: ${c.brand_voice}`); const prefs = c.preferences; if (prefs) { if ((prefs.tone_keywords as string[])?.length) parts.push(`Tone: ${(prefs.tone_keywords as string[]).join(', ')}`); if ((prefs.topics_lean_into as string[])?.length) parts.push(`Lean Into: ${(prefs.topics_lean_into as string[]).join(', ')}`); if (prefs.posting_frequency) parts.push(`Posting Frequency: ${prefs.posting_frequency}`); } if (profiles.length > 0) { parts.push(`Social Accounts:`); for (const p of profiles) { parts.push(` - ${p.platform}: @${p.username} (profile_id: ${p.id})`); } } if (strategy?.executive_summary) { parts.push(`Strategy: ${strategy.executive_summary}`); } return parts.join('\n'); } /** Notify all super_admins when a guardrail fires. Non-blocking. */ async function notifySuperAdminsGuardrail( adminClient: ReturnType<typeof createAdminClient>, ctx: { userId: string; userEmail: string; message: string; ruleName: string }, ) { try { const { data: superAdmins } = await adminClient .from('users') .select('id') .eq('is_super_admin', true); if (!superAdmins || superAdmins.length === 0) return; // Don't notify the super_admin about their own messages const recipients = superAdmins.filter((sa) => sa.id !== ctx.userId); if (recipients.length === 0) return; const truncatedMsg = ctx.message.length > 120 ? ctx.message.slice(0, 120) + '...' : ctx.message; const notifications = recipients.map((sa) => ({ recipient_user_id: sa.id, type: 'guardrail_triggered', title: `Guardrail triggered: ${ctx.ruleName}`, body: `${ctx.userEmail} asked: "${truncatedMsg}"`, link_path: '/admin/nerd/settings', is_read: false, })); await adminClient.from('notifications').insert(notifications); } catch (err) { console.error('[guardrail-notify] Failed to notify super_admins:', err); } } async function buildKnowledgeSummary(clientId: string): Promise<string> { try { const { getKnowledgeEntries, getBrandProfile } = await import('@/lib/knowledge/queries'); const entries = await getKnowledgeEntries(clientId); if (entries.length === 0) return ''; const parts: string[] = ['Knowledge Base:']; const counts: Record<string, number> = {}; for (const e of entries) { counts[e.type] = (counts[e.type] ?? 0) + 1; } parts.push(` Entries: ${Object.entries(counts).map(([t, c]) => `${c} ${t}(s)`).join(', ')}`); // Full brand profile const brandProfile = await getBrandProfile(clientId); if (brandProfile) { parts.push(` Brand Profile:\n${brandProfile.content.substring(0, 1500)}`); } // Structured entity summaries from knowledge entries const entitySummary: string[] = []; const people = new Set<string>(); const products = new Set<string>(); const locations = new Set<string>(); for (const entry of entries) { const meta = entry.metadata as Record<string, unknown> | null; const entities = meta?.entities as { people?: { name: string; role?: string }[]; products?: { name: string; description?: string }[]; locations?: { address: string }[]; } | undefined; if (!entities) continue; for (const p of entities.people ?? []) people.add(p.role ? `${p.name} (${p.role})` : p.name); for (const p of entities.products ?? []) products.add(p.name); for (const l of entities.locations ?? []) locations.add(l.address); } if (people.size > 0) entitySummary.push(` Key People: ${[...people].join(', ')}`); if (products.size > 0) entitySummary.push(` Products/Services: ${[...products].join(', ')}`); if (locations.size > 0) entitySummary.push(` Locations: ${[...locations].join(', ')}`); if (entitySummary.length > 0) parts.push(...entitySummary); // Meeting notes summaries (last 5) const meetings = entries .filter((e) => e.type === 'meeting_note') .slice(0, 5); if (meetings.length > 0) { parts.push(' Recent Meetings:'); for (const m of meetings) { const summary = m.content.substring(0, 200); parts.push(` - ${m.title}: ${summary}...`); } } return parts.join('\n'); } catch (err) { console.error(`buildKnowledgeSummary failed for client ${clientId}:`, err instanceof Error ? err.message : err); return ''; } } // --------------------------------------------------------------------------- // Handler // --------------------------------------------------------------------------- /** POST /api/nerd/chat Streaming AI chat endpoint for "The Nerd" — an in-house social media strategist AI. Loads the full client portfolio and team context, then streams a response from Claude via OpenRouter. Supports tool use with up to 5 sequential tool calls per request. Write-risk tools emit action_confirmation events; destructive tools are blocked.

**Auth:** Required (any authenticated user)

**Body:**

```
messages - Conversation history (required, min 1 message)
mentions - Optional @mention resolutions from the latest user message
actionConfirmation - Optional confirmed/cancelled tool action to execute
```

**Returns:**

```
SSE stream of JSON lines: { type: 'text' | 'tool_result' | 'action_confirmation' | 'action_result', ... }
```

### `GET /api/nerd/clients`

List active clients for use by The Nerd AI assistant. Returns name, slug, and agency for all active clients, ordered alphabetically.

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ name: string, slug: string, agency: string | null }[]}
```

### `POST /api/nerd/command`

### `GET /api/nerd/conversations`

Lists this user's Nerd conversations, newest first. Optional ?clientId= filter scopes the list to conversations tagged with that client — used by the Strategy Lab conversation picker so the header dropdown only shows threads started for the currently-open client. The client_id column lives on nerd_conversations as of migration 096. If that migration hasn't run yet the filter is silently dropped so the endpoint still returns the unfiltered list (admin Nerd sidebar behaviour) rather than erroring.

### `POST /api/nerd/conversations`

### `DELETE /api/nerd/conversations/:id`

### `GET /api/nerd/conversations/:id`

### `PATCH /api/nerd/conversations/:id`

### `DELETE /api/nerd/conversations/:id/share`

DELETE — revoke share link

### `GET /api/nerd/conversations/:id/share`

GET — check if a conversation has an active share link

### `POST /api/nerd/conversations/:id/share`

POST — create a share link for a conversation

### `POST /api/nerd/conversations/by-scope`

Resolves the per-user, per-analysis Nerd conversation for a drawer chat. Each user has exactly one thread per (scopeType, scopeId); this endpoint finds or creates it and returns `{ conversationId }`. Admin-only. Drawer surfaces aren't exposed to portal users yet.

### `DELETE /api/nerd/guardrails`

DELETE /api/nerd/guardrails — remove a guardrail

### `GET /api/nerd/guardrails`

GET /api/nerd/guardrails — list all guardrails

### `PATCH /api/nerd/guardrails`

PATCH /api/nerd/guardrails — update a guardrail

### `POST /api/nerd/guardrails`

POST /api/nerd/guardrails — create a guardrail

### `GET /api/nerd/mentions`

Return all active clients and team members for @mention autocomplete in The Nerd chat. Returns both entities in a single response to minimize round-trips.

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ clients: MentionClient[], team: MentionTeamMember[] }}
```

### `GET /api/nerd/searches`

### `DELETE /api/nerd/skills`

DELETE /api/nerd/skills — remove a skill

### `GET /api/nerd/skills`

GET /api/nerd/skills — list all skills

### `PATCH /api/nerd/skills`

PATCH /api/nerd/skills — update a skill

### `POST /api/nerd/skills`

POST /api/nerd/skills — create + sync from GitHub

### `GET /api/nerd/slash-commands`

Returns the unified slash command list for the Nerd composer: the hardcoded built-in commands from lib/nerd/slash-commands.ts plus any user-installed skills from the nerd_skills table that have a command_slug set. The client uses this to populate both the inline slash menu (typing "/") and the Commands catalog popover in the chat header. Skill-based commands expose minimal metadata — the full content + prompt template stays server-side and is applied when /<slug> is invoked through the chat pipeline.

---

## Scheduler

_Social media scheduling, publishing, captions, reviews._

### `POST /api/scheduler/ai/hashtag-suggestions`

Generate 15-20 hashtag suggestions for a post caption using AI, grouped into high_volume, niche, and branded categories. Optionally uses client context (industry + keywords) to tailor suggestions.

**Auth:** Required (any authenticated user)

**Body:**

```
caption - Post caption to base suggestions on (optional)
client_id - Client UUID for industry/keyword context (optional)
```

**Returns:**

```
{{ hashtags: string[], groups: { high_volume, niche, branded } }}
```

### `POST /api/scheduler/ai/improve-caption`

Improve an existing caption or generate a new one from scratch using AI. Uses client brand voice, saved captions/CTAs, and target audience for context. Returns only the final caption text (no markdown formatting).

**Auth:** Required (any authenticated user)

**Body:**

```
caption - Caption to improve; omit or leave blank to generate from scratch
client_id - Client UUID for brand context and saved captions (optional)
```

**Returns:**

```
{{ improved_caption: string }}
```

### `GET /api/scheduler/analytics`

Fetch post analytics from the Late API for all social profiles linked to a client that have a late_account_id. Returns analytics merged across all connected accounts.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Client UUID (required)
start - Analytics start date (required)
end - Analytics end date (required)
```

**Returns:**

```
{{ analytics: AnalyticsItem[] }}
```

### `POST /api/scheduler/auto-schedule`

Optional media IDs to schedule (defaults to all unused media) */ media_ids: z.array(z.string()).optional(), }); /** POST /api/scheduler/auto-schedule Automatically schedule all unused media for a client across a date range. AI generates a unique caption per video using brand context and saved captions. Posts are evenly spaced based on posts_per_week and distributed across the date range. Each successful post is linked to platform profiles and media, and media is marked as used.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID (required)
start_date - Start date YYYY-MM-DD (required)
end_date - End date YYYY-MM-DD (required)
posts_per_week - Posts per week 1-14 (default 3)
posting_time - Daily posting time HH:MM (default '12:00')
platform_profile_ids - Social profile UUIDs to post to (min 1 required)
media_ids - Specific media UUIDs to schedule (optional; defaults to all unused media)
```

**Returns:**

```
{{ success: true, scheduled: number, errors: number, results: ScheduleResult[] }}
```

### `POST /api/scheduler/connect`

Initiate Zernio OAuth to connect a social account for a client. Creates a Zernio profile (stored as late_profile_id) if missing, then returns authUrl to redirect the user.

**Auth:** Required (any authenticated user)

**Body:**

```
platform - 'facebook' | 'instagram' | 'tiktok' | 'youtube' (required)
client_id - Client UUID (required)
```

**Returns:**

```
{{ authUrl: string }}
```

### `GET /api/scheduler/connect/callback`

OAuth callback from Zernio after a social account connection. Verifies the signed state token, reads the connected account details from query params (standard flow: Zernio appends ?connected={platform}&accountId=Y&username=Z), upserts the social_profile into the DB, and redirects back to the scheduler UI.

**Auth:** None (OAuth callback — no session required, but state token is HMAC-verified)

**Query params:**

```
state - Signed state token containing client_id and platform (required)
connected - Platform name from Zernio (e.g. instagram, tiktok)
accountId - Zernio account ID for the connected account
username - Connected account username
profileId - Zernio profile ID (echoed back)
```

**Returns:**

```
Redirect to /admin/scheduler
```

### `GET /api/scheduler/media`

List scheduler media for a client, ordered by creation date descending. Optionally filters to only show media not yet attached to any post.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Client UUID to filter by (required)
unused - Pass 'true' to return only unused media (optional)
```

**Returns:**

```
{{ media: SchedulerMedia[] }}
```

### `POST /api/scheduler/media`

Two-action endpoint for media uploads. With action='get-upload-url', returns a presigned upload URL and public URL from Late. With action='confirm-upload', saves the media record to scheduler_media after the client has uploaded directly to Late.

**Auth:** Required (any authenticated user)

**Body:**

```
action - 'get-upload-url' | 'confirm-upload' (required)
contentType - MIME type of the file (for get-upload-url)
filename - Original filename (for get-upload-url and confirm-upload)
client_id - Client UUID (for confirm-upload)
public_url - Late public URL of the uploaded file (for confirm-upload)
file_size_bytes - File size in bytes (for confirm-upload)
mime_type - MIME type (for confirm-upload)
thumbnail_url - Thumbnail URL (for confirm-upload, optional)
```

**Returns:**

```
{{ uploadUrl, publicUrl }} | SchedulerMedia record
```

### `DELETE /api/scheduler/media/:id`

Permanently delete a scheduler media item. Returns 409 if the media is still attached to any scheduled post — remove it from the post first.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Scheduler media UUID
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/scheduler/posts`

List scheduled posts for a client, with associated platforms, media, and review link status. Returns posts ordered by scheduled_at ascending.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Client UUID to filter by (required)
start - Filter posts on or after this datetime (optional)
end - Filter posts on or before this datetime (optional)
```

**Returns:**

```
{{ posts: TransformedScheduledPost[] }}
```

### `POST /api/scheduler/posts`

Create a new scheduled post. Persists the post, links platform profiles and media, then syncs to the Late API if any linked profiles have a late_account_id and the status is 'scheduled' (not 'draft'). Late sync failures are logged but non-fatal.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID (required)
caption - Post caption text (default '')
hashtags - Array of hashtags (default [])
scheduled_at - ISO datetime for scheduling, or null for drafts
status - 'draft' | 'scheduled' (default 'draft')
platform_profile_ids - Social profile UUIDs to publish to
media_ids - Scheduler media UUIDs to attach
cover_image_url - Cover image URL for video posts (nullable)
tagged_people - Instagram tagged people handles
collaborator_handles - Instagram collaborator handles
```

**Returns:**

```
{{ post: ScheduledPost }}
```

### `DELETE /api/scheduler/posts/:id`

Delete a scheduled post. Attempts to remove the post from Late API first if a late_post_id exists (non-fatal on failure), unmarks attached media as used, then deletes the post record (cascades to platforms, media links, and review links).

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Scheduled post UUID
```

**Returns:**

```
{{ success: true }}
```

### `PUT /api/scheduler/posts/:id`

Update a scheduled post's fields, platform links, and/or media attachments. When media is replaced, old media items are unmarked as used. Platform links are replaced atomically (delete then insert) if platform_profile_ids is provided.

**Auth:** Required (any authenticated user)

**Body:**

```
caption - Updated caption (optional)
hashtags - Updated hashtags array (optional)
scheduled_at - Updated schedule datetime or null (optional)
status - 'draft' | 'scheduled' (optional)
platform_profile_ids - Replace platform profile links (optional)
media_ids - Replace media attachments (optional)
cover_image_url - Updated cover image URL (optional)
tagged_people - Updated tagged people (optional)
collaborator_handles - Updated collaborator handles (optional)
```

**Query params:**

```
id - Scheduled post UUID
```

**Returns:**

```
{{ post: ScheduledPost }}
```

### `POST /api/scheduler/posts/batch-publish`

Queue multiple scheduled or draft posts for immediate publishing by setting their status to 'publishing' and scheduled_at to now. The cron job picks them up on its next run.

**Auth:** Required (any authenticated user)

**Body:**

```
post_ids - Array of scheduled post UUIDs to publish (min 1 required)
```

**Returns:**

```
{{ published: number, message: string }}
```

### `POST /api/scheduler/posts/publish-drafts`

Promote all draft posts with a scheduled date for a client to 'scheduled' status and sync each to the Late API. Posts without Late-connected profiles are skipped. Late sync errors per post are logged but non-fatal.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID whose drafts to promote (required)
```

**Returns:**

```
{{ published: number, synced: number, message: string }}
```

### `GET /api/scheduler/profiles`

List active social profiles connected to a client for use in the post scheduler. Returns profiles that have been connected via Late OAuth, ordered by platform name.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Client UUID (required)
```

**Returns:**

```
{{ profiles: { id, platform, username, avatar_url, late_account_id }[] }}
```

### `GET /api/scheduler/review`

Fetch a scheduled post with its review link data by token. Public endpoint used by the client review page. Returns 410 if the review link has expired.

**Auth:** None (public — token provides authorization)

**Query params:**

```
token - Post review link token (required)
```

**Returns:**

```
{{ post, comments, review_link_id }}
```

### `POST /api/scheduler/review`

Generate a client review link for a scheduled post. Creates a post_review_links record and returns the shareable URL.

**Auth:** Required (any authenticated user)

**Body:**

```
post_id - Scheduled post UUID (required)
```

**Returns:**

```
{{ link: PostReviewLink, url: string }}
```

### `POST /api/scheduler/review/comment`

Add a review comment to a post review link. Public endpoint — clients use this to approve, request changes, or leave a general comment without needing an account. Returns 410 if the review link has expired.

**Auth:** None (public — review_link_id provides authorization)

**Body:**

```
review_link_id - Post review link UUID (required)
author_name - Commenter name (default 'Anonymous')
content - Comment text (required)
status - 'approved' | 'changes_requested' | 'comment' (default 'comment')
```

**Returns:**

```
{{ comment: PostReviewComment }}
```

### `DELETE /api/scheduler/saved-captions`

Permanently delete a saved caption template by ID.

**Auth:** Required (any authenticated user)

**Query params:**

```
id - Saved caption UUID (required)
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/scheduler/saved-captions`

List all saved caption templates for a client, ordered by creation date descending.

**Auth:** Required (any authenticated user)

**Query params:**

```
client_id - Client UUID (required)
```

**Returns:**

```
{{ captions: SavedCaption[] }}
```

### `POST /api/scheduler/saved-captions`

Save a caption template (title, text, hashtags) to the client's saved captions library. Saved captions are used as style reference by AI caption improvement.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID (required)
title - Caption template name (required)
caption_text - Caption body text (optional)
hashtags - Array of hashtags without # prefix (optional)
```

**Returns:**

```
{{ caption: SavedCaption }}
```

### `GET /api/scheduler/share`

Fetch posts for a shared calendar review link. Public endpoint used by the client review page. Returns posts enriched with platform info, media thumbnails, and per-post review status from any existing comments.

**Auth:** None (public — token provides authorization)

**Query params:**

```
token - Calendar review link token (required)
```

**Returns:**

```
{{ client_name, label, posts: EnrichedPost[] }}
```

### `POST /api/scheduler/share`

Create a shareable calendar review link for a selected set of posts. Clients use the generated URL to view and provide feedback on scheduled content without logging in.

**Auth:** Required (any authenticated user)

**Body:**

```
client_id - Client UUID (required)
post_ids - Scheduled post UUIDs to share (min 1 required)
label - Label for the review link (default 'Review link')
```

**Returns:**

```
{{ link: ClientReviewLink, url: string }}
```

### `POST /api/scheduler/share/feedback`

Submit review feedback on a post via a shared calendar link. When a client approves a draft post, it is automatically promoted to 'scheduled' and synced to Late API. Public endpoint — no auth required, authorization is via share token.

**Auth:** None (public — share_token provides authorization)

**Body:**

```
share_token - Calendar review link token (required)
post_id - Scheduled post UUID to comment on (required)
author_name - Commenter name (required)
content - Feedback text (required)
status - 'approved' | 'changes_requested' | 'comment' (default 'comment')
```

**Returns:**

```
{{ comment: PostReviewComment }}
```

### `POST /api/scheduler/webhooks`

First non-empty string among keys on obj. */ function pickStr(obj: Record<string, unknown> | null, ...keys: string[]): string { if (!obj) return ''; for (const k of keys) { const v = obj[k]; if (typeof v === 'string' && v) return v; } return ''; } /** Zernio sends either `data: { postId }` (legacy) or top-level `post: { id, ... }`. Account events may use `data` or top-level `account`. / function extractZernioWebhookIds(body: Record<string, unknown>): { postId: string; accountId: string; post: Record<string, unknown> | null; account: Record<string, unknown> | null; data: Record<string, unknown> | null; } { const data = asRecord(body.data); const post = asRecord(body.post); const account = asRecord(body.account); const postId = pickStr(data, 'postId', 'post_id', '_id', 'id') || pickStr(post, 'id', '_id', 'postId') || ''; const accountId = pickStr(data, 'accountId', 'account_id') || pickStr(account, 'id', '_id', 'accountId') || ''; return { postId, accountId, post, account, data }; } function normalizeWebhookEvent(raw: string): string { return raw.trim().toLowerCase().replace(/\s+/g, '.'); } /** POST /api/scheduler/webhooks Receive **Zernio** webhooks and update scheduled post statuses. Handles post.published, post.failed, post.scheduled, post.partial / post.partial_publish, account.connected, and account.disconnected. Verifies HMAC when the **Zernio webhook secret** is configured via `ZERNIO_WEBHOOK_SECRET` (legacy alias: `LATE_WEBHOOK_SECRET`).

**Auth:** HMAC SHA-256 in X-Zernio-Signature, X-Late-Signature, or X-Signature (secret required)

**Returns:**

```
{{ received: true }}
```

---

## Reporting

_Reports, digests, top posts, Instagram insights, ads, affiliates._

### `GET /api/affiliates`

Fetch comprehensive affiliate analytics for a client within a date range. Returns KPIs (new/total/active affiliates, referrals, revenue, commission, clicks, pending payouts), snapshot trend data for charts, a ranked list of top affiliates with period performance, recent referrals, and pending payout details.

**Auth:** Required (admin)

**Query params:**

```
clientId - Client UUID (required)
start - Start date in YYYY-MM-DD format (required)
end - End date in YYYY-MM-DD format (required)
```

**Returns:**

```
{{ kpis, snapshots, topAffiliates, recentReferrals, pendingPayouts }}
```

### `GET /api/instagram/accounts`

### `GET /api/instagram/demographics`

### `GET /api/instagram/insights`

### `GET /api/instagram/media`

### `GET /api/reporting/audience-insights`

### `GET /api/reporting/best-time`

Proxies /v1/analytics/best-time — day-of-week × hour engagement slots ranked by avg_engagement. When clientId is supplied we resolve its Zernio profileId so Zernio can scope the aggregation to that client.

### `GET /api/reporting/cadence`

Posting activity heatmap — array of { day: YYYY-MM-DD, count } rows computed from post_metrics.published_at. The UI renders a day-by-week grid (GitHub-style) so you can see when posts actually went out.

### `GET /api/reporting/demographics`

Pulls demographic breakdowns from Zernio's Instagram / YouTube dedicated endpoints. We resolve the Zernio accountId from our social_profiles row, then proxy to the platform-specific wrapper.

### `GET /api/reporting/gmb`

Unified Google Business Profile analytics: performance metrics (views, calls, directions, website clicks) + top search keywords. Returns { connected: false } when the client has no GMB account linked to Zernio yet, so the UI can render a connect CTA.

### `GET /api/reporting/post-details`

Paginated + filterable list of posts for a client — drives the "Post Details" grid. Pure DB read against post_metrics (already synced from Zernio), so no extra Zernio calls per view.

### `POST /api/reporting/share`

Create a shareable report link for a client's analytics. Generates a random token with a 30-day expiry and stores the selected date range and sections configuration.

**Auth:** Required (any authenticated user)

**Body:**

```
clientId - Client UUID (required)
dateRange - { start: YYYY-MM-DD, end: YYYY-MM-DD } (required)
sections - { performanceSummary, platformBreakdown, topPosts, topPostsCount } (required)
```

**Returns:**

```
{{ id: string, token: string, url: string }}
```

### `GET /api/reporting/shared/:token`

Public endpoint to resolve a report share token and return the configured analytics data. Assembles platform summary, per-platform breakdowns, and ranked top posts based on the sections stored when the link was created. Returns 410 if the link has expired.

**Auth:** None (public — token provides authorization)

**Query params:**

```
token - Report share token from the report_links table
```

**Returns:**

```
{{ clientName, agency, logoUrl, dateRange, sections, summary, topPosts }}
```

### `GET /api/reporting/summary`

Build a MetricCard for one numeric column across a set of snapshots. */ function buildMetricCard( snaps: PlatformSnapshot[], prevSnaps: PlatformSnapshot[], pick: (s: PlatformSnapshot) => number, ): MetricCard | undefined { let total = 0; const byDay = new Map<string, number>(); for (const s of snaps) { const v = pick(s) || 0; total += v; byDay.set(s.snapshot_date, (byDay.get(s.snapshot_date) ?? 0) + v); } const prevTotal = prevSnaps.reduce((sum, s) => sum + (pick(s) || 0), 0); if (total === 0 && prevTotal === 0) return undefined; const series: MetricSeriesPoint[] = [...byDay.entries()] .sort(([a], [b]) => a.localeCompare(b)) .map(([date, value]) => ({ date, value })); return { total, previousTotal: prevTotal, changePercent: calcChange(total, prevTotal), series, }; } /** GET /api/reporting/summary Compute a combined analytics summary for a client across all active social profiles. Compares the requested period against an equal-length prior period to calculate percentage changes. Returns per-platform breakdowns plus rolled-up combined metrics.

**Auth:** Required (any authenticated user)

**Query params:**

```
clientId - Client UUID (required)
start - Period start date YYYY-MM-DD (required)
end - Period end date YYYY-MM-DD (required)
```

**Returns:**

```
{SummaryReport}
```

### `POST /api/reporting/sync`

Manually trigger a social analytics sync for a single client. Defaults to the last 7 days if no date range is provided. Used for on-demand refreshes from the admin analytics UI.

**Auth:** Required (any authenticated user)

**Body:**

```
clientId - Client UUID to sync (required)
dateRange - { start: YYYY-MM-DD, end: YYYY-MM-DD } (optional, defaults to last 7 days)
```

**Returns:**

```
{SyncResult}
```

### `GET /api/reporting/tiktok-creator-info`

Surfaces TikTok creator-level signals (verification, canPostMore, allowed privacy levels) for the platform badge / publishing UI.

### `GET /api/reporting/top-posts`

Fetch the top-performing posts for a client within a date range, ranked by total engagement (likes + comments + shares + saves). Includes social profile username.

**Auth:** Required (any authenticated user)

**Query params:**

```
clientId - Client UUID (required)
start - Date range start YYYY-MM-DD (required)
end - Date range end YYYY-MM-DD (required)
limit - Number of posts to return, 1-50 (default 3)
```

**Returns:**

```
{{ posts: TopPostItem[], dateRange: { start, end } }}
```

### `GET /api/social/callback/:platform`

OAuth callback handler for social platform connections. Exchanges the auth code for access tokens, upserts social_profiles for all connected accounts (Meta: per Facebook page + linked Instagram), and redirects to the client settings page. State param must be a base64url-encoded JSON with clientId, platform, and userId.

**Auth:** None (OAuth callback — authorization is via state param)

**Query params:**

```
platform - 'instagram' | 'facebook' | 'tiktok' | 'youtube'
code - Authorization code from platform (required)
state - Base64url-encoded state payload (required)
```

**Returns:**

```
Redirect to /admin/clients/[slug]?connected=[platform]
```

### `GET /api/social/connect/:platform`

Initiate a social platform OAuth flow by redirecting to the platform's consent screen. Encodes clientId, platform, and userId into a base64url state param for the callback. Supports instagram, facebook, tiktok, and youtube.

**Auth:** Required (any authenticated user)

**Query params:**

```
platform - 'instagram' | 'facebook' | 'tiktok' | 'youtube'
clientId - Client UUID to associate the connection with (required)
```

**Returns:**

```
Redirect to platform OAuth consent screen
```

### `DELETE /api/social/disconnect/:profileId`

Deactivate a connected social profile (soft delete). Clears access tokens and marks is_active false. Also attempts to disconnect from Late API if the profile has a late_account_id (non-fatal on failure).

**Auth:** Required (any authenticated user)

**Query params:**

```
profileId - Social profile UUID to disconnect
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/social/profiles`

List active social profiles for a client, ordered by platform name. Used by the analytics and reporting UIs to enumerate connected accounts.

**Auth:** Required (any authenticated user)

**Query params:**

```
clientId - Client UUID to filter by (required)
```

**Returns:**

```
{SocialProfile[]}
```

---

## Google Workspace

_Google Calendar, Drive, Chat, and OAuth connections._

### `GET /api/google`

### `GET /api/google/callback`

### `GET /api/google/chat`

### `POST /api/google/disconnect`

### `GET /api/google/drive`

### `GET /api/google/status`

---

## Team & Meetings

_Team members, workload, meetings._

### `GET /api/meetings`

### `POST /api/meetings`

### `DELETE /api/meetings/:id`

### `GET /api/meetings/:id`

### `PATCH /api/meetings/:id`

### `GET /api/team`

List all active team members, ordered by full name.

**Auth:** Required (admin)

**Returns:**

```
{TeamMember[]} Array of active team member records
```

### `POST /api/team`

Create a new team member record. The team_members table is standalone and does not require a corresponding auth.users entry.

**Auth:** Required (super_admin)

**Body:**

```
id - Optional UUID for the team member (auto-generated if omitted)
full_name - Team member's full name (required, max 200 chars)
email - Email address (used for invite flows)
role - Job role/title (max 100 chars)
avatar_url - URL to avatar image
is_active - Whether the member is active (default: true)
```

**Returns:**

```
{TeamMember} Created team member record (201)
```

### `DELETE /api/team/:id`

Delete a team member. If they have a linked auth account, deletes that too.

**Auth:** Required (super admin)

**Query params:**

```
id - Team member UUID
```

**Returns:**

```
{{ success: true }}
```

### `PATCH /api/team/:id`

Update a team member's profile fields. At least one field must be provided.

**Auth:** Required (admin)

**Body:**

```
full_name - Updated full name
email - Updated email address
role - Updated job role/title
avatar_url - Updated avatar URL
is_active - Updated active status
```

**Query params:**

```
id - Team member UUID
```

**Returns:**

```
{TeamMember} Updated team member record
```

### `DELETE /api/team/:id/delete-account`

### `POST /api/team/:id/invite`

Generate a team invite token for a team member so they can create their own login account. Expires any existing unused invite tokens for this member before creating a new one. The team member must have an email address set and must not already have a linked account.

**Auth:** Required (admin)

**Query params:**

```
id - Team member UUID
```

**Returns:**

```
{{ token: string, invite_url: string, expires_at: string, member_name: string }}
```

### `DELETE /api/team/:id/link`

Unlink a team member from their auth user account, clearing the user_id field.

**Auth:** Required (admin)

**Query params:**

```
id - Team member UUID to unlink
```

**Returns:**

```
{TeamMember} Updated team member record with user_id cleared
```

### `POST /api/team/:id/link`

Link a team_members record to an existing auth user account. Validates that the team member isn't already linked and that the target user isn't linked to another member.

**Auth:** Required (admin)

**Body:**

```
user_id - Auth user UUID to link to (required)
```

**Query params:**

```
id - Team member UUID to link
```

**Returns:**

```
{TeamMember} Updated team member record
```

### `GET /api/team/:id/workload`

Returns a team member's current workload: - Their client assignments (with roles) - Pipeline items they're assigned to this month (by role) Use when: Checking capacity before assigning new work, building team dashboards, or balancing workload across the team.

### `POST /api/team/invite/accept`

Accept a team invite link and create a new admin user account. Validates the token, creates a Supabase auth user, inserts a users record with admin role, links the team_members record, and marks the invite as used. Rolls back auth user creation if the users table insert fails.

**Auth:** None (public — invite token provides authorization)

**Body:**

```
token - Invite token from the team_invite_tokens table (required)
full_name - New user's full name (required)
email - New user's email address (required)
password - New user's password (min 8 chars) (required)
```

**Returns:**

```
{{ success: true }}
```

### `GET /api/team/invite/validate`

Validate a team invite token before the user fills out the accept form. Returns metadata about the invite (email, member name and role) so the UI can pre-populate fields. Includes a machine-readable `reason` field on error for UI branching.

**Auth:** None (public — token provides authorization)

**Query params:**

```
token - Invite token from the team_invite_tokens table (required)
```

**Returns:**

```
{{ valid: true, email: string, member_name: string, member_role: string }}
```

### `GET /api/team/linkable-users`

Return all auth user accounts that are not yet linked to a team_members record. Merges data from both public.users and auth.users (via admin API) so that accounts created outside the normal invite flow are still discoverable.

**Auth:** Required (admin)

**Returns:**

```
{{ id: string, full_name: string, email: string }[]} Sorted by name
```

---

## Notifications

_Notification management and broadcast updates._

### `GET /api/notifications`

List notifications for the authenticated user, ordered by most recent. Always returns the total unread count regardless of the unread_only filter. Scoped by recipient_user_id — each user only sees their own notifications.

**Auth:** Required (any authenticated user)

**Query params:**

```
unread_only - If 'true', only returns unread notifications
```

**Returns:**

```
{{ notifications: Notification[], unread_count: number }}
```

### `DELETE /api/notifications/:id`

### `PATCH /api/notifications/:id`

Mark a specific notification as read or unread. Only the recipient can update their own notification.

**Auth:** Required (any authenticated user)

**Body:**

```
read - Boolean indicating whether to mark read (true) or unread (false)
```

**Query params:**

```
id - Notification UUID
```

**Returns:**

```
{Notification} Updated notification record
```

### `POST /api/notifications/clear-all`

Deletes all notifications for the authenticated user (inbox clear).

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ success: true }}
```

### `POST /api/notifications/mark-all-read`

Mark all unread notifications as read for the authenticated user. Returns the count of notifications that were marked read.

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ success: true, count: number }} Number of notifications marked read
```

### `GET /api/notifications/preferences`

Fetch the authenticated user's notification preferences, merged with defaults so all preference keys are always present.

**Auth:** Required (any authenticated user)

**Returns:**

```
{NotificationPreferences} User's notification preference object
```

### `PUT /api/notifications/preferences`

Replace the authenticated user's notification preferences with the provided object.

**Auth:** Required (any authenticated user)

**Body:**

```
The full notification preferences object to save
```

**Returns:**

```
{{ ok: true }}
```

---

## Vault

_Obsidian vault — search, indexing, file read/write, webhooks._

### `GET /api/vault/:path*`

Read a file or list a directory from the GitHub-backed Obsidian vault. Paths with no file extension or ending in '/' are treated as directory listings; all other paths return the file content and SHA.

**Auth:** Required (any authenticated user)

**Query params:**

```
path - Catch-all path segments joined as the vault path
```

**Returns:**

```
Directory: { files: VaultFile[] } | File: { content: string, sha: string }
```

### `PUT /api/vault/:path*`

Write (create or update) a file in the GitHub-backed Obsidian vault.

**Auth:** Required (any authenticated user)

**Body:**

```
content - File content string (required)
message - Git commit message (optional, defaults to "update <path>")
```

**Query params:**

```
path - Catch-all path segments joined as the vault path
```

**Returns:**

```
{{ success: true, sha: string }}
```

### `POST /api/vault/index`

### `POST /api/vault/init`

Bootstrap the GitHub-backed Obsidian vault. Creates the 5 standard Obsidian templates (research, idea, client profile, shoot prep, meeting prep) only if they don't already exist. Then syncs all active clients to Clients/<Name>/_profile.md and updates the Dashboard MOC. Safe to re-run — skips existing files.

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ success: true, created: string[] }} List of files created
```

### `POST /api/vault/provision`

### `GET /api/vault/search`

### `POST /api/vault/webhook`

---

## Dashboard

_Dashboard stats, overview, activity, AI usage, health._

### `GET /api/activity`

Fetch recent activity log entries. Admins see all activity; portal viewers see only activity related to clients in their organization.

**Auth:** Required (any authenticated user)

**Query params:**

```
limit - Maximum number of records to return (default: 50, max: 100)
```

**Returns:**

```
{ActivityLogEntry[]} Array of activity log entries, most recent first
```

### `GET /api/dashboard/overview`

Returns a comprehensive dashboard overview in a single call: - Active client count - Pipeline status distribution for current month - Upcoming shoots (next 7 days) - Recent notifications (last 5 unread) - Recent research searches (last 5) Use when: Building dashboard views, AI agent status checks, or getting a quick pulse on agency operations.

### `GET /api/dashboard/stats`

Fetch comprehensive dashboard statistics including client counts, search counts (current vs last month), upcoming shoot count, moodboard item count, a list of upcoming shoots for the next 7 days, recent searches, and a unified activity feed (searches, shoots, moodboard items, new clients — last 10 events).

**Auth:** Required (any authenticated user)

**Returns:**

```
{{ stats: { totalClients, activeSearches, activeSearchesLastMonth, upcomingShoots, moodboardItems }, upcomingShootsList, recentSearches, activity: ActivityItem[] }}
```

### `GET /api/health`

Health check endpoint for uptime monitoring (SOC 2 A1.3). Returns 200 with timestamp. No auth required.

### `GET /api/usage`

Fetch AI token usage and cost summary for a given date range. Defaults to the last 30 days if no range is specified.

**Auth:** Required (any authenticated user)

**Query params:**

```
from - Start of date range (ISO datetime, default: 30 days ago)
to - End of date range (ISO datetime, default: now)
```

**Returns:**

```
{UsageSummary} Aggregated usage data (tokens, cost, by feature, etc.)
```

### `GET /api/usage/export.csv`

Streams a CSV of every api_usage_logs row in the requested window so Jack can save a copy locally (and hand it to Claude for analysis). Admin-only — the full log contains user IDs + emails.

**Auth:** Admin / super-admin only

**Query params:**

```
from  ISO timestamp; defaults to 30 days ago
to    ISO timestamp; defaults to now
```

---

## Portal Invites

_Client portal invite generation, validation, acceptance._

### `GET /api/invites`

### `POST /api/invites`

### `DELETE /api/invites/:id`

### `POST /api/invites/accept`

### `POST /api/invites/batch`

### `POST /api/invites/bulk`

### `POST /api/invites/link`

### `GET /api/invites/preview`

### `GET /api/invites/validate`

---

## Settings

_Account and workspace preferences._

### `GET /api/settings/ai-model`

Sets planner, research, and merger to the same id (topic search llm_v1). */ topicSearchModel: z.string().min(1).max(200).optional(), topicSearchPlannerModel: z.string().min(1).max(200).optional(), topicSearchResearchModel: z.string().min(1).max(200).optional(), topicSearchMergerModel: z.string().max(200).optional(), }); /** GET /api/settings/ai-model Fetch the currently active AI model and fallback models from agency_settings.

**Auth:** Required (admin)

### `PATCH /api/settings/ai-model`

Update the platform-wide AI model and/or fallback models.

**Auth:** Required (admin)

**Body:**

```
{ model?: string, fallbackModels?: string[] }
```

### `GET /api/settings/ai-routing-summary`

Returns the active AI model and overrides for the admin settings UI. Simplified: one model for everything, switchable from dashboard.

**Auth:** Required (admin)

### `GET /api/settings/llm-credentials`

Env vars we mirror two-way between the dashboard and Vercel. */ const VERCEL_SYNC_TARGETS = { openrouter: 'OPENROUTER_API_KEY', openai: 'OPENAI_API_KEY', } as const; type SyncProvider = keyof typeof VERCEL_SYNC_TARGETS; const keyField = z .union([z.string().min(8).max(800), z.null()]) .optional(); const openAiKeyField = z .union([z.string().min(16).max(800), z.null()]) .optional(); const PatchSchema = z.object({ openrouter: z .object({ default: keyField, topic_search: keyField, nerd: keyField, }) .optional(), openai: z .object({ default: openAiKeyField, topic_search: openAiKeyField, nerd: openAiKeyField, }) .optional(), nerdModel: z.union([z.string().max(200), z.null()]).optional(), ideasModel: z.union([z.string().max(200), z.null()]).optional(), /** Opt-in: pull the current Vercel env values into the DB instead of using the `openrouter` / `openai` fields. UI "Use Vercel value" button posts this. Values in `openrouter` / `openai` are ignored when this is truthy. / syncFromVercel: z .object({ openrouter: z.boolean().optional(), openai: z.boolean().optional(), }) .optional(), }); function maskProviderBlock(stored: LlmProviderKeysStored['openrouter'] | LlmProviderKeysStored['openai']) { const legacy = stored as Record<string, string | undefined> | undefined; const buckets: LlmProviderKeyBucket[] = ['default', 'topic_search', 'nerd']; const out: Record<string, { configured: boolean; masked: string | null }> = {}; for (const b of buckets) { const v = b === 'default' ? legacy?.default?.trim() || legacy?.ideas?.trim() : legacy?.[b]?.trim(); out[b] = { configured: Boolean(v), masked: maskApiKey(v), }; } return out; } async function requireAdmin() { const supabase = await createServerSupabaseClient(); const { data: { user }, error: authError, } = await supabase.auth.getUser(); if (authError || !user) { return { user: null as null, adminClient: null as null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }; } const adminClient = createAdminClient(); const { data: userData } = await adminClient.from('users').select('role').eq('id', user.id).single(); if (!userData || userData.role !== 'admin') { return { user: null, adminClient: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }; } return { user, adminClient, error: null as null }; } /** Compare the DB-stored "default" key for a provider against the decrypted value Vercel has for the mirrored env var. Returns a tiny status object the UI renders as a pill ("synced" / "differs" / "no Vercel token"). Read-only — it never writes. Writes happen in PATCH. / async function vercelMirrorStatus( provider: SyncProvider, stored: LlmProviderKeysStored | undefined, ) { if (!vercelEnvSyncAvailable()) { return { available: false as const }; } const envKey = VERCEL_SYNC_TARGETS[provider]; const remote = await getVercelEnvVar(envKey); const dbBlock = (stored?.[provider] as Record<string, string | undefined> | undefined) ?? {}; const dbValue = (dbBlock.default ?? dbBlock.ideas ?? '').trim(); const remoteValue = remote?.value?.trim() ?? ''; return { available: true as const, envKey, configured: Boolean(remoteValue), masked: maskApiKey(remoteValue), updatedAt: remote?.updatedAt ?? null, targets: remote?.target ?? [], differsFromDb: Boolean(remoteValue) && Boolean(dbValue) && remoteValue !== dbValue, dbEmpty: !dbValue, }; } /** GET /api/settings/llm-credentials Masked keys + model ids + Vercel mirror status (admin only).

### `PATCH /api/settings/llm-credentials`

Set or clear per-bucket OpenRouter keys and optional Nerd / ideas models.

### `GET /api/settings/openrouter-models`

Fetch all OpenRouter models with pricing and capability info. Cached server-side for 10 minutes to avoid hammering the API.

**Auth:** Required (any authenticated user)

### `GET /api/settings/scheduling`

Fetch scheduling link settings for all agencies (nativz and ac).

**Auth:** Required (admin)

**Returns:**

```
{{ settings: { agency: string, scheduling_link: string | null, updated_at: string }[] }}
```

### `PUT /api/settings/scheduling`

Update the scheduling link for a specific agency (nativz or ac).

**Auth:** Required (admin)

**Body:**

```
agency - Agency identifier: 'nativz' | 'ac' (required)
scheduling_link - Scheduling link URL (or null to clear)
```

**Returns:**

```
{{ success: true }}
```

---

## Portal

_Client-portal-specific endpoints._

### `GET /api/portal/brand-dna`

Return the active brand guideline for the authenticated portal user's active client. Respects the x-portal-active-client cookie for multi-brand support.

**Auth:** Required (portal user)

**Returns:**

```
{{ content, metadata, created_at, readonly: true }}
```

### `POST /api/portal/brand-dna/feedback`

Submit feedback on a Brand DNA section from the client portal. Creates a notification for the admin team.

**Auth:** Required (portal user)

**Body:**

```
section - Section heading
feedback - Feedback text
flagged_incorrect - Whether the section is flagged as incorrect
```

### `GET /api/portal/brands`

### `POST /api/portal/brands/switch`

### `POST /api/portal/knowledge`

Create a knowledge entry for the authenticated portal user's client.

**Auth:** Required (portal user session)

**Body:**

```
type - Entry type
title - Entry title
content - Entry content
```

**Returns:**

```
{{ entry: KnowledgeEntry }}
```

---

## Admin Ops

_Admin-only ops: backfills, migrations, diagnostics._

### `POST /api/accounting/entries`

### `DELETE /api/accounting/entries/:id`

### `PATCH /api/accounting/entries/:id`

### `POST /api/accounting/entries/bulk`

by the import preview ("does this look right? confirm") flow.

### `POST /api/accounting/import`

### `GET /api/accounting/periods`

### `POST /api/accounting/periods`

### `DELETE /api/accounting/periods/:id`

### `GET /api/accounting/periods/:id`

### `PATCH /api/accounting/periods/:id`

### `GET /api/accounting/periods/:id/export`

the period. Columns are ordered for the "drop into a spreadsheet and paste into bookkeeping" workflow, with headers the tax person can read.

### `GET /api/accounting/periods/:id/submit-tokens`

### `POST /api/accounting/periods/:id/submit-tokens`

### `DELETE /api/accounting/periods/:id/view-tokens`

### `GET /api/accounting/periods/:id/view-tokens`

### `POST /api/accounting/periods/:id/view-tokens`

### `POST /api/admin/active-client`

### `GET /api/admin/banners`

### `POST /api/admin/banners`

### `DELETE /api/admin/banners/:id`

### `PATCH /api/admin/banners/:id`

### `GET /api/admin/email-hub/campaigns`

### `POST /api/admin/email-hub/campaigns`

### `GET /api/admin/email-hub/contacts`

### `POST /api/admin/email-hub/contacts`

### `DELETE /api/admin/email-hub/contacts/:id`

### `PATCH /api/admin/email-hub/contacts/:id`

### `GET /api/admin/email-hub/contacts/duplicates`

Find potential duplicate contacts. The email column has a lowercase-unique index so true dupes shouldn't exist — this scans for near-duplicates by normalizing the local part (stripping +tags, dots for Gmail) and by matching contacts that share the same full_name.

### `POST /api/admin/email-hub/contacts/import`

### `GET /api/admin/email-hub/lists`

### `POST /api/admin/email-hub/lists`

### `DELETE /api/admin/email-hub/lists/:id`

### `GET /api/admin/email-hub/lists/:id`

### `PATCH /api/admin/email-hub/lists/:id`

### `DELETE /api/admin/email-hub/lists/:id/members`

### `POST /api/admin/email-hub/lists/:id/members`

### `GET /api/admin/email-hub/messages`

### `GET /api/admin/email-hub/sequences`

### `POST /api/admin/email-hub/sequences`

### `DELETE /api/admin/email-hub/sequences/:id`

### `GET /api/admin/email-hub/sequences/:id`

### `PATCH /api/admin/email-hub/sequences/:id`

### `POST /api/admin/email-hub/sequences/:id/enroll`

### `GET /api/admin/email-hub/setup`

Returns the configured sender identities per agency + webhook health. Read-only — Resend domain verification is configured in the Resend dashboard, not here.

### `POST /api/admin/email-hub/setup/test-send`

### `GET /api/admin/email-log`

Unified send log across every email path in Cortex: - email_messages: campaigns, sequences, reports, invites, one-off composer sends - onboarding_email_sends: ad-hoc sends from /admin/onboarding + invoice reminders + kickoff emails (these also land in email_messages via the webhook callback, but we surface them separately so admins can see the "what was attempted" record even when Resend hasn't webhooked back yet).

### `GET /api/admin/email-templates`

### `POST /api/admin/email-templates`

### `DELETE /api/admin/email-templates/:id`

### `PATCH /api/admin/email-templates/:id`

### `GET /api/admin/errors`

GET /api/admin/errors — recent API errors (super_admin only)

### `GET /api/admin/pdf/preview/branded-deliverable`

### `GET /api/admin/proposal-services`

GET /api/admin/proposal-services?agency= — list catalog.

### `POST /api/admin/proposal-services`

POST /api/admin/proposal-services — create.

### `DELETE /api/admin/proposal-services/:id`

### `PATCH /api/admin/proposal-services/:id`

### `POST /api/admin/proposal-services/extract`

Paste an existing proposal (markdown / plain text — copy from a doc, a PDF text extract, whatever) and the LLM returns a structured array of services + suggested pricing rules. The admin reviews and accepts the parsed output via the catalog UI; nothing writes to the catalog directly from this endpoint. Output shape matches what the catalog form expects, so the UI can pre-fill the Create form with each suggestion.

### `GET /api/admin/proposal-templates`

### `GET /api/admin/proposals`

### `POST /api/admin/proposals`

### `DELETE /api/admin/proposals/:id`

Delete a proposal. Allowed for any status EXCEPT `paid` — paid proposals have money tied to them and need to stay in the audit trail. Admins wanting to clean up a paid record should use Stripe + a dedicated accounting flow, not this endpoint. Cleans up downstream: signed/executed PDFs in Storage, proposal_events, and the proposal row itself. The cascade on proposal_events FK already handles event cleanup; we just blast the storage objects manually.

### `PATCH /api/admin/proposals/:id`

### `POST /api/admin/proposals/:id/send`

### `GET /api/admin/proposals/drafts`

GET /api/admin/proposals/drafts — list this admin's recent drafts.

### `POST /api/admin/proposals/drafts`

is set, auto-fills signer fields from the client's primary contact.

### `DELETE /api/admin/proposals/drafts/:id`

### `GET /api/admin/proposals/drafts/:id`

### `PATCH /api/admin/proposals/drafts/:id`

### `PATCH /api/admin/proposals/drafts/:id/blocks`

### `POST /api/admin/proposals/drafts/:id/blocks`

Markdown blocks render as rich text inline; image blocks render as a captioned figure. Image content should be a URL (the chat uploads dropped images to Storage first and passes the public URL here).

### `POST /api/admin/proposals/drafts/:id/commit`

draft into a real `proposals` row by going through the existing createProposalDraft pipeline. Bridge strategy: the legacy proposal flow expects a template_id + tier. The chat-built draft has neither. renderDraftAsTemplateTier() synthesizes a transient template + tier from the draft so the canonical proposal renderer + sign + Stripe flow keep working without a parallel pipeline.

### `PATCH /api/admin/proposals/drafts/:id/lines`

PATCH /api/admin/proposals/drafts/[id]/lines — mutate or remove a line.

### `POST /api/admin/proposals/drafts/:id/lines`

POST /api/admin/proposals/drafts/[id]/lines — append a service line.

### `POST /api/admin/proposals/drafts/:id/upload-image`

image file (multipart form, field name 'file'), stores it in the 'proposal-draft-images' bucket under <draft_id>/<uuid>-<filename>, and returns the public URL. The chat then calls /blocks with kind= 'image' and that URL as content. Bucket is public-read so the preview iframe doesn't need a signed URL on every render. The path is uuid-prefixed so URL guessing is impractical.

### `POST /api/admin/proposals/generate`

### `GET /api/admin/scheduled-emails`

### `DELETE /api/admin/scheduled-emails/:id`

### `PATCH /api/admin/scheduled-emails/:id`

### `GET /api/admin/scraper-settings`

### `PUT /api/admin/scraper-settings`

### `POST /api/admin/scraper-settings/refresh-pricing`

### `GET /api/admin/secrets`

### `DELETE /api/admin/secrets/:key`

### `PUT /api/admin/secrets/:key`

### `DELETE /api/admin/users`

DELETE /api/admin/users — delete a user (removes auth + public.users)

### `GET /api/admin/users`

GET /api/admin/users — all users with enriched data (super_admin only)

### `PATCH /api/admin/users`

PATCH /api/admin/users — update user role/permissions/name

### `POST /api/admin/users/:id/schedule-email`

### `GET /api/admin/users/:id/searches`

### `POST /api/admin/users/:id/send-email`

### `POST /api/admin/users/bulk-email`

### `POST /api/admin/users/bulk-schedule-email`

### `POST /api/admin/users/reset-password`

POST /api/admin/users/reset-password — send password reset email (super_admin only)

### `GET /api/submit-payroll/:token`

### `POST /api/submit-payroll/:token/commit`

### `POST /api/submit-payroll/:token/parse`

---

## Shared Links

_Public/shared-link endpoints (auth via token)._

### `GET /api/shared/ad-creatives/:token`

Public read — no auth required. Middleware's `/shared/` bypass covers this route, and we use the service-role admin client to look up the token + scoped concept list without needing any session. Payload is trimmed to what the client-facing gallery needs: concept fields plus comment counts per card. The full image_prompt is omitted (it's admin-internal) — the client sees visual_description which reads like plain English.

### `POST /api/shared/ad-creatives/:token/comments`

Public comment submission via a share link. Validates the token is live, that the target concept belongs to the same client as the token, and that if the token is batch-scoped the concept is from that batch. Then inserts the comment and returns it so the shared page can optimistically render without a refetch.

### `GET /api/shared/moodboard/:token`

Public endpoint. Resolve a moodboard share token and return the full board with items, notes, and edges. Supports optional password protection via query param or header. Returns 401 if password is required or incorrect, 410 if expired.

**Auth:** None (public; password-protected boards require x-share-password header or ?password= query)

**Query params:**

```
token - Moodboard share token
password - Password for password-protected boards (or use x-share-password header)
```

**Returns:**

```
{{ board, items, notes, edges }}
```

### `GET /api/shared/nerd/:token`

GET — fetch a shared conversation by public token (no auth required)

### `GET /api/shared/search/:token`

Public endpoint. Resolve a search share token and return the full completed search results. Returns 410 if the link has expired, 404 if not found or search is not completed.

**Auth:** None (public)

**Query params:**

```
token - Share link token
```

**Returns:**

```
Complete search record with client_name appended
```

### `POST /api/shared/search/:token/explain-emotion`

Same as authenticated explain-emotion, scoped to a valid share token.

**Auth:** None (public; token must be valid and unexpired)

---

## Presentations

_Client-facing presentation viewer + data._

### `GET /api/presentations`

### `POST /api/presentations`

### `DELETE /api/presentations/:id`

### `GET /api/presentations/:id`

### `PUT /api/presentations/:id`

### `POST /api/presentations/:id/social-results/generate`

---

## Monday.com

_Monday.com webhooks, sync, board updates._

### `GET /api/monday/sync`

Full sync: fetch all clients from Monday.com and update their vault profiles. Preserves vault-owned fields (brand voice, audience, etc.) while updating Monday.com-owned fields (services, POC, abbreviation). / import { NextRequest, NextResponse } from 'next/server'; import { createServerSupabaseClient } from '@/lib/supabase/server'; import { createAdminClient } from '@/lib/supabase/admin'; import { isVaultConfigured } from '@/lib/vault/github'; import { isMondayConfigured, fetchMondayClients, parseMondayClient } from '@/lib/monday/client'; import { syncAllMondayClients } from '@/lib/monday/sync'; export const maxDuration = 60; /** GET /api/monday/sync Fetch a single client's Monday.com data by exact name match. Used to preview what Monday.com has for a client before syncing.

**Auth:** Required (admin)

**Query params:**

```
client_name - Client name to look up in Monday.com (required, case-insensitive)
```

**Returns:**

```
Parsed Monday.com client record
```

### `POST /api/monday/sync`

Full Monday.com sync: fetch all clients from Monday.com and update their vault profiles. Preserves vault-owned fields (brand voice, audience, etc.) while updating Monday.com-owned fields (services, POC, abbreviation). Creates new clients if not found.

**Auth:** Required (admin; requires both vault and Monday.com to be configured)

**Returns:**

```
{{ message: string, results: SyncResult[] }}
```

### `POST /api/monday/update`

Update a Monday.com client board item's column values (services, agency, POC, abbreviation). After updating Monday.com, re-syncs the client's vault profile and revalidates the clients page.

**Auth:** Required (admin)

**Body:**

```
monday_item_id - Numeric Monday.com item ID (required)
services - Optional array of service strings: 'SMM' | 'Paid Media' | 'Affiliates' | 'Editing'
agency - Optional agency label
poc_name - Optional point-of-contact name
poc_email - Optional point-of-contact email
abbreviation - Optional client abbreviation
```

**Returns:**

```
{{ success: true, message?: string }}
```

### `POST /api/monday/webhook`

---

## External API (v1)

_API key-authenticated endpoints for external agents and scripts._

### `GET /api/v1/calendar/events`

Fetch Google Calendar events for the authenticated API key's user via Google OAuth. Returns events normalized to { id, title, start, end, is_all_day }.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
start - ISO 8601 date/time lower bound (required)
end - ISO 8601 date/time upper bound (required)
```

**Returns:**

```
{{ events: CalendarEvent[] }}
```

### `POST /api/v1/calendar/events`

Create a Google Calendar event via Google OAuth for the API key owner.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
summary - Event title (required)
description - Event description (optional)
location - Event location (optional)
start - ISO 8601 start dateTime (required)
end - ISO 8601 end dateTime (required)
attendees - Array of { email } objects (optional)
```

**Returns:**

```
{{ event: { id, summary } }}
```

### `GET /api/v1/clients`

List all clients. Returns a summary projection (no sensitive fields).

**Auth:** API key (Bearer token via Authorization header)

**Returns:**

```
{{ clients: Client[] }}
```

### `POST /api/v1/clients`

Onboard a new client. Creates the organization, client record, and (if services includes 'SMM') a Late API social media profile non-blocking. Handles slug collisions by appending a timestamp suffix.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
name - Client name (required)
website_url - Client website URL (required)
industry - Industry/sector (required)
target_audience - Target audience description (optional)
brand_voice - Brand voice description (optional)
topic_keywords - Array of topic keywords (optional)
logo_url - Logo URL (optional)
poc_name - Point of contact name (optional)
poc_email - Point of contact email (optional)
services - Array of service types e.g. ['SMM', 'PDR'] (optional)
agency - Agency name (optional)
```

**Returns:**

```
{{ client: Client }}
```

### `GET /api/v1/clients/:id`

Fetch a single client by UUID or slug, with associated contacts.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Client UUID or slug
```

**Returns:**

```
{{ client: Client, contacts: Contact[] }}
```

### `GET /api/v1/clients/:id/knowledge`

List knowledge entries for a client. Supports full-text search via the search_knowledge_entries RPC, filtering by type, and optionally including entity metadata and knowledge graph links.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Client UUID
type - Filter by entry type: 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note' (optional)
search - Full-text search query (optional)
include_links - Include knowledge graph links (optional, default false)
include_entities - Include entity metadata on results (optional, default false)
```

**Returns:**

```
{{ entries: KnowledgeEntry[], links?: KnowledgeLink[] }}
```

### `POST /api/v1/clients/:id/knowledge`

Create a new knowledge entry for a client. Triggers automatic embedding generation for semantic search.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
type - Entry type: 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note' (required)
title - Entry title (required)
content - Entry content text (optional, default '')
metadata - Arbitrary metadata object (optional)
source - Source type: 'manual' | 'scraped' | 'generated' | 'imported' (default 'manual')
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }}
```

### `GET /api/v1/clients/:id/knowledge/:entryId`

Fetch a single knowledge entry by ID, scoped to the given client.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Client UUID
entryId - Knowledge entry UUID
```

**Returns:**

```
{{ entry: KnowledgeEntry }}
```

### `GET /api/v1/clients/:id/knowledge/graph`

Fetch the knowledge graph for a client — nodes (entries) and edges (links). Used for visualization and agent traversal of the client's knowledge base.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ nodes: KnowledgeNode[], edges: KnowledgeEdge[] }}
```

### `POST /api/v1/clients/:id/knowledge/import`

Import content into a client's knowledge base. For 'meeting_note' type, uses the meeting importer which extracts linked entities and updates brand profile. For 'note' and 'document' types, creates a basic knowledge entry.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
content - Text content to import (required)
type - Entry type: 'meeting_note' | 'note' | 'document' (default 'note')
title - Entry title (optional, auto-generated if not provided)
metadata - Arbitrary metadata object (optional)
meeting_date - ISO date string for meeting notes (optional)
attendees - Array of attendee names (optional)
source - Source identifier string (optional)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ entry: { id, title, type }, linked_entries?: string[] }}
```

### `POST /api/v1/clients/:id/knowledge/search`

Full-text search over a client's knowledge entries using the search_knowledge_entries Postgres RPC. Returns matching entries with metadata included.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
query - Search string (required, min 1 char)
type - Filter by entry type (optional)
limit - Max results to return, 1–50 (default 20)
```

**Query params:**

```
id - Client UUID
```

**Returns:**

```
{{ results: KnowledgeEntry[], total: number }}
```

### `GET /api/v1/posts`

List scheduled posts for a client. Returns posts ordered by scheduled_at ascending (nulls last). Optionally filtered by status.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
client_id - Client UUID (required)
status - Filter by post status: 'draft' | 'scheduled' | 'published' (optional)
```

**Returns:**

```
{{ posts: ScheduledPost[] }}
```

### `POST /api/v1/posts`

Create a scheduled post with optional platform profiles and media links.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
client_id - Client UUID (required)
caption - Post caption text (optional, default '')
hashtags - Array of hashtag strings (optional)
scheduled_at - ISO 8601 scheduled time (optional)
status - 'draft' | 'scheduled' (default 'draft')
platform_profile_ids - Array of social profile UUIDs to link (optional)
media_ids - Array of media UUIDs to attach in order (optional)
```

**Returns:**

```
{{ post: ScheduledPost }}
```

### `GET /api/v1/posts/:id`

Fetch a single scheduled post by UUID with full platform and media details.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Scheduled post UUID
```

**Returns:**

```
{{ post: ScheduledPost & { scheduled_post_platforms, scheduled_post_media } }}
```

### `GET /api/v1/search`

Not implemented — use POST to trigger a search.

**Returns:**

```
405 Method Not Allowed
```

### `POST /api/v1/search`

Create a topic search record for a client in 'pending' status. The actual search processing is handled asynchronously by the background worker.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
client_id - Client UUID (required)
query - Search query string (required)
search_mode - 'quick' | 'deep' (default 'quick')
```

**Returns:**

```
{{ search: { id, query, status, search_mode, created_at } }}
```

### `GET /api/v1/shoots`

List shoot events, optionally filtered by client, status, and date range. Returns shoots ordered by shoot_date ascending, with client name and slug.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
client_id - Filter by client UUID (optional)
status - Filter by scheduled_status (optional)
date_from - ISO date lower bound inclusive (optional)
date_to - ISO date upper bound inclusive (optional)
```

**Returns:**

```
{{ shoots: ShootEvent[] }}
```

### `GET /api/v1/shoots/:id`

Fetch a single shoot event by UUID, with the associated client name and slug.

**Auth:** API key (Bearer token via Authorization header)

**Query params:**

```
id - Shoot event UUID
```

**Returns:**

```
{{ shoot: ShootEvent & { clients: { id, name, slug } } }}
```

### `GET /api/v1/team`

List all active team members, ordered alphabetically by name.

**Auth:** API key (Bearer token via Authorization header)

**Returns:**

```
{{ team: TeamMember[] }}
```

### `POST /api/v1/team`

Create a new team member record. Returns 409 if the email already exists.

**Auth:** API key (Bearer token via Authorization header)

**Body:**

```
full_name - Full name, max 200 chars (required)
email - Email address (optional)
role - Role/title, max 100 chars (optional)
```

**Returns:**

```
{{ member: TeamMember }}
```

---

## Cron Jobs

_Internal scheduled jobs for sync, publishing, monitoring._

### `GET /api/cron/meta-ads-sync`

### `GET /api/cron/onboarding-flow-reminders`

### `GET /api/cron/onboarding-notifications`

### `GET /api/cron/revenue-anomalies`

### `GET /api/cron/revenue-reconcile`

---

## Other

_Uncategorized routes._

### `GET /api/ad-assets`

List ad assets for a client. The workspace server-fetches on first load, so this route is primarily for client-side refreshes after uploads — Phase 1 uses optimistic state instead of refetching, so this is a future-proofing hook.

### `POST /api/ad-assets`

Upload an asset. Accepts multipart/form-data with `file` and metadata fields. Writes the file to the `ad-assets` bucket under a per-client folder, then inserts the `ad_assets` row and returns it.

### `DELETE /api/ad-assets/:id`

Delete a single ad asset. Removes the storage object first, then the row. Order matters — if the DB delete fails we'd rather leave a dangling row than a dangling file (storage is where the bytes live, and admins can always re-delete the row from the UI).

### `POST /api/banners/:id/dismiss`

### `GET /api/banners/active`

### `POST /api/brand-audits`

POST /api/brand-audits — create a new audit row, run all model × prompt combos in parallel, persist the rollup. Returns the finished row id so the caller can navigate straight to /spying/self-audit/[id].

### `GET /api/brand-audits/:id`

GET /api/brand-audits/[id] — read a single audit row. Used by the detail page and by the "still running" poll once we move execution off-thread.

### `GET /api/client-groups`

Admin-only list of client pipeline groups, ordered by sort_order.

### `POST /api/client-groups`

Create a new group. sort_order defaults to end of list.

### `DELETE /api/client-groups/:id`

Delete a group. ON DELETE SET NULL on clients.group_id means members fall back to the "Unassigned" bucket automatically.

### `PATCH /api/client-groups/:id`

Rename, recolor, or reorder a group.

### `POST /api/email/preview`

### `POST /api/offer/:slug/sign`

### `POST /api/onboard/:token/connect`

### `PATCH /api/onboard/:token/items/:itemId`

### `POST /api/onboarding/flows`

client. Idempotent: if a live (non-archived/completed) flow already exists for the client, we return it instead of erroring. The persistent "Start onboarding" toast surfaces from `getPendingFlowToastsForUser` until the admin attaches a proposal or dismisses the toast.

### `GET /api/onboarding/flows/:id`

### `PATCH /api/onboarding/flows/:id`

### `POST /api/onboarding/flows/:id/dismiss-toast`

button on the persistent "Start onboarding" toast. The flow itself stays live (it still appears in the roster); only the toast goes away.

### `POST /api/onboarding/flows/:id/segments`

Each non-virtual segment kind has a starter tracker template (lib/onboarding/segment-templates.ts) that scaffolds the onboarding_trackers row + phases + checklist groups + items. The flow_segments junction is then created pointing at the new tracker.

### `DELETE /api/onboarding/flows/:id/segments/:segmentId`

service segment. Cascades: the junction row + the underlying tracker (and its checklist groups/items + phases via FK CASCADE). The agreement_payment segment is virtual and cannot be removed.

### `POST /api/onboarding/flows/:id/send-poc-invite`

automated POC invite that fires on `proposal.paid`. Admin can re-fire if the proposal-paid send failed (Resend hiccup, missing API key at the time, etc.).

### `POST /api/onboarding/flows/:id/stakeholders`

as a milestone-notification stakeholder. Snapshot their email + display name + role label at attach time so renders don't re-query. Default notify settings: onboarding_complete = true, the others off. Admin can toggle each individually after add via PATCH.

### `DELETE /api/onboarding/flows/:id/stakeholders/:stakeholderId`

### `PATCH /api/onboarding/flows/:id/stakeholders/:stakeholderId`

### `POST /api/onboarding/groups`

### `DELETE /api/onboarding/groups/:id`

### `PATCH /api/onboarding/groups/:id`

### `POST /api/onboarding/items`

### `DELETE /api/onboarding/items/:id`

### `PATCH /api/onboarding/items/:id`

### `POST /api/onboarding/items/reorder`

Commits new checklist-item order after a drag-drop. Same shape as the phases reorder route but scoped by `group_id`. We only touch items that actually belong to the named group, so a stale or malicious id can't trample an item in another group.

### `POST /api/onboarding/phases`

Add a new timeline phase to a tracker. Appends at the end of the existing sort order.

### `DELETE /api/onboarding/phases/:id`

### `PATCH /api/onboarding/phases/:id`

### `POST /api/onboarding/phases/reorder`

Commits a new phase order after a drag-drop. Accepts `order` — the full ordered array of phase ids — and rewrites `sort_order` to 0..N-1 in that sequence. We refetch the tracker's actual phase ids first and drop any strays in the request (so a malformed client can't overwrite phases on a different tracker). The write is a parallel batch of one-row UPDATEs because Supabase doesn't expose per-row batch updates with distinct values.

### `POST /api/onboarding/public/connect`

### `POST /api/onboarding/public/item-toggle`

### `POST /api/onboarding/public/link`

### `POST /api/onboarding/public/upload`

multipart/form-data: - share_token (string, required, uuid) - file (File, required, up to 50MB) - phase_id (string, optional — fulfil a specific phase) - note (string, optional — client's own message) Validates the token, writes the file to the private onboarding-uploads bucket under `onboarding/<tracker_id>/<upload_id>-<safename>`, and records the row. Then fires the file-uploaded notification non-blocking.

### `GET /api/onboarding/trackers`

with client name + slug joined for the list page. Admin-only. Optional query params: ?client_id=<uuid> — scope to one client ?is_template=true|false — default false (real trackers only).

### `POST /api/onboarding/trackers`

DB unique constraint prevents duplicates on (client_id, service) for real trackers; templates are allowed in unlimited number per service because NULL client_id is distinct in Postgres unique indexes.

### `DELETE /api/onboarding/trackers/:id`

Cascade deletes phases, groups, and items via FK ON DELETE CASCADE.

### `GET /api/onboarding/trackers/:id`

Full tracker + phases + groups + items for the admin editor.

### `PATCH /api/onboarding/trackers/:id`

Update status, title, timestamps, or rotate the share token.

### `POST /api/onboarding/trackers/:id/apply-template`

Seeds the target tracker from a template by copying its phases, checklist groups, and items. Appends onto whatever's already there — existing data is never destroyed. sort_order values start after the current max for each collection so the copied content renders below the existing content, in order. Validates that the template is actually `is_template=true` and matches the target tracker's service — applying a "Paid Media" template to a Social tracker is rejected at the API boundary.

### `POST /api/onboarding/trackers/:id/duplicate`

Clones a tracker (real or template) along with its phases + groups + items. Result matches the kind of the source: - real tracker → new real tracker, same client_id, title "X (copy)" - template → new template, no client_id, name "X (copy)" If a real tracker already exists for (client_id, service) — the DB has a partial unique index — the duplicate lands without a client_id reference won't collide, but a real-duplicate IS blocked. We surface the DB error plainly in that case so admins understand. Partial-failure rollback: if any child copy fails, we delete the freshly-created parent to avoid orphans.

### `POST /api/onboarding/trackers/:id/save-as-template`

Snapshots the source tracker's phases + checklist into a new `is_template=true` tracker with the same service. The source tracker is unchanged. Useful after an admin has hand-tuned a client's onboarding and wants to reuse the shape for future clients. We persist the source's CURRENT status values too, because sometimes admins want "pre-completed setup steps" in a template. Easy to reset manually after the save.

### `POST /api/onboarding/trackers/:id/send-email`

### `GET /api/onboarding/trackers/:id/uploads`

Admin list of every upload tied to this tracker, newest first.

### `DELETE /api/onboarding/trackers/:id/uploads/:upload_id`

Admin removes the upload row + storage object.

### `GET /api/onboarding/trackers/:id/uploads/:upload_id`

Returns a short-lived signed URL for the admin to download the file.

### `GET /api/proposals/public/:slug/config`

### `POST /api/proposals/public/:slug/sign`

### `PATCH /api/proposals/templates/:id/payment-links`

### `GET /api/public/onboarding/:token`

Public read endpoint for the client-facing timeline page. No auth — possession of the share token IS the auth. Returns the tracker plus all phases + checklist groups + items in one shape so the public page can render without additional round-trips. Uses the admin client (service role) to bypass RLS after matching the token. Nothing sensitive is returned; the shape matches what RankPrompt exposes on their equivalent page.

### `DELETE /api/revenue/ad-spend`

### `GET /api/revenue/ad-spend`

### `PATCH /api/revenue/ad-spend`

### `POST /api/revenue/ad-spend`

### `GET /api/revenue/anomalies`

### `POST /api/revenue/anomalies`

### `GET /api/revenue/clients`

### `POST /api/revenue/clients/:id/link-stripe`

### `POST /api/revenue/clients/:id/meta-ad-account`

### `GET /api/revenue/events`

### `GET /api/revenue/export/quickbooks`

### `GET /api/revenue/invoices`

### `POST /api/revenue/invoices/:id/refund`

### `POST /api/revenue/invoices/:id/remind`

### `GET /api/revenue/overview`

### `GET /api/revenue/subscriptions`

### `POST /api/sales/prospects`

brand-new prospect AND immediately creates a `needs_proposal` flow so the admin lands on the flow detail page with everything pre-wired. Idempotent on (name, signer_email) — re-submitting the same prospect returns the existing client + flow rather than creating dupes. The caller redirects to /admin/onboarding/[flowId] on success. This sidesteps the auto-create-on-proposal path in `createProposalDraft` for admins who want the brand wired up before generating a proposal. The proposal step itself is unchanged — once attached, the existing sign endpoint links it back to the flow as before.

### `GET /api/schedule/:token`

### `POST /api/schedule/:token/pick`

### `GET /api/scheduling/events`

### `POST /api/scheduling/events`

### `POST /api/spying/baseline`

Pulls the brand's connected IG + TikTok handles from `social_profiles`, creates a fresh `client_benchmarks` row whose `competitors_snapshot` is the brand itself, and stamps `next_snapshot_due_at = now()` so the daily cron picks it up and writes the first scored snapshot on its next run. The brand's own scoring lives in the same table the leaderboard reads from — no parallel "self vs. competitors" split. The brand is just the first profile in the list; competitor profiles are appended as audits get attached. Returns 422 with `missing_handles: true` when the brand has neither IG nor TikTok wired up, so the UI can route to settings instead of failing silently.

### `GET /api/spying/watch/:id/history`

GET /api/spying/watch/[id]/history — full snapshot history for a single client_benchmarks row. Powers the watch-history drawer on /spying. Returns the rows in chronological order so the chart code can map them straight onto an x-axis without resorting.

### `GET /api/webhooks/openrouter/generation`

### `POST /api/webhooks/openrouter/generation`

### `POST /api/webhooks/resend`

### `POST /api/webhooks/stripe`

### `POST /api/webhooks/stripe/:agency`

---
