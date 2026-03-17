# Nativz Cortex — API Reference

> **For AI agents:** This document describes all available API endpoints. Use it to understand what operations are available, what data they accept, and what they return. All endpoints return JSON. Auth is via Supabase session cookie unless noted otherwise.

---

## Authentication

Three distinct auth patterns are used:

- **Session cookie (default)** — `supabase.auth.getUser()` via cookie. Required for all standard routes.
- **API key** — `Authorization: Bearer nativz_...` header. Used by `/api/v1/` routes for machine-to-machine access.
- **Cron secret** — `Authorization: Bearer {CRON_SECRET}`. Used by `/api/cron/` routes.
- **Public** — No authentication required.

Role levels:
- **admin** — Internal Nativz team members. Full access.
- **viewer** — Portal clients. Automatically scoped to their `organization_id`.

---

## 1. Auth & Account

### `POST /api/auth/logout`
Sign out the current user and clear the session cookie.
**Auth:** Required (user)
**Response:** `{ redirectTo: string }`

### `GET /api/account`
Get the current user's profile.
**Auth:** Required (user)
**Response:** User profile object

### `PATCH /api/account`
Update user profile fields.
**Auth:** Required (user)
**Body:** `{ full_name?: string, avatar_url?: string, job_title?: string, password?: string }`
**Response:** `{ success: true }`

### `POST /api/account/upload-avatar`
Upload an avatar image to storage.
**Auth:** Required (user)
**Body:** FormData with `file` field (JPEG/PNG/WebP, max 2 MB)
**Response:** `{ url: string }`

---

## 2. API Keys

### `GET /api/api-keys`
List all API keys belonging to the current user (key hashes not returned — prefix only).
**Auth:** Required (user)
**Response:** `{ keys: [{ id, name, key_prefix, scopes, is_active, last_used_at, created_at, expires_at }] }`

### `POST /api/api-keys`
Create a new API key. The plaintext key is returned **once only** in the response.
**Auth:** Required (user)
**Body:** `{ name: string, scopes: Array<'tasks'|'clients'|'shoots'|'scheduler'|'search'|'team'|'calendar'>, expires_at?: ISO8601 }`
**Response:** `{ key: { id, name, key_prefix, scopes, is_active, created_at, expires_at, plaintext } }`

### `DELETE /api/api-keys/[id]`
Revoke (deactivate) or permanently delete an API key. Only the key owner can do this.
**Auth:** Required (user)
**Query:** `permanent=true` to hard-delete; omit to soft-deactivate
**Response:** `{ revoked: true }` or `{ deleted: true }`

---

## 3. Search & Research

### `POST /api/search/start`
Create a new topic research job. Returns a search ID immediately; then call `/process` to run the pipeline.
**Auth:** Required (user)
**Body:** `{ query: string, source?: string, time_range?: string, language?: string, country?: string, client_id?: string, search_mode?: 'general' | 'client_strategy' }`
**Response:** `{ id: string }`
**Use when:** Starting a new topic research from the Research Hub.

### `POST /api/search/[id]/process`
Execute the full search pipeline: Brave SERP fetch → Claude AI analysis → store results. Long-running (up to 5 min).
**Auth:** Required (user)
**Response:** `{ success: true }` on completion

### `GET /api/search/[id]`
Retrieve a completed search result with all AI analysis data.
**Auth:** Required (user)
**Response:** Full `TopicSearch` object including `summary`, `metrics`, `trending_topics`, `big_movers`, `raw_ai_response`

### `PATCH /api/search/[id]`
Approve or reject a search (marks it as reviewed/sent to client).
**Auth:** Required (admin)
**Body:** `{ action: 'approve' | 'reject' }`
**Response:** Updated search object

### `GET /api/search/[id]/share`
Get the share status of a search.
**Auth:** Required (user)
**Response:** `{ shared: boolean, token?: string, url?: string }`

### `POST /api/search/[id]/share`
Create a shareable public link for a search result.
**Auth:** Required (user)
**Response:** `{ token: string, url: string, expires_at: string }`

### `DELETE /api/search/[id]/share`
Remove the shareable link for a search.
**Auth:** Required (user)
**Response:** `{ success: true }`

### `POST /api/search/[id]/generate-ideas`
Generate additional video ideas for a specific topic within a completed search.
**Auth:** Required (user)
**Body:** `{ topic_name: string, existing_ideas?: string[] }`
**Response:** `{ ideas: VideoIdea[] }`

### `POST /api/search` (legacy)
Run a synchronous topic search. Prefer the async `start`/`process` pattern instead.
**Auth:** Required (user)
**Body:** Same as `/api/search/start`
**Response:** Full search result

### `GET /api/research/history`
Fetch research history with optional filtering and cursor-based pagination.
**Auth:** Required (user)
**Query:** `limit?: number, cursor?: string, type?: string, client_id?: string`
**Response:** `{ items: HistoryItem[], nextCursor?: string }`

### `GET /api/shared/search/[token]`
Retrieve a shared search result by token (no auth required).
**Auth:** Public
**Response:** Search object with `client_name`

---

## 4. Clients & Onboarding

### `GET /api/clients`
List clients. Admins see all; portal viewers see only their organization's clients.
**Auth:** Required (user)
**Query:** `minimal?: boolean` (returns just `id` + `name` for pickers)
**Response:** Array of client objects

### `POST /api/clients`
Create a new client record only (no external provisioning).
**Auth:** Required (admin)
**Body:** `{ name, slug, industry, organization_id?, target_audience?, brand_voice?, topic_keywords?, logo_url?, website_url? }`
**Response:** Client object

### `GET /api/clients/[id]`
Get a single client by ID.
**Auth:** Required (user)
**Response:** Client object

### `PATCH /api/clients/[id]`
Update client fields.
**Auth:** Required (admin)
**Body:** Any client fields to update
**Response:** Updated client object

### `POST /api/clients/onboard`
Full client provisioning across 4 systems in parallel: Cortex DB (org + client), Obsidian vault, Monday.com Clients board, Late social profile. Use this for new client onboarding.
**Auth:** Required (admin)
**Body:** `{ name, website_url, industry, target_audience?, brand_voice?, topic_keywords?, logo_url?, poc_name?, poc_email?, services?, agency? }`
**Response:** `{ cortex: { success, clientId, organizationId }, vault: { success }, monday: { success, mondayId }, late: { success, lateProfileId } }`

### `POST /api/clients/analyze-url`
Analyze a website URL to auto-fill client profile fields. Used during onboarding to pre-populate industry, audience, voice, keywords, and logo.
**Auth:** Required (user)
**Body:** `{ url: string }`
**Response:** `{ industry, target_audience, brand_voice, topic_keywords: string[], logo_url? }`

### `POST /api/clients/upload-logo`
Upload a client logo image (JPEG/PNG/WebP, max 2 MB) to Supabase storage.
**Auth:** Required (admin)
**Body:** FormData with `file` field
**Response:** `{ url: string }`

### `POST /api/clients/preferences`
Save or update client brand preferences (content style, topics to avoid, etc).
**Auth:** Required (user)
**Body:** `{ client_id: string, preferences: object }`
**Response:** `{ success: true }`

### `POST /api/clients/backfill-industry`
One-time admin utility: analyze websites for all clients with `industry = 'General'` and update their industry field.
**Auth:** Required (admin)
**Response:** `{ message: string, results: [{ name, industry, status }] }`

### `GET /api/clients/monday-cache`
Fetch and cache Monday.com Clients board data (5-min in-memory cache).
**Auth:** Required (admin)
**Response:** Array of parsed Monday.com client items

### `GET /api/clients/vault/[slug]`
Read a client's profile from the Obsidian vault by slug.
**Auth:** Required (user)
**Response:** Vault client profile object

### `GET /api/clients/assignments/strategists`
List all clients with strategist assignments. Used to show strategist names on calendar events.
**Auth:** Required (user)
**Response:** `{ assignments: [{ client_id, strategist_id, strategist_name }] }`

### `GET /api/clients/[id]/summary`
Aggregated client health dashboard — team assignments, pipeline status, upcoming shoots, task counts, recent searches, idea generations.
**Auth:** Required (user)
**Response:** `{ client, team, pipeline, upcomingShoots, taskStats, recentSearches, ideaGenerations }`
**Use when:** Building dashboards, AI agent context, or a client overview page.

### `GET /api/clients/[id]/strategy`
Get the client's AI-generated content strategy document.
**Auth:** Required (user)
**Response:** Strategy object with pillars, target audience analysis, competitive positioning

### `POST /api/clients/[id]/strategy`
Generate a new AI-powered content strategy for the client.
**Auth:** Required (admin)
**Response:** `{ strategyId: string, status: string }`

### `GET /api/clients/[id]/contacts`
List contacts for a client.
**Auth:** Required (user)
**Response:** Array of contact objects

### `POST /api/clients/[id]/contacts`
Add a contact to a client.
**Auth:** Required (admin)
**Body:** `{ full_name: string, email?, phone?, role? }`
**Response:** Contact object

### `PATCH /api/clients/[id]/contacts/[contactId]`
Update a contact.
**Auth:** Required (admin)
**Body:** Contact fields to update
**Response:** Updated contact

### `DELETE /api/clients/[id]/contacts/[contactId]`
Delete a contact.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `GET /api/clients/[id]/assignments`
List team member assignments for a client.
**Auth:** Required (admin)
**Response:** Array of assignment objects

### `POST /api/clients/[id]/assignments`
Assign a team member to a client.
**Auth:** Required (admin)
**Body:** `{ team_member_id: string, role: string, is_lead?: boolean }`
**Response:** Assignment object

### `DELETE /api/clients/[id]/assignments/[assignmentId]`
Remove a team member assignment from a client.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/clients/[id]/uppromote`
Connect an UpPromote affiliate API key to a client and trigger initial affiliate sync.
**Auth:** Required (admin)
**Body:** `{ api_key: string }`
**Response:** `{ success: true, message: string }`

### `DELETE /api/clients/[id]/uppromote`
Remove the UpPromote API key from a client.
**Auth:** Required (admin)
**Response:** `{ success: true }`

---

## 5. Content Pillars

### `GET /api/clients/[id]/pillars`
List all content pillars for a client, ordered by `sort_order`.
**Auth:** Required (user)
**Response:** `{ pillars: ContentPillar[] }`

### `POST /api/clients/[id]/pillars`
Manually create a new content pillar.
**Auth:** Required (user)
**Body:** `{ name, description?, emoji?, example_series?, formats?, hooks?, frequency? }`
**Response:** `{ pillar: ContentPillar }`

### `PATCH /api/clients/[id]/pillars/[pillarId]`
Update a content pillar's fields.
**Auth:** Required (user)
**Body:** Any pillar fields to update
**Response:** `{ pillar: ContentPillar }`

### `DELETE /api/clients/[id]/pillars/[pillarId]`
Delete a content pillar.
**Auth:** Required (user)
**Response:** `{ success: true }`

### `POST /api/clients/[id]/pillars/reorder`
Update `sort_order` for a set of pillars based on the provided array order.
**Auth:** Required (user)
**Body:** `{ pillar_ids: string[] }` (ordered array of UUIDs)
**Response:** `{ success: true }`

### `POST /api/clients/[id]/pillars/generate`
AI-generate new content pillars for a client. Async — returns a generation ID to poll.
**Auth:** Required (admin)
**Body:** `{ count?: number (1-10, default 5), direction?: string }`
**Response:** `{ id: string, status: 'processing' }` — poll the status endpoint

### `GET /api/clients/[id]/pillars/generate/[generationId]`
Poll the status of a pillar generation job. When `status = 'completed'`, also returns the generated pillars.
**Auth:** Required (user)
**Response:** `{ generation: { id, status, count, tokens_used, estimated_cost, ... }, pillars: ContentPillar[] | null }`

### `POST /api/clients/[id]/pillars/generate-strategy`
Full strategy pipeline: AI-generates pillars then ideas for each pillar, then scripts for each idea — all in one background job.
**Auth:** Required (admin)
**Body:** `{ direction?: string, pillar_count?: number (1-10), ideas_per_pillar?: number (1-10) }`
**Response:** `{ id: string, status: 'processing' }` — poll the run status endpoint

### `GET /api/clients/[id]/pillars/generate-strategy/[runId]`
Poll the status of a full strategy pipeline run.
**Auth:** Required (user)
**Response:** `{ run: { id, status, current_phase: 'pillars'|'ideas'|'scripts'|'done', error_message?, ... } }`

### `POST /api/clients/[id]/pillars/[pillarId]/reroll`
Regenerate a single pillar using AI (delete and replace).
**Auth:** Required (admin)
**Response:** `{ pillar: ContentPillar }`

---

## 6. Knowledge Base

### `GET /api/clients/[id]/knowledge`
List knowledge entries for a client, optionally filtered by type.
**Auth:** Required (user)
**Query:** `type?: 'brand_asset'|'brand_profile'|'document'|'web_page'|'note'|'idea'|'meeting_note'`
**Response:** `{ entries: KnowledgeEntry[] }`

### `POST /api/clients/[id]/knowledge`
Manually create a knowledge entry.
**Auth:** Required (admin)
**Body:** `{ type, title, content?, metadata?, source?: 'manual'|'scraped'|'generated'|'imported' }`
**Response:** `{ entry: KnowledgeEntry }` (status 201)

### `PATCH /api/clients/[id]/knowledge/[entryId]`
Update a knowledge entry.
**Auth:** Required (admin)
**Body:** Knowledge entry fields to update
**Response:** Updated entry

### `DELETE /api/clients/[id]/knowledge/[entryId]`
Delete a knowledge entry.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `GET /api/clients/[id]/knowledge/graph`
Get the knowledge graph (entities and connections extracted from entries).
**Auth:** Required (user)
**Response:** `{ nodes: Entity[], edges: Connection[] }`

### `GET /api/clients/[id]/knowledge/links`
Get linked knowledge entries and relationships.
**Auth:** Required (user)
**Response:** Array of linked entry pairs

### `POST /api/clients/[id]/knowledge/brand-profile`
Generate (or regenerate) an AI brand profile entry from all existing knowledge entries.
**Auth:** Required (user)
**Response:** `{ entry: KnowledgeEntry }`

### `POST /api/clients/[id]/knowledge/scrape`
Crawl the client's website and import pages as knowledge entries. Blocks until complete.
**Auth:** Required (admin)
**Body:** `{ maxPages?: number (1-100, default 50), maxDepth?: number (1-5, default 3) }`
**Response:** `{ message: string, count: number }`

### `POST /api/clients/[id]/knowledge/import-meeting`
Import a meeting transcript as a structured knowledge entry (extracts action items, insights, etc).
**Auth:** Required (user)
**Body:** `{ transcript: string, meetingDate?: string, attendees?: string[], source?: string }`
**Response:** `{ entry: KnowledgeEntry, actionItems: string[], insights: string[] }`

### `POST /api/clients/[id]/knowledge/generate-ideas`
Generate video ideas from the client's knowledge base.
**Auth:** Required (user)
**Body:** `{ concept?: string, count?: number (1-50, default 10) }`
**Response:** `{ ideas: VideoIdea[] }`

### `GET /api/knowledge/search`
Semantic search across the knowledge base using Gemini embeddings.
**Auth:** Required (user)
**Query:** `q: string, client_id?: string, limit?: number`
**Response:** `{ results: KnowledgeEntry[] }`

---

## 7. Ideas & Content Generation

### `GET /api/ideas`
List idea submissions, scoped by role. Admins see all; portal viewers see their client's ideas.
**Auth:** Required (user)
**Query:** `client_id?: string, status?: string`
**Response:** Array of idea submission objects

### `POST /api/ideas`
Submit a new idea.
**Auth:** Required (user)
**Body:** `{ client_id: string, title: string, description?, source_url?, category? }`
**Response:** Idea submission object

### `GET /api/ideas/[id]`
Get idea generation results by generation ID.
**Auth:** Required (user)
**Response:** Generation object with `ideas` array, `status`, `tokens_used`, `estimated_cost`

### `POST /api/ideas/generate`
Generate AI-powered video ideas. Supports multiple input sources: client context, a URL, a prior search result, or specific content pillars.
**Auth:** Required (user)
**Body:** `{ client_id?: string, url?: string, concept?: string, count: number, reference_video_ids?: string[], search_id?: string, pillar_ids?: string[], ideas_per_pillar?: number }`
**Response:** `{ id: string }` — generation ID to poll via `GET /api/ideas/[id]`
**Use when:** Creating video ideas from the Ideas Hub wizard.

### `POST /api/ideas/generate-script`
Generate a spoken-word video script for a given idea using Claude AI. Calibrates word count to target video length. Optionally matches style of reference videos.
**Auth:** Required (user)
**Body:** `{ client_id: string, title: string, why_it_works?: string|string[], content_pillar?: string, reference_video_ids?: string[], idea_entry_id?: string, cta?: string, video_length_seconds?: number (10-180), target_word_count?: number (10-500), hook_strategies?: Array<'negative'|'curiosity'|'controversial'|'story'|'authority'|'question'|'listicle'|'fomo'|'tutorial'> }`
**Response:** `{ script: string, scriptId: string|null, usage: TokenUsage, estimatedCost: number }`

### `POST /api/ideas/reject`
Save a rejected idea to prevent it from being regenerated.
**Auth:** Required (user)
**Body:** `{ client_id, title, description?, hook?, content_pillar?, generation_context? }`
**Response:** `{ success: true }`

### `GET /api/ideas/saved`
List all saved ideas (type = 'idea') from the knowledge base.
**Auth:** Required (user)
**Response:** `{ ideas: KnowledgeEntry[] }` (up to 200)

### `POST /api/concepts/react`
Submit a reaction (approve/star/revision) to a concept from a search result.
**Auth:** Required (user)
**Body:** `{ title, hook?, format?, virality?, why_it_works?, topic_name?, client_id?, search_id?, reaction: 'approved'|'starred'|'revision_requested'|null, feedback? }`
**Response:** `{ success: true }`

---

## 8. Reference Videos

### `GET /api/reference-videos`
List reference videos, optionally filtered by client.
**Auth:** Required (user)
**Query:** `client_id?: string`
**Response:** Array of reference video objects (status, title, url, transcript, visual_analysis)

### `POST /api/reference-videos`
Create a reference video record (in `pending` state — then call `/process`).
**Auth:** Required (user)
**Body:** `{ client_id: string, url?: string, title?: string, platform?: string }`
**Response:** `{ video: ReferenceVideo }`

### `POST /api/reference-videos/[id]/process`
Process a reference video: transcribe with Groq and run Gemini visual analysis in parallel. Updates status to `completed`.
**Auth:** Required (user)
**Response:** `{ video: ReferenceVideo }` with `transcript` and `visual_analysis` populated

---

## 9. Tasks & Todos

### `GET /api/tasks`
List tasks. Owners see all; non-owners see tasks assigned to or created by them.
**Auth:** Required (admin)
**Query:** `client_id?, assignee_id?, status?, task_type?, due_date_from?, due_date_to?`
**Response:** `{ tasks: Task[], is_owner: boolean, my_team_member_id: string|null, todoist_connected: boolean }`

### `POST /api/tasks`
Create a task. Auto-assigns to creator if no assignee. Pushes to Todoist if connected.
**Auth:** Required (admin)
**Body:** `{ title, description?, status?, priority?, client_id?, assignee_id?, due_date?, task_type?: 'content'|'shoot'|'edit'|'paid_media'|'strategy'|'other', tags?, recurrence? }`
**Response:** Task object with client and assignee relations

### `PATCH /api/tasks/[id]`
Update task fields. Syncs status changes to Todoist automatically.
**Auth:** Required (admin)
**Body:** Any task fields to update
**Response:** Updated task object

### `DELETE /api/tasks/[id]`
Delete a task. Also deletes from Todoist if synced.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `GET /api/tasks/search`
Full-text search across tasks with filtering.
**Auth:** Required (user)
**Query:** `q?, status?, priority?, assignee?, client?, task_type?, due_before?, due_after?, limit?`
**Response:** `{ tasks: Task[], count: number }`
**Use when:** Finding tasks by keyword, building filtered views, AI agent task lookups.

### `GET /api/tasks/[id]/activity`
Get the activity log and comments on a task.
**Auth:** Required (admin)
**Response:** Array of activity entries

### `GET /api/tasks/suggestions`
Get task suggestions aggregated from Monday.com boards.
**Auth:** Required (admin)
**Response:** Array of suggestion objects with `board_source`

### `POST /api/tasks/parse`
Parse natural language text into structured task fields using AI.
**Auth:** Required (admin)
**Body:** `{ text: string }`
**Response:** Parsed task object (title, due_date, priority, assignee_name, etc)

### `GET /api/todos`
List the current user's personal todos.
**Auth:** Required (user)
**Response:** Array of todo objects

### `POST /api/todos`
Create a personal todo.
**Auth:** Required (user)
**Body:** `{ title: string, due_date?, client_id?, priority? }`
**Response:** Todo object

### `PATCH /api/todos/[id]`
Update a todo.
**Auth:** Required (user)
**Body:** Todo fields to update
**Response:** Updated todo

### `DELETE /api/todos/[id]`
Delete a todo.
**Auth:** Required (user)
**Response:** `{ success: true }`

---

## 10. Pipeline (Content Production)

### `GET /api/pipeline`
List pipeline items for a given month.
**Auth:** Required (user)
**Query:** `month: string` (YYYY-MM-DD format, first day of month)
**Response:** `{ items: PipelineItem[] }`

### `POST /api/pipeline`
Add a client to the pipeline for a month.
**Auth:** Required (admin)
**Body:** `{ client_name, month_label, month_date, agency? }`
**Response:** Pipeline item

### `PATCH /api/pipeline/[id]`
Update any pipeline item field (status, team, dates, links, notes).
**Auth:** Required (admin)
**Body:** `{ [field]: value }` — any pipeline field
**Response:** Updated item

### `DELETE /api/pipeline/[id]`
Remove a client from the pipeline month.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/pipeline/[id]/advance`
Smart status advancement with transition validation. Advances a specific production track to its next logical status.
**Auth:** Required (user)
**Body:** `{ track: 'assignment'|'raws'|'editing'|'client_approval'|'boosting', target_status?: string }`
**Response:** `{ item: PipelineItem, transition: { track, from, to } }`
**Use when:** An editor marks work done, a manager approves, or any pipeline status needs to advance. Validates transitions are allowed.

### `GET /api/pipeline/summary`
Get pipeline summary statistics and health metrics.
**Auth:** Required (user)
**Response:** Summary stats object with counts by status

### `POST /api/pipeline/sync`
Sync pipeline items from Monday.com Content Calendars board.
**Auth:** Required (admin)
**Body:** `{ api_token?, group_id? }`
**Response:** `{ synced: number, errors?: string[] }`

---

## 11. Shoots & Calendar

### `GET /api/shoots`
List shoot events with optional filtering.
**Auth:** Required (admin)
**Query:** `client_id?, status?, date_from? (YYYY-MM-DD), date_to? (YYYY-MM-DD)`
**Response:** Array of shoot events with client relation

### `GET /api/shoots/[id]`
Get a single shoot event by ID.
**Auth:** Required (admin)
**Response:** Shoot event with client relation

### `PATCH /api/shoots/[id]`
Update a shoot event's fields (title, date, location, status, notes).
**Auth:** Required (admin)
**Body:** `{ title?, client_id?, shoot_date?, location?, notes?, scheduled_status?: 'scheduled'|'completed'|'cancelled' }`
**Response:** Updated shoot event

### `DELETE /api/shoots/[id]`
Delete a shoot event.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/shoots/schedule`
Schedule a shoot: creates a shoot event record, optionally creates a Google Calendar event, and sends email invites.
**Auth:** Required (admin)
**Body:** `{ client_name, client_id, shoot_date, shoot_time?, location?, notes?, agency, team_emails: string[], client_emails: string[], videographer_emails: string[], add_to_calendar: boolean, send_invites: boolean }`
**Response:** `{ success: true, shootId, googleEventCreated, invitesSent }`

### `POST /api/shoots/reschedule`
Update the shoot date on the Monday.com Content Calendars board (used by calendar drag-to-reschedule).
**Auth:** Required (admin)
**Body:** `{ monday_item_id: string, new_date: string (YYYY-MM-DD) }`
**Response:** `{ success: true }`

### `POST /api/shoots/ideate`
Generate an AI-powered shoot plan (video ideas, equipment, talking points) for a given client and date.
**Auth:** Required (admin)
**Body:** `{ clientName, clientId?, shootDate?, industry?, context }`
**Response:** `{ plan: ShootPlan, usage, estimatedCost }`

### `POST /api/shoots/[id]/plan`
Generate a full AI shoot plan for an existing shoot event. Pulls live SERP data + client content memory. Saves to shoot and syncs to vault.
**Auth:** Required (admin)
**Response:** `{ shootId, status: 'generated', plan: ShootPlan }`

### `PATCH /api/shoots/[id]/footage`
Update raw footage upload status for a shoot.
**Auth:** Required (admin)
**Body:** `{ raw_footage_uploaded: boolean, raw_footage_url?: string }`
**Response:** Updated shoot event

### `POST /api/shoots/sync`
Sync upcoming Google Calendar events via Google OAuth, filter for shoot-related events, and upsert into `shoot_events`.
**Auth:** Required (admin)
**Response:** `{ synced: number }`

### `GET /api/shoots/content-calendar`
Fetch shoot data from Monday.com Content Calendars board (cached 10 min).
**Auth:** Required (admin)
**Response:** Array of parsed shoot items

### `GET /api/calendar/events`
Fetch Google Calendar events for the current user via Google OAuth (2-min cache).
**Auth:** Required (user)
**Query:** `days_ahead?: number, calendars?: comma-separated calendar IDs`
**Response:** `[{ name, color, connection_type, events: CalendarEvent[] }]`

### `POST /api/calendar/sync`
Pull Google Calendar events and identify + import shoot events into the shoot_events table.
**Auth:** Required (admin)
**Response:** `{ imported: number, matched: number }`

### `POST /api/calendar/invite`
Generate a calendar connection invite token for a contact.
**Auth:** Required (admin)
**Body:** `{ contact_id: string }`
**Response:** `{ token, url }`

### `GET /api/calendar/connect/[token]`
Accept a calendar connection invite via token.
**Auth:** Public
**Response:** Redirects to connect flow

### `GET /api/calendar/gaps`
Find free time slots in connected calendars.
**Auth:** Required (user)
**Query:** `date_from, date_to, min_duration?`
**Response:** Array of free time slot objects

### `POST /api/calendar/webhook`
Receive Google Calendar push notification webhooks.
**Auth:** Public (webhook)
**Response:** `{ ok: true }`

---

## 12. Analyze (Video Analysis)

### `GET /api/moodboard/boards`
List all analysis boards.
**Auth:** Required (admin)
**Response:** Array of board objects with item count

### `POST /api/moodboard/boards`
Create a new analysis board.
**Auth:** Required (admin)
**Body:** `{ name, description?, client_id?, template_id? }`
**Response:** New board object

### `GET /api/moodboard/boards/[id]`
Get a board with all items, notes, edges, and tags.
**Auth:** Required (admin)
**Response:** Full board object

### `PATCH /api/moodboard/boards/[id]`
Update a board's name, description, or client association.
**Auth:** Required (admin)
**Body:** Board fields to update
**Response:** Updated board

### `DELETE /api/moodboard/boards/[id]`
Delete a board and all its items.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/moodboard/boards/[id]/share`
Create a shareable link with optional password and expiry.
**Auth:** Required (admin)
**Body:** `{ password?, expires_days? }`
**Response:** `{ token, url, expires_at }`

### `POST /api/moodboard/boards/[id]/duplicate`
Duplicate a board with all items.
**Auth:** Required (admin)
**Response:** New board object

### `GET /api/moodboard/boards/[id]/search`
Full-text search items within a board (title, transcript, summary, hook, creator name).
**Auth:** Required (admin)
**Query:** `q: string`
**Response:** `{ item_ids: string[] }`

### `PATCH /api/moodboard/boards/[id]/positions`
Batch-update canvas positions of items and notes within a board.
**Auth:** Required (admin)
**Body:** `{ items?: [{ id, position_x, position_y, width?, height? }], notes?: [...] }`
**Response:** `{ success: true }`

### `GET/PATCH /api/moodboard/boards/[id]/tags`
Get or manage tags on a board.
**Auth:** Required (admin)

### `GET /api/moodboard/items`
List items, optionally filtered by board.
**Auth:** Required (admin)
**Query:** `board_id?: string`
**Response:** Array of analysis items

### `POST /api/moodboard/items`
Create a new item (video or website). For TikTok URLs, auto-fetches metadata via tikwm API + oembed + HTML scrape in parallel.
**Auth:** Required (admin)
**Body:** `{ board_id, type: 'video'|'website'|'image', url?, title? }`
**Response:** Created item object

### `GET /api/moodboard/items/[id]`
Get a single analysis item.
**Auth:** Required (admin)
**Response:** Item object

### `PATCH /api/moodboard/items/[id]`
Update item fields.
**Auth:** Required (admin)
**Body:** Item fields to update
**Response:** Updated item

### `DELETE /api/moodboard/items/[id]`
Delete an analysis board item.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/moodboard/items/[id]/process`
Full video processing pipeline: download, extract frames (ffmpeg), transcribe, generate AI analysis. Saves all results to item.
**Auth:** Required (admin)
**Response:** `{ item: AnalyzeItem }` with transcript, visual_analysis, and concept_summary populated

### `POST /api/moodboard/items/[id]/reprocess`
Re-run the full video processing pipeline (overwriting existing results).
**Auth:** Required (admin)
**Response:** `{ item: AnalyzeItem }`

### `POST /api/moodboard/items/[id]/analyze`
Run AI analysis on an item (visual breakdown, hook analysis, engagement patterns).
**Auth:** Required (admin)
**Response:** `{ analysis: object }`

### `POST /api/moodboard/items/[id]/insights`
Generate or regenerate AI creative insights for an item.
**Auth:** Required (admin)
**Response:** `{ insights: object }`

### `POST /api/moodboard/items/[id]/transcribe`
Transcribe the audio of a video item.
**Auth:** Required (admin)
**Response:** `{ transcript: string }`

### `POST /api/moodboard/items/[id]/extract-frames`
Extract frame thumbnails from a video item using ffmpeg.
**Auth:** Required (admin)
**Response:** `{ frames: string[] }`

### `GET /api/moodboard/items/[id]/thumbnail`
Get (or generate) a thumbnail for an item.
**Auth:** Required (admin)
**Response:** `{ thumbnail_url: string }`

### `GET /api/moodboard/items/[id]/video-url`
Get a pre-signed or proxied URL for streaming a video item.
**Auth:** Required (admin)
**Response:** `{ url: string }`

### `POST /api/moodboard/items/[id]/rescript`
Generate a new script adapted from a video item's transcript for a specific brand/audience.
**Auth:** Required (admin)
**Body:** `{ client_id?, brand_voice?, product?, target_audience?, notes? }`
**Response:** `{ script: string, usage, estimatedCost }`

### `POST /api/moodboard/items/[id]/replicate`
Generate a content strategy for replicating a video item's style in a specified format.
**Auth:** Required (admin)
**Body:** `{ client_id?, format: string, notes? }`
**Response:** `{ strategy: string, usage, estimatedCost }`

### `GET/POST /api/moodboard/items/[id]/tags`
Get or add tags to an analysis board item.
**Auth:** Required (admin)

### `POST /api/moodboard/items/batch-tags`
Apply tags to multiple items at once.
**Auth:** Required (admin)
**Body:** `{ item_ids: string[], tag_ids: string[] }`
**Response:** `{ success: true }`

### `GET /api/moodboard/items/[id]/analysis/pdf`
Generate and stream a PDF analysis report for an analysis board item.
**Auth:** Required (admin)
**Response:** PDF file stream

### `GET /api/moodboard/items/[id]/brief/pdf`
Generate and stream a PDF creative brief for an analysis board item.
**Auth:** Required (admin)
**Response:** PDF file stream

### `POST /api/moodboard/chat`
AI chat (Cortex AI) with analysis item context. Returns SSE stream of text chunks.
**Auth:** Required (admin)
**Body:** `{ board_id, item_ids: string[], messages: [{role, content}], note_contents?: string[], client_slugs?: string[], model?: string }`
**Response:** Server-sent events stream (text/event-stream)
**Use when:** Analyzing video hooks, comparing content styles, drafting new scripts inspired by board items.

### `GET/POST /api/moodboard/notes`
List or create sticky notes on a board.
**Auth:** Required (admin)
**POST Body:** `{ board_id, content?, color?, position_x?, position_y? }`

### `PATCH/DELETE /api/moodboard/notes/[id]`
Update or delete a sticky note.

### `GET/POST /api/moodboard/edges`
List or create connection edges between items on a board.
**Auth:** Required (admin)

### `PATCH/DELETE /api/moodboard/edges/[id]`
Update or delete an edge.

### `GET/POST /api/moodboard/comments`
List or create comments on board items.
**Auth:** Required (admin)

### `PATCH/DELETE /api/moodboard/comments/[id]`
Update or delete a comment.

### `PATCH/DELETE /api/moodboard/tags/[id]`
Update or delete a tag definition.

### `GET /api/moodboard/templates`
List available board templates.
**Auth:** Required (admin)
**Response:** Array of template objects

### `GET /api/shared/moodboard/[token]`
Public access to a shared analysis board (supports optional password).
**Auth:** Public
**Query:** `password?: string`
**Response:** Board with items (password-protected if configured)

---

## 13. The Nerd AI Assistant

### `POST /api/nerd/chat`
"The Nerd" AI assistant — a tool-calling Claude agent with full access to client data, knowledge bases, tasks, shoots, and the ability to take actions. Returns SSE stream.
**Auth:** Required (user)
**Body:** `{ messages: [{role: 'user'|'assistant'|'tool', content, tool_call_id?}], mentions?: [{type: 'client'|'team_member', id, name, slug?}], actionConfirmation?: { toolName, arguments, confirmed } }`
**Response:** Server-sent events stream (text/event-stream)
**Use when:** Asking strategic questions, generating ideas, creating tasks, looking up client info, or analyzing performance.

### `GET /api/nerd/clients`
List all active clients (name, slug, agency) for @mention autocomplete in The Nerd.
**Auth:** Required (user)
**Response:** Array of `{ name, slug, agency }`

### `GET /api/nerd/mentions`
Fetch all clients and team members for @mention autocomplete in The Nerd.
**Auth:** Required (user)
**Response:** `{ clients: [{type, id, name, slug, agency, avatarUrl}], team: [{type, id, name, role, avatarUrl}] }`

---

## 14. Social Media & Scheduler

### `GET /api/scheduler/posts`
List scheduled posts for a client, with optional status filter.
**Auth:** Required (admin)
**Query:** `client_id: string (required), status?: 'draft'|'scheduled'|'published'|'failed'`
**Response:** Array of scheduled post objects

### `POST /api/scheduler/posts`
Create a new scheduled post (draft or scheduled).
**Auth:** Required (admin)
**Body:** `{ client_id, caption?, hashtags?, scheduled_at?, status?: 'draft'|'scheduled', platform_profile_ids?, media_ids?, cover_image_url?, tagged_people?, collaborator_handles? }`
**Response:** Created post object

### `PUT /api/scheduler/posts/[id]`
Update a scheduled post.
**Auth:** Required (admin)
**Body:** Post fields to update
**Response:** Updated post object

### `DELETE /api/scheduler/posts/[id]`
Delete a scheduled post.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/scheduler/posts/batch-publish`
Immediately publish a batch of scheduled posts to their social platforms.
**Auth:** Required (admin)
**Body:** `{ posts: string[] }` (array of post IDs)
**Response:** `{ published: number, errors?: string[] }`

### `POST /api/scheduler/posts/publish-drafts`
Publish all posts with `status = 'scheduled'` whose `scheduled_at` is in the past.
**Auth:** Required (admin)
**Response:** `{ published: number }`

### `POST /api/scheduler/auto-schedule`
Bulk AI caption generation + scheduling. Distributes unused media across a date range at the specified frequency, generates captions using Claude AI with client brand context and saved captions as style examples.
**Auth:** Required (admin)
**Body:** `{ client_id, start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), posts_per_week (1-14), posting_time (HH:MM), platform_profile_ids: string[], media_ids?: string[] }`
**Response:** `{ scheduled: number, posts: ScheduledPost[] }`

### `GET /api/scheduler/profiles`
List connected social profiles (Late accounts) for a client.
**Auth:** Required (admin)
**Query:** `client_id: string (required)`
**Response:** `{ profiles: [{ id, platform, username, avatar_url, late_account_id }] }`

### `POST /api/scheduler/connect`
Start the OAuth flow to connect a social platform account for a client via Late. Creates a Late profile if one doesn't exist.
**Auth:** Required (admin)
**Body:** `{ platform: 'facebook'|'instagram'|'tiktok'|'youtube', client_id: string }`
**Response:** `{ authUrl: string }` — redirect user to this URL

### `GET /api/scheduler/connect/callback`
OAuth callback handler after social platform authorization.
**Auth:** Required (admin)
**Query:** `client_id, platform, code, state`
**Response:** Redirects to scheduler settings page

### `GET /api/scheduler/analytics`
Fetch post analytics from Late for a client's connected social accounts.
**Auth:** Required (admin)
**Query:** `client_id, start (YYYY-MM-DD), end (YYYY-MM-DD)`
**Response:** `{ analytics: [{ platform, ...metrics }] }`

### `POST /api/scheduler/media`
Get a presigned upload URL for media (`action = 'get-upload-url'`), or confirm a completed media upload (`action = 'confirm-upload'`).
**Auth:** Required (admin)
**Body (get-upload-url):** `{ action: 'get-upload-url', contentType, filename }`
**Body (confirm-upload):** `{ action: 'confirm-upload', client_id, filename, public_url, file_size_bytes, mime_type, thumbnail_url? }`
**Response (get):** `{ uploadUrl, publicUrl }` | **Response (confirm):** Media record object

### `GET /api/scheduler/media`
List uploaded media for a client.
**Auth:** Required (admin)
**Query:** `client_id: string, is_used?: boolean`
**Response:** Array of media objects

### `DELETE /api/scheduler/media/[id]`
Delete a media item.
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `POST /api/scheduler/ai/hashtag-suggestions`
Generate AI hashtag suggestions for a caption.
**Auth:** Required (admin)
**Body:** `{ text: string, platform?: string }`
**Response:** `{ hashtags: string[] }`

### `POST /api/scheduler/ai/improve-caption`
Use AI to improve/rewrite an existing caption with client brand context and saved caption examples as style guides.
**Auth:** Required (admin)
**Body:** `{ caption: string, client_id?: string }`
**Response:** `{ improved_caption: string }`

### `GET /api/scheduler/review`
Get post review records for a client.
**Auth:** Required (admin)
**Query:** `client_id: string`
**Response:** Array of review objects

### `POST /api/scheduler/review`
Create a review record for a post.
**Auth:** Required (admin)
**Body:** `{ post_id: string, status: string, notes? }`
**Response:** Review object

### `POST /api/scheduler/review/comment`
Add a comment to a post review.
**Auth:** Required (admin)
**Body:** `{ review_id: string, content: string }`
**Response:** Comment object

### `GET /api/scheduler/saved-captions`
List saved caption templates for a client.
**Auth:** Required (admin)
**Query:** `client_id: string`
**Response:** Array of saved caption objects

### `POST /api/scheduler/saved-captions`
Save a reusable caption template.
**Auth:** Required (admin)
**Body:** `{ client_id, title, caption_text, hashtags? }`
**Response:** Saved caption object

### `POST /api/scheduler/share`
Create a shareable calendar review link for selected posts (for client review workflows).
**Auth:** Required (admin)
**Body:** `{ client_id, post_ids: string[], label?: string }`
**Response:** `{ link: object, url: string }`

### `POST /api/scheduler/share/feedback`
Submit client feedback on a shared calendar review link.
**Auth:** Public
**Body:** `{ token, post_id, feedback, status }`
**Response:** `{ success: true }`

### `POST /api/scheduler/webhooks`
Receive posting status webhooks from Late (published, failed, etc).
**Auth:** Public (webhook from Late)
**Response:** `{ ok: true }`

### `GET /api/social/profiles`
List active social profiles for a client.
**Auth:** Required (user)
**Query:** `clientId: string (required)`
**Response:** Array of social profile objects

### `GET /api/social/connect/[platform]`
Start OAuth flow for connecting a social account directly.
**Auth:** Required (admin)

### `GET /api/social/callback/[platform]`
Handle OAuth callback for social platform connection.
**Auth:** Required (admin)

### `DELETE /api/social/disconnect/[profileId]`
Disconnect a social profile.
**Auth:** Required (admin)
**Response:** `{ success: true }`

---

## 15. Reporting & Analytics

### `GET /api/reporting/summary`
Generate analytics summary for a client over a date range (aggregates from Meta/Instagram data).
**Auth:** Required (user)
**Query:** `clientId, start (YYYY-MM-DD), end (YYYY-MM-DD)`
**Response:** `{ combined, platforms, dateRange }`

### `GET /api/reporting/top-posts`
Get top-performing posts for a client sorted by engagement.
**Auth:** Required (user)
**Query:** `client_id, limit?, platform?`
**Response:** Array of top posts with metrics

### `POST /api/reporting/sync`
Sync social analytics data from Meta/Instagram for a client.
**Auth:** Required (user)
**Body:** `{ clientId, dateRange?: { start, end } }`
**Response:** `{ synced: number }`

### `POST /api/reporting/share`
Create a shareable analytics report link.
**Auth:** Required (admin)
**Body:** `{ client_id, date_from, date_to }`
**Response:** `{ token, url, expires_at }`

### `GET /api/reporting/shared/[token]`
Public access to a shared analytics report.
**Auth:** Public
**Response:** Report data

### `GET /api/instagram/accounts`
List connected Instagram accounts.
**Auth:** Required (admin)
**Response:** Array of Instagram account objects

### `GET /api/instagram/media`
Get recent Instagram media with optional insights.
**Auth:** Required (admin)
**Query:** `account_id, limit?, insights?`
**Response:** Array of media objects with engagement data

### `GET /api/instagram/insights`
Get account-level Instagram insights (reach, impressions, followers).
**Auth:** Required (admin)
**Query:** `account_id, period?`
**Response:** Insights object

### `GET /api/instagram/demographics`
Get Instagram audience demographic data.
**Auth:** Required (admin)
**Query:** `account_id`
**Response:** Demographics object

### `GET /api/analytics/meta`
Fetch Meta Ads Manager data: campaigns, ad sets, and ads with insights. Computes performance scores.
**Auth:** Required (admin)
**Query:** `datePreset: 'last_7d'|'last_14d'|'last_30d'|'this_month'|'all_time'|'custom', dateFrom?, dateTo?`
**Response:** Structured campaigns and performance data

### `GET /api/affiliates`
Get UpPromote affiliate analytics for a client.
**Auth:** Required (admin)
**Query:** `clientId, start (YYYY-MM-DD), end (YYYY-MM-DD)`
**Response:** Affiliate stats (new/total/active affiliates, referrals, sales, commissions, clicks, top affiliates, recent referrals, pending payouts)

---

## 16. Google Workspace Integration

### `GET /api/google`
Get the current user's Google Workspace connection status.
**Auth:** Required (user)
**Response:** `{ connected: boolean, email?, scopes? }`

### `GET /api/google/status`
Detailed status of Google connection including which services are available.
**Auth:** Required (user)
**Response:** `{ calendar: boolean, drive: boolean, chat: boolean, gmail: boolean }`

### `GET /api/google/callback`
OAuth callback from Google for workspace connection.
**Auth:** Required (user)
**Response:** Redirects to settings page

### `POST /api/google/disconnect`
Disconnect Google Workspace from the current user's account.
**Auth:** Required (user)
**Response:** `{ success: true }`

### `GET /api/google/chat`
List Google Chat spaces, or list messages in a specific space.
**Auth:** Required (user)
**Query:** `space?: string (spaces/xxx format), pageToken?`
**Response:** `{ spaces: [...] }` or `{ messages: [...], nextPageToken? }`

### `GET /api/google/drive`
List files from Google Drive.
**Auth:** Required (user)
**Query:** `folderId?, q? (search query), pageToken?, pageSize?`
**Response:** `{ files: [...], nextPageToken? }`

---

## 17. Team & Meetings

### `GET /api/team`
List all active team members.
**Auth:** Required (admin)
**Response:** Array of team member objects (id, full_name, email, role, avatar_url, is_active)

### `POST /api/team`
Create a new team member record.
**Auth:** Required (admin)
**Body:** `{ full_name: string, email?, role?, avatar_url? }`
**Response:** Team member object

### `PATCH /api/team/[id]`
Update a team member's profile.
**Auth:** Required (admin)
**Body:** Team member fields to update
**Response:** Updated team member

### `DELETE /api/team/[id]`
Deactivate a team member (soft delete).
**Auth:** Required (admin)
**Response:** `{ success: true }`

### `GET /api/team/[id]/workload`
Get a team member's current workload — client assignments, open/overdue tasks, pipeline items.
**Auth:** Required (user)
**Response:** `{ member, assignments, tasks: { open, overdue, items }, pipeline: { count, items } }`
**Use when:** Checking capacity before assigning work, building team dashboards.

### `POST /api/team/[id]/invite`
Generate an invite link for a team member to create their Cortex account.
**Auth:** Required (admin)
**Response:** `{ invite_url, expires_at }`

### `POST /api/team/[id]/link`
Link a team member record to an existing auth user account.
**Auth:** Required (admin)
**Body:** `{ user_id: string }`
**Response:** `{ success: true }`

### `GET /api/team/linkable-users`
List auth users (from both `public.users` and `auth.users`) that are not yet linked to a team member.
**Auth:** Required (admin)
**Response:** Array of linkable user objects

### `GET /api/team/invite/validate`
Validate a team invite token (check expiry and usage).
**Auth:** Public
**Query:** `token: string`
**Response:** `{ valid: true, email, member_name, member_role }` or error

### `POST /api/team/invite/accept`
Accept a team invite and create the user's Cortex account.
**Auth:** Public
**Body:** `{ token, full_name, email, password }`
**Response:** `{ success: true, user_id }`

### `GET /api/meetings`
List meetings with attendees.
**Auth:** Required (user)
**Response:** Array of meeting objects

### `POST /api/meetings`
Create a meeting record.
**Auth:** Required (user)
**Body:** `{ title, attendees?, date, duration?, notes?, recurrence? }`
**Response:** Meeting object

### `PATCH /api/meetings/[id]`
Update a meeting.
**Auth:** Required (user)
**Body:** Meeting fields to update
**Response:** Updated meeting

### `DELETE /api/meetings/[id]`
Delete a meeting.
**Auth:** Required (user)
**Response:** `{ success: true }`

---

## 18. Notifications

### `GET /api/notifications`
List notifications for the authenticated user.
**Auth:** Required (user)
**Query:** `unread_only?: boolean, limit?: number`
**Response:** `{ notifications: Notification[], unread_count: number }`

### `PATCH /api/notifications/[id]`
Mark a notification as read.
**Auth:** Required (user)
**Body:** `{ read: true }`
**Response:** Updated notification

### `POST /api/notifications/mark-all-read`
Mark all of the current user's notifications as read.
**Auth:** Required (user)
**Response:** `{ updated: number }`

### `GET /api/notifications/preferences`
Get the current user's notification preferences.
**Auth:** Required (user)
**Response:** Preferences object

### `PATCH /api/notifications/preferences`
Update notification preferences.
**Auth:** Required (user)
**Body:** Preferences fields to update
**Response:** Updated preferences

---

## 19. Vault (Obsidian)

### `GET /api/vault/search`
Search the Obsidian vault using full-text or semantic search.
**Auth:** Required (user)
**Query:** `q: string, limit?: number, mode?: 'fts'|'semantic'`
**Response:** `{ query, mode, count, results: [{ path, title, excerpt, score }] }`

### `POST /api/vault/init`
Initialize the vault with templates and client profile stubs.
**Auth:** Required (admin)
**Response:** `{ initialized: true }`

### `POST /api/vault/provision`
Read vault client profiles and provision/update them in the Cortex database.
**Auth:** Required (admin)
**Response:** `{ provisioned: number }`

### `POST /api/vault/index`
Re-index all vault files for semantic search.
**Auth:** Required (admin)
**Response:** `{ indexed: number }`

### `GET /api/vault/[...path]`
Read a file from the vault (proxied to GitHub API).
**Auth:** Required (admin)
**Response:** File content (JSON or text)

### `PUT /api/vault/[...path]`
Write a file to the vault (proxied to GitHub API).
**Auth:** Required (admin)
**Body:** `{ content: string, message?: string }`
**Response:** Commit info

### `POST /api/vault/webhook`
GitHub push webhook receiver. Re-indexes changed markdown files when vault repo is updated. Validates HMAC signature.
**Auth:** Public (webhook — validated by X-Hub-Signature-256)
**Response:** `{ indexed: number }`

---

## 20. Dashboard

### `GET /api/dashboard/stats`
Get dashboard widget statistics (basic counts).
**Auth:** Required (user)
**Response:** Stats object

### `GET /api/dashboard/overview`
Comprehensive agency pulse — active clients, pipeline distribution, task stats, upcoming shoots, unread notifications, recent searches.
**Auth:** Required (user)
**Response:** `{ clients, pipeline, tasks, upcomingShoots, unreadNotifications, recentSearches }`
**Use when:** Building dashboard views, AI agent status checks, quick operational overview.

### `GET /api/activity`
Fetch recent activity log entries. Admins see all; portal viewers see only their org's activity.
**Auth:** Required (user)
**Query:** `limit?: number (max 100, default 50)`
**Response:** Array of activity log entries (most recent first)

### `GET /api/usage`
Get AI usage and cost summary for a time period.
**Auth:** Required (user)
**Query:** `from?: ISO8601, to?: ISO8601` (default: last 30 days)
**Response:** Usage summary with costs by feature and model

---

## 21. Portal Invites

### `POST /api/invites`
Generate a portal invite token for a client organization.
**Auth:** Required (admin)
**Body:** `{ client_id: string }`
**Response:** `{ token, invite_url, expires_at, client_name }`

### `GET /api/invites/validate`
Check if a portal invite token is valid and not expired.
**Auth:** Public
**Query:** `token: string`
**Response:** `{ valid: true, client_name }` or error

### `POST /api/invites/accept`
Accept a portal invite and create a viewer account linked to the client's organization.
**Auth:** Public
**Body:** `{ token, full_name, email, password }`
**Response:** `{ success: true }`

---

## 22. Settings

### `GET /api/settings/scheduling`
Get scheduling settings (timezone, business hours, auto-schedule config).
**Auth:** Required (admin)
**Response:** Settings object

### `PATCH /api/settings/scheduling`
Update scheduling settings.
**Auth:** Required (admin)
**Body:** Settings fields to update
**Response:** Updated settings

---

## 23. Monday.com Integration

### `POST /api/monday/webhook`
Receive Monday.com webhook events (`create_item`, `change_column_values`). Syncs client changes from Monday to vault.
**Auth:** Public (Monday.com webhook)
**Response:** `{ ok: true }`

### `POST /api/monday/update`
Push Cortex data back to Monday.com board columns.
**Auth:** Required (admin)
**Body:** `{ item_id, updates: Record<columnId, value> }`
**Response:** `{ success: true }`

### `POST /api/monday/sync`
Full sync: fetch all clients from the Monday.com Clients board and upsert into the Cortex DB and vault.
**Auth:** Required (admin)
**Response:** `{ synced: number, errors?: string[] }`

---

## 24. Todoist Integration

### `POST /api/todoist/connect`
Connect a Todoist account with an API key. Validates the key against Todoist before saving.
**Auth:** Required (user)
**Body:** `{ api_key: string, project_id?: string }`
**Response:** `{ connected: true }`

### `POST /api/todoist/sync`
Trigger a full Todoist ↔ Cortex sync (pull completed tasks from Todoist + push new tasks).
**Auth:** Required (user)
**Query:** `auto?: boolean` (skips if synced recently)
**Response:** `{ pulled: number, pushed: number, errors: string[] }`

---

## 25. External API (`/api/v1/` — API Key Auth)

All `/api/v1/` routes use `Authorization: Bearer nativz_...` header instead of session cookies. The key must have the appropriate scope.

### `GET /api/v1/clients`
List all clients.
**Auth:** API key (scope: `clients`)
**Response:** `{ clients: [...] }`

### `POST /api/v1/clients`
Create a new client.
**Auth:** API key (scope: `clients`)
**Body:** Same as `/api/clients/onboard` schema
**Response:** `{ client: object }`

### `GET /api/v1/clients/[id]`
Get a single client by ID.
**Auth:** API key (scope: `clients`)
**Response:** Client object

### `PATCH /api/v1/clients/[id]`
Update a client.
**Auth:** API key (scope: `clients`)

### `GET /api/v1/clients/[id]/knowledge`
List or full-text search a client's knowledge entries.
**Auth:** API key (scope: `clients`)
**Query:** `type?, search?, include_links?, include_entities?`
**Response:** Array of knowledge entry objects

### `POST /api/v1/clients/[id]/knowledge`
Create a knowledge entry.
**Auth:** API key (scope: `clients`)
**Body:** `{ type, title, content?, metadata?, source? }`
**Response:** `{ entry: KnowledgeEntry }` (status 201)

### `GET /api/v1/clients/[id]/knowledge/[entryId]`
Get a single knowledge entry.
**Auth:** API key (scope: `clients`)

### `PATCH/DELETE /api/v1/clients/[id]/knowledge/[entryId]`
Update or delete a knowledge entry.
**Auth:** API key (scope: `clients`)

### `POST /api/v1/clients/[id]/knowledge/search`
Full-text search a client's knowledge entries.
**Auth:** API key (scope: `clients`)
**Body:** `{ query: string, type?, limit? }`
**Response:** `{ results: KnowledgeEntry[] }`

### `GET/POST /api/v1/clients/[id]/knowledge/import`
Import knowledge entries in bulk.
**Auth:** API key (scope: `clients`)

### `GET /api/v1/clients/[id]/knowledge/graph`
Get the knowledge graph for a client.
**Auth:** API key (scope: `clients`)

### `GET /api/v1/tasks`
List tasks with filtering.
**Auth:** API key (scope: `tasks`)
**Query:** `client_id?, assignee_id?, status?, due_date_from?, due_date_to?`
**Response:** `{ tasks: [...] }`

### `POST /api/v1/tasks`
Create a task.
**Auth:** API key (scope: `tasks`)
**Body:** `{ title, description?, status?, priority?, client_id?, assignee_id?, due_date?, task_type?, tags? }`
**Response:** `{ task: object }`

### `GET /api/v1/tasks/[id]`
Get a single task.
**Auth:** API key (scope: `tasks`)

### `PATCH/DELETE /api/v1/tasks/[id]`
Update or delete a task.
**Auth:** API key (scope: `tasks`)

### `GET /api/v1/shoots`
List shoot events with filtering.
**Auth:** API key (scope: `shoots`)
**Query:** `client_id?, status?, date_from?, date_to?`
**Response:** `{ shoots: [...] }`

### `GET /api/v1/shoots/[id]`
Get a single shoot event.
**Auth:** API key (scope: `shoots`)

### `GET /api/v1/posts`
List scheduled posts for a client.
**Auth:** API key (scope: `scheduler`)
**Query:** `client_id: string (required), status?`
**Response:** `{ posts: [...] }`

### `POST /api/v1/posts`
Create a scheduled post.
**Auth:** API key (scope: `scheduler`)
**Body:** `{ client_id, caption?, hashtags?, scheduled_at?, status?, platform_profile_ids?, media_ids? }`
**Response:** `{ post: object }`

### `GET/PATCH/DELETE /api/v1/posts/[id]`
Get, update, or delete a scheduled post.
**Auth:** API key (scope: `scheduler`)

### `GET /api/v1/team`
List active team members.
**Auth:** API key (scope: `team`)
**Response:** `{ team: [...] }`

### `POST /api/v1/team`
Create a team member.
**Auth:** API key (scope: `team`)
**Body:** `{ full_name, email?, role? }`

### `POST /api/v1/search`
Create a topic search record (returns ID, doesn't run the pipeline).
**Auth:** API key (scope: `search`)
**Body:** `{ client_id, query, search_mode?: 'quick'|'deep' }`
**Response:** `{ search: { id, query, status, search_mode, created_at } }`

### `GET /api/v1/calendar/events`
Fetch Google Calendar events for the API key owner via Google OAuth.
**Auth:** API key (scope: `calendar`)
**Query:** `start: ISO8601, end: ISO8601`
**Response:** `{ events: CalendarEvent[] }`

### `POST /api/v1/calendar/events`
Create a Google Calendar event via Google OAuth for the API key owner.
**Auth:** API key (scope: `calendar`)
**Body:** `{ summary, description?, location?, start, end, attendees?: [{email}] }`
**Response:** `{ event: GoogleCalendarEvent }`

---

## 26. Cron Jobs (Internal)

These run on a schedule. All require `Authorization: Bearer {CRON_SECRET}` header.

| Path | Purpose |
|------|---------|
| `POST /api/cron/sync-reporting` | Sync social media analytics from Meta/Instagram for all active clients |
| `POST /api/cron/shoot-planner` | Auto-generate AI shoot plans for shoots happening in 3 days |
| `POST /api/cron/publish-posts` | Publish scheduled posts whose `scheduled_at` is now due |
| `POST /api/cron/check-velocity` | Check post velocity and send notifications about trending content |
| `POST /api/cron/sync-affiliates` | Sync UpPromote affiliate data for all connected clients |
| `POST /api/cron/fyxer-import` | Import meeting notes from Fyxer via Gmail polling (Google service account) + generate embeddings |

---

## Response Conventions

- **Success:** `{ data }` or `{ success: true }`
- **Error:** `{ error: string }` with appropriate HTTP status code
- **Status codes:** 200 (ok), 201 (created), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 422 (unprocessable), 500 (server error), 503 (service unavailable)
- **AI responses:** Always null-safe with `?? []`, `?? ''`, `?? 0`
- **Dates:** ISO 8601 (`YYYY-MM-DD` for dates, full ISO string for timestamps)
- **Async jobs:** Create record → return `{ id, status: 'processing' }` → poll status endpoint until `status = 'completed' | 'failed'`
- **SSE streams:** `Content-Type: text/event-stream` — parse `data: ` lines; stream ends with `data: [DONE]`
