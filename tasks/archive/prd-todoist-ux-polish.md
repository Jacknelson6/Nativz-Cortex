# PRD: Todoist-style UX polish for tasks

## Introduction

The tasks page has solid functionality but feels heavy and enterprise-y. This PRD focuses on one thing: making the tasks experience feel as satisfying and simple as Todoist. The check-off moment should be delightful. The layout should breathe. The interaction model should feel effortless.

This is a UX-only rewrite of the tasks page frontend. No new backend work. No new database columns. Just making what exists feel incredible.

## Goals

- Replicate Todoist's clean, minimal task list aesthetic adapted to our dark theme
- Make checking off a task genuinely satisfying (animation, sound, timing)
- Simplify the visual hierarchy — fewer badges, less clutter, more whitespace
- Keep the "Add task" flow fast and inline (no modals, no AI parsing step)
- Strip views down to what matters: Today and Upcoming (remove Board and Calendar tabs for now)

## Reference

**Todoist patterns to replicate (adapted to dark theme):**
- Circular checkbox with priority color ring (not filled — just the ring)
- On check: ring fills → checkmark draws in → task text strikes through → row fades up and out after ~600ms
- Generous vertical spacing between tasks (~12-16px gaps)
- Clean horizontal separator lines between tasks (subtle, `border-nativz-border`)
- Task title is the hero — large enough to scan, not cramped
- Description preview shown as muted subtext below title (single line, truncated)
- Right side: client name + due date in small muted text, no badges or pills
- "+ Add task" as a persistent inline row at the bottom of each section
- Section headers: bold date label ("Today", "Tomorrow", "Monday — Mar 9") with task count

## User Stories

### US-001: Simplify page to Today + Upcoming views
**Description:** As a user, I want a clean two-view task page so I can focus on what matters without tab overload.

**Acceptance Criteria:**
- [ ] Remove Board and Calendar view tabs entirely
- [ ] Default view is "Today" (tasks due today + overdue)
- [ ] Second view is "Upcoming" (next 14 days, grouped by day)
- [ ] View toggle is minimal — two text buttons, active state is bold + accent underline
- [ ] View persists in URL param `?view=today` or `?view=upcoming`
- [ ] Remove Monday.com suggestions panel entirely from the tasks page
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-002: Redesign task row with Todoist aesthetics
**Description:** As a user, I want each task row to feel clean and scannable like Todoist, with a clear visual hierarchy.

**Acceptance Criteria:**
- [ ] Circular checkbox: 20px, 2px stroke, color matches priority (red=urgent, orange=high, blue=medium, gray/white-20%=low)
- [ ] On hover, checkbox ring brightens slightly (opacity increase)
- [ ] Task title: `text-sm font-medium text-text-primary`, no truncation on desktop (wrap if needed)
- [ ] If task has description: show first ~60 chars as `text-xs text-text-muted` on a second line below title
- [ ] Right side (flex end): client name as plain `text-xs text-text-muted` (no badge/pill), then due date as `text-xs text-text-muted`
- [ ] Overdue dates show in `text-red-400`
- [ ] Horizontal separator: `border-b border-nativz-border/50` between each task row
- [ ] Row padding: `py-3 px-1` — generous vertical breathing room
- [ ] No priority dot (the checkbox color IS the priority indicator)
- [ ] No assignee avatar in the row (keep it for the detail panel only)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Satisfying check-off animation
**Description:** As a user, I want checking off a task to feel genuinely delightful — a small moment of reward.

**Acceptance Criteria:**
- [ ] On click: checkbox ring fills with priority color over ~200ms (ease-out)
- [ ] Checkmark SVG draws in with a stroke-dasharray animation (~150ms, slightly delayed)
- [ ] Task title gets `line-through` with `text-text-muted/60` color transition over ~200ms
- [ ] After ~600ms pause (let user see the completed state), row slides up and fades out over ~300ms
- [ ] Task is moved to "done" status via PATCH API after the visual animation begins (optimistic update)
- [ ] If API call fails, animation reverses and toast shows error
- [ ] Unchecking a done task: reverse animation — checkmark undraws, ring unfills, strikethrough removed
- [ ] The task count in the section header updates immediately (optimistic)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Inline "Add task" row
**Description:** As a user, I want to add tasks with zero friction — just click, type, press Enter.

**Acceptance Criteria:**
- [ ] At the bottom of each section, show a `+ Add task` button (red plus icon like Todoist, `text-text-muted`)
- [ ] On click, the button morphs into an inline text input (framer-motion expand)
- [ ] Input has no border — just the text cursor and placeholder "Task name"
- [ ] Below the input: a row of small icon buttons for setting due date (calendar picker), priority (dropdown), client (dropdown)
- [ ] Pressing Enter creates the task immediately (POST /api/tasks) with the current section's date as `due_date`
- [ ] After creation, input clears and stays focused for rapid entry (batch-add mode)
- [ ] Pressing Escape or clicking outside closes the inline input
- [ ] New task animates in from below (slide-up + fade-in, ~200ms)
- [ ] Remove the old AI-powered QuickAddBar completely
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Clean section headers
**Description:** As a user, I want clear day-based section grouping so I can quickly orient myself.

**Acceptance Criteria:**
- [ ] Today view shows: "Overdue" section (red dot, if any), "Today" section (blue dot)
- [ ] Upcoming view groups by date: "Today", "Tomorrow", "Wednesday — Mar 6", etc.
- [ ] Section header format: bold label + muted task count on right
- [ ] Headers are sticky within scroll (`sticky top-0 bg-background z-10`)
- [ ] "No date" section at bottom for tasks without due_date (collapsed by default, chevron toggle)
- [ ] Completed tasks hidden by default; small "Show completed" toggle at page bottom
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Page header simplification
**Description:** As a user, I want the page header to be minimal — just the essentials.

**Acceptance Criteria:**
- [ ] Page title: "Today" or "Upcoming" (matches current view, large `text-2xl font-bold`)
- [ ] Below title: muted task count like Todoist (e.g., "4 tasks" with a small check icon)
- [ ] View toggle sits in the header, right-aligned
- [ ] No filter dropdowns in the header (move filtering to a future iteration)
- [ ] No task type filter (simplify)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Task detail panel cleanup
**Description:** As a user, I want the slide-out detail panel to feel clean when I click a task.

**Acceptance Criteria:**
- [ ] Keep existing slide-out panel functionality
- [ ] Ensure the same checkbox animation works in the detail panel header
- [ ] Title is editable inline (click to edit, blur or Enter to save)
- [ ] Description is editable as a textarea below title
- [ ] Metadata (client, assignee, priority, due date, task type) shown as a clean form below description
- [ ] Activity log section at bottom (existing, keep as-is)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Empty states
**Description:** As a user, I want friendly empty states that feel encouraging, not sad.

**Acceptance Criteria:**
- [ ] Today view, no tasks: Large check icon + "All clear for today" + muted "Enjoy your day or add a task below"
- [ ] Upcoming view, no tasks: Calendar icon + "Nothing on the horizon" + muted "Add tasks to start planning ahead"
- [ ] Each empty state has the inline "+ Add task" row below it
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Page loads with "Today" view by default, showing overdue + today's tasks
- FR-2: Clicking "Upcoming" switches to 14-day grouped view with sticky date headers
- FR-3: Each task row shows: priority-colored circular checkbox, title, optional description preview, client name, due date
- FR-4: Checking a task triggers a multi-stage animation (fill → checkmark → strikethrough → fade-out) then PATCH to API
- FR-5: "+ Add task" at bottom of each section expands into inline input; Enter saves, Escape cancels
- FR-6: New tasks default to `status: backlog`, `priority: medium`, with the section's date as `due_date`
- FR-7: Tasks without a due date appear in a collapsible "No date" section at the bottom
- FR-8: Completed tasks are hidden by default; "Show completed" toggle at page bottom reveals them
- FR-9: Page header shows view title, task count, and view toggle — nothing else

## Non-Goals

- No Monday.com suggestions panel — removed for simplicity
- No Board (Kanban) view — too complex, not Todoist-like
- No Calendar view — dedicated calendar exists elsewhere
- No AI natural language parsing for task creation — just type and go
- No drag-and-drop reordering within lists
- No filters or sorting controls (simplify first, add back later if needed)
- No subtasks or recurring tasks
- No keyboard shortcuts (future iteration)
- No sound effects on check-off (future iteration — too risky to get wrong)

## Design Considerations

**Todoist dark-theme adaptation:**
- Background: `bg-background` (#0f1117) — not card-based, just flat
- Task rows sit directly on the background (no wrapping Card component)
- Separator lines: `border-nativz-border/50` — very subtle
- Checkbox colors map to existing priority system: red=urgent, orange=high, blue=medium, gray=low

**Typography scale:**
- Page title: `text-2xl font-bold text-text-primary`
- Section headers: `text-sm font-semibold text-text-secondary`
- Task title: `text-sm font-medium text-text-primary`
- Task description preview: `text-xs text-text-muted`
- Metadata (client, date): `text-xs text-text-muted`

**Animation timing (critical for feel):**
- Checkbox fill: 200ms ease-out
- Checkmark draw: 150ms ease-out, 50ms delay
- Text strikethrough: 200ms ease
- Row exit: 300ms ease-in, 600ms delay after check
- New task entry: 200ms ease-out slide-up
- Add-task expand: 200ms ease-out

**Existing components to reuse:**
- `components/tasks/task-detail-panel.tsx` — slide-out detail (keep, clean up)
- `components/tasks/types.ts` — Task type definition (keep as-is)
- `components/ui/button.tsx`, `components/ui/badge.tsx` — reuse where needed
- Framer Motion for all animations

**Components to remove/replace:**
- Remove `CalendarView` integration from tasks page
- Remove `@dnd-kit` imports (no drag-and-drop in list views)
- Remove `QuickAddBar` (AI parsing) — replace with simple inline add
- Remove Board view (Kanban columns)
- Remove filter dropdowns

## Technical Considerations

- The SVG checkbox animation uses `stroke-dasharray` + `stroke-dashoffset` for the checkmark draw effect — this needs a custom SVG component, not a Lucide icon
- Optimistic updates: update local state immediately, then fire API call; revert on failure
- Keep all existing API routes unchanged — this is purely frontend
- The inline "Add task" input should auto-focus when expanded and trap focus until dismissed
- Framer Motion `layout` animations on task rows for smooth reflow when items are removed
- Section headers with `position: sticky` need `bg-background` to avoid transparency issues on scroll

## Success Metrics

- Task check-off feels satisfying and rewarding (subjective but primary goal)
- Page feels noticeably simpler and less cluttered than current implementation
- Adding a task takes < 3 seconds (click → type → Enter)
- Zero additional API calls vs. current implementation
- No performance regression on pages with 50+ tasks

## Open Questions

- Should we add a subtle haptic/sound on check-off in a future iteration?
- Should completed tasks auto-hide after the animation, or should there be a brief "undo" toast?
- Should the detail panel open on click, or only on a dedicated "expand" button (to avoid conflict with checkbox click)?
