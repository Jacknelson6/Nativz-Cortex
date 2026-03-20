# Ad Creative Wizard v2 — Phase 3: Generation Refinement

> Phase 3 of 3. Final phase.

## Problem

Generation quality needs user control:
- No way to review or edit prompts before image generation
- No visibility into what media/images the system has for the brand
- No way to upload additional product photos or lifestyle images to improve generation
- No interactive mode — it's full-auto only

## Solution

Add an optional prompt review step, a brand media library panel, and an interactive mode toggle.

---

## 1. Prompt Review Step (Hybrid — Auto by Default, Expandable)

After clicking "Generate", before images are created:

### Auto mode (default)
- Prompts are generated server-side and images start immediately (current behavior)
- No extra step — fast path

### Review mode
- User clicks "Review prompts" instead of "Generate"
- System generates prompts (calls assembleImagePrompt for each template × variation)
- Shows a card per creative with:
  - Template thumbnail
  - Generated copy (headline, subheadline, CTA) — editable
  - Style direction summary — editable text area
  - "Approve" or "Edit" per card
- User can edit any prompt, then "Generate all approved"

### API

| Route | Method | Purpose |
|-------|--------|---------|
| `POST /api/clients/[id]/ad-creatives/preview-prompts` | POST | Generate prompts without generating images. Returns assembled prompts + copy. |

---

## 2. Brand Media Library

A panel in the wizard (between Brand and Products) showing all media the system has for this brand.

### Content
- Images from the brand crawl (stored in `metadata.ad_creative_context.mediaUrls`)
- Product images
- Logo
- Any user-uploaded media

### Upload
- User can upload additional images (product shots, lifestyle photos, logo variants)
- Uploaded to Supabase Storage under `brand-media/{client_id}/`
- URLs added to the knowledge entry's `metadata.ad_creative_context.mediaUrls`

### Usage
- Selected media URLs are passed to the image generation prompt as additional reference images
- The orchestrator already supports `productImageUrls` — extend to include selected brand media

---

## 3. Interactive vs Auto Mode Toggle

A simple toggle at the top of the Generate step:

- **Auto** (default): Generate prompts + images in one go (current behavior)
- **Interactive**: Generate prompts → review → approve → generate images

The toggle sets a flag that determines whether clicking "Generate" goes straight to gallery placeholders or shows the prompt review screen.

---

## Technical changes

### New files
| File | Purpose |
|------|---------|
| `components/ad-creatives/prompt-review.tsx` | Prompt review cards with editable copy + style |
| `components/ad-creatives/brand-media-panel.tsx` | Brand media grid with upload |
| `app/api/clients/[id]/ad-creatives/preview-prompts/route.ts` | Generate prompts without images |

### Modified files
| File | Change |
|------|--------|
| `components/ad-creatives/ad-wizard.tsx` | Add auto/interactive toggle, prompt review step, brand media panel |
| `lib/ad-creatives/orchestrate-batch.ts` | Accept pre-edited prompts from review |

---

## Non-goals
- Real-time prompt streaming (prompts are generated in batch, not streamed)
- Custom Gemini model parameters (temperature, etc.) — too advanced for v1
- Multi-language prompt support

---

## Success criteria
- "Review prompts" shows editable prompt cards before generation
- Auto mode works exactly as before (no regression)
- Brand media panel shows all crawled images + allows upload
- Uploaded brand media appears in the generation prompt
