# CONTEXT.md, shared codebase ground truth

Read every iteration before touching PRD or code. Last verified 2026-05-10 against worktree `compassionate-einstein-44c75f`.

## Repo essentials

- Stack: Next.js 15 (App Router) + TS, Supabase Postgres + Auth + RLS, Tailwind v4, Recharts, Zod, lucide-react.
- LLM: Claude Sonnet 4.5 via OpenRouter for text, Gemini 2.5 Flash for video, Gemini Embedding 001 for vectors.
- Storage: Supabase Storage for images + thumbnails. Mux for video files.
- Posting: Zernio (NEVER call it Postara, that table name is legacy).
- Cortex dev server: `http://localhost:3001`.
- Latest applied migration: `272_clients_caption_notes.sql`. New migrations start at **273**.

## Auth + roles

| Role | Tooling | Scoping |
|------|---------|---------|
| `admin` / `super_admin` | `createAdminClient()` | none |
| `viewer` (portal) | `getPortalClient()` returns `{ user, client, organization_id }` | hard filter on `organization_id` |

Portal helper: `lib/portal/get-portal-client.ts`.

**Hard rule:** every API route a viewer can hit MUST filter by `organization_id`. RLS is enabled on all tables but `createAdminClient()` bypasses it, so manual filtering is required when using admin client in portal-reachable routes.

## Existing tables (selected)

### Identity + access
- `users(id, role, organization_id, email, ...)`
- `clients(id, organization_id, name, is_active, is_paused, caption_notes, ...)`
- `organizations(id, name, ...)`
- `user_client_access(user_id, client_id, organization_id)`
- `invite_tokens(token, client_id, organization_id, expires_at, ...)` → /portal/join/[token]
- `team_invite_tokens(...)` (internal team only)

### Social + scheduling
- `social_profiles(id, client_id, platform, platform_user_id, username, avatar_url, ...)`
- `scheduled_posts(id, client_id, status, scheduled_at, published_at, caption, post_type, external_post_id, ...)` — status in (draft, scheduled, publishing, published, partially_failed, failed)
- `scheduled_post_platforms(id, post_id, social_profile_id, external_post_id, ...)`
- `scheduled_post_media(...)` Mux-backed

### Analytics (already exists — extend, do not recreate)
- `platform_snapshots(id, social_profile_id, client_id, platform, snapshot_date, followers_count, followers_change, views_count, engagement_count, engagement_rate, posts_count, created_at)` UNIQUE (social_profile_id, snapshot_date)
- `post_metrics(id, social_profile_id, client_id, platform, external_post_id, post_url, thumbnail_url, caption, post_type, published_at, views_count, likes_count, comments_count, shares_count, saves_count, reach_count, engagement_rate, fetched_at)` UNIQUE (external_post_id, platform)
- `client_competitors(id, client_id, platform, profile_url, username, display_name, avatar_url, ...)`
- `competitor_snapshots(id, competitor_id, ...)` — verify columns before extending

### Prospect / sales
- `prospect_audits(id, tiktok_url, website_url, status, prospect_data jsonb, competitors_data jsonb, scorecard jsonb, error_message, created_by, created_at, updated_at)` — single-row audit, NOT a full prospect record. SPY-01 extends/replaces with `prospects` table.

### LLM brand visibility (different product surface)
- `brand_audits(id, attached_client_id, brand_name, prompts jsonb, models text[], responses jsonb, visibility_score, sentiment_score, ...)` — separate from "social audit," do not confuse.

### Topic + content
- `topic_plans(id, client_id, organization_id, title, plan_json jsonb, topic_search_ids uuid[], conversation_id, ...)` — VFF-10 extends `plan_json` schema, doesn't add columns.
- `topic_search_videos`, `topic_search_hooks`, `topic_search_folders`, `topic_search_folder_members`
- `nerd_conversations`, `nerd_conversation_share_links`
- `audit_share_links` — pattern reused by SPY-04 prospect share links.

### Share-link pattern
Always: `<entity>_share_links(id, entity_id, token, name, expires_at, ...)` + `<entity>_share_link_views(...)` for view analytics. See `audit_share_links`, `editing_project_share_links`, `moodboard_share_links`.

## Existing libs (selected)

### `lib/audit/`
- `analyze.ts` — orchestrates competitor + website audit
- `analyze-videos.ts` — Gemini 2.5 Flash video analysis (REUSE for VFF-05)
- `discover-competitors.ts` — search + dedupe competitor candidates
- `persist-scraped-images.ts` — downloads image → Supabase Storage → returns URL (REUSE for VFF-08, ZNA-04 thumbnails)
- `scorecard-helpers.ts` + `.test.ts` — deterministic R/Y/G scoring (REUSE for SPY-04)
- `scrape-{tiktok,instagram,facebook,youtube}-profile.ts` — per-platform Apify wrappers
- `scrape-website.ts` — WebFetch + heuristic extraction
- `search-competitor-socials.ts` — handle resolution
- `scrape-helpers.ts`, `types.ts`

### `lib/reporting/`
- `sync.ts` — exports `syncClientReporting()`, `syncSocialProfile()`, `syncOneProfile()`. Already writes to `platform_snapshots` + `post_metrics`. ZNA-01 wraps/extends this, doesn't reinvent.
- `weekly-social-report.ts`, `build-competitor-report.ts`, `render-competitor-report-pdf.ts`
- `velocity.ts`, `notifications.ts`, `date-presets.ts`, `range-utc.ts`

### `lib/zernio/` + `lib/posting/`
- `lib/zernio/ensure-profile.ts`
- `lib/posting/zernio.ts` — `publishToZernio()`
- `lib/posting/zernio-reconcile.ts` — reconciles status post-publish
- `lib/posting/zernio-account-errors.ts`
- `lib/social/zernio-webhook-notify.ts`

### `lib/nerd/`
- `content-lab-context-pack.ts` — context bundle passed into Nerd
- `content-lab-scripting-context.ts` — scripting-focused context (~10k char budget)
- `guardrails.ts`, `marketing-skills.ts`, `registry.ts`, `skills-loader.ts`, `slash-commands.ts`, `tools/`
- VFF-10 + SPY-09 add tools here.

### `lib/pdf/branded/`
- `document.tsx` — shared @react-pdf template
- `adapters.ts` — entity → PDF data adapters (topic plan, audit, etc.)
- `types.ts`, `index.ts`, `_preview-fixture.ts`
- SPY-04 adds `mapProspectScorecardToBranded`.

### `lib/portal/`
- `get-portal-client.ts` — `getPortalClient()` returning the scoped client + org.

## Existing cron routes

`app/api/cron/<name>/route.ts` pattern. All require `Authorization: Bearer ${CRON_SECRET}`.

Active cron routes (use as exemplars):
- `sync-reporting` — daily, populates `platform_snapshots` + `post_metrics`. Wrapped in `withCronTelemetry`. `maxDuration = 300`.
- `publish-posts` — every 2min, drains `scheduled_posts` to Zernio.
- `reconcile-zernio` — reconciles post statuses.
- `benchmark-snapshots`, `ecom-snapshots`, `meta-ad-snapshots`
- `weekly-social-report`, `weekly-affiliate-report`
- `sweep-stuck-brand-audits`, `sync-knowledge-graph`, `topic-search-notify`

Cron registration: `vercel.json` `crons` array (verify path before assuming a new entry is wired).

## Existing API surface (selected, alphabetical heads)

`app/api/`:
- `analytics/client-series`, `analytics/meta`
- `analyze-social`
- `audits`, `brand-audits`
- `clients`, `client-groups`
- `content-lab/*` (Nerd surface)
- `cron/*`
- `editing/*`
- `ideas`
- `topic-search/*`
- (full list ~50+)

When adding a new route under an existing namespace, follow that namespace's auth + Zod pattern. When adding a brand-new namespace, mirror the closest existing one.

## Conventions

### API routes (per `.claude/rules/api-routes.md`)
- Zod validation BEFORE auth, then auth, then logic.
- `createAdminClient()` for admin-only; `createServerSupabaseClient()` for portal-reachable.
- Dynamic params: `{ params }: { params: Promise<{ id: string }> }` then `await params`.
- Always `NextResponse.json()` (never raw `Response`).
- Errors: `{ error: string }`.
- AI fields: null-safe.

### UI tokens
- `bg-background` page; `bg-surface` cards; `accent-text` for accents.
- Sentence case in product UI (sidebar nav is the documented Title Case exception).
- Buttons sentence case, no uppercase, `whitespace-nowrap` baked into `<Button>`.
- Dark theme; sentiment bar emerald/red is a documented carve-out.
- 9:16 card aspect for short-form video tiles.

### Section card system
`IconCard` for bounded surfaces; `SectionPanel` (optional `icon` prop) for lists. Both use h-9 w-9 accent swatch + 13px `?` tooltip.

### Sidebar
`components/layout/admin-sidebar.tsx` four-section structure: Dashboard / Intelligence / Create / Manage. New VFF + SPY entries land under Intelligence.

## Env vars currently consumed

`CRON_SECRET`, `OPENROUTER_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APIFY_TOKEN`, `RESEND_API_KEY`, `ZERNIO_*`, `STRIPE_*`. New env vars introduced by these PRDs must be added to `.env.example`.

## Hard rules (carry over)

- No em dash / en dash. Period.
- No autonomous email send. Drafts only.
- Unapproved drop posts MUST NEVER publish.
- "Drops" is internal jargon; client-facing copy says "posts."
- Video → Mux, not Supabase Storage.
- Editing project rows are the PM layer (strategist + admin + editor share one row).
- Brand-pill binding only; no in-page client picker on brand-scoped pages.
- Buttons never wrap.
- Push to main, no feature branches.

## What does NOT yet exist (confirmed gaps)

- `brand_profiles` table — brand info lives on `clients` columns. VFF-02 introduces `brand_format_context` as a NEW table keyed off `client_id`.
- `content_pillars` table — content pillars live in `clients` columns or `topic_plans.plan_json`.
- `lib/analytics/` directory — net-new. VFF/SPY/ZNA libs land here.
- `app/admin/formats/*` route — net-new (VFF).
- `app/admin/prospects/*` route — net-new (SPY beyond current single-shot audit).
- `app/admin/analytics/zernio/*` route — net-new (ZNA admin surface).

## Migration numbering

Assigned in this batch (do not change without coordinating):
- 273: VFF-01 scaffolding
- 274: VFF-02 brand format context
- 275: VFF-04 reject reason column (extends 273)
- 276: VFF-06 format taxonomy seed
- 277: SPY-01 prospects + lifecycle
- 278: SPY-03 prospect_analyses
- 279: SPY-04 prospect_share_links
- 280: SPY-05 prospect_competitor_benchmarks
- 281: SPY-06 monitor config + snapshots + alerts
- 282: SPY-07 clients.converted_from_prospect_id
- 283: SPY-10 prospect_digest_events
- 284: ZNA-03 client_analytics_pulses
- 285: ZNA-04 post_metrics.thumbnail_storage_url
- 286: ZNA-05 post_performance_signals
- 287: ZNA-06 post_metric_timepoints

If gaps appear (a PRD doesn't need a migration after all), renumber forward to keep dense ordering. Don't leave holes.

## Verify-everything checklist (run before marking a PRD `Done When`)

- `npx tsc --noEmit` clean
- `npm run lint` clean
- Migration applies cleanly (Supabase MCP `apply_migration` against staging branch first)
- `getPortalClient()` org filter present on any portal-reachable route
- `createAdminClient()` callers either admin-only OR manually filter org
- Sentence case + no em dash audit on new copy
- New cron route registered in `vercel.json`
- New env vars added to `.env.example`
- Push notification fires on completion (per CLAUDE.md long-running rule)
