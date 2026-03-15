# Knowledge Base Overhaul — PRD

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the knowledge base into an Obsidian-style client vault system with a proper graph view, structured data ingestion, meeting import, and deep integration across all AI tools (Nerd, topic search, ideation).

**Architecture:** Each client gets a vault — a collection of structured markdown entries linked via `[[wikilinks]]`. The UI mirrors Obsidian: file explorer sidebar, markdown editor with live preview, and a force-directed graph view with animated connectors. All AI tools (Nerd, topic search, idea generator) read from and write to the vault. External agents connect via the existing v1 API.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, Canvas 2D (graph), CodeMirror 6 (markdown editor), existing OpenRouter AI pipeline.

---

## Phase 1: Structured Data Ingestion

### Current problem
The scraper dumps raw website text into `content` as-is. Brand profiles are one giant markdown blob. There's no structured extraction — no separation of products, team members, FAQs, testimonials, etc.

### Task 1: Add structured scraper post-processing

**Files:**
- Modify: `lib/knowledge/scraper.ts`
- Create: `lib/knowledge/structurer.ts`

After the scraper crawls pages, run each page through an AI structuring pass that:
1. Identifies the page type (about, services, team, FAQ, testimonials, contact, blog, product, pricing, legal, other)
2. Extracts structured entities: people (name + role), products/services (name + description + price), locations (address), FAQs (question + answer), testimonials (quote + author)
3. Stores the page type in `metadata.page_type`
4. Stores extracted entities in `metadata.entities` as typed arrays
5. Rewrites `content` as clean structured markdown with `[[wikilinks]]` to other pages and entities

The structurer should:
- Accept a raw page content string + list of existing entry titles
- Call Claude with a structured extraction prompt
- Return: `{ pageType, entities, structuredContent }`
- Use a modest token budget (2K max per page) to keep costs low

Update the scraper to call `structurePageContent()` after extracting readable text, before creating the knowledge entry.

### Task 2: Create entity auto-linking

**Files:**
- Create: `lib/knowledge/entity-linker.ts`
- Modify: `lib/knowledge/queries.ts`

After structuring, automatically create knowledge links between:
- Pages that mention the same person → link both to that person's contact (if exists) or create a note entry for them
- Pages that reference the same product/service → link via shared entity
- Pages with matching FAQ topics → cross-link

Add a function `autoLinkEntities(clientId, newEntryId)` that:
1. Reads the new entry's `metadata.entities`
2. Searches existing entries for matching entity names (fuzzy, case-insensitive)
3. Creates `client_knowledge_links` with label `shared_entity:{type}:{name}`

### Task 3: Meeting notes import

**Files:**
- Create: `lib/knowledge/meeting-importer.ts`
- Create: `app/api/clients/[id]/knowledge/import-meeting/route.ts`

Accept meeting transcripts (plain text or markdown) from Fyxer.AI or manual paste:
1. API route accepts `POST { transcript: string, meetingDate?: string, attendees?: string[] }`
2. Runs through Claude to extract: action items, decisions made, key topics discussed, people mentioned, follow-ups
3. Creates a knowledge entry with type `meeting_note` (new type)
4. Structures content as markdown with sections: Summary, Attendees, Key Decisions, Action Items, Topics Discussed
5. Auto-links to existing entries and contacts via entity linker
6. Adds `[[wikilinks]]` to referenced entries

Update `lib/knowledge/types.ts`:
- Add `meeting_note` to `KnowledgeEntryType`
- Add `MeetingNoteMetadata` shape: `{ meeting_date, attendees, action_items, source: 'fyxer' | 'manual' }`

---

## Phase 2: Obsidian-Style Vault UI

### Task 4: Vault page layout with file explorer

**Files:**
- Rewrite: `app/admin/clients/[slug]/knowledge/page.tsx`
- Create: `components/knowledge/VaultLayout.tsx`
- Create: `components/knowledge/FileExplorer.tsx`
- Create: `components/knowledge/VaultHeader.tsx`

Replace the current full-screen graph with a 3-pane layout:

```
┌─────────────────────────────────────────────────┐
│  VaultHeader: client name, search, view toggle  │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│  File    │   Main content area                  │
│  Explorer│   (editor OR graph view)             │
│  240px   │                                      │
│          │                                      │
│  ─────── │                                      │
│  Types   │                                      │
│  ─────── │                                      │
│  Recent  │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

**VaultHeader:**
- Back arrow + "{Client Name}'s vault" title
- Search input (filters file explorer + highlights in graph)
- View toggle: Editor | Graph (pill toggle, like Obsidian)
- "New entry" button + "Import" dropdown (Scrape website, Import meeting, Manual note)

**FileExplorer:**
- Collapsible tree grouped by entry type (folders):
  - Brand Profile
  - Web Pages
  - Meeting Notes
  - Notes
  - Documents
  - Ideas
- Each folder shows count badge
- Entries sorted alphabetically within folders
- Click entry → opens in editor pane
- Right-click → context menu (Rename, Delete, Copy link)
- Active entry highlighted with accent bg
- Small colored dot per entry matching type color from graph
- Search filters entries in real-time

### Task 5: Markdown editor with live preview

**Files:**
- Create: `components/knowledge/EntryEditor.tsx`
- Create: `components/knowledge/MarkdownPreview.tsx`

The main content area when in Editor view:

**EntryEditor:**
- Split pane: raw markdown left, rendered preview right (toggleable)
- Entry title as editable h1 at top
- Metadata bar below title: type badge, source badge, created date, word count
- Markdown textarea with:
  - `[[` trigger → autocomplete dropdown of entry titles (like Obsidian)
  - Syntax highlighting for headings, bold, links, wikilinks
  - Tab key inserts 2 spaces
  - Auto-save after 1.5s of inactivity (debounced PATCH to API)
  - "Saving..." / "Saved" indicator in header
- Backlinks section at bottom: list of entries that link TO this entry via wikilinks

**MarkdownPreview:**
- Renders markdown to HTML
- Wikilinks render as clickable blue links that navigate to that entry in the editor
- Code blocks, tables, lists all styled to match dark theme
- Images render inline (if URLs in content)

### Task 6: Redesigned graph view

**Files:**
- Rewrite: `components/knowledge/KnowledgeGraph.tsx`
- Create: `components/knowledge/GraphControls.tsx`

When the view toggle is set to Graph, the main content area shows:

**Improved graph rendering:**
- WebGL or Canvas 2D with proper force simulation (not the simple 200-iteration static layout)
- **Continuous animation**: nodes gently float and settle, not static
- **Animated edges**: curved lines with subtle pulse animation along the path (like data flowing)
- **Node sizing**: proportional to connection count (more links = bigger node)
- **Node labels**: always visible for nodes above a size threshold, hover for smaller ones
- **Cluster coloring**: nodes of the same type cluster together with a faint background halo
- **Zoom-to-fit**: auto-fits all nodes on initial load
- **Click node** → opens entry in editor view (switches view)
- **Hover node** → highlight all connected edges and neighbor nodes, dim everything else
- **Right-click node** → context menu (Open, Delete, View connections)

**GraphControls (overlay, bottom-right):**
- Zoom slider
- "Fit to view" button
- Filter checkboxes by type (toggle visibility)
- Edge label toggle
- Physics toggle (pause/resume simulation)

**Edge rendering:**
- Curved bezier lines (not straight)
- Color gradient from source to target node color
- Wikilink edges: solid line
- Generated-from edges: dashed line
- Shared-entity edges: dotted line
- Label shown on hover (e.g., "wikilink", "generated_from", "shared_entity:person:John")

### Task 7: Entry creation and import modals

**Files:**
- Create: `components/knowledge/NewEntryModal.tsx`
- Create: `components/knowledge/ImportMeetingModal.tsx`
- Create: `components/knowledge/ScrapeModal.tsx`

**NewEntryModal:**
- Title input
- Type selector (note, document, idea)
- Content textarea (markdown)
- Create button

**ImportMeetingModal:**
- Large textarea for pasting transcript
- Optional: meeting date picker, attendees tags input
- Source selector: Fyxer.AI / Manual / Other
- "Import & Structure" button → calls meeting import API → shows progress

**ScrapeModal:**
- Shows client website URL
- Max pages slider (1-100)
- Max depth slider (1-5)
- Checkbox: "Structure content with AI" (default on)
- "Start crawl" button → shows real-time progress

---

## Phase 3: AI Tool Integration

### Task 8: Knowledge-aware topic search

**Files:**
- Modify: `lib/prompts/topic-research.ts`
- Modify: `lib/prompts/client-strategy.ts`
- Modify: `app/api/search/[id]/process/route.ts`

When a topic search runs for a client, inject relevant knowledge base context:
1. In the search processing route, fetch the client's brand profile and top 5 most-connected entries
2. Add a `<knowledge_base>` XML block to the prompt containing:
   - Brand profile summary (first 2000 chars)
   - Key entities extracted from structured entries (products, team members, FAQs)
   - Recent meeting notes summaries (if any)
3. Instruct the AI to reference knowledge base context when generating video ideas
4. After search completes, auto-create a knowledge entry of type `note` titled "Research: {query}" with the search summary, and link it to the client's vault

### Task 9: Knowledge-aware Nerd chat

**Files:**
- Modify: `app/api/nerd/chat/route.ts`
- Modify: `lib/nerd/tools/knowledge.ts`

Enhance the Nerd's knowledge integration:
1. When a client is @mentioned, include their full brand profile + structured entity summaries (not just raw entries)
2. Add new Nerd tools:
   - `search_knowledge_base` — semantic search across a client's entries (keyword + type filter)
   - `create_knowledge_note` — create a new note in a client's vault from conversation context
   - `import_meeting_notes` — trigger meeting import from a pasted transcript
3. Update the system prompt to tell the Nerd it has access to client vaults and should reference specific entries when answering questions about clients

### Task 10: Knowledge-aware idea generator

**Files:**
- Modify: `lib/knowledge/idea-generator.ts`

Update `generateVideoIdeas()` to:
1. Include structured entities from the knowledge base (products, FAQs, team members)
2. Include meeting note action items and topics as potential idea seeds
3. Reference specific knowledge entries in the idea output (e.g., "Based on [[About Us - Brand]] and [[Q3 Strategy Meeting]]")
4. After generating ideas, create a knowledge entry of type `idea` for each generated idea and link it to source entries

### Task 11: External API enhancements

**Files:**
- Modify: `app/api/v1/clients/[id]/knowledge/route.ts`
- Create: `app/api/v1/clients/[id]/knowledge/search/route.ts`
- Create: `app/api/v1/clients/[id]/knowledge/import/route.ts`

Add new v1 API endpoints for external agent integration:
1. `POST /api/v1/clients/{id}/knowledge/search` — keyword search across vault entries
   - Params: `{ query: string, type?: string, limit?: number }`
   - Returns matching entries with relevance scoring
2. `POST /api/v1/clients/{id}/knowledge/import` — import content (meeting notes, documents)
   - Params: `{ content: string, type: 'meeting_note' | 'note' | 'document', title?: string, metadata?: object }`
   - Runs through structurer, creates entry, auto-links
3. Update existing `GET /api/v1/clients/{id}/knowledge` to support:
   - `?search=keyword` query param for filtering
   - `?include_links=true` to include link data
   - `?include_entities=true` to include extracted entities from metadata

Update the API docs page at `/admin/nerd/api` to document new endpoints.

---

## Phase 4: Database & Infrastructure

### Task 12: Database migrations

**Files:**
- Create: Supabase migration

Add `meeting_note` to the knowledge entry type enum (if using an enum, otherwise it's just a string).

Add a text search index for knowledge entry content:
```sql
CREATE INDEX idx_knowledge_entries_search
ON client_knowledge_entries
USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));
```

Add a function for keyword search:
```sql
CREATE OR REPLACE FUNCTION search_knowledge_entries(
  p_client_id uuid,
  p_query text,
  p_type text DEFAULT NULL,
  p_limit int DEFAULT 20
) RETURNS SETOF client_knowledge_entries AS $$
  SELECT * FROM client_knowledge_entries
  WHERE client_id = p_client_id
    AND (p_type IS NULL OR type = p_type)
    AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
        @@ plainto_tsquery('english', p_query)
  ORDER BY ts_rank(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
    plainto_tsquery('english', p_query)
  ) DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
```

---

## Implementation Priority

1. **Phase 4** (Task 12) — Database first, everything depends on it
2. **Phase 1** (Tasks 1-3) — Structured data makes everything else better
3. **Phase 2** (Tasks 4-7) — The UI overhaul, biggest visual impact
4. **Phase 3** (Tasks 8-11) — AI integration, highest long-term value

---

## Design Notes

- **Dark theme**: all new components use existing tokens (`bg-surface`, `bg-background`, `border-nativz-border`, `text-primary/secondary/muted`)
- **Animations**: stagger fade-in for file explorer items, smooth transitions on view toggle, graph nodes animate on load
- **Graph colors**: keep existing type-to-color mapping from `KnowledgeGraph.tsx`
- **Obsidian feel**: the vault should feel like a second brain for each client — interconnected, searchable, alive with connections
- **File explorer width**: 240px, collapsible to 0 with a rail (like the main sidebar pattern)
- **Wikilink autocomplete**: trigger on `[[`, show dropdown of entry titles filtered by typed text, insert `[[Title]]` on select
