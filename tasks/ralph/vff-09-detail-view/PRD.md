# PRD: VFF · 09 · Expanded detail view

> Viral Format Finder · 09/10 · 2026-05-10

## Purpose & Value

Clicking a card opens the full reasoning: hook breakdown, structure beats, why it works, retention pattern, top comments, and the "Use this format" CTA that hands off to Content Lab (VFF-10). This is where intelligence becomes action. After this PRD, the surface stops being read-only browsing and starts being a workflow tool.

## Problem

A card is a hook; the detail view is the payoff. Without it, the format library is decorative. With it, the strategist can copy a structure into a script in seconds.

## Primary User

Strategist mid-research. Secondary: editor / shooter referencing the structure.

## SMART Goals

- Time-from-click-to-fully-rendered <=600ms when data is already in the row payload (no network re-fetch).
- "Use this format" CTA succeeds in >=95% of attempts (handoff returns a Content Lab conversation id).
- Save / Pin / Dismiss persist in <=200ms.
- Strategist can read the entire breakdown without horizontal scrolling at 1280px+.

## User Stories

- **US-01** — As a strategist, clicking a card opens a side modal with video preview on the left + structured analysis on the right.
- **US-02** — As a strategist, the right pane shows: hook breakdown (one paragraph summary), structure (4 dimension chips), why it works (2-3 sentences), retention pattern (one-line), top comments (collapsed by default), source link.
- **US-03** — As a strategist, "Use this format" lands me in Content Lab with the format pinned and the system prompt augmented.
- **US-04** — As a strategist, I can Save (per-user collection), Pin (per-brand collection), or Dismiss ("not for this brand"); each persists.
- **US-05** — As a strategist, dismissing a video demotes it in future feeds for this brand (via `viral_video_brand_dismissals`).

## In Scope

- Page route: `app/admin/formats/[id]/page.tsx` (deep-linkable full-page view; same content as the modal but full-screen).
- Modal route: `app/admin/formats/@modal/(.)formats/[id]/page.tsx` (intercepting modal overlay).
- Detail API: `GET /api/admin/formats/[id]` returning full record.
- Actions API:
  - `POST /api/admin/formats/[id]/save` (per-user save collection)
  - `DELETE /api/admin/formats/[id]/save`
  - `POST /api/admin/formats/[id]/pin` (per-brand pin collection)
  - `DELETE /api/admin/formats/[id]/pin`
  - `POST /api/admin/formats/[id]/dismiss` (with optional brand_id; defaults to active brand)
  - `DELETE /api/admin/formats/[id]/dismiss`
  - `POST /api/admin/formats/[id]/use-in-content-lab` (creates a `nerd_conversations` row pre-pinned with format)
- New table `viral_video_brand_dismissals` (migration 288 — see Data Model).
- Components:
  - `components/formats/format-detail-pane.tsx`
  - `components/formats/format-video-preview.tsx`
  - `components/formats/format-detail-modal.tsx` (wraps pane in modal chrome)
  - `components/formats/format-action-bar.tsx`
- Auto-collection helpers: per-user "Saved" collection created on first save (if missing); per-brand "Pinned" collection created on first pin.

## Out of Scope

- Editing the LLM's analysis output (read-only; admin can dismiss not edit).
- Multi-select bulk dismiss / save.
- Detailed comment thread (top 5 only).
- Composing the full Content Lab system prompt (VFF-10 owns the augmentation).

## Resolved Decisions

- **D-01** — Modal or full-page? **→ Both. Intercepting modal for in-flow clicks; full-page route for deep links and refresh.** Rationale: Netflix-pattern best practice.
- **D-02** — Use-this-format pre-seeds a script? **→ No, pins format to context + creates an empty conversation.** Rationale: less prescriptive; strategist drives the prompt.
- **D-03** — Show top comments? **→ Yes, top 5, collapsed by default.** Rationale: audience reaction context without dominating the pane.
- **D-04** — Competitor-source flag? **→ Yes; "Pulled from your competitor @{handle}" line shown when `viral_videos.creator_handle` matches a `client_competitors.username` for the active brand.** Rationale: useful provenance.
- **D-05** — Per-user vs per-brand save? **→ Per-user "Saved" collection (`client_id = null`, `created_by = user.id`); separate per-brand "Pinned" collection (`client_id = active brand`, no user).** Rationale: matches `viral_collections` schema from VFF-01 (`client_id` nullable, `created_by` populated).
- **D-06** — Dismissal scope? **→ Per-brand. Stored in `viral_video_brand_dismissals(video_id, client_id, dismissed_by, dismissed_at, reason text nullable)`.** Rationale: a video dismissed for Brand A may still be relevant for Brand B.
- **D-07** — Video preview source? **→ Direct platform iframe for TikTok / Instagram / YouTube (well-supported embed APIs). MP4 fallback only if iframe disallowed or fails to load.** Rationale: avoids re-hosting; respects platform CDNs.
- **D-08** — Source link target? **→ Always opens original platform URL in a new tab (`target="_blank" rel="noopener"`).** Rationale: standard.
- **D-09** — Hook breakdown timestamped beats? **→ Replaced with `engagement_hook_descriptor` + `why_it_works` displayed prominently.** Rationale: timestamped beats would require timed transcript work; deferred to v2.
- **D-10** — When dismissed video is also pinned/saved? **→ Allowed; dismissal demotes in feed ranking but does not auto-unpin.** Rationale: power users may want to keep a reference even after marking off-brand.

## Data Model

### Migration `288_viral_video_brand_dismissals.sql`

Note: migration number 288 takes the next free slot after the ZNA series (CONTEXT.md reserved 273-287). If a later PRD has already taken 288, renumber forward.

```sql
-- ============================================================
-- VFF-09: Per-brand dismissal feedback
-- ============================================================

CREATE TABLE IF NOT EXISTS viral_video_brand_dismissals (
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dismissed_by UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  PRIMARY KEY (video_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissals_client
  ON viral_video_brand_dismissals(client_id);

ALTER TABLE viral_video_brand_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY dismissals_admin_all ON viral_video_brand_dismissals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin','super_admin')));
```

VFF-07 `format-feed.ts` MUST be modified to LEFT JOIN this table and demote dismissed videos (push to end OR exclude when row size allows; pick demote, not exclude, so power-user override is possible).

## API Contracts

### `GET /api/admin/formats/[id]`
Auth: admin.
Request: path param `id` (uuid).
Response (200):
```ts
{
  video: {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    source_url: string;
    external_post_id: string | null;
    creator_handle: string | null;
    creator_display_name: string | null;
    thumbnail_storage_url: string | null;
    thumbnail_source_url: string | null;
    duration_seconds: number | null;
    views_count: number | null;
    likes_count: number | null;
    comments_count: number | null;
    shares_count: number | null;
    posted_at: string | null;
    title: string | null;
    engagement_hook_descriptor: string | null;
    why_it_works: string | null;
    retention_pattern: string | null;
    analysis_status: string;
    raw_payload_top_comments: Array<{ text: string; likes: number; author: string | null }>;
    formats: Array<{ kind: 'hook_type' | 'structure' | 'archetype' | 'pacing'; slug: string; display_name: string; confidence: number }>;
  };
  brand_context: {
    client_id: string | null;
    competitor_match: { handle: string; competitor_id: string } | null;
    is_saved: boolean;
    is_pinned: boolean;
    is_dismissed: boolean;
  } | null;
}
```
Errors: 401, 403, 404, 500.

### `POST /api/admin/formats/[id]/save`
Auth: admin.
Request: empty.
Behavior: gets-or-creates per-user collection named "Saved" (`client_id = null`, `created_by = user.id`); inserts `viral_collection_videos` row; idempotent (`ON CONFLICT DO NOTHING`).
Response (200): `{ collection_id: string; is_saved: true }`.

### `DELETE /api/admin/formats/[id]/save`
Auth: admin.
Behavior: removes row from per-user Saved collection.
Response (200): `{ is_saved: false }`.

### `POST /api/admin/formats/[id]/pin`
Auth: admin.
Request:
```ts
const PinSchema = z.object({ client_id: z.string().uuid() });
```
Behavior: gets-or-creates per-brand collection named "Pinned" (`client_id = body.client_id`); inserts `viral_collection_videos` row.
Response (200): `{ collection_id, is_pinned: true }`.

### `DELETE /api/admin/formats/[id]/pin`
Same as above (DELETE).

### `POST /api/admin/formats/[id]/dismiss`
Auth: admin.
Request:
```ts
const DismissSchema = z.object({
  client_id: z.string().uuid(),
  reason: z.string().max(200).optional(),
});
```
Behavior: inserts into `viral_video_brand_dismissals` (`ON CONFLICT (video_id, client_id) DO UPDATE SET dismissed_at = now(), reason = excluded.reason`).
Response (200): `{ is_dismissed: true }`.

### `DELETE /api/admin/formats/[id]/dismiss`
Request:
```ts
const UndismissSchema = z.object({ client_id: z.string().uuid() });
```
Response (200): `{ is_dismissed: false }`.

### `POST /api/admin/formats/[id]/use-in-content-lab`
Auth: admin.
Request:
```ts
const UseSchema = z.object({ client_id: z.string().uuid() });
```
Behavior: creates `nerd_conversations` row with `format_video_id = id` (this column is added in VFF-10 migration); returns conversation id + redirect URL `/admin/content-lab/conversations/<id>`.
Response (200):
```ts
{ conversation_id: string; redirect_url: string }
```
**Note:** Until VFF-10 migrates, this endpoint can stub `format_video_id` storage in `nerd_conversations.metadata` JSONB if the column does not yet exist. Coordinate with VFF-10 to align.

## LLM Prompts

None new.

## UI Components

### `components/formats/format-detail-pane.tsx`

Props:
```ts
type Props = {
  data: FormatDetailPayload;     // full GET shape
  activeClientId: string | null; // for action endpoints
};
```

Layout: 12-column grid; left 7 cols video preview, right 5 cols analysis.

Right pane sections (vertically stacked, 16px gap):
1. Header: creator handle + posted relative time + competitor-source pill if matched.
2. Title (h2): `engagement_hook_descriptor` (bold, accent-text).
3. Action bar: 4 buttons (Use this format, Save, Pin, Dismiss).
4. "Why it works" block: paragraph (`why_it_works`).
5. "Format dimensions": 4 chips (hook / structure / archetype / pacing) each showing display_name + confidence as small percent.
6. "Retention pattern": one-line italic.
7. "Audience reaction" (collapsible): top 5 comments.
8. "Source": platform name + open-original link.

Copy:
- Save button: "Save" / "Saved" (toggled)
- Pin button: "Pin to brand" / "Pinned"
- Dismiss button: "Not for this brand" / "Restored"
- Use button (primary): "Use this format"
- Section heads: "Why it works", "Format dimensions", "Retention pattern", "Audience reaction", "Source"
- Competitor pill: "Pulled from your competitor @{handle}"
- Toggle copy on audience reaction: "Show comments (5)" / "Hide comments"
- Use confirm toast: "Opened in Content Lab with format pinned."
- Save toast: "Saved to your library."
- Pin toast: "Pinned to {brand_name}'s library."
- Dismiss toast: "Demoted for this brand. We will show it less."

### `components/formats/format-video-preview.tsx`

Props:
```ts
type Props = {
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string;
  external_post_id: string | null;
  fallback_thumbnail: string | null;
};
```

Renders the appropriate platform embed iframe; falls back to thumbnail + "Open on platform" link if iframe disallowed.

### `components/formats/format-action-bar.tsx`

Props:
```ts
type Props = {
  video_id: string;
  client_id: string | null;
  initial: { is_saved: boolean; is_pinned: boolean; is_dismissed: boolean };
  brand_name: string | null;
};
```

Renders 4 buttons with optimistic state toggle and toast on success. All buttons have `whitespace-nowrap` baked in via `<Button>`.

### `components/formats/format-detail-modal.tsx`

Wraps `FormatDetailPane` in a modal chrome (Dialog component from shadcn or existing modal primitive). Close button top-right; ESC closes; backdrop click closes; URL updates via parallel route.

### `app/admin/formats/[id]/page.tsx`
Full-page server-component variant: same content + `PageHeader` chrome.

### `app/admin/formats/@modal/(.)formats/[id]/page.tsx`
Intercepting modal route returning `<FormatDetailModal data={...} />`.

### `app/admin/formats/layout.tsx`
Wires `@modal` parallel slot.

## File Map

Create:
- `supabase/migrations/288_viral_video_brand_dismissals.sql`
- `app/admin/formats/[id]/page.tsx`
- `app/admin/formats/@modal/(.)formats/[id]/page.tsx`
- `app/admin/formats/layout.tsx` (if it does not exist; add `@modal` parallel slot)
- `app/api/admin/formats/[id]/route.ts` (GET)
- `app/api/admin/formats/[id]/save/route.ts`
- `app/api/admin/formats/[id]/pin/route.ts`
- `app/api/admin/formats/[id]/dismiss/route.ts`
- `app/api/admin/formats/[id]/use-in-content-lab/route.ts`
- `lib/analytics/format-detail.ts` (server helper: `getFormatDetail(videoId, viewerClientId)`)
- `components/formats/format-detail-pane.tsx`
- `components/formats/format-detail-modal.tsx`
- `components/formats/format-video-preview.tsx`
- `components/formats/format-action-bar.tsx`
- `tasks/ralph/vff-09-detail-view/progress.txt`

Modify:
- `lib/analytics/format-feed.ts` (LEFT JOIN dismissals; demote dismissed videos by appending `dismissed_at IS NOT NULL` as last sort key)
- `lib/supabase/types.ts` (regenerate)

## Env Vars

None new.

## Edge Cases

- **Modal opened on a refresh (no row data in memory).** Full-page route renders; modal behavior triggered by `useRouter().back()` (does not exist in browser history → close goes to /admin/formats).
- **Embed iframe blocked.** `onError`/load-timeout falls back to thumbnail + external link.
- **Active brand changes while modal open.** Action endpoints accept `client_id` in body; modal closes on brand change (verify).
- **Video deleted while modal open.** Actions return 404; UI shows "Video was removed" + close.
- **User saves twice quickly.** Optimistic UI debounces 500ms; backend idempotent.
- **Conversation creation fails.** Error toast "Could not open Content Lab. Try again."; do not close modal.
- **Top comments missing.** Section hides entirely.
- **Format chips with confidence < 0.4.** Render with muted color + "(low confidence)" label.
- **Dismissed video later pinned.** Both states coexist (D-10).

## Test Plan

Unit:
- `lib/analytics/format-detail.test.ts`:
  - Returns full payload with brand_context populated when activeClientId provided.
  - Returns brand_context: null when no active brand.
  - Detects competitor_match when creator_handle matches a `client_competitors.username` (case-insensitive).
  - Aggregates top 5 comments from `raw_payload`.

Integration:
- Apply migration 288; dismissals table exists.
- GET `/api/admin/formats/<id>?client_id=<id>`; payload includes all action flags.
- POST save/pin/dismiss + DELETE counterparts; verify DB rows.

E2E (Playwright):
- Click card in `/admin/formats`; modal opens.
- Click Save; button toggles + Saved collection row exists.
- Click Pin; button toggles + Pinned collection row exists.
- Click Dismiss; button toggles + dismissal row exists.
- Click Use this format; navigates to Content Lab.
- Refresh `/admin/formats/<id>`; full-page renders with same data.

Manual QA:
- Verify time-from-click-to-render <=600ms (data in row; just modal mount + chip render).
- Verify dismiss demotes the video on next feed fetch (it appears later in its row OR moves down list).
- Verify keyboard ESC closes modal.

## Architecture Wiring

- Intercepting modal pattern follows Next.js parallel routes (verify a working sibling pattern, e.g. moodboard share modal; mirror that structure).
- `lib/analytics/format-feed.ts` LEFT JOIN dismissals and sorts dismissed to bottom (preserves transparency over silent removal).
- Per-user / per-brand "Saved" / "Pinned" collection auto-creation pattern: use `INSERT ... ON CONFLICT DO NOTHING` against `viral_collections (created_by, client_id, name)` partial-unique helper view OR write a `getOrCreateCollection(opts)` helper.
- Content Lab handoff: `use-in-content-lab` route delegates to VFF-10's helper if shipped, else stubs into `nerd_conversations.metadata` jsonb for v0.

## Done When

- Migration 288 applied.
- Detail modal opens on card click with all sections rendered.
- All 4 actions (save/pin/dismiss/use) persist and reflect immediately.
- Dismissed videos visibly demoted on next `/admin/formats` load.
- Use-this-format navigates to Content Lab with format pinned (or stub metadata pending VFF-10).
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
