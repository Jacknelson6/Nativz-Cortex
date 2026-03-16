# Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic pipeline spreadsheet with a role-aware production board featuring Board (kanban), List, and Detail Panel views.

**Architecture:** Extract the 838-line `pipeline-view.tsx` into focused components. The orchestrator (`pipeline-page-client.tsx`) manages state and delegates rendering to view-specific components. Role detection drives default view and kanban column configuration.

**Tech Stack:** Next.js 15, React, Framer Motion, Tailwind CSS, Supabase, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-15-pipeline-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/pipeline/pipeline-types.ts` | Create | Types, status configs, role-to-column mappings, constants |
| `components/pipeline/status-pill.tsx` | Create | Reusable status pill with dropdown (extracted from pipeline-view) |
| `components/pipeline/person-cell.tsx` | Create | Team member picker cell (extracted from pipeline-view) |
| `components/pipeline/pipeline-detail-panel.tsx` | Create | Slide-out panel for full client-month editing |
| `components/pipeline/pipeline-filters.tsx` | Create | Filter bar + summary stats bar |
| `components/pipeline/pipeline-board.tsx` | Create | Role-aware kanban board view |
| `components/pipeline/pipeline-list.tsx` | Create | Compact list view with clickable rows |
| `components/pipeline/pipeline-page-client.tsx` | Create | Main orchestrator (state, API calls, view switching) |
| `app/admin/pipeline/page.tsx` | Modify | Update imports to use new orchestrator |
| `components/pipeline/pipeline-view.tsx` | Delete | Replaced by the above files |

---

## Chunk 1: Types, Constants, and Extracted Components

### Task 1: Pipeline types and constants

**Files:**
- Create: `components/pipeline/pipeline-types.ts`

- [ ] **Step 1: Create types file with all status configs and role mappings**

```typescript
// All types, status configs, role-to-kanban-column mappings
// Extracted from pipeline-view.tsx lines 26-124 + new role mapping

export interface PipelineItem {
  id: string;
  client_id: string | null;
  client_name: string;
  month_label: string;
  month_date: string;
  agency: string | null;
  strategist: string | null;
  videographer: string | null;
  editing_manager: string | null;
  editor: string | null;
  smm: string | null;
  assignment_status: string;
  raws_status: string;
  editing_status: string;
  client_approval_status: string;
  boosting_status: string;
  shoot_date: string | null;
  strategy_due_date: string | null;
  raws_due_date: string | null;
  smm_due_date: string | null;
  calendar_sent_date: string | null;
  edited_videos_folder_url: string | null;
  raws_folder_url: string | null;
  later_calendar_link: string | null;
  project_brief_url: string | null;
  notes: string | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

export type PipelineViewMode = 'board' | 'list' | 'table';

export interface StatusConfig {
  value: string;
  label: string;
  color: string;
}

// Status configs — same values as current, extracted for reuse
export const ASSIGNMENT_STATUSES: StatusConfig[] = [
  { value: 'can_assign', label: 'Can assign', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'assigned', label: 'Assigned', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'need_shoot', label: 'Need shoot', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

export const RAWS_STATUSES: StatusConfig[] = [
  { value: 'need_to_schedule', label: 'Need to schedule', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_shoot', label: 'Waiting on shoot', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'uploaded', label: 'Uploaded', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

export const EDITING_STATUSES: StatusConfig[] = [
  { value: 'not_started', label: 'Not started', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'editing', label: 'Editing', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'edited', label: 'Edited', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'em_approved', label: 'EM approved', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { value: 'revising', label: 'Revising', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-emerald-700/20 text-emerald-400 border-emerald-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

export const APPROVAL_STATUSES: StatusConfig[] = [
  { value: 'not_sent', label: 'Not sent', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_approval', label: 'Waiting', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'client_approved', label: 'Approved', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'needs_revision', label: 'Needs revision', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'revised', label: 'Revised', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'sent_to_paid_media', label: 'Sent to paid', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

export const BOOSTING_STATUSES: StatusConfig[] = [
  { value: 'not_boosting', label: 'Not boosting', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'working_on_it', label: 'Working on it', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

// Role-to-kanban-column mapping
// Maps team_member role → which status field to group by + which statuses to show as columns
export interface RoleBoardConfig {
  statusField: keyof PipelineItem;
  assignmentField: keyof PipelineItem;
  statuses: StatusConfig[];
  label: string;
}

export const ROLE_BOARD_CONFIGS: Record<string, RoleBoardConfig> = {
  editor: {
    statusField: 'editing_status',
    assignmentField: 'editor',
    statuses: EDITING_STATUSES,
    label: 'Editing',
  },
  editing_manager: {
    statusField: 'editing_status',
    assignmentField: 'editing_manager',
    statuses: EDITING_STATUSES,
    label: 'Editing',
  },
  smm: {
    statusField: 'boosting_status',
    assignmentField: 'smm',
    statuses: BOOSTING_STATUSES,
    label: 'Boosting',
  },
  videographer: {
    statusField: 'raws_status',
    assignmentField: 'videographer',
    statuses: RAWS_STATUSES,
    label: 'RAWs',
  },
  strategist: {
    statusField: 'assignment_status',
    assignmentField: 'strategist',
    statuses: ASSIGNMENT_STATUSES,
    label: 'Assignment',
  },
};

// Default config for owners/managers — use editing status (most complex)
export const DEFAULT_BOARD_CONFIG: RoleBoardConfig = ROLE_BOARD_CONFIGS.editor;

// Status action map: current status → primary/secondary actions
export interface StatusAction {
  label: string;
  nextStatus: string;
  variant: 'primary' | 'secondary' | 'danger';
}

export const EDITING_STATUS_ACTIONS: Record<string, StatusAction[]> = {
  not_started: [{ label: 'Start editing', nextStatus: 'editing', variant: 'primary' }],
  editing: [
    { label: 'Mark edited', nextStatus: 'edited', variant: 'primary' },
    { label: 'Block', nextStatus: 'blocked', variant: 'danger' },
  ],
  edited: [
    { label: 'Approve', nextStatus: 'em_approved', variant: 'primary' },
    { label: 'Request revision', nextStatus: 'revising', variant: 'secondary' },
  ],
  em_approved: [{ label: 'Send to client', nextStatus: 'waiting_on_approval', variant: 'primary' }],
  revising: [
    { label: 'Mark edited', nextStatus: 'edited', variant: 'primary' },
    { label: 'Block', nextStatus: 'blocked', variant: 'danger' },
  ],
  blocked: [{ label: 'Unblock', nextStatus: 'editing', variant: 'primary' }],
  scheduled: [{ label: 'Mark done', nextStatus: 'done', variant: 'primary' }],
};

// Progress calculation
export function getCompletionProgress(item: PipelineItem): number {
  let done = 0;
  if (item.assignment_status === 'assigned') done++;
  if (item.raws_status === 'uploaded') done++;
  if (['em_approved', 'scheduled', 'done'].includes(item.editing_status)) done++;
  if (['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status)) done++;
  if (item.boosting_status === 'done') done++;
  return Math.round((done / 5) * 100);
}

// Row progress border color
export function getRowProgressBorder(item: PipelineItem): string {
  const doneStatuses = ['done', 'scheduled'];
  const allDone =
    item.assignment_status === 'assigned' &&
    item.raws_status === 'uploaded' &&
    doneStatuses.includes(item.editing_status) &&
    ['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status) &&
    item.boosting_status === 'done';
  if (allDone) return 'border-l-green-500';
  const anyStarted =
    item.assignment_status !== 'can_assign' ||
    item.raws_status !== 'need_to_schedule' ||
    item.editing_status !== 'not_started' ||
    item.client_approval_status !== 'not_sent' ||
    item.boosting_status !== 'not_boosting';
  if (anyStarted) return 'border-l-amber-500';
  return 'border-l-gray-600';
}

// URL extraction helper
export function extractUrl(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : raw;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-types.ts
git commit -m "refactor: extract pipeline types and constants"
```

---

### Task 2: Status pill component

**Files:**
- Create: `components/pipeline/status-pill.tsx`

- [ ] **Step 1: Create StatusPill component**

Extract from pipeline-view.tsx lines 128-173. Same logic but imports types from pipeline-types.

```typescript
'use client';

import { useState } from 'react';
import type { StatusConfig } from './pipeline-types';

export function StatusPill({
  value,
  statuses,
  field,
  itemId,
  onUpdate,
}: {
  value: string;
  statuses: StatusConfig[];
  field: string;
  itemId: string;
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = statuses.find(s => s.value === value) ?? statuses[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border cursor-pointer transition-colors whitespace-nowrap ${config.color}`}
      >
        {config.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px]">
            {statuses.map(s => (
              <button
                key={s.value}
                onClick={() => { onUpdate(itemId, field, s.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-surface-hover ${
                  s.value === value ? 'text-text-primary font-medium' : 'text-text-muted'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0]}`} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/status-pill.tsx
git commit -m "refactor: extract StatusPill component"
```

---

### Task 3: Person cell component

**Files:**
- Create: `components/pipeline/person-cell.tsx`

- [ ] **Step 1: Create PersonCell component**

Extract from pipeline-view.tsx lines 177-231. Same logic.

```typescript
'use client';

import { useState } from 'react';
import type { TeamMember } from './pipeline-types';

export function PersonCell({
  value,
  field,
  itemId,
  teamMembers,
  onUpdate,
}: {
  value: string | null;
  field: string;
  itemId: string;
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer truncate max-w-[100px] block"
        title={value ?? 'Unassigned'}
      >
        {value ?? <span className="text-text-muted">—</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px] max-h-48 overflow-y-auto">
            <button
              onClick={() => { onUpdate(itemId, field, ''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover cursor-pointer"
            >
              Unassigned
            </button>
            {teamMembers.map(m => (
              <button
                key={m.id}
                onClick={() => { onUpdate(itemId, field, m.full_name); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer flex items-center gap-2"
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-surface-hover" />
                )}
                <span className="truncate">{m.full_name}</span>
                <span className="text-[10px] text-text-muted ml-auto">{m.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/person-cell.tsx
git commit -m "refactor: extract PersonCell component"
```

---

## Chunk 2: Detail Panel

### Task 4: Pipeline detail panel

**Files:**
- Create: `components/pipeline/pipeline-detail-panel.tsx`

- [ ] **Step 1: Create the detail panel component**

This follows the same pattern as `components/tasks/task-detail-panel.tsx` — AnimatePresence slide-in from right, portal to body.

The panel shows:
- Header: client name, agency badge, progress bar, close button
- Status section: all 5 status tracks with StatusPill dropdowns + contextual action buttons
- Team section: all 5 role assignments with PersonCell pickers
- Dates section: shoot_date, strategy_due_date, raws_due_date, smm_due_date, calendar_sent_date as date inputs
- Links section: edited_videos_folder_url, raws_folder_url, later_calendar_link, project_brief_url with add/edit capability
- Notes section: textarea for notes

Props:
```typescript
interface PipelineDetailPanelProps {
  item: PipelineItem | null;
  onClose: () => void;
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string, name: string) => void;
  teamMembers: TeamMember[];
}
```

Implementation: Full component with AnimatePresence overlay, organized in labeled sections. Each field calls `onUpdate(item.id, fieldName, newValue)` on change. Action buttons use `EDITING_STATUS_ACTIONS` map from pipeline-types.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-detail-panel.tsx
git commit -m "feat: add pipeline detail panel"
```

---

## Chunk 3: Filter Bar and Summary

### Task 5: Pipeline filters and summary bar

**Files:**
- Create: `components/pipeline/pipeline-filters.tsx`

- [ ] **Step 1: Create filters component**

Two sub-components:

**PipelineFilters:** Renders filter bar with:
- "My clients" toggle (defaults on for non-owners)
- Editing status filter dropdown
- Agency filter (Nativz / AC / All)
- Search input (filters by client_name)

**PipelineSummary:** Renders clickable status count pills showing how many items are in each editing status. Clicking a pill sets the status filter.

Props:
```typescript
interface PipelineFiltersProps {
  myClientsOnly: boolean;
  onMyClientsToggle: (v: boolean) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  agencyFilter: string;
  onAgencyFilter: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  isOwner: boolean;
}

interface PipelineSummaryProps {
  items: PipelineItem[];
  statusFilter: string;
  onStatusFilter: (v: string) => void;
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-filters.tsx
git commit -m "feat: add pipeline filter bar and summary"
```

---

## Chunk 4: Board and List Views

### Task 6: Pipeline board view (role-aware kanban)

**Files:**
- Create: `components/pipeline/pipeline-board.tsx`

- [ ] **Step 1: Create board component**

Uses `RoleBoardConfig` from pipeline-types to determine which status field to group by and which statuses to show as columns.

Props:
```typescript
interface PipelineBoardProps {
  items: PipelineItem[];
  teamMembers: TeamMember[];
  boardConfig: RoleBoardConfig;
  onUpdate: (id: string, field: string, value: string) => void;
  onSelect: (item: PipelineItem) => void;
  onDelete: (id: string, name: string) => void;
}
```

Features:
- Columns from `boardConfig.statuses`
- Cards show: client_name, agency badge, shoot_date, relevant assignee, progress bar, folder link icons
- Drag-and-drop between columns updates `boardConfig.statusField`
- Click card → calls `onSelect` to open detail panel
- Reuses `StatusPill` and `PersonCell` components

Follow the existing kanban pattern from pipeline-view.tsx lines 292-452 but with dynamic column configuration.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-board.tsx
git commit -m "feat: add role-aware pipeline board view"
```

---

### Task 7: Pipeline list view

**Files:**
- Create: `components/pipeline/pipeline-list.tsx`

- [ ] **Step 1: Create list component**

Compact rows designed for scanning. Each row is a single line showing:
- Left border color (progress indicator)
- Client name + agency badge
- Editor name (or relevant assignee)
- Editing status pill (compact)
- Approval status pill (compact)
- Shoot date (formatted)
- Link icons (folders, calendar)

Clicking a row calls `onSelect` to open the detail panel.

Props:
```typescript
interface PipelineListProps {
  items: PipelineItem[];
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
  onSelect: (item: PipelineItem) => void;
  onDelete: (id: string, name: string) => void;
}
```

Uses `StatusPill` for inline status changes. Row hover shows delete button.

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-list.tsx
git commit -m "feat: add pipeline list view"
```

---

## Chunk 5: Orchestrator and Page Integration

### Task 8: Pipeline page client orchestrator

**Files:**
- Create: `components/pipeline/pipeline-page-client.tsx`

- [ ] **Step 1: Create main orchestrator component**

This replaces `pipeline-view.tsx` as the main client component. It manages:
- State: items, teamMembers, selectedItem, filters, currentMonth, activeView
- Role detection: looks up logged-in user's team_member record to determine role
- View switching: Board / List / Table (table falls back to the current table layout, kept inline for now)
- API calls: fetchItems, handleUpdate, handleAdd, handleDelete (same patterns as current)
- Filter application: filters items based on myClientsOnly, statusFilter, agencyFilter, search
- Default view: Board for individual contributors, List for owners

Props (same shape as current):
```typescript
interface PipelinePageClientProps {
  initialItems: PipelineItem[];
  initialTeamMembers: TeamMember[];
  initialMonth: string;
  userTeamMember: { id: string; full_name: string; role: string } | null;
  isOwner: boolean;
}
```

Renders:
- Header with month nav + view switcher + add button
- PipelineFilters
- PipelineSummary
- Active view (PipelineBoard, PipelineList, or inline table)
- PipelineDetailPanel
- AddClientModal (kept from current)

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/pipeline/pipeline-page-client.tsx
git commit -m "feat: add pipeline page orchestrator"
```

---

### Task 9: Update server page and clean up

**Files:**
- Modify: `app/admin/pipeline/page.tsx`
- Delete: `components/pipeline/pipeline-view.tsx`

- [ ] **Step 1: Update the server page component**

Update `app/admin/pipeline/page.tsx` to:
- Import `PipelinePageClient` from new orchestrator
- Fetch user's team_member record + is_owner flag (same pattern as tasks page)
- Pass `userTeamMember` and `isOwner` props to orchestrator

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import PipelinePageClient from '@/components/pipeline/pipeline-page-client';
import type { PipelineItem, TeamMember } from '@/components/pipeline/pipeline-types';

export default async function PipelinePage() {
  const now = new Date();
  const initialMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminClient = createAdminClient();

  const [pipelineResult, teamResult, userResult, ownerResult] = await Promise.all([
    adminClient.from('content_pipeline').select('*').eq('month_date', initialMonth).order('client_name', { ascending: true }),
    adminClient.from('team_members').select('*').eq('is_active', true).order('full_name'),
    user ? adminClient.from('team_members').select('id, full_name, role').eq('user_id', user.id).single() : Promise.resolve({ data: null }),
    user ? adminClient.from('users').select('is_owner').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ]);

  return (
    <PipelinePageClient
      initialItems={(pipelineResult.data ?? []) as PipelineItem[]}
      initialTeamMembers={(teamResult.data ?? []).map(m => ({
        id: m.id, full_name: m.full_name, role: m.role ?? '', avatar_url: m.avatar_url ?? null,
      }))}
      initialMonth={initialMonth}
      userTeamMember={userResult.data ?? null}
      isOwner={!!ownerResult.data?.is_owner}
    />
  );
}
```

- [ ] **Step 2: Delete old pipeline-view.tsx**

```bash
rm components/pipeline/pipeline-view.tsx
```

- [ ] **Step 3: Verify full build**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace pipeline page with role-aware production board"
```

---

## Chunk 6: Visual QA and Polish

### Task 10: Visual QA in browser

- [ ] **Step 1: Start dev server and test all views**

Run: `npm run dev`

Test at `http://localhost:3000/admin/pipeline`:
- Board view renders with kanban columns
- List view renders with compact rows
- Click row/card → detail panel opens
- Status pills open dropdown and update
- Person cells open picker and update
- Month navigation works
- Filters work (my clients, status, agency, search)
- Summary bar counts are correct and clickable
- Add client modal works
- Delete works with confirmation
- Detail panel shows all fields and saves changes

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: pipeline visual QA polish"
```
