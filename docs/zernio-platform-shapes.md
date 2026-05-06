# Zernio platform shapes (frozen reference)

**Source:** https://docs.zernio.com/platforms (snapshotted 2026-05-06)
**Endpoint:** `POST /v1/posts` for every platform. The only knob that varies per platform is `platforms[].platformSpecificData` (per-leg) and a single body-level `tiktokSettings` (TikTok only).

This file is the canonical reference the codebase agrees with. If `docs.zernio.com` changes, update this file in the same commit as the routing change so we always know what version of the Zernio contract we're shipping.

The per-platform routers in `lib/posting/zernio.ts` (`buildInstagramEntry`, `buildFacebookEntry`, `buildLinkedInEntry`, `buildYouTubeEntry`, `buildTikTokEntry`, `buildGoogleBusinessEntry`) implement these shapes.

## Body envelope (every request)

```json
{
  "content": "caption text with hashtags appended",
  "mediaItems": [{ "type": "image|video|document", "url": "https://..." }],
  "platforms": [
    { "platform": "instagram", "accountId": "...", "platformSpecificData": { ... } }
  ],
  "publishNow": true,
  "scheduledFor": "2026-12-31T23:59:00Z",
  "tiktokSettings": { ... }
}
```

`publishNow` and `scheduledFor` are mutually exclusive. `tiktokSettings` is only sent when at least one leg is TikTok.

## Instagram

Source: https://docs.zernio.com/platforms/instagram

**Variant inference:** the `contentType` discriminator selects feed/reels/story.

| Variant | `contentType` | Inferred default |
|---|---|---|
| Feed (single image) | omit | image-only, 1 item |
| Carousel | omit | image-only, multi-item |
| Reels | `"reels"` | any video |
| Stories | `"story"` | only via explicit override (we can't detect 9:16 from URL) |

**`platformSpecificData` fields:**

| Field | Type | Required | Applies to | Notes |
|---|---|---|---|---|
| `contentType` | `"story"` \| `"reels"` | optional | all | omit for feed/carousel |
| `shareToFeed` | bool | optional, default `true` | reels only | cross-post Reel to main feed |
| `collaborators` | `string[]` | optional | feed/carousel/reels | up to 3 usernames; not allowed on stories |
| `userTags` | `Array<{username, x, y, mediaIndex?}>` | optional | feed/carousel/reels | x,y in 0.0–1.0; `mediaIndex` is 0-based for carousels |
| `firstComment` | string | optional | feed/carousel | useful for clickable links; **not** allowed on stories |
| `thumbOffset` | number (ms) | optional | reels only | thumbnail position in video |
| `instagramThumbnail` | URL | optional | reels only | overrides `thumbOffset` |
| `audioName` | string | optional | reels only | set at creation, not editable |
| `trialParams` | `{graduationStrategy: "MANUAL" \| "SS_PERFORMANCE"}` | optional | reels only | trial reels visible to non-followers |

**Aspect ratios:**

- Feed: 4:5 to 1.91:1
- Reels & Stories: 9:16
- Carousel: all items must share the first item's aspect ratio

## Facebook

Source: https://docs.zernio.com/platforms/facebook

**Variant inference:** Zernio routes feed-image vs feed-video automatically when no `contentType` is sent. Override only when you need Reel or Story.

**Important field-name quirks vs Instagram:**

- Facebook uses `contentType: "reel"` (singular), Instagram uses `"reels"` (plural).
- Both use `"story"`.

**`platformSpecificData` fields:**

| Field | Type | Required | Applies to | Notes |
|---|---|---|---|---|
| `contentType` | `"story"` \| `"reel"` | optional | stories, reels | omit for standard feed |
| `draft` | bool | optional | feed/video/reel | unpublished draft in Publishing Tools |
| `title` | string | optional | reels only | separate from `content` caption |
| `firstComment` | string | optional | feed/reel | skipped if `draft: true` or stories |
| `pageId` | string | optional | all | target page when account manages multiple |
| `geoRestriction` | `{countries: string[]}` | optional | feed/video/reel | up to 25 ISO 3166-1 codes; not for stories |

## LinkedIn

Source: https://docs.zernio.com/platforms/linkedin

**Variant inference:** No `contentType` discriminator. Zernio infers the variant from `mediaItems`:

| Variant | Trigger |
|---|---|
| Text-only | no `mediaItems` |
| Single / multi-image | `mediaItems` of `type: "image"` (1–20) |
| Video | exactly 1 `type: "video"` |
| Document | exactly 1 `type: "document"` (PDF/PPT/PPTX/DOC/DOCX) |

**Cannot mix media types in one post.**

**`platformSpecificData` fields:**

| Field | Type | Required | Applies to | Notes |
|---|---|---|---|---|
| `documentTitle` | string | **REQUIRED** for document posts | document | falls back to media item `title`, then `filename` |
| `organizationUrn` | string | optional | all | format: `urn:li:organization:123456`; posts as company page |
| `firstComment` | string | optional | all | best practice: park external links here (LinkedIn down-ranks link posts ~40-50%) |
| `disableLinkPreview` | bool | optional | text-only with URL | suppress auto preview card |
| `geoRestriction` | `{countries: string[]}` | optional | all (org pages only) | requires 300+ targeted followers |

**Constraints:**

| Variant | Max count | File size | Aspect / duration |
|---|---|---|---|
| Image | 20 | 8 MB each | 1.91:1, 1:1, or 1:1.25 |
| Video | 1 | 5 GB | 1:2.4 to 2.4:1; 10 min personal / 30 min org |
| Document | 1 | 100 MB | 300-page max |

## TikTok

Source: https://docs.zernio.com/platforms/tiktok

**Special case:** TikTok config lives at the BODY level (`tiktokSettings`), NOT on per-leg `platformSpecificData`. Quoting the docs: *"This is a special case unique to TikTok."*

**`tiktokSettings` fields (body-level):**

| Field | Type | Required | Notes |
|---|---|---|---|
| `privacy_level` | enum | yes | `PUBLIC_TO_EVERYONE` \| `MUTUAL_FOLLOW_FRIENDS` \| `FOLLOWER_OF_CREATOR` \| `SELF_ONLY`; must match creator's allowed values |
| `allow_comment` | bool | yes | |
| `allow_duet` | bool | yes (videos) | video only |
| `allow_stitch` | bool | yes (videos) | video only |
| `content_preview_confirmed` | bool | yes | **must be `true`** (TikTok legal req) |
| `express_consent_given` | bool | yes | **must be `true`** (TikTok legal req) |
| `video_cover_timestamp_ms` | number | optional | thumbnail position; default 1000 |
| `video_cover_image_url` | string | optional | custom thumbnail (JPG/PNG/WebP, ≤20 MB) — **DO NOT SEND**; broke Zernio's ffmpeg stitch on Joseph Pytcher's Weston Funding post 46a94566 (PRE_FFMPEG_THUMBNAIL_STITCH); leave it unset and let TikTok pick the first frame |
| `media_type` | `"photo"` | optional | only for photo carousels |
| `photo_cover_index` | number | optional | 0-based |
| `description` | string | optional | photo carousels, up to 4000 chars |
| `auto_add_music` | bool | optional | photo carousels only |
| `video_made_with_ai` | bool | optional | AI disclosure |
| `draft` | bool | optional | sends to Creator Inbox |
| `commercialContentType` | enum | optional | `none` \| `brand_organic` \| `brand_content` |

**Video constraints:** 3 sec to 10 min, 9:16 only, MP4/MOV/WebM, ≤4 GB, H.264, 1080×1920 recommended.

## YouTube

Source: https://docs.zernio.com/platforms/youtube

**No discriminator — Shorts vs regular video is inferred from aspect ratio + duration on YouTube's side.**

**`platformSpecificData` fields:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | string | optional | first line of `content` or `"Untitled Video"` | max 100 chars; YT rejects empty title |
| `visibility` | enum | optional | `"public"` | `public` \| `private` \| `unlisted` |
| `madeForKids` | bool | optional | `false` | COPPA flag; permanently disables comments / notifications / personalized ads / end screens / cards |
| `containsSyntheticMedia` | bool | optional | `false` | AI disclosure |
| `categoryId` | string | optional | `"22"` | e.g. `"1"` Film, `"10"` Music, `"27"` Education |
| `playlistId` | string | optional | – | format `PLxxxxxxxxxxxxx` |
| `firstComment` | string | optional | – | pinned comment, max 10000 chars |

**Note:** `tags` is NOT documented on Zernio's YouTube schema. We currently send it (legacy from Late) and YouTube appears to silently accept it. If a future Zernio strict-validation pass rejects it, drop the field.

**Constraints:**

- Both: MP4/MOV/AVI/WMV/FLV/3GP/WebM, ≤256 GB, ≥1 sec
- Shorts: ≤3 min, 9:16, 1080×1920
- Regular: ≤15 min unverified / ≤12h verified, 16:9, 1920×1080
- Custom thumbnail (regular only): JPEG/PNG/GIF, ≤2 MB, 1280×720

## Google Business

Source: https://docs.zernio.com/platforms/google-business

No `platformSpecificData` per the docs. Just text + photos.

## Variant-specific aspect-ratio caveat

We don't have media dimensions at publish time (Zernio fetches the URL itself). So:

- IG defaults to `reels` for any video; if the video is wider than 9:16, IG silently letterboxes. To force a non-Reel video post, set `instagramContentType: 'feed'`.
- IG image-only defaults to feed; to publish a 9:16 image as a Story (the only legal home for that aspect), set `instagramContentType: 'story'`.
- Facebook video defaults to feed-video (no `contentType`); to force Reel, set `facebookContentType: 'reel'`.

Future improvement: probe media dimensions during scheduling and auto-set the override based on aspect.
