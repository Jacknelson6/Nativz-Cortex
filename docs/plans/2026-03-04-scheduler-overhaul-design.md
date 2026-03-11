# Scheduler Overhaul — Late API Integration

**Date:** 2026-03-04
**Status:** Approved
**Scope:** Scheduling + media library via Late API (getlate.dev)

## Context

The scheduler is ~60% built with calendar views, post editor, media library UI, AI caption/hashtag features, and a `LatePostingService` abstraction. This overhaul wires everything to the Late API so posts actually publish. Analytics stays in its existing sidebar page.

## Architecture: Thin Wrapper over Late API

Late is the source of truth for posts, media, and publishing state. Our database stores client-to-profile mappings and local metadata. Late handles retries, rate limits, and platform quirks.

### Key decisions

- **Media storage:** Late presigned URLs (up to 5GB). No Supabase Storage hop.
- **Account management:** Admin-managed. Admin connects client social accounts via Late OAuth.
- **Auto-publish:** Late handles natively. Webhooks update our local status.
- **Share/review links:** Use Late's built-in review system if available, otherwise use existing `post_review_links` table.

## Changes by layer

### 1. Late SDK integration

- Install `@getlatedev/social-media-api` npm package
- Replace manual fetch calls in `lib/posting/late.ts` with SDK methods
- Add `LATE_API_KEY` to env config

### 2. Media library overhaul

- Upload flow: Request presigned URL from Late → direct upload to Late CDN → store `publicUrl`
- Media library grid reads from Late's media list endpoint
- Remove Supabase Storage upload path for scheduler media
- Keep existing drag-and-drop UI, progress bar, filter toggle

### 3. Account connection flow

- New API route: `/api/scheduler/connect` — initiates Late OAuth, returns `authUrl`
- Admin clicks "Connect account" per client → redirected to platform OAuth
- Callback stores Late `accountId` in `social_profiles` table
- Profile selector in post editor reads from connected accounts

### 4. Post CRUD via Late API

- Create: Post editor → API route → Late SDK `createPost()` → store Late `postId` locally
- Update: API route → Late SDK `updatePost()`
- Delete: API route → Late SDK `deletePost()`
- List: Calendar fetches from Late API by date range, merges with local metadata
- Modes: scheduled (with `scheduledFor`), draft, immediate (`publishNow: true`)

### 5. Webhook endpoint

- New route: `/api/scheduler/webhooks` — receives Late webhook events
- Events: post published, post failed, account disconnected
- Updates local `scheduled_posts.status` and `scheduled_post_platforms.status`

### 6. Calendar views

- Keep existing month/week/list UI components
- Data source switches from local DB queries to Late API responses
- `use-scheduler-data.ts` hook updated to fetch from Late

#### 7. Analytics via Late API

- Existing analytics sidebar page pulls data from Late's analytics endpoints
- Metrics: impressions, engagement, reach, follower growth, best posting times
- Per-platform breakdown available
- No custom tracking needed — Late aggregates across connected accounts

## What stays unchanged

- Calendar UI components (month/week/list rendering)
- Post editor UI (caption, platforms, date/time, media preview)
- AI caption improvement (`/api/scheduler/ai/improve-caption`)
- AI hashtag suggestions (`/api/scheduler/ai/hashtag-suggestions`)
- Video validation (`components/scheduler/video-validation.ts`)
- Sidebar navigation entry
- Database schema (additive changes only — Late ID columns)

## Database additions

```sql
-- Add Late reference IDs
ALTER TABLE social_profiles ADD COLUMN late_account_id TEXT;
ALTER TABLE scheduled_posts ADD COLUMN late_post_id TEXT;
ALTER TABLE scheduler_media ADD COLUMN late_media_url TEXT;
```

## Environment variables

```
LATE_API_KEY=sk_...
LATE_WEBHOOK_SECRET=whsec_...
```
