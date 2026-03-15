# Search Ideas Wizard — Design Spec

## Problem

When a user clicks "Create video ideas" from a completed topic search, it currently navigates to the Ideas Hub with a `search_id` query param. This loses the context of the search results page and drops the user into a generic flow. The user needs a focused, contextual wizard that stays on the search results page and leverages the search data directly.

## Solution

A 2-step modal wizard (`WizardShell`) that opens on top of the search results page. It mirrors the existing `IdeasWizard` functionality but is contextual — it knows the `search_id` and pre-selects the attached client.

## Wizard Steps

### Step 1: "Who are the ideas for?"

- `ClientPickerButton` component for client selection
- Pre-selected with the search's attached client (if any)
- "No client" option remains available
- No URL/website mode — the search data is the source context
- "Next" button advances to step 2

### Step 2: "Shape your ideas"

- **Concept/direction** — text input for steering content direction (e.g. "behind the scenes", "day in the life")
- **Count presets** — 5 / 10 / 15 / 20 + custom input (1–50 range)
- **Reference video URLs** — paste URLs, processed via `POST /api/reference-videos` (same as IdeasWizard)
- **Back** button returns to step 1
- **Skip & generate** shortcut — generates with defaults (no concept, count 10, no references)
- **Generate** button — generates with current settings

## API

Same `POST /api/ideas/generate` endpoint with body:

```json
{
  "search_id": "<from props — always present>",
  "client_id": "<selected or null>",
  "concept": "<optional string>",
  "count": 10,
  "reference_video_ids": ["<optional uuids>"]
}
```

Response: `{ id: string, status: 'processing' }`

## Behavior

- On generate: toast "Generating ideas in the background" → close modal → navigate to `/admin/ideas/{id}`
- Uses `WizardShell` with purple accent (`#a855f7`)
- Escape key closes the modal
- Error state shown inline with retry option

## Files

### New

- `components/research/search-ideas-wizard.tsx` — the wizard component

### Modified

- `app/admin/search/[id]/results-client.tsx` — wire "Create video ideas" button to open the wizard modal instead of navigating away; pass `searchId` and `clientId` props
- `app/admin/search/[id]/page.tsx` — fetch clients list from Supabase and pass to `ResultsClient`

## Component Props

```typescript
interface SearchIdeasWizardProps {
  open: boolean;
  onClose: () => void;
  searchId: string;
  clientId: string | null;        // pre-selected client from the search
  clients: ClientOption[];         // full client list for the picker
  onStarted?: (item: {
    id: string;
    concept: string | null;
    clientName: string | null;
  }) => void;
}
```

## Dependencies

- `WizardShell` — existing reusable wizard modal container
- `ClientPickerButton` — existing client selection component
- `GlassButton` — existing styled button
- `/api/reference-videos` — existing reference video processing endpoint
- `/api/ideas/generate` — existing idea generation endpoint
