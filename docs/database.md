# Database Schema

All tables live in Supabase (Postgres) with RLS enabled.

## Tables

### `topic_searches`
Core table for search queries and AI-generated results.

| Column | Type | Description |
|--------|------|-------------|
| `query` | text | Search query string |
| `source` | text | Source platform |
| `time_range` | text | Time range filter |
| `language` | text | Language filter |
| `country` | text | Country filter |
| `client_id` | uuid | Optional client attachment |
| `search_mode` | text | `'general'` or `'client_strategy'` |
| `status` | text | pending, processing, completed, failed |
| `summary` | jsonb | Parsed AI summary |
| `metrics` | jsonb | Computed metrics |
| `emotions` | jsonb | Emotion analysis |
| `content_breakdown` | jsonb | Content type breakdown |
| `trending_topics` | jsonb | Trending topics with video ideas |
| `serp_data` | jsonb | Raw Brave SERP data |
| `approved_at` | timestamptz | Admin approval timestamp |
| `approved_by` | uuid | Admin who approved |
| `raw_ai_response` | text | Full AI response for debugging |
| `tokens_used` | int | Token usage tracking |
| `estimated_cost` | numeric | Cost tracking |

### `clients`
Client records with feature flags and preferences.

| Column | Type | Description |
|--------|------|-------------|
| `name` | text | Client name |
| `slug` | text | URL-safe identifier |
| `industry` | text | Client industry |
| `target_audience` | text | Target audience description |
| `brand_voice` | text | Brand voice/tone |
| `topic_keywords` | text[] | Topic keyword array |
| `website_url` | text | Client website |
| `organization_id` | uuid | Links to org for portal access |
| `feature_flags` | jsonb | `{ can_search, can_view_reports, can_edit_preferences, can_submit_ideas }` |
| `preferences` | jsonb | Brand preferences (content types, posting frequency, etc.) |
| `health_score` | text | Rating: `'not_good'`, `'fair'`, `'good'`, `'great'`, `'excellent'` |
| `agency` | text | Which Nativz agency (e.g. Nativz, AC) |
| `services` | text[] | Enabled services (e.g. `['SMM', 'Paid Media', 'Editing']`) |
| `description` | text | Short client description / notes |
| `google_drive_branding_url` | text | Link to branding assets on Google Drive |
| `google_drive_calendars_url` | text | Link to content calendars on Google Drive |
| `is_active` | bool | Soft delete flag |

### `users`
App users with role-based access.

| Column | Type | Description |
|--------|------|-------------|
| `role` | text | `'admin'` or `'viewer'` |
| `organization_id` | uuid | Links viewer to their client org |
| `full_name` | text | Display name |
| `avatar_url` | text | Profile image URL |
| `nango_connection_id` | text | Nango OAuth connection ID for Google Calendar |

### `invite_tokens`
Portal invite links for client onboarding.

| Column | Type | Description |
|--------|------|-------------|
| `token` | text | Unique hex string (auto-generated) |
| `client_id` | uuid | Links invite to a client |
| `organization_id` | uuid | Links invite to an org |
| `expires_at` | timestamptz | 7-day default expiry |
| `used_at` | timestamptz | One-time use tracking |
| `used_by` | uuid | User who used the invite |
| `created_by` | uuid | Admin who generated the invite |

### `contacts`
Points of contact per client. RLS: admin only.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `client_id` | uuid | References `clients(id)`, cascade delete |
| `name` | text | Contact name (required) |
| `email` | text | Email address |
| `phone` | text | Phone number |
| `role` | text | Role at the client company |
| `project_role` | text | Role in the Nativz engagement (e.g. "Primary Contact", "Approver") |
| `avatar_url` | text | Profile image URL |
| `is_primary` | bool | Whether this is the primary contact (default false) |
| `created_at` | timestamptz | Auto-set on creation |
| `updated_at` | timestamptz | Auto-set on creation |

### `team_members`
Nativz internal team members. RLS: admin only.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key, references `auth.users(id)` |
| `full_name` | text | Display name |
| `email` | text | Email address |
| `role` | text | Job title (e.g. "Social Media Manager", "Video Editor") |
| `avatar_url` | text | Profile image URL |
| `is_active` | bool | Active status (default true) |
| `created_at` | timestamptz | Auto-set on creation |
| `updated_at` | timestamptz | Auto-set on creation |

### `client_assignments`
Links team members to clients. RLS: admin only. Unique constraint on `(client_id, team_member_id)`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `client_id` | uuid | References `clients(id)`, cascade delete |
| `team_member_id` | uuid | References `team_members(id)`, cascade delete |
| `role` | text | Role on this account (e.g. "Account Manager", "Editor") |
| `is_lead` | bool | Whether this is the lead on the account (default false) |
| `created_at` | timestamptz | Auto-set on creation |

### `todos`
Per-user to-do list items for the dashboard widget.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner (references `auth.users`) |
| `title` | text | Task title (required) |
| `description` | text | Optional details |
| `is_completed` | bool | Completion flag (default false) |
| `completed_at` | timestamptz | When marked complete |
| `due_date` | date | Optional due date |
| `assigned_by` | uuid | Who assigned it (references `auth.users`) |
| `client_id` | uuid | Optional client association |
| `priority` | text | `'low'` / `'medium'` / `'high'` |
| `created_at` | timestamptz | Auto-set |

**RLS:** Users can only see/edit their own todos. Admins can insert todos assigned to others.

### `activity_log`
Unified activity feed for the dashboard.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `actor_id` | uuid | Who performed the action (references `auth.users`) |
| `action` | text | Event type (e.g. `'search_completed'`, `'client_created'`) |
| `entity_type` | text | `'search'` / `'client'` / `'idea'` / `'shoot'` / `'report'` |
| `entity_id` | uuid | ID of the related record |
| `metadata` | jsonb | Extra context (client name, query, etc.) |
| `created_at` | timestamptz | Auto-set |

**RLS:** All authenticated users can read and insert activity.

### `tasks`
Full task management table (Monday.com replacement).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `title` | text | Task title (required) |
| `description` | text | Task details |
| `status` | text | `'backlog'` / `'in_progress'` / `'review'` / `'done'` (default `'backlog'`) |
| `priority` | text | `'low'` / `'medium'` / `'high'` / `'urgent'` (default `'medium'`) |
| `client_id` | uuid | Optional client association |
| `assignee_id` | uuid | References `team_members(id)` |
| `created_by` | uuid | References `auth.users(id)` |
| `due_date` | date | Task deadline |
| `task_type` | text | `'content'` / `'shoot'` / `'edit'` / `'paid_media'` / `'strategy'` / `'other'` (default `'other'`) |
| `shoot_date` | date | If tied to a shoot |
| `tags` | text[] | Freeform tags |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-set |

**RLS:** All authenticated users can manage tasks.

### `meetings`
Biweekly client meetings with Google Calendar sync.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `client_id` | uuid | References `clients(id)`, cascade delete |
| `title` | text | Meeting title (required) |
| `scheduled_at` | timestamptz | When the meeting is scheduled |
| `duration_minutes` | int | Duration in minutes (default 30) |
| `location` | text | Zoom link, address, etc. |
| `google_event_id` | text | Google Calendar event ID for bidirectional sync |
| `recurrence_rule` | text | RRULE string (e.g. `RRULE:FREQ=WEEKLY;INTERVAL=2`) |
| `created_by` | uuid | References `auth.users(id)` |
| `attendees` | jsonb | Array of `{email, name, role}` |
| `notes` | text | Meeting notes / agenda |
| `status` | text | `'scheduled'` / `'completed'` / `'cancelled'` (default `'scheduled'`) |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-set |

**RLS:** All authenticated users can read/write.

### `ideas`
Video idea submissions with status tracking.

## Credentials

| Service | Env Vars |
|---------|----------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| OpenRouter | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4-5`) |
| Brave Search | `BRAVE_SEARCH_API_KEY` |
| Vercel | `NEXT_PUBLIC_APP_URL` |
| Vault (GitHub) | `VAULT_GITHUB_TOKEN`, `VAULT_GITHUB_OWNER`, `VAULT_GITHUB_REPO` |
