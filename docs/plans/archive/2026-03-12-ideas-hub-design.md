# Ideas Hub — Design Document

## Goal

Consolidate idea generation, script writing, reference video analysis, and the moodboard into a single "Ideas" section. One page shows saved ideas (grid + canvas views). A single generation modal handles both from-scratch and from-reference generation with optional reference videos.

## Architecture

### Page Structure

- **Route:** `/admin/ideas` — main Ideas page
- **Sidebar:** Rename "Idea generator" → "Ideas", remove "Moodboard" nav item
- **Main page** is always the saved ideas library (grid view default, canvas toggle)
- **Single "Generate ideas" button** in header opens the generation modal
- **Client filter** dropdown in header filters saved ideas

### Generation Modal

Single modal with:
- Client selector (required, ComboSelect)
- Reference videos section (optional) — upload files or paste URLs
- Concept direction (optional text input)
- Count selector (visual pill/slider, not a number input)
- Generate button

When reference videos are provided:
1. Videos are processed in parallel: Groq Whisper transcription + Gemini 2.5 Flash visual analysis
2. Analysis results shown with priority-ranked elements (high/medium/low badges, color-coded)
3. Both transcripts and visual analysis are passed as context to idea generation

Output (same for both flows):
- List of idea cards, each with: title, "why it works" explanation
- Per-idea actions: Save (bookmark), Re-roll (refresh icon), Generate script (pen)
- Batch actions: Generate all scripts, Save all

### Re-roll Mechanism

- Refresh icon on each idea card
- Replaces the idea in-place (old idea gone from view)
- Rejected idea saved to `rejected_ideas` table with client_id, idea content, and generation context
- Rejected ideas fed as negative examples in future generations for that client

### Script Generation

- Per-idea or batch ("Generate all scripts" button)
- Script is spoken-word only — no shot lists, pacing notes, or stage directions
- Context: idea + client brand profile + reference video analysis (if present)
- Loading state per card during generation
- Toast notification when batch completes
- Inline editable script text (textarea)
- Regenerate script button per idea

### Download & Copy

- **Copy all scripts** — clipboard: title + script text only, no explanations
- **Download** — checklist popover with toggleable elements:
  - Titles (always on)
  - Scripts
  - Why it works (explanations)
  - Reference video breakdowns
  - Downloads as .txt

### Saved Ideas View

**Grid view (default):**
- Cards showing: title, client name, content pillar/tags, thumbnail (if from reference), created date
- Filterable by client
- Click to expand/view details + script

**Canvas view:**
- Existing moodboard React Flow canvas
- Same items rendered as nodes
- Connections, sticky notes, all existing moodboard features preserved

### Reference Video Processing

**Upload flow:** File → Supabase Storage → parallel processing
**URL flow:** Paste URL → platform detection → download → parallel processing

Processing pipeline:
1. **Groq Whisper** (`whisper-large-v3`) — audio transcription
2. **Gemini 2.5 Flash** — multimodal video analysis extracting:
   - Script/dialogue structure
   - Camera angles and shots
   - Visual cues (props, demonstrations, text overlays)
   - Pacing and energy
   - Hook technique
   - Content structure (hook → problem → solution → CTA)
   - Each element gets a priority ranking: high (green), medium (amber), low (gray)

### Data Model Changes

**New table: `rejected_ideas`**
- id, client_id, title, description, hook, content_pillar, generation_context (JSONB), created_at

**New table: `idea_scripts`**
- id, idea_id (FK), client_id, script_text, reference_context (JSONB), created_at, updated_at

**New table: `reference_videos`**
- id, client_id, created_by, url, file_path (Supabase Storage), platform, title, thumbnail_url
- transcript, transcript_segments (JSONB)
- visual_analysis (JSONB — ranked elements from Gemini)
- status (pending/processing/completed/failed), error_message
- created_at

**Extend `client_knowledge_entries`:** Ideas saved from generation go here as type='idea' (existing behavior).

### API Routes

- `POST /api/ideas/generate` — generate ideas (with optional reference video context)
- `POST /api/ideas/generate-script` — generate script for an idea
- `POST /api/ideas/reject` — save rejected idea as negative example
- `POST /api/reference-videos` — upload/create reference video
- `POST /api/reference-videos/[id]/process` — trigger transcription + analysis
- `GET /api/reference-videos` — list reference videos (optional client filter)

### AI Integrations

| Service | Model | Purpose |
|---------|-------|---------|
| OpenRouter | Claude Sonnet 4.5 | Idea generation, script writing |
| Groq | whisper-large-v3 | Video audio transcription |
| Google AI Studio | Gemini 2.5 Flash | Video visual analysis |

### Env Vars

- `GOOGLE_AI_STUDIO_KEY` — already provided
- `GROQ_API_KEY` — check if exists, reuse from TikTok scraper
- `OPENROUTER_API_KEY` — existing

## Tech Stack

Existing: Next.js 15, Supabase, Tailwind v4, lucide-react, sonner, React Flow (moodboard)
New: @google/generative-ai (Gemini SDK)
