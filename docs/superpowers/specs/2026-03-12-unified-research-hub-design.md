# Unified Research Hub

> Combine brand research, topic research, and video idea generation into a single page with wizard-driven flows and a unified history feed.

## Overview

The existing search page at `/admin/search/new` becomes the single entry point for all research and idea generation. Two action cards launch step-by-step wizard modals. A unified history feed below shows all past searches and generations in one filterable list.

### Goals

- Eliminate the separate `/admin/ideas` entry point for generation — everything starts from one page
- Reduce cognitive load: two clear actions (Research, Video ideas) instead of three scattered paths
- Unified history makes it easy to find any past research or generation regardless of type

### Non-goals

- Redesigning the search results page (`/admin/search/[id]`)
- Redesigning the idea results page (`/admin/ideas/[id]`) — separate spec
- Changing the underlying API routes or data model

## Page structure

Route: `/admin/search/new` (unchanged)

Three vertical zones:

1. **Header** — "What would you like to research today?"
2. **Action cards** — two SpotlightCard components side by side
3. **History feed** — unified chronological list with filters

### Action cards

Two cards, equal width, using ReactBits `SpotlightCard` for hover effect:

**Research card (left):**
- Icon, "Research" title, "Search what people are saying about a brand or topic" description
- "Start research" CTA button (blue accent)
- Clicking opens the research wizard modal

**Video ideas card (right):**
- Icon, "Video ideas" title, "Generate content ideas powered by AI + knowledge" description
- "Generate ideas" CTA button (amber accent)
- Clicking opens the ideas wizard modal

## Wizard modals

Both wizards share a common modal shell component with:
- Centered overlay with backdrop blur
- `FadeContent` (ReactBits) transitions between steps
- `Stepper` (ReactBits) progress bar at the top
- Escape key or backdrop click to close
- Accent color matches wizard type (blue for research, amber for ideas)

### Research wizard (2 steps)

**Step 1 — Mode and target:**
- Segmented toggle: "Brand intel" (default) / "Topic research"
- **Brand intel mode:** Client combobox selector (required)
- **Topic research mode:** Text input for search query + client combobox (optional, labeled "Attach to a client")
- Below client selector: "or paste a link instead" — swaps client selector for a URL text input. "or select a client" swaps back. These are mutually exclusive — selecting a client clears the URL and vice versa.
- Next button (disabled until required fields filled)

**Step 2 — Confirm and run:**
- Summary of what will be researched (client name or URL, mode)
- "Run research" button
- On submit: creates `topic_search` record via existing flow, closes modal
- Toast confirms "Research started"
- Item appears in history feed with processing spinner

### Video ideas wizard (2 steps)

**Step 1 — Select client:**
- Client combobox (required)
- Next button

**Step 2 — Shape ideas (all optional):**
- Concept/direction text input
- Count presets: 5 / 10 / 15 / 20 (default 10)
- Reference video area: paste a URL to a reference video. Uses the existing `POST /api/reference-videos` endpoint which accepts `{ client_id, url }` and returns a `reference_video_id` for the generate request. File upload is out of scope for this spec.
- "Skip & generate" button (uses defaults) or "Generate" button
- On submit: the wizard shows a loading state (spinner + "Generating ideas..." text, buttons disabled) while `POST /api/ideas/generate` runs (up to ~120s). On success, closes modal and redirects to `/admin/ideas/[generationId]`. On error, shows an error message in the wizard with a retry button.

### Post-submit behavior

After submitting a research wizard, the user stays on the page. The new item is optimistically inserted into the history feed with a "Processing" state. A `router.refresh()` call revalidates server data once processing completes (detected via polling the search status). The user can immediately open another wizard to run a second search or generation in parallel.

After submitting an ideas wizard, the user is redirected to the results page at `/admin/ideas/[id]`.

## History feed

### Inline feed (on page)

**Header row:** "Recent history" on left, "View all history" link on right.

**Filter bar:**
- Type pills (segmented toggle): All / Brand intel / Topic / Ideas — "All" selected by default
- Client dropdown: "All clients" default, lists active clients

**Feed items:** Rendered with ReactBits `AnimatedList` for staggered entrance. Each row contains:
- Type icon (search icon for brand/topic, sparkle for ideas)
- Title: search query for research, "X video ideas" for generations (concept in quotes if provided)
- Colored type badge: purple for Brand intel, blue for Topic, amber for Ideas
- Relative timestamp
- Client name (if attached)
- Processing state: spinner + "Processing" badge for in-progress items (not clickable until complete)

**Click behavior:** Navigates to `/admin/search/[id]` for research results, `/admin/ideas/[id]` for idea generations.

**Data:** Server-side merged query of `topic_searches` and `idea_generations`, sorted by `created_at DESC`, limited to 10. The server fetches 10 from each table, merges, sorts, and takes the top 10. For the full history modal, cursor-based pagination uses the same approach: fetch N from each table where `created_at < cursor`, merge, sort, take N.

### Full history modal

Triggered by "View all history" link. Opens a large centered modal (not a new route):
- X button to close
- Same filter bar (type pills + client dropdown)
- Infinite scroll with `AnimatedList` staggered entrance (loads 20 at a time, cursor-based pagination by `created_at`)
- Same row format as the inline feed

## Component architecture

| File | Type | Purpose |
|------|------|---------|
| `app/admin/search/new/page.tsx` | Server | Fetches clients + recent history, renders page |
| `components/research/research-hub.tsx` | Client | Main layout: header, cards, feed. Manages wizard open state |
| `components/research/wizard-shell.tsx` | Client | Shared modal shell: backdrop, Stepper, FadeContent, close |
| `components/research/research-wizard.tsx` | Client | Research wizard (2 steps) |
| `components/research/ideas-wizard.tsx` | Client | Video ideas wizard (2 steps) |
| `components/research/history-feed.tsx` | Client | Filtered history list (used inline and in modal) |
| `components/research/history-modal.tsx` | Client | Full history modal wrapper with pagination |

## Data flow

### History query

No new API route needed. The server component in `page.tsx` queries both tables and merges:

```
topic_searches: id, query, search_mode, status, client_id, created_at, clients(name)
idea_generations: id, concept, count, status, client_id, created_at, clients(name)
```

Merged into a unified type:

```typescript
type HistoryItem = {
  id: string;
  type: 'brand_intel' | 'topic' | 'ideas';
  title: string;
  status: string;
  clientName: string | null;
  clientId: string | null;
  createdAt: string;
  href: string; // /admin/search/[id] or /admin/ideas/[id]
};
```

Filters (type, client) applied as search params, handled server-side.

### Submissions

- Research: uses existing two-step flow — `POST /api/search/start` (creates `topic_search` record, returns `id`) then `POST /api/search/[id]/process` (kicks off AI analysis). The wizard calls both sequentially on submit.
- Ideas: uses existing `POST /api/ideas/generate`

No new API routes. No database changes.

### Type mapping

The database `topic_searches.search_mode` column stores `'client_strategy'` and `'general'`. These map to display types:
- `client_strategy` → `brand_intel` (purple badge, "Brand intel")
- `general` → `topic` (blue badge, "Topic")
- `idea_generations` rows → `ideas` (amber badge, "Ideas")

## Animations

- **Card hover:** SpotlightCard spotlight effect
- **Wizard open/close:** Modal fades in with backdrop blur, content scales up slightly
- **Wizard step transitions:** FadeContent with directional slide (forward = slide left, back = slide right)
- **Stepper:** Animated progress bar fill between steps
- **History feed:** AnimatedList staggered entrance on load
- **Processing items:** Subtle pulse animation on the spinner

## Migration

- `/admin/ideas` page continues to work (for direct links and the ideas results page)
- `/admin/ideas/generate` already redirects to `/admin/ideas` — no change needed
- Sidebar "Ideas" nav item remains — it serves the ideas results pages and saved ideas library
- "Search" sidebar item remains, pointing to `/admin/search/new`
