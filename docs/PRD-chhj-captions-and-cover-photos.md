# PRD: CHHJ caption style + post cover photos

Status: in progress  ·  Owner: Jack  ·  Date: 2026-05-12

## Goal

Two things bothering us on the content calendar today:

1. The AI captions we generate read nothing like what College Hunks Hauling Junk actually publishes. Alex spent 30 min hand-rewriting all 15 of their May 12 captions before we sent the post calendar back to the client. We have those rewrites in the DB. Bake the style back into CHHJ's brand profile so we generate it correctly next time.
2. There's no way to upload a custom cover photo for a video post on the content calendar share link. Today the cover is the auto-extracted first frame; teams want to choose a thumbnail.

Five tasks total. Self-referential loop: each item ends with a `next:` pointer.

---

## Item 1 - Audit CHHJ revisions (done)

15 caption_edit rows on 2026-05-12 (`post_review_comments` where `status='caption_edit'`, joined through `post_review_links` to scheduled_posts for CHHJ). All edits by "Alex" between 13:39 and 14:13.

**Pattern observed (AI draft vs CHHJ edit):**

| Dimension | AI draft (before) | CHHJ edit (after) |
|-----------|-------------------|-------------------|
| Voice | 3rd-person observational ("That garage did not stand a chance") | 2nd-person imperative ("Don't risk breaking grandma's antiques") |
| Topic angle | Visible outcome (cleared clutter, fresh space) | Brand pivot to moving services + crew credentials |
| Brand mention | None or generic | "HUNKS" / "College HUNKS" in nearly every caption |
| Trust signals | None | "trained, licensed, and insured" / "20+ years" appears repeatedly |
| Core values | None | The H.U.N.K.S. acronym - Honest, Uniformed, Nice, Knowledgable Service - shows up in 2 of 15 |
| CTA | None | Implicit "let the HUNKS handle it" |
| Hashtag case | lowercase (`#junkremoval`, `#decluttering`) | PascalCase brand-led (`#CollegeHUNKS`, `#Moving`, `#MovingTips`, `#ProfessionalMovers`) |
| Hashtag count | 6-7 generic | 4-5 brand-specific |
| Emoji | Cleaning emojis (🧹 ♻️ 🚚), always 1 | Sparing, often none; topical when used (🗣️ ✅ 🚚) |
| Length | 130-200 chars | 90-180 chars (tighter) |

**Source data:** `select * from post_review_comments where status='caption_edit' and review_link_id in (select id from post_review_links where post_id in (select id from scheduled_posts where client_id='85d52b89-8d70-4a6e-8188-f7f0384a31bc'))` returns 15 rows.

next: Item 2 (write the style fingerprint into CHHJ's brand profile).

---

## Item 2 - Persist CHHJ guidance to brand profile

`clients` already has the three text columns we need (NAT-67 migration):

- `caption_notes` - strategist guidance, shaped into the prompt
- `hashtag_notes` - shaped, not appended literally
- `cta_notes` - shaped guidance

Update CHHJ (`id='85d52b89-8d70-4a6e-8188-f7f0384a31bc'`) with the style fingerprint distilled from Item 1. Caption generator already renders these fields into the system prompt (`lib/calendar/generate-caption.ts:227-237`), so populating them is the entire fix - no code changes needed in the generator.

**Caption notes draft:**
> Write in second person, direct address. Lead with an imperative ("Don't risk", "Let the HUNKS handle", "Hiring movers means"), not a third-person observation. Pivot to brand value within the first sentence: mention HUNKS / College HUNKS by name, reference crew credentials (trained, licensed, insured), or invoke a brand fact (20+ years in business). When relevant, work in the H.U.N.K.S. acronym: Honest, Uniformed, Nice, Knowledgable Service. Keep captions tight - 90-180 characters. Emojis are sparing and topical (🚚 ✅ 🗣️), never decorative. Avoid generic cleaning/decluttering framing - the brand is professional moving services first, junk removal second. End with a soft CTA that implies "let us handle it" rather than asking for follows.

**Hashtag notes draft:**
> PascalCase, brand-led. Always include #CollegeHUNKS and one Moving-related tag (#Moving, #ProfessionalMovers, #MovingTips, #MovingServices). 4-5 hashtags total - not 6+. Pull from this tag library when relevant: #ProfessionalMovers #MovingTips #StressFree #Licensed #Insured #Safety #Dolly #Packing #FurnitureMoving #MovingCompany #LicensedMovers #JunkRemoval #CoreValues #HUNKS. Skip lowercase generic tags like #decluttering #cleanout #homedecor - those don't match the brand voice.

**CTA notes draft:**
> Soft implicit CTAs only. "Let the HUNKS handle it", "Call the HUNKS", "Let us do the heavy lifting" - never explicit "follow us" or "DM for a quote". The CTA should feel like a punchline to the body copy, not a separate sentence.

next: Item 3 (cover photo API route).

---

## Item 3 - Cover photo API route

Zernio already supports custom cover images for video posts: `lib/posting/zernio.ts:494` reads `input.coverImageUrl` and stamps it on the video media item as `thumbnail`. The publish pipeline reads `scheduled_posts.cover_image_url` and passes it through (`lib/calendar/schedule-drop.ts:579`).

What's missing: a way to **override** that cover from the client-facing share link. Today it's auto-set to the first-frame thumbnail at ingest time. Strategists can swap a thumbnail via admin tools but clients can't from `/c/[token]`.

**New route:** `app/api/calendar/share/[token]/cover/[postId]/route.ts`

- POST: multipart upload of an image (jpg/png/webp, ≤8 MB)
- Validates `token` against `content_drop_share_links`, checks `included_post_ids`, checks `expires_at`
- Uploads to `scheduler-media` bucket under `covers/<postId>/<uuid>.jpg`
- Updates `scheduled_posts.cover_image_url` with the public URL
- Inserts a `post_review_comments` row with `status='cover_edit'` (or `'comment'` with metadata - check what `post_review_comments.status` enum allows) carrying author_name + a "Updated the cover photo" note so the activity rail surfaces it
- DELETE: clears `cover_image_url` (reverts to auto-thumbnail from drop_video.thumbnail_url - mirror what backfill-cover-images.ts copies)

Mirror the auth + validation pattern from `caption/route.ts`. Keep the response shape `{ cover_image_url: string | null }`.

next: Item 4 (cover photo UI on share link).

---

## Item 4 - Cover photo UI on share link

In `app/c/[token]/page.tsx`, the `SharedPost` already carries `cover_image_url`. Add an "Edit cover" affordance to each video tile in the share-link reviewer view:

- Small button overlaid on the video poster (icon: ImageUp from lucide), visible only when `isEditor || link.allows_client_edit` (mirror the caption-edit gate)
- Opens a modal: drag-drop or click-to-upload, preview, Save / Cancel
- POSTs to the new route, optimistically updates the in-page state, falls back to refetch on save success
- Show "Reset to default" when `cover_image_url !== null` and differs from auto-thumbnail - DELETE to the new route
- Add an "Updated the cover photo" entry to the activity rail (the comment insert in Item 3 handles the persistence side; the UI just needs to refetch comments)

Constraints (per CLAUDE.md):
- Sentence case copy
- Reuse existing button primitives + bg-surface tokens
- No em dashes anywhere

next: Item 5 (end-to-end Zernio verification).

---

## Item 5 - Verify Zernio publish payload uses cover

Smoke test the publish path end-to-end:

1. Pick one CHHJ scheduled post that hasn't published yet (status='scheduled', scheduled_at in the future).
2. Upload a custom cover via the new UI as that post's reviewer.
3. SELECT `cover_image_url` from `scheduled_posts` to confirm DB write.
4. Trigger the publish manually (or wait for the 2-min cron - faster to script: `node scripts/publish-one.ts <id>` if it exists, otherwise call the Zernio service in a one-off node REPL).
5. Inspect the outbound Zernio payload (the service logs the request body when `LOG_ZERNIO_PAYLOAD=1` is set, per `lib/posting/zernio.ts`).
6. Confirm: video media item has `thumbnail` = uploaded cover URL on Instagram + Facebook + LinkedIn legs. TikTok ignores custom thumbnails per Zernio's API (`lib/posting/zernio.ts:733-736`) - that's expected, not a bug.
7. If the post publishes, confirm the cover is visible on Instagram/Facebook/LinkedIn before the video plays.

Done = all 5 items shipped + verified, brand profile updated for CHHJ, share-link reviewers can set per-post covers, Zernio honors them where the platform allows.

next: nothing - all items complete.

---

## Loop instruction

When resuming this PRD, read this file top-to-bottom, find the first item not yet marked **done**, execute it, update its section header to **done** with a one-line commit-sha breadcrumb, then follow the `next:` pointer. If a step lands a commit, write the sha into the doc before moving on.
