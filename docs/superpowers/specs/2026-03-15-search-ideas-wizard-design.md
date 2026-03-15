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

### Backend change required

The existing Zod `.refine()` in `app/api/ideas/generate/route.ts` requires either `client_id` or `url`:

```typescript
.refine((d) => d.client_id || d.url, { message: 'Either client_id or url is required' })
```

This must be updated to also accept `search_id` as a valid source:

```typescript
.refine((d) => d.client_id || d.url || d.search_id, {
  message: 'Either client_id, url, or search_id is required',
})
```

## Behavior

- On generate: toast "Generating ideas in the background" → close modal → navigate to `/admin/ideas/{id}`
- Uses `WizardShell` with purple accent (`#a855f7`)
- Escape key closes the modal
- Error state shown inline with retry option, loading spinner on Generate button, buttons disabled during API call
- All state (step, concept, count, references, error) resets when modal closes
- Reference video input hidden when no client is selected (matches IdeasWizard behavior — `/api/reference-videos` requires `client_id`)
- Both steps rendered as direct children of `WizardShell` (it manages visibility by child index + `currentStep`)

## Files

### New

- `components/research/search-ideas-wizard.tsx` — the wizard component

### Modified

- `app/admin/search/[id]/results-client.tsx` — wire "Create video ideas" button to open the wizard modal instead of navigating away; add `clients` to props interface
- `app/admin/search/[id]/page.tsx` — fetch clients list (`select('id, name, logo_url, agency').from('clients').eq('is_active', true)`) and pass as `clients` prop to `ResultsClient`
- `app/api/ideas/generate/route.ts` — update Zod `.refine()` to accept `search_id` as valid source

## Component Props

```typescript
import { type ClientOption } from '@/components/ui/client-picker';

interface SearchIdeasWizardProps {
  open: boolean;
  onClose: () => void;
  searchId: string;
  clientId: string | null;        // pre-selected client from the search
  clients: ClientOption[];         // full client list for picker (from client-picker.tsx)
}
```

Note: `onStarted` from `IdeasWizard` is dropped — not needed here since the wizard navigates away immediately. The Research Hub uses it to track processing items in a feed, but the search results page has no such feed.

## Dependencies

- `WizardShell` — existing reusable wizard modal container
- `ClientPickerButton` — existing client picker (`components/ui/client-picker.tsx`)
- `GlassButton` — existing styled button
- `/api/reference-videos` — existing reference video processing endpoint
- `/api/ideas/generate` — existing idea generation endpoint
