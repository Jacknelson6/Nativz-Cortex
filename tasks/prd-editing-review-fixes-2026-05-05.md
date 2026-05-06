# PRD: Editing review modal + webhook fixes

Date: 2026-05-05
Owner: Jack
Status: in flight

## Why

Jack flagged a cluster of bugs/gaps across the unified review surface (calendar share links + editing project share links). They're scattered through prior sessions and one new one (webhooks), so this doc gathers everything into one ralph loop.

The unified review modal is the spine that wraps both flows. SMM (calendar) and editing currently drift on layout and behaviour. We bring editing to a complete state, then bring SMM up to layout parity.

## Scope

Seven issues, each with QA gates (L1 → L4) before moving on. Ralph through them top-to-bottom; do not skip.

## QA levels

Every issue has these gates. We do not move on until every gate passes.

- **L1: Static checks** — `npx tsc --noEmit` clean and `npm run lint` clean for every touched file.
- **L2: Logic / integration** — confirm the fix actually wires through. For DB writes, query Supabase and verify the row changed. For API endpoints, hit the endpoint with a real token and confirm the response. For webhooks, post a test event and confirm the chat space received it.
- **L3: UI manual smoke** — open the modal/screen at `localhost:3001` after `npm run dev`, walk through the golden path, screenshot the result. Verify the change is visible and matches sibling screens.
- **L4: Cross-impact** — does the fix break the *other* flow (editing fix → calendar regressed, or vice versa)? Confirm the symmetric flow still works.

## Issues

### 1. Editing video reviews don't send Google Chat webhooks

**Symptom:** Jack: "Im not seing webhooks get sent at all" on edited-video reviews.

**Root cause:** [`app/api/editing/share/[token]/comment/route.ts`](app/api/editing/share/[token]/comment/route.ts#L170) only pulls `process.env.OPS_CHAT_WEBHOOK_URL`. It never reads the per-client `clients.chat_webhook_url` or runs `resolveTeamChatWebhook`. The calendar route (working) does both: per-client primary, ops fallback. So:

- If a client has `chat_webhook_url` set, the editing route still posts to ops (not to that client's space). The client's editor watching their own space sees nothing.
- If `OPS_CHAT_WEBHOOK_URL` isn't configured in the deployed env, no chat post fires at all.

**Fix:** Mirror the calendar pattern in `loadProjectChatContext`:
- Add `chat_webhook_url` to the `clients` select on the `editing_projects` join.
- Run `resolveTeamChatWebhook({ primaryUrl, agency })` first.
- Fall back to `OPS_CHAT_WEBHOOK_URL` only if the per-client + agency catchall both return null.

**QA:**
- L1: typecheck + lint clean
- L2: post a test comment via `/api/editing/share/[token]/comment` against a project whose client has `chat_webhook_url` set. Confirm the per-client space receives it. Then post against a client without webhook → confirm ops space receives it.
- L3: open an editing share link in a browser, leave a comment, watch the chat space.
- L4: post a test calendar comment, confirm calendar still pings the right space.

---

### 2. Editing project status doesn't roll up to "approved" when all videos approved

**Symptom:** All videos in an editing project get approved comments, but `editing_projects.status` stays `need_approval`. The "all approved" claim atomic flip on `editing_project_share_links.all_approved_notified_at` fires (chat ping goes out), but the project row itself doesn't transition.

**Root cause:** [`app/api/editing/share/[token]/comment/route.ts`](app/api/editing/share/[token]/comment/route.ts#L302-L318) flips `all_approved_notified_at` but never `editing_projects.status = 'approved'`.

**Fix:** When `allApprovedClaim === 'won'`, also update `editing_projects.status` to `'approved'` and stamp `approved_at` if that column exists. Verify the unified status pill picks it up via `unifiedStatusForEditingProject`.

**QA:**
- L1: typecheck + lint clean
- L2: in dev, approve every video in a test project. Verify `editing_projects.status` flips to `'approved'` in Supabase. Verify the pill on the review board now reads "Approved".
- L3: open the editing modal, walk approve flow, watch pill change inline.
- L4: confirm calendar's all-approved roll-up still works (calendar is a different table, but the unified pill helper is shared).

---

### 3. Per-deliverable status tags missing from editing modal Media tab

**Symptom:** Editing modal Media tab counters render aggregate (`approved/changes/pending`) but each individual deliverable card doesn't show its own status pill, so editors can't see at a glance which clip is in which state.

**Fix:** In the Media tab card per video, add a small status chip using the same pill component as the review board. Source: `editing_project_videos.review_status` (already populated).

**QA:**
- L1: typecheck + lint clean
- L2: in Supabase, manually set one video's `review_status` to `changes_requested`, reload the modal, verify the chip renders.
- L3: visual smoke against the editing modal Media tab — chip lines up with the existing card layout, doesn't break wrapping.
- L4: SMM modal Media tab unaffected (it doesn't have per-video chips by design).

---

### 4. History verb is hardcoded to "cuts"

**Symptom:** Activity log says "approved a cut" / "requested changes on a cut" even for static-image / ad / generic-deliverable projects. Confuses non-video projects.

**Fix:** Drive the verb from `editing_projects.project_type`. Map: `cuts` → "cut", `static_ads` → "ad", `social_post` → "post", default → "deliverable". Apply in `TITLE_BY_STATUS` in the comment route AND in the activity feed renderer.

**QA:**
- L1: typecheck + lint clean
- L2: write a test comment on a static-ad project, confirm the inserted notification title reads "approved an ad on …" not "approved a cut on …".
- L3: visual smoke on the activity feed for one cuts project + one static-ads project.
- L4: chat ping wording also reflects the type-aware verb (since `postEditingChatForComment` constructs its own message text).

---

### 5. Email subject/body says "cuts" on non-video projects

**Symptom:** Send email and resend email both lead with "cuts" / "edits" verbiage. Static-ads or generic-deliverable projects get the wrong copy.

**Fix:** Same project_type → noun map, applied in the editing share-link send/resend email templates. Subject + body + CTA copy.

**QA:**
- L1: typecheck + lint clean
- L2: trigger send email for a static-ads project via the modal "Send" button. Inspect the email subject + body in Resend dashboard or local stub.
- L3: archive the email after send, open from the modal "Past emails" panel, confirm rendered HTML matches.
- L4: cuts project still says "cuts" / "edits" as expected.

---

### 6. `last_followup_at` not populated for editing rows

**Symptom:** The unified review board shows "X days since last followup" for calendar rows but blank/null for editing rows, because the editing send-followup endpoint doesn't write this column.

**Fix:** When the send-followup action fires for an editing share link, stamp `editing_project_share_links.last_followup_at = now()` and bump `followup_count`. Confirm `ReviewLinkRow` shape carries both fields out of `/api/calendar/review`.

**QA:**
- L1: typecheck + lint clean
- L2: send a followup on an editing project, query Supabase, confirm the column populated.
- L3: the unified review table column "Last followup" populates with the row.
- L4: calendar followup unchanged.

---

### 7. SMM modal layout parity with editing modal

**Symptom:** SMM (calendar) modal at `components/admin/content-tools/calendar-link-detail.tsx` is missing pieces that editing modal has:
- View counter inline in the share link box
- Strategist picker
- Editor picker
- Notes textarea

Recipients + past emails (with rendering) already exist on SMM, those don't need work.

**Schema state:**
- `content_drops.strategist_id` + `editor_id` already exist (migration 240). FKs to `team_members`. ✓
- `content_drops.notes` — needs verification, likely missing. Add migration if so.
- `content_drop_share_links.view_count` — does NOT exist. Views are tracked in `content_drop_share_link_views` table (migration 188). We can either (a) add a `view_count` column and backfill, or (b) compute on the fly via COUNT in the API.

**Fix plan:**
- (a) Add `content_drops.notes` column if missing (migration 251).
- (b) Decide on view count: prefer (b) computing live in `/api/calendar/review` since the views table is small and avoids drift. Add `view_count` to `ReviewLinkRow` shape.
- (c) Update `/api/calendar/review` to include `strategist_id`, `editor_id`, `notes`, `view_count`.
- (d) Add a PATCH endpoint at `/api/calendar/drops/[id]` to save strategist/editor/notes (or use an existing one).
- (e) Wire the SMM modal sections: AssigneePicker × 2, Notes textarea, view count line in share box. Exact same component instances used by editing modal so styling stays identical.

**QA:**
- L1: typecheck + lint clean
- L2: open an SMM modal, change strategist + editor, write notes, verify Supabase row updated.
- L3: side-by-side screenshot of SMM modal vs editing modal, confirm layout parity (strategist, editor, notes, view counter, recipients, past emails — all present and aligned).
- L4: editing modal still works exactly as before.

---

## Ralph order

Issues 1-2 first (webhook + status roll-up — critical user-facing bugs).
Issues 3-6 (medium-priority polish + content-aware copy).
Issue 7 last (UI parity, biggest scope, depends on stable backend from 1-6).

Each issue: investigate → fix → run all four QA gates → commit → move on. No batching commits across issues — each one ships independently so a regression is bisectable.

## Out of scope

- Editing project chat space per-client config (we still fall back to ops; per-client editing chat is a future enhancement)
- Cross-flow consolidation of comment route logic into a single helper (deferred until both flows are stable)
- Editing project Mux upload flow (separate area, not flagged this session)
