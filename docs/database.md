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
| `is_active` | bool | Soft delete flag |

### `users`
App users with role-based access.

| Column | Type | Description |
|--------|------|-------------|
| `role` | text | `'admin'` or `'viewer'` |
| `organization_id` | uuid | Links viewer to their client org |
| `full_name` | text | Display name |
| `avatar_url` | text | Profile image URL |

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
