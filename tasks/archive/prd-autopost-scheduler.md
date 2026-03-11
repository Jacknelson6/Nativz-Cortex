# PRD: Autopost Scheduler

## Introduction

Build a Later.com-style autopost scheduler into the Nativz Cortex admin dashboard. The scheduler lets the team upload videos, write captions, schedule posts across Facebook, Instagram, TikTok, and YouTube Shorts, and share preview links with clients for approval. This solves the gap between content creation (shoots/moodboards) and content distribution — right now the team uses Later.com separately, but having scheduling inside Cortex keeps everything in one place.

## Goals

- Schedule and auto-publish video posts to Facebook, Instagram (Reels), TikTok, and YouTube Shorts from a single interface
- Provide a visual calendar (month/week/list) for planning content across all clients
- Allow drag-and-drop scheduling from a media library to the calendar
- Generate shareable preview links so clients can approve or request changes before publishing
- Reduce dependency on external tools (Later.com) by bringing scheduling in-house
- Leverage existing AI (Claude via OpenRouter) for caption improvement and hashtag suggestions

## Integration Decision

### Chosen: Late (getlate.dev) — $49/mo for 50 accounts

**Why not Nango + direct APIs?**
- TikTok requires a manual compliance audit before public posting (weeks-months, no guaranteed timeline)
- Meta (Facebook/Instagram) requires app review with screen recordings (weeks)
- YouTube requires OAuth consent screen verification + quota approval
- Nango only handles OAuth tokens — you still build every async video upload pipeline yourself
- Estimated 2-4 months of engineering just to get all 4 platforms reliably posting

**Late (getlate.dev)** — $49/mo Accelerate plan, 50 social sets, unlimited posts, API-first, 99.97% uptime SLA. Handles all platform OAuth, token refresh, and compliance audits. Single REST API for all 4 platforms.

**Fallback**: Ayrshare ($344/mo) if Late proves unreliable. Architecture is abstracted behind a `PostingService` interface so providers can be swapped without touching app code.

---

## User Stories

### US-001: Database schema for scheduler
**Description:** As a developer, I need database tables to store social profiles, scheduled posts, media items, saved captions, and client review links.

**Acceptance Criteria:**
- [ ] Create `social_profiles` table: `id`, `client_id`, `platform` (facebook|instagram|tiktok|youtube), `platform_user_id`, `username`, `avatar_url`, `access_token_ref` (reference to token in posting provider), `is_active`, `created_at`, `updated_at`
- [ ] Create `scheduled_posts` table: `id`, `client_id`, `created_by`, `status` (draft|scheduled|publishing|published|failed), `scheduled_at` (timestamptz), `published_at`, `caption`, `hashtags[]`, `cover_image_url`, `tagged_people[]`, `collaborator_handles[]`, `post_type` (reel|short|video), `external_post_id` (from platform after publish), `external_post_url`, `failure_reason`, `retry_count` (default 0), `created_at`, `updated_at`
- [ ] Create `scheduled_post_platforms` junction table: `id`, `post_id`, `social_profile_id`, `status` (pending|publishing|published|failed), `external_post_id`, `external_post_url`, `failure_reason` — supports posting same content to multiple platforms
- [ ] Create `scheduler_media` table: `id`, `client_id`, `uploaded_by`, `filename`, `storage_path`, `thumbnail_url`, `duration_seconds`, `file_size_bytes`, `mime_type`, `width`, `height`, `is_used` (boolean, tracks if placed on calendar), `created_at`
- [ ] Create `scheduled_post_media` junction table: `id`, `post_id`, `media_id`, `sort_order`
- [ ] Create `saved_captions` table: `id`, `client_id`, `created_by`, `title`, `caption_text`, `hashtags[]`, `created_at`
- [ ] Create `post_review_links` table: `id`, `post_id`, `token` (unique), `expires_at`, `created_at`
- [ ] Create `post_review_comments` table: `id`, `review_link_id`, `author_name`, `content`, `status` (approved|changes_requested|comment), `created_at`
- [ ] RLS policies on all tables scoped appropriately (admin full access, service role for cron)
- [ ] Supabase migration runs successfully
- [ ] Typecheck passes

### US-002: Scheduler media storage bucket
**Description:** As a developer, I need a Supabase storage bucket for scheduler video uploads with appropriate policies.

**Acceptance Criteria:**
- [ ] Create `scheduler-media` storage bucket (public read for thumbnails, authenticated write)
- [ ] Create `scheduler-thumbnails` storage bucket (public read)
- [ ] Upload API generates thumbnail from first frame of video (use ffmpeg or similar)
- [ ] Max file size: 500MB (covers all platform limits)
- [ ] Accepted types: mp4, mov, webm
- [ ] Typecheck passes

### US-003: Social profile connection flow
**Description:** As an admin, I want to connect client social media accounts so I can post to them from Cortex.

**Acceptance Criteria:**
- [ ] Settings page at `/admin/clients/[slug]/settings` gets new "Connected accounts" section
- [ ] "Connect account" button for each platform: Facebook Page, Instagram Business, TikTok, YouTube
- [ ] OAuth flow redirects to posting provider (Ayrshare/Late) for account linking
- [ ] On callback, store profile info in `social_profiles` table
- [ ] Show connected accounts with avatar, username, platform icon, and disconnect button
- [ ] Disconnect removes the profile (with confirmation dialog)
- [ ] Handle expired/revoked tokens gracefully with "Reconnect" prompt
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Media library panel
**Description:** As an admin, I want a media library where I can upload and manage videos, then drag them onto the calendar to schedule posts.

**Acceptance Criteria:**
- [ ] Left sidebar panel on scheduler page shows uploaded media as thumbnail grid
- [ ] "Upload media" button opens file picker (accepts mp4, mov, webm up to 500MB)
- [ ] Upload shows progress bar, generates thumbnail on completion
- [ ] Each media item shows: thumbnail, duration overlay, filename (truncated)
- [ ] Filter: "unused" toggle to show only unscheduled media, "Clear all" to reset filters
- [ ] Media items are draggable (HTML5 drag or react-dnd)
- [ ] Right-click context menu: "Delete" (with confirmation)
- [ ] Empty state: "No media yet — upload videos to get started"
- [ ] Media is scoped per client (filtered by currently selected client)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Calendar view (month/week/list)
**Description:** As an admin, I want to see all scheduled posts on a visual calendar so I can plan content across the month.

**Acceptance Criteria:**
- [ ] New route: `/admin/scheduler` accessible from admin sidebar
- [ ] Client selector dropdown at top to filter by client (or "All clients")
- [ ] Three view modes: Week, Month (default), List — toggled via segmented control
- [ ] Month view: grid with days, each day cell shows post thumbnails with time and status badge (Draft/Scheduled/Published/Failed)
- [ ] Week view: 7-column layout with time slots, posts positioned by scheduled time
- [ ] List view: chronological list of posts with thumbnail, caption preview, platforms, status, scheduled time
- [ ] Navigation: "Today" button, left/right arrows for prev/next period, month/year label
- [ ] Timezone display in header (use browser timezone)
- [ ] Today's date highlighted
- [ ] Clicking a post on calendar opens the post editor (US-006)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Post editor modal
**Description:** As an admin, I want to create and edit posts with caption, platform selection, scheduling, and media attachment.

**Acceptance Criteria:**
- [ ] Modal/slide-over opens when: clicking "Create post" button, clicking existing post on calendar, or dropping media onto a calendar date
- [ ] **Profile selector**: shows connected profiles for the selected client with platform icons and avatars; multi-select checkboxes to post to multiple platforms simultaneously
- [ ] **Publish mode toggle**: "Auto publish" (posts automatically at scheduled time) vs "Draft" (saved but not published)
- [ ] **Date/time picker**: calendar date picker + time selector for scheduled_at
- [ ] **Media section**: shows attached video with thumbnail preview, play button, "Change media" button, "Select cover" button (opens cover selector — see US-009)
- [ ] **Caption editor**: multi-line textarea with character count (platform-specific limits shown), emoji picker button
- [ ] **Hashtag section**: rendered as tags below caption, editable
- [ ] **More options section** (collapsible):
  - Tag people: text input to add @handles
  - Invite collaborator: text input to add collaborator @handles
- [ ] **Bottom bar**: Delete button (trash icon, with confirmation), "Copy draft" button, "Save as draft" / "Schedule post" primary action button
- [ ] Saving updates the calendar immediately (optimistic UI)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Drop media onto calendar
**Description:** As an admin, I want to drag a video from the media library and drop it onto a calendar date to quickly create a scheduled post.

**Acceptance Criteria:**
- [ ] Dragging a media item from the library shows a drag preview (thumbnail)
- [ ] Calendar day cells are valid drop targets — highlight on drag-over
- [ ] Dropping opens the post editor modal pre-filled with: the media attached, the drop date selected, time defaulting to the client's configured default time (or system default of 12:00 PM CST if none set)
- [ ] Media item in library gets "used" indicator after being placed on calendar
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: AI caption improvement
**Description:** As an admin, I want AI to help me write and improve post captions so content performs better.

**Acceptance Criteria:**
- [ ] "Improve this caption" button below caption textarea in post editor
- [ ] Clicking sends current caption + client context (brand voice, industry, target audience from `clients` table) to Claude via existing `createCompletion()` in `lib/ai/client.ts`
- [ ] Returns improved caption with better hooks, CTAs, and platform-appropriate formatting
- [ ] Shows original and improved side-by-side, user can accept or dismiss
- [ ] "Generate caption" option when caption is empty — generates from video context/client info
- [ ] Loading state while AI processes
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Video cover image selection
**Description:** As an admin, I want to choose a custom cover/thumbnail image for my video post so it looks good in feeds.

**Acceptance Criteria:**
- [ ] "Select cover" button on video preview in post editor
- [ ] Opens cover selector showing: auto-generated frames from the video (6-8 frames evenly spaced across duration)
- [ ] User can click a frame to select it as cover
- [ ] Option to upload a custom cover image
- [ ] Selected cover saved to `scheduled_posts.cover_image_url`
- [ ] Cover image shown as thumbnail on calendar view
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Saved captions library
**Description:** As an admin, I want to save and reuse caption templates so I don't rewrite common copy.

**Acceptance Criteria:**
- [ ] "Saved captions" button in post editor opens a drawer/popover
- [ ] Shows list of saved captions for the current client with title and preview
- [ ] Clicking a saved caption inserts it into the caption textarea
- [ ] "Save current caption" option to save the active caption as a template (prompts for title)
- [ ] Delete saved captions with confirmation
- [ ] Saved captions scoped per client
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-011: Hashtag suggestions
**Description:** As an admin, I want AI-powered hashtag suggestions so I can maximize post reach.

**Acceptance Criteria:**
- [ ] "Hashtag suggestions" button next to saved captions in post editor
- [ ] Sends caption text + client industry/keywords to Claude
- [ ] Returns 15-20 suggested hashtags grouped by: high-volume, niche, branded
- [ ] Click to add/remove hashtags to the post
- [ ] Shows estimated reach category (high/medium/low) per hashtag if available
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Tag people and invite collaborators
**Description:** As an admin, I want to tag people and invite collaborators on posts.

**Acceptance Criteria:**
- [ ] "Tag people" input in post editor's More Options section
- [ ] Type @handle to add tags, shown as removable chips
- [ ] "Invite collaborator" input works the same way
- [ ] Tags and collaborators stored in `scheduled_posts.tagged_people[]` and `collaborator_handles[]`
- [ ] Passed to posting API when publishing (platform support varies — gracefully skip on unsupported platforms)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Auto-publish engine
**Description:** As a system, I need to automatically publish scheduled posts at their scheduled time.

**Acceptance Criteria:**
- [ ] Cron job route at `/api/cron/publish-posts` runs every minute (or use Supabase pg_cron / Vercel cron)
- [ ] Queries `scheduled_posts` where `status = 'scheduled'` and `scheduled_at <= now()`
- [ ] For each post, calls the posting provider API (Ayrshare/Late) with: video URL, caption, hashtags, cover image, tagged people, platform list
- [ ] Updates `scheduled_post_platforms` status per-platform as results come back
- [ ] On success: set post status to `published`, store `external_post_id` and `external_post_url`
- [ ] On failure: set status to `failed`, store `failure_reason`, increment retry count (max 3 retries with exponential backoff)
- [ ] After all platforms processed, update parent `scheduled_posts.status` based on platform results (all success = published, any fail = partially_failed, all fail = failed)
- [ ] Typecheck passes

### US-014: Post status tracking
**Description:** As an admin, I want to see the status of each post so I know what's published, pending, or failed.

**Acceptance Criteria:**
- [ ] Status badges on calendar posts: Draft (gray), Scheduled (blue), Publishing (yellow/pulse), Published (green), Failed (red)
- [ ] Failed posts show error message on click with "Retry" button
- [ ] Published posts show link to live post on each platform
- [ ] Post editor shows per-platform status breakdown (e.g., "Instagram: Published, TikTok: Failed — caption too long")
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Client review share links
**Description:** As an admin, I want to generate a share link for scheduled posts so clients can preview and approve content before it goes live.

**Acceptance Criteria:**
- [ ] "Share for review" button on post editor generates a unique link (`/shared/post/[token]`)
- [ ] Share link page shows: video preview, caption, scheduled date/time, target platforms
- [ ] Client can leave comments with their name (no auth required)
- [ ] Client can click "Approve" or "Request changes" button
- [ ] Approval/change-request creates a `post_review_comments` entry with appropriate status
- [ ] Admin sees review status on the post: "Pending review", "Approved", "Changes requested"
- [ ] Comments visible in post editor under "External Review" tab
- [ ] Share links expire after configurable period (default 7 days)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-016: Batch publish ("Send Posts")
**Description:** As an admin, I want to publish multiple scheduled posts at once instead of one at a time.

**Acceptance Criteria:**
- [ ] "Send posts" button in calendar header
- [ ] Opens confirmation modal showing all posts with status `scheduled` and `scheduled_at` in the current calendar view period
- [ ] Checkbox to select/deselect individual posts
- [ ] "Send selected" triggers immediate publish for all selected posts (bypasses scheduled_at, publishes now)
- [ ] Progress indicator showing publish status for each post
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-017: Admin sidebar and navigation
**Description:** As an admin, I want the scheduler accessible from the main sidebar navigation.

**Acceptance Criteria:**
- [ ] Add "Scheduler" item to admin sidebar with calendar icon, positioned after "Shoots"
- [ ] Route: `/admin/scheduler`
- [ ] Active state highlights correctly
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-018: Posting service abstraction layer
**Description:** As a developer, I need an abstraction over the posting provider so we can swap between Late, Ayrshare, or other providers without changing app code.

**Acceptance Criteria:**
- [ ] Create `lib/posting/types.ts` with `PostingService` interface defining: `publishPost()`, `getPostStatus()`, `deletePost()`, `connectProfile()`, `disconnectProfile()`, `getConnectedProfiles()`
- [ ] Create `lib/posting/late.ts` implementing `PostingService` for Late (getlate.dev) API
- [ ] Create `lib/posting/index.ts` that exports the active provider based on env config (`POSTING_PROVIDER=late`)
- [ ] All scheduler features use only the `PostingService` interface, never the provider directly
- [ ] Typecheck passes

### US-019: Video format validation on upload
**Description:** As an admin, I want videos validated on upload so I know immediately if they won't work on a platform, rather than finding out at publish time.

**Acceptance Criteria:**
- [ ] On upload, validate: file type (mp4, mov, webm), file size (max 500MB), duration, aspect ratio
- [ ] Show validation warnings (not blocks) for: wrong aspect ratio for target platforms (9:16 expected for Reels/Shorts), duration exceeding platform limits (90s Instagram Reels, 10min TikTok, 60s YouTube Shorts)
- [ ] Warnings displayed as yellow banners on the media item: "This video is 16:9 — Instagram Reels and YouTube Shorts expect 9:16"
- [ ] Block upload only for: unsupported file type, exceeds 500MB
- [ ] Warnings also shown in post editor when attaching media to specific platforms
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-020: Default posting time settings
**Description:** As an admin, I want a system-wide default posting time that auto-fills when scheduling, with the ability to override per client.

**Acceptance Criteria:**
- [ ] System-wide default posting time: 12:00 PM CST (stored in app config or `scheduler_settings` table)
- [ ] Per-client override: optional `default_posting_time` field on `clients` table (time + timezone)
- [ ] Settings UI: in `/admin/settings`, add "Default posting time" field (time picker + timezone selector)
- [ ] Per-client override UI: in `/admin/clients/[slug]/settings`, add "Default posting time" field under scheduling section
- [ ] When creating a new post (via "Create post" button, dropping media, or clicking calendar date), time auto-fills with: client override if set, otherwise system default
- [ ] Admin can always edit the time per post in the post editor
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-021: Email notifications on publish failure
**Description:** As an admin, I want to receive an email when a post fails to publish so I can fix it before the content window passes.

**Acceptance Criteria:**
- [ ] After a post fails all retry attempts (3 retries exhausted), send an email to the post creator
- [ ] Email includes: client name, post caption (truncated), scheduled time, platforms that failed, error reason, link to the post in Cortex
- [ ] Use existing email sending infrastructure (or add Resend/SendGrid if none exists)
- [ ] Email sent only on final failure (not on each retry attempt)
- [ ] Typecheck passes

---

## Functional Requirements

- FR-1: Upload video files (mp4, mov, webm, max 500MB) to a media library scoped per client
- FR-2: Generate video thumbnails automatically on upload
- FR-3: Display uploaded media in a filterable sidebar with drag capability
- FR-4: Render a calendar (month/week/list views) showing all scheduled posts for the selected client
- FR-5: Create posts by clicking "Create post" button or dropping media onto a calendar date
- FR-6: Edit posts in a modal with: profile selector, caption editor, date/time picker, publish mode toggle, media attachment, cover selection, tagged people, collaborators
- FR-7: Save posts as drafts or schedule for auto-publish at a specific date/time
- FR-8: Auto-publish scheduled posts via cron job calling the posting provider API
- FR-9: Track post status per-platform: pending, publishing, published, failed
- FR-10: Retry failed posts up to 3 times with exponential backoff
- FR-11: Connect/disconnect social profiles via OAuth through the posting provider
- FR-12: AI-powered caption improvement using existing Claude integration
- FR-13: AI-powered hashtag suggestions grouped by reach potential
- FR-14: Save and reuse caption templates per client
- FR-15: Select video cover image from auto-generated frames or custom upload
- FR-16: Generate shareable review links for client approval (no auth required)
- FR-17: Clients can approve, request changes, or comment on posts via share links
- FR-18: Batch publish multiple posts from the calendar view
- FR-19: Display per-platform posting status and live post links after publishing
- FR-20: Validate video format on upload — warn (not block) for wrong aspect ratio or duration exceeding platform limits
- FR-21: System-wide default posting time of 12:00 PM CST, overridable per client
- FR-22: Send email notification to post creator when a post fails all retry attempts
- FR-23: Review share links are per-post only (no bulk generation)

---

## Non-Goals (Out of Scope)

- **No "first comment" feature** — not critical for V1
- **No Link in Bio management** — separate product concern
- **No location tagging** — low priority for video-first content
- **No product tagging** — e-commerce feature not needed
- **No campaign/post tags** — internal organization feature, add later
- **No Dropbox integration** — upload-only is sufficient for V1
- **No "Future trending hashtags" predictive feature** — regular hashtag suggestions cover this
- **No analytics/insights on published posts** — existing Instagram analytics covers this; posting provider may add analytics later
- **No client portal scheduler access** — admin-only per user choice (1A); clients interact only via share links
- **No multi-image/carousel posts** — video-first for V1
- **No Stories support** — Reels/Shorts only
- **No direct message / engagement management**

---

## Design Considerations

### UI Layout
The scheduler page follows Later.com's layout pattern:
- **Left panel**: Media library (collapsible sidebar, ~300px wide)
- **Main area**: Calendar view with header controls (client selector, view toggle, navigation, "Send posts" button)
- **Modal/slide-over**: Post editor opens as a right-side slide-over panel (~500px) or large modal

### Existing Components to Reuse
- `Card`, `Badge`, `Button`, `Dialog`, `Input`, `Select` from `components/ui/`
- `GlassButton` for primary CTAs (Create Post, Schedule Post)
- `EmptyState` component for empty media library and empty calendar
- Toast notifications via `sonner` for publish success/failure
- Dark theme: `bg-surface` cards, `bg-background` base, blue accent
- Sentence case for all copy
- Calendar grid pattern already exists in `/admin/shoots` — reference for month layout

### Calendar Interactions
- Day cells are both click targets (to create a post on that date) and drop targets (for media drag)
- Posts on calendar show: small thumbnail, time, status badge
- Hover on calendar post shows caption preview tooltip
- Click opens post editor with that post loaded

---

## Technical Considerations

### Posting Provider Integration
- Abstract behind `PostingService` interface in `lib/posting/`
- Using Late (getlate.dev) — $49/mo Accelerate plan, single REST API for all 4 platforms
- ENV vars: `POSTING_PROVIDER=late`, `LATE_API_KEY`
- Late handles OAuth for social accounts, token refresh, platform compliance
- Video must be accessible via public URL for Late — use Supabase storage public bucket or signed URLs
- Fallback provider: Ayrshare ($344/mo) — swap by changing `POSTING_PROVIDER` env var and adding `lib/posting/ayrshare.ts`

### Cron Job for Auto-Publishing
- Vercel Cron or Supabase pg_cron — runs every 1-2 minutes
- Route: `/api/cron/publish-posts` with cron secret validation
- Process posts in batches to avoid timeout (Vercel functions have 60s limit on Hobby, 300s on Pro)
- Use database lock (`SELECT ... FOR UPDATE SKIP LOCKED`) to prevent duplicate publishes

### Video Upload Pipeline
- Client uploads to Supabase Storage `scheduler-media` bucket
- Server-side thumbnail generation (extract first frame)
- Store metadata in `scheduler_media` table
- For publishing: Late accepts public video URLs, so use Supabase signed URLs (or public bucket)

### Cover Image / Frame Extraction
- Reuse pattern from moodboard's frame extraction (`app/api/moodboard/items/[id]/extract-frames/`)
- Extract 6-8 evenly-spaced frames from uploaded video
- Store frames in `scheduler-thumbnails` bucket

### Existing Integrations to Leverage
- `lib/ai/client.ts` — `createCompletion()` for caption improvement and hashtag suggestions
- `lib/supabase/admin.ts` — `createAdminClient()` for cron job operations
- `components/shoots/` calendar grid — reference for month view layout
- Moodboard share links pattern (`moodboard_share_links` table) — reference for post review links

### Performance
- Calendar view: fetch posts for visible date range only (1 month ± buffer)
- Media library: paginated, lazy-load thumbnails
- Optimistic UI for draft saves
- Debounce caption auto-save

---

## Success Metrics

- Admin can schedule and auto-publish a video post to all 4 platforms in under 3 minutes
- Posts publish within 2 minutes of their scheduled time
- Failed posts auto-retry and succeed on retry >90% of the time
- Client review links load in under 2 seconds
- Eliminate need for separate Later.com subscription for Nativz clients

---

## Resolved Decisions

| Question | Decision |
|---|---|
| **Posting provider** | Late (getlate.dev) — $49/mo, Ayrshare as fallback |
| **Video format validation** | Validate on upload — warn for wrong aspect ratio/duration, block only for unsupported type or >500MB |
| **Default posting times** | System-wide default 12:00 PM CST, editable per client in client settings |
| **Notifications** | Email on final publish failure only (after 3 retries exhausted) |
| **Review link bulk generation** | Per-post only, no bulk generation |
| **Posting time optimization** | V2 feature — skip for V1 |

## Open Questions

1. **Late API specifics** — need to review Late's API docs for exact endpoints, auth flow, and webhook support for publish status callbacks
2. **Email provider** — does the project already have an email sending service (Resend, SendGrid, etc.) or do we need to add one for failure notifications?
3. **Supabase storage limits** — verify storage bucket size limits and costs for video files at scale (500MB per video, potentially hundreds of videos)
