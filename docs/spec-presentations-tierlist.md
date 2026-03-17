# Presentations & Tier List Builder — PRD

## Problem

The Nativz team needs a centralized place to store and create client-facing presentations, and a visual tier list builder for ranking video content during calls. Currently, presentations live in scattered Google Slides/Docs, and tier ranking happens verbally without a visual tool.

## Solution

Two new features under a **"Present"** sidebar section:

### 1. Presentations

A storage and creation hub for client presentations. Each presentation is a collection of ordered slides with titles, content (markdown), and optional images/embeds.

**Core features:**
- List view of all presentations with client association, date, status
- Create/edit presentations with a slide-based editor
- Each slide: title, rich text body (markdown), optional image URL, optional embed URL
- Assign presentations to clients
- Duplicate, archive, delete presentations
- Full-screen presentation mode for calls (arrow key navigation)

**Data model — `presentations` table:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `title` | text | Presentation title |
| `description` | text | Optional description |
| `client_id` | uuid | Optional client FK |
| `created_by` | uuid | FK to auth.users |
| `slides` | jsonb | Array of `{ title, body, image_url, embed_url, notes }` |
| `status` | text | `'draft'` / `'ready'` / `'archived'` |
| `tags` | text[] | Freeform tags |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

### 2. Tier List Builder

A fully customizable visual tier list for ranking video content on calls. Users input video links, the system captures thumbnails, and items are dragged into ranked tiers.

**Core features:**
- Create/edit tier lists with custom title and description
- Customizable tiers: default S/A/B/C/D/E/F, but add/remove/rename/recolor any tier
- Add items via URL (video link) — system extracts thumbnail via oEmbed/OpenGraph
- Each item: URL, title (editable), thumbnail URL, optional notes
- Drag-and-drop items between tiers
- Items start in an "Unranked" pool
- Assign tier lists to clients
- Full-screen view mode for calls
- Export as image (future)

**Data model — `tier_lists` table:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `title` | text | Tier list title |
| `description` | text | Optional description |
| `client_id` | uuid | Optional client FK |
| `created_by` | uuid | FK to auth.users |
| `tiers` | jsonb | Array of `{ id, name, color }` — ordered |
| `items` | jsonb | Array of `{ id, url, title, thumbnail_url, tier_id, position, notes }` |
| `status` | text | `'draft'` / `'ready'` / `'archived'` |
| `tags` | text[] | Freeform tags |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto |

**Default tiers:**
```json
[
  { "id": "s", "name": "S", "color": "#ff7f7f" },
  { "id": "a", "name": "A", "color": "#ffbf7f" },
  { "id": "b", "name": "B", "color": "#ffdf7f" },
  { "id": "c", "name": "C", "color": "#ffff7f" },
  { "id": "d", "name": "D", "color": "#bfff7f" },
  { "id": "e", "name": "E", "color": "#7fbfff" },
  { "id": "f", "name": "F", "color": "#7f7fff" }
]
```

## Sidebar

Add a new **"Present"** section between "Content" and "Manage" with:
- **Presentations** (`/admin/presentations`) — Presentation icon
- **Tier lists** (`/admin/tier-lists`) — ListOrdered icon

## Routes

- `/admin/presentations` — List all presentations
- `/admin/presentations/new` — Create presentation
- `/admin/presentations/[id]` — Edit presentation
- `/admin/presentations/[id]/present` — Full-screen presentation mode
- `/admin/tier-lists` — List all tier lists
- `/admin/tier-lists/new` — Create tier list
- `/admin/tier-lists/[id]` — Edit tier list (the builder)

## API Routes

- `GET/POST /api/presentations` — List/create
- `GET/PUT/DELETE /api/presentations/[id]` — CRUD single
- `GET/POST /api/tier-lists` — List/create
- `GET/PUT/DELETE /api/tier-lists/[id]` — CRUD single
- `POST /api/tier-lists/extract-thumbnail` — Extract thumbnail from URL via OpenGraph

## Tech Notes

- Thumbnail extraction: fetch the URL server-side, parse `og:image` from HTML `<meta>` tags
- Drag-and-drop: use native HTML drag-and-drop API (no extra deps)
- Presentation mode: full-screen div with keyboard navigation
- All JSONB fields null-safe with `?? []` defaults
- RLS: admin-only for both tables
