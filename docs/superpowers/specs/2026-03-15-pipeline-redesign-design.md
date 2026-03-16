# Pipeline Redesign — Design Spec

## Problem

The content pipeline page is a 13-column spreadsheet that treats every team member the same. An editor, editing manager, SMM, and strategist all see the same overwhelming table. The page needs to answer: **"What do I need to do right now?"**

## Solution

A role-aware production board that adapts to the logged-in user. Three views: Board (kanban), List (compact rows + detail panel), and the existing Table. The detail panel replaces the need for every column to be visible.

## Views

### Board View (default for individual contributors)

Kanban columns contextual to the user's role:

- **Editor:** Ready to edit → In progress → Edited (awaiting EM) → Revisions needed
- **Editing Manager:** Awaiting review → Approved → Sent back → Blocked
- **SMM:** Ready to schedule → Scheduled → Boosting → Done
- **Videographer:** Need to schedule → Waiting on shoot → RAWs uploaded
- **Strategist:** Needs strategy → Strategy complete → Needs shoot

Cards show: client name, agency badge, shoot date, assigned person, folder links. Drag-and-drop to advance status.

### List View (default for owners/managers)

Compact rows with key info visible:
- Progress indicator (colored left border)
- Client name + agency badge
- Editor name
- Editing status (compact pill)
- Approval status (compact pill)
- Shoot date
- Link icons

Click any row → detail panel slides in from right.

### Detail Panel (on row/card click)

Full right panel with sections:
- **Header:** Client name, agency, progress bar
- **Status tracks:** All 5 statuses with dropdowns + contextual action buttons
- **Team:** All 5 role assignments with person pickers
- **Dates:** All 5 dates, editable
- **Links:** RAWs folder, edited videos, Later calendar, project brief
- **Notes:** Text field

### Filter Bar

Below header: `[My clients toggle] [Status filter] [Agency filter] [Search]`

- "My clients" on by default for non-owners
- Status filter clickable from summary bar
- Search by client name

### Summary Bar

Compact stats: `3 Not started · 5 Editing · 2 Awaiting EM · 4 EM approved · 1 Blocked · 6 Done`
Clickable to filter.

## Status Actions

Contextual buttons based on current editing status:

| Current | Primary Action | Secondary |
|---------|---------------|-----------|
| not_started | Start editing → editing | — |
| editing | Mark edited → edited | Block → blocked |
| edited | Approve → em_approved | Request revision → revising |
| em_approved | Send to client → waiting_on_approval | — |
| revising | Mark edited → edited | Block → blocked |
| blocked | Unblock → editing | — |

Full dropdown always available via clicking the status label.

## Data Model

No schema changes. Uses existing `content_pipeline` table, API routes, and status enums. Role detection via `team_members.role` for the logged-in user.

## File Structure

Replace monolithic `components/pipeline/pipeline-view.tsx` (838 lines) with:

- `components/pipeline/pipeline-types.ts` — Types, status configs, constants
- `components/pipeline/pipeline-filters.tsx` — Filter bar + summary bar
- `components/pipeline/pipeline-board.tsx` — Role-aware kanban view
- `components/pipeline/pipeline-list.tsx` — Compact list view with row component
- `components/pipeline/pipeline-detail-panel.tsx` — Slide-out detail panel
- `components/pipeline/status-pill.tsx` — Reusable status pill with dropdown
- `components/pipeline/person-cell.tsx` — Team member picker
- `components/pipeline/pipeline-page-client.tsx` — Main client component (orchestrator)
- `app/admin/pipeline/page.tsx` — Server component (data fetching, unchanged pattern)
