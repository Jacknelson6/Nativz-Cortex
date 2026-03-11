# Client Knowledge System — Design Doc

**Date:** 2026-03-11
**Status:** Approved

## Overview

A per-client knowledge system that stores brand context, scraped web content, documents, notes, and ideas as interconnected entries. Features a knowledge graph visualization, AI-powered brand profile generation, website scraping pipeline, and a lightweight idea generator tool. All data syncs to the Obsidian vault with native wiki-links.

## Decisions

- **Storage:** Hybrid — Supabase as primary store, Obsidian vault as synced mirror
- **Architecture:** Two tables (entries + links) with polymorphic references to existing tables
- **Graph UI:** Read-only ReactFlow explorer (click to view, no edit-on-graph)
- **Scraping:** Full site crawl up to 3 levels deep, max 50 pages, using Cloudflare BR Crawl
- **Idea generator:** Dual UI — client profile tab + Nerd tool, same backend
- **Existing data:** Referenced via foreign keys, no duplication

---

## 1. Data Model

### `client_knowledge_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `client_id` | uuid (FK → clients) | Required |
| `type` | text | `brand_asset`, `brand_profile`, `document`, `web_page`, `note`, `idea` |
| `title` | text | Display name |
| `content` | text | Markdown body |
| `metadata` | jsonb | Type-specific: colors array, source_url, file_url, etc. |
| `source` | text | `manual`, `scraped`, `generated`, `imported` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `created_by` | uuid (FK → auth.users) | Nullable |

### `client_knowledge_links`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `client_id` | uuid (FK → clients) | Denormalized for fast per-client queries |
| `source_id` | uuid | The "from" node |
| `source_type` | text | `entry`, `contact`, `search`, `strategy`, `idea_submission` |
| `target_id` | uuid | The "to" node |
| `target_type` | text | Same enum as source_type |
| `label` | text | Relationship label: `related_to`, `inspired_by`, `authored_by`, etc. |
| `created_at` | timestamptz | |

**Unique constraint:** `(source_id, source_type, target_id, target_type)`

**RLS:** Admin full access. Portal users read-only, scoped by organization_id through clients.

### Knowledge Entry Types

| Type | Source | Description |
|------|--------|-------------|
| `brand_asset` | manual/imported | Logos, colors, fonts, style guidelines |
| `brand_profile` | generated/manual | AI-generated or hand-written brand summary |
| `document` | imported | PDFs, briefs, contracts |
| `web_page` | scraped | Content extracted from client website |
| `note` | manual | Freeform markdown notes |
| `idea` | generated/manual | Video ideas and content concepts |

### External Node Types (referenced via links, not stored in entries)

- `contact` → `contacts` table
- `search` → `topic_searches` table
- `strategy` → `client_strategies` table
- `idea_submission` → `idea_submissions` table

---

## 2. Web Scraping Pipeline

### Flow

1. **Trigger** — "Scrape website" button on client profile, or automatic during onboarding
2. **Endpoint** — `POST /api/clients/[id]/knowledge/scrape`
3. **Crawl logic** (`lib/knowledge/scraper.ts`):
   - Check sitemap.xml first for page discovery
   - Fall back to Cloudflare BR Crawl endpoint for JS-rendered sites
   - Follow internal links up to 3 levels deep, max 50 pages
   - Extract readable content via `@mozilla/readability`
   - Deduplicate by URL
4. **Storage** — Each page → `client_knowledge_entries` row with `type: 'web_page'`
5. **Auto-linking** — Create edges between pages that reference each other via internal links
6. **Vault sync** — Non-blocking sync to `Clients/{name}/Knowledge/Web/`

### Cloudflare BR Crawl

```
POST /accounts/{account_id}/browser-rendering/crawl
{ "url": "https://clientsite.com", "maxPages": 50, "renderJs": true }
```

### Safety

- One crawl at a time per client (tracked in metadata)
- 1-second delay between page fetches
- Skip non-HTML resources (PDFs stored as `document` type)
- Max 50 pages default, configurable per client

---

## 3. Brand Profile Generation

### Flow

1. **Trigger** — Button on profile, onboarding step, or Nerd tool
2. **Endpoint** — `POST /api/clients/[id]/knowledge/brand-profile`
3. **Data gathering:**
   - Client record (industry, audience, voice, keywords, preferences)
   - Scraped web pages (if available)
   - Contacts, social profiles, logo URL
   - Latest strategy (if exists)
4. **AI generation** — Claude produces structured brand profile:
   - Brand identity (mission, values, positioning)
   - Voice & tone (style, vocabulary, do's/don'ts)
   - Visual identity (colors, typography, imagery style)
   - Target audience (demographics, psychographics, pain points)
   - Content themes (core topics, pillars, seasonal angles)
   - Competitive positioning
5. **Storage** — `type: 'brand_profile'`, `source: 'generated'`
6. **Auto-linking** — Links to scraped pages, strategy, key contacts
7. **Regeneration** — Old profile gets `metadata.superseded_by`, new one created

---

## 4. Knowledge Graph Renderer

### Route

`/admin/clients/[slug]/knowledge` — new tab on client profile

### Components

- **`KnowledgeGraph`** — ReactFlow canvas, auto-layout via dagre
- **`KnowledgeNodeCard`** — Custom node with icon, title, snippet. Color-coded by type:
  - Brand profile → blue
  - Web page → green
  - Note → yellow
  - Document → purple
  - Contact → orange
  - Research → teal
  - Strategy → red
  - Idea → pink
- **`KnowledgePanel`** — Slide-out side panel on node click. Full content, metadata, linked entries, edit button
- **`KnowledgeToolbar`** — Type filters, search, add entry, scrape, generate profile buttons

### Data Flow

1. `GET /api/clients/[id]/knowledge` returns entries, links, and external nodes
2. External nodes fetched from contacts, topic_searches, client_strategies, idea_submissions
3. Auto-layout with dagre (hierarchical), force-directed option
4. Positions not persisted (re-layouts on reload)

### Interactions

- Click node → open side panel
- Hover node → highlight connected edges and neighbors
- Filter toolbar → toggle node types
- Search → highlight matches, dim others
- Pan/zoom → built into ReactFlow

---

## 5. Integration Points

### Nerd Chat

- **New tool: `query_client_knowledge`** — Search knowledge base by keyword/type for @mentioned client
- **New tool: `generate_brand_profile`** — Trigger brand profile generation
- **Context injection** — Expand `buildClientSummary()` to include knowledge summary (entry counts, brand profile excerpt, recent entries)

### Topic Searches

- Expand `buildTopicResearchPrompt()` with `<client_knowledge>` block:
  - Brand profile content
  - Top 5 relevant scraped pages
  - Past idea history

### Moodboards

- Surface brand profile's visual identity section (colors, imagery style) as reference panel when viewing a board for a client

### API (v1)

- `GET /api/v1/clients/:id/knowledge` — List entries
- `GET /api/v1/clients/:id/knowledge/:entryId` — Get entry
- `POST /api/v1/clients/:id/knowledge` — Create entry
- `GET /api/v1/clients/:id/knowledge/graph` — Entries + links for graph

---

## 6. Idea Generator

### Purpose

Lightweight, brand-aware alternative to full topic searches. Draws from client knowledge base and history instead of SERP data.

### UI — Client Profile

Route: `/admin/clients/[slug]/ideas/generate`

**Inputs:** Client (pre-selected), concept/theme (optional), number of ideas (5/10/15)

**Output:** Card grid with title/hook, description, suggested format, content pillar tag, save button

### Nerd Tool

`generate_video_ideas` — same backend, conversational interface

### Backend

`POST /api/clients/[id]/knowledge/generate-ideas`

**Data gathered:**
- Brand profile entry
- Last 10 topic searches (trending topics + video ideas)
- Past saved ideas (for deduplication)
- Content logs (published content)
- Strategy content pillars
- Scraped web content (key pages)
- Optional concept input

**Output:** JSON array of idea objects → displayed as cards, saveable as knowledge entries

### Comparison

| | Topic Search | Idea Generator |
|---|---|---|
| Sources | Brave SERP + web + forums | Client knowledge base |
| Speed | 15-30 seconds | 5-10 seconds |
| Depth | Multi-faceted trend analysis | Quick actionable ideas |
| Best for | Discovering what's trending | Prepping for a specific shoot |

---

## 7. Vault Sync & Obsidian Structure

### Path Structure

```
Clients/{ClientName}/
├── Knowledge/
│   ├── Brand Profile.md
│   ├── Notes/{title}.md
│   ├── Web/{page-title}.md
│   ├── Documents/{title}.md
│   └── Ideas/{title}.md
├── Research/          (existing)
├── Strategy/          (existing)
└── Content Logs/      (existing)
```

### Wiki-Links

Entries with links in `client_knowledge_links` render as Obsidian wiki-links:

```markdown
## Related
- [[Brand Profile]]
- [[Research/summer fitness trends 2026]]
- [[Web/about-us]]
```

### Sync Triggers

- Entry created/updated/deleted → sync that file
- Links changed → update `## Related` section in affected entries
- Brand profile generated → sync immediately
- Scrape completed → batch sync all new web pages
- All syncs non-blocking (existing pattern)
