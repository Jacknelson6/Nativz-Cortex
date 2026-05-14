'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  BadgeDollarSign,
  Bell,
  Cable,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  Megaphone,
  RefreshCcw,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  ScheduleRangePicker,
  type ScheduleRange,
} from '@/components/ui/schedule-range-picker';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SubNav } from '@/components/ui/sub-nav';
import {
  ReviewTableCard,
  sortLinksBy,
  type ReviewHideableColumn,
  type SortState,
} from '@/components/scheduler/review-table';
import type {
  ReviewLinkRow,
  ReviewLinkStatus,
  ReviewProjectType,
} from '@/components/scheduler/review-board';
import type {
  EditingProject,
  EditingProjectStatus,
  EditingProjectType,
} from '@/lib/editing/types';
import { ProjectsEmptyState } from './projects-empty-state';
import { ProjectsTableSkeleton } from './projects-table-skeleton';
import { QuickScheduleTab } from './quick-schedule-tab';
import { ConnectionsTab } from './connections-tab';
import { NotificationsTab } from './notifications-tab';
import { PostingHistoryTab } from './posting-history-tab';
import { EditingNewProjectDialog } from './editing-new-project-dialog';
import { EditingProjectDetail } from './editing-project-detail';
import { CalendarLinkDetail } from './calendar-link-detail';
import { subscribeToCompletion } from '@/lib/editing/upload-store';

/**
 * Group rows by date, either:
 *  - `default`: full-month buckets keyed by `YYYY-MM` from `created_at`
 *    (when the project was started); or
 *  - `approval`: half-month buckets keyed by `YYYY-MM-H1` (1st-15th) /
 *    `YYYY-MM-H2` (16th-EOM) from `approved_at`. Two periods per
 *    calendar month mirrors how Jack invoices in arrears, so the table
 *    reads like the billing sheet.
 *
 * Rows missing the chosen date land in the `null` bucket and render
 * under a fallback "No date" / "No approval date" header so they never
 * vanish. In `approval` mode the current period is always included
 * (even when empty) so chevron navigation has a stable anchor and the
 * default focus lands on "today's billing window."
 */
type GroupBy = 'default' | 'approval';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'approval', label: 'Approval' },
];

// Accounting math. Finance bills clients by deliverable count, split by
// media type. Kept as named constants so the CSV stays the single source
// of truth — if rates change, update them here and the invoice math
// re-flows on next export.
const VIDEO_UNIT_COST = 50;
const STATIC_UNIT_COST = 15;

function csvEscape(value: string): string {
  // Wrap in quotes whenever the value contains a comma, quote, or newline
  // and double up any embedded quotes per RFC 4180. Always quoting is also
  // valid but inflates the file; quoting only when needed keeps the export
  // readable when finance scrolls through it in Numbers/Excel.
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Dollar amount formatted like `$1,250.00` for the accounting sheet. */
function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function downloadApprovedPeriodCsv(
  periodLabel: string,
  rows: ReviewLinkRow[],
): void {
  // Finance records completed deliverables per calendar month so we can
  // invoice in arrears. Brand-first, project last (Jack's preferred read
  // order), and rows with zero approved deliverables drop out entirely —
  // they're noise for the invoice. Each row breaks the count into Videos
  // ($50 each) vs Statics ($15 each) so the team can reconcile against
  // the per-unit rate without re-counting media types by hand.
  const billableRows = rows.filter((r) => (r.approved_count ?? 0) > 0);
  const header = [
    'Brand',
    'Videos',
    'Video cost',
    'Statics',
    'Static cost',
    'Total',
    'Project',
  ];
  const body = billableRows.map((r) => {
    const videos = r.approved_video_count ?? 0;
    const statics = r.approved_image_count ?? 0;
    const videoCost = videos * VIDEO_UNIT_COST;
    const staticCost = statics * STATIC_UNIT_COST;
    return [
      r.client_name ?? '',
      String(videos),
      formatMoney(videoCost),
      String(statics),
      formatMoney(staticCost),
      formatMoney(videoCost + staticCost),
      r.name ?? '',
    ].map(csvEscape).join(',');
  });
  const csv = [header.join(','), ...body].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safePeriod = periodLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.href = url;
  a.download = `approved-deliverables-${safePeriod}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Default window for the Promote-to-calendar dialog: tomorrow through
 * +21 calendar days, which comfortably covers 15 weekdays (the typical
 * editing project size) without forcing the admin to extend the range
 * before submitting. Stored as `YYYY-MM-DD` strings to match the
 * ScheduleRangePicker contract.
 */
function defaultPromoteRange(): ScheduleRange {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 21);
  return { start: fmt(start), end: fmt(end) };
}

/** Full-month key, `YYYY-MM`. Used by `default` (created_at) grouping. */
function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Half-month bucket key, `YYYY-MM-H1` for days 1..15 or `YYYY-MM-H2`
 * for 16..end-of-month. Computed in UTC so the bucket boundary doesn't
 * drift across timezones, the approval timestamp is also stored UTC.
 */
function halfMonthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const half = d.getUTCDate() <= 15 ? 'H1' : 'H2';
  return `${y}-${m}-${half}`;
}

/** Build a half-month key for the current period (today's bucket). */
function currentHalfMonthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const half = now.getUTCDate() <= 15 ? 'H1' : 'H2';
  return `${y}-${m}-${half}`;
}

/** Last day of the given UTC month, e.g. 31 for May, 30 for April. */
function lastDayOfMonth(year: number, monthIndex0: number): number {
  // Day 0 of the next month rolls back to the last day of the current month.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Human label for a full-month key. e.g. `2026-05` to "May 2026". */
function monthLabel(key: string): string {
  const [yStr, mStr] = key.split('-');
  const year = Number(yStr);
  const monthIndex0 = Number(mStr) - 1;
  const monthName = new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString(
    undefined,
    { month: 'long', timeZone: 'UTC' },
  );
  return `${monthName} ${year}`;
}

/**
 * Human label for a half-month bucket key. e.g. `2026-05-H1` to
 * "May 1 to 15, 2026", `2026-05-H2` to "May 16 to 31, 2026". Uses 'to'
 * deliberately (no en/em dashes per project copy rule).
 */
function halfMonthLabel(key: string): string {
  const [yStr, mStr, half] = key.split('-');
  const year = Number(yStr);
  const monthIndex0 = Number(mStr) - 1;
  const monthName = new Date(Date.UTC(year, monthIndex0, 1)).toLocaleDateString(
    undefined,
    { month: 'long', timeZone: 'UTC' },
  );
  if (half === 'H1') return `${monthName} 1 to 15, ${year}`;
  const end = lastDayOfMonth(year, monthIndex0);
  return `${monthName} 16 to ${end}, ${year}`;
}

/**
 * Bucket rows by date according to `mode`. In `approval` mode the
 * current half-month period is always included (even when empty) so
 * chevron navigation has a stable anchor and the default focus lands
 * on "today's billing window" regardless of whether anyone approved
 * yet. Newest bucket first, null/no-date bucket last.
 */
function groupRowsByMonth(
  rows: ReviewLinkRow[],
  mode: GroupBy,
): { key: string | null; label: string; rows: ReviewLinkRow[] }[] {
  const buckets = new Map<string | null, ReviewLinkRow[]>();
  for (const row of rows) {
    const key =
      mode === 'approval'
        ? halfMonthKey(row.approved_at ?? null)
        : monthKey(row.created_at);
    const existing = buckets.get(key);
    if (existing) existing.push(row);
    else buckets.set(key, [row]);
  }
  if (mode === 'approval') {
    const todayKey = currentHalfMonthKey();
    if (!buckets.has(todayKey)) buckets.set(todayKey, []);
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b.localeCompare(a);
  });
  const nullLabel = mode === 'approval' ? 'No approval date' : 'No date';
  return keys.map((key) => ({
    key,
    label: key
      ? mode === 'approval'
        ? halfMonthLabel(key)
        : monthLabel(key)
      : nullLabel,
    rows: buckets.get(key) ?? [],
  }));
}

/**
 * `/admin/content-tools` shell. Reorganised around project type so
 * Jack can pivot between the cross-brand "everything in flight" view
 * and a single-type breakdown without reaching for filters.
 *
 *   All projects    - every share-link the agency has out (default).
 *   Calendar        - filtered to project_type = calendar.
 *   Editing         - filtered to project_type = editing.
 *   Quick schedule  - Monday "EM Approved" videos -> thumbnail extract
 *                     + transcribe + caption write -> kick off scheduler.
 *   Connections     - integration health (Drive / Monday / Resend /
 *                     Zernio / Supabase / OpenRouter / Anthropic /
 *                     Nango). Connected vs. missing at a glance.
 *   Notifications   - POC contacts panel + recent transactional email
 *                     activity feed. The "what just went out" view.
 *
 * Every project tab feeds the same `<ReviewTableCard>` primitive with
 * a different filter + column visibility set. Type-specific tabs hide
 * the now-redundant "Project type" column since the tab itself is
 * the answer. We load the underlying roster once from
 * `/api/calendar/review` and slice it locally so cross-tab navigation
 * is instant.
 *
 * Other tabs (Quick schedule / Connections / Notifications) are
 * independent panes - no cross-coupled state, no shared fetches. Each
 * pane handles its own loading + error rendering so a Connections
 * probe failure can't block the Projects table from rendering.
 */

type ProjectTabSlug =
  | 'projects'
  | 'calendar'
  | 'editing';

type ContentToolsTab =
  | ProjectTabSlug
  | 'quick-schedule'
  | 'history'
  | 'connections'
  | 'notifications';

/**
 * Maps each project-type tab to the underlying `ReviewProjectType`
 * filter. `null` means "no filter" (the All projects view).
 */
const PROJECT_TAB_FILTER: Record<ProjectTabSlug, ReviewProjectType | null> = {
  projects: null,
  calendar: 'calendar',
  editing: 'editing',
};

const PROJECT_TAB_HIDE: Record<ProjectTabSlug, ReviewHideableColumn[]> = {
  projects: [],
  calendar: ['project_type'],
  editing: ['project_type'],
};

const PROJECT_TAB_LABEL: Record<ProjectTabSlug, string> = {
  projects: 'All projects',
  calendar: 'Calendar',
  editing: 'Editing',
};

function isProjectTab(tab: ContentToolsTab): tab is ProjectTabSlug {
  return tab in PROJECT_TAB_FILTER;
}

/**
 * Map an editing project's `project_type` into a `ReviewProjectType`.
 * Post-migration 302 both enums are the same binary set so this is a
 * straight passthrough; kept as a function so any future schema drift
 * has a single place to land.
 */
function projectTypeForReview(
  type: EditingProjectType,
): ReviewProjectType {
  return type;
}

/**
 * Map an editing-project lifecycle state onto the smaller status
 * vocabulary the shared review table understands.
 *   editing / need_approval        → ready_for_review (yellow)
 *   revising                       → revising (blue)
 *   approved / done                → approved (green)
 *   archived                       → expired (red, dimmed)
 */
function statusForReview(
  status: EditingProjectStatus,
): ReviewLinkStatus {
  switch (status) {
    case 'editing':
    case 'need_approval':
      return 'ready_for_review';
    case 'revising':
      return 'revising';
    case 'approved':
    case 'done':
      return 'approved';
    case 'archived':
      return 'expired';
  }
}

/**
 * Project an `editing_projects` row into the `ReviewLinkRow` shape
 * the shared table renders. Calendar-only fields (token, drop dates,
 * followup state) are zeroed out; the `kind` discriminator tells the
 * table to route clicks to the editing detail dialog instead of
 * `/c/<token>`.
 */
function editingProjectToRow(p: EditingProject): ReviewLinkRow {
  // Source of truth for "are the creatives approved?" is the per-video
  // latest review state (`approved_count`/`changes_count`/`pending_count`),
  // not the project's `status` column - the column is a manual lifecycle
  // flag that lags real review state. Mirror calendar's status derivation
  // so the row's pill matches its counter.
  const totalForReview = p.approved_count + p.changes_count + p.pending_count;
  const reviewDerivedStatus: ReviewLinkRow['status'] | null =
    totalForReview > 0
      ? p.changes_count > 0
        ? 'revising'
        : p.approved_count === totalForReview
          ? 'approved'
          : null
      : null;
  return {
    id: `editing:${p.id}`,
    token: '',
    // Editing rows don't have a public share URL — clicks open the
    // detail dialog instead of routing to /s/<token>. Set to '' so the
    // type stays satisfied; UI never reads this for `kind === 'editing'`.
    share_url: '',
    drop_id: p.drop_id ?? '',
    drop_start: null,
    drop_end: null,
    client_id: p.client_id,
    client_name: p.client_name,
    client_agency: null,
    client_logo_url: p.client_logo_url,
    post_count: p.video_count,
    approved_count: p.approved_count,
    // Editing projects are video-only deliverables (raw clips → final cuts),
    // so every approved item bills at the video rate.
    approved_video_count: p.approved_count,
    approved_image_count: 0,
    changes_count: p.changes_count,
    pending_count: p.pending_count,
    status: reviewDerivedStatus ?? statusForReview(p.status),
    expires_at: p.created_at,
    created_at: p.created_at,
    approved_at: p.approved_at,
    last_viewed_at: null,
    name: p.name,
    project_type: projectTypeForReview(p.project_type),
    project_type_other: null,
    abandoned_at: p.archived_at,
    last_followup_at: p.last_followup_at,
    followup_count: p.followup_count,
    first_sent_at: p.first_sent_at,
    last_sent_at: p.last_sent_at,
    send_count: p.send_count,
    kind: 'editing',
    editing_project_id: p.id,
    // Override the project's lifecycle status when per-video review state
    // is terminal (all approved or any changes). The pill reads from this
    // field via `unifiedStatusForEditingProject`, so this keeps the pill
    // in sync with the counter without depending on the lifecycle column
    // having been advanced manually.
    editing_status:
      totalForReview > 0 && p.changes_count > 0
        ? 'revising'
        : totalForReview > 0 && p.approved_count === totalForReview
          ? 'approved'
          : p.status,
    notes: p.notes,
    strategist_id: p.strategist_id,
    strategist_email: p.strategist_email,
    strategist_name: p.strategist_name,
    editor_id: p.editor_id,
    editor_email: p.editor_email,
    editor_name: p.editor_name,
  };
}

const TABS: {
  slug: ContentToolsTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    slug: 'projects',
    label: 'All projects',
    icon: <FileText className="size-3.5" />,
  },
  {
    slug: 'calendar',
    label: 'Calendar',
    icon: <Megaphone className="size-3.5" />,
  },
  {
    slug: 'editing',
    label: 'Editing',
    icon: <BadgeDollarSign className="size-3.5" />,
  },
  {
    slug: 'quick-schedule',
    label: 'Quick schedule',
    icon: <Wand2 className="size-3.5" />,
  },
  {
    slug: 'history',
    label: 'History',
    icon: <History className="size-3.5" />,
  },
  {
    slug: 'connections',
    label: 'Connections',
    icon: <Cable className="size-3.5" />,
  },
  {
    slug: 'notifications',
    label: 'Notifications',
    icon: <Bell className="size-3.5" />,
  },
];

export function ContentToolsShell() {
  const router = useRouter();
  const [tab, setTab] = useState<ContentToolsTab>('projects');

  // Projects state lives at the shell level so the same fetch backs
  // every project-type tab. Cross-tab navigation is instant because
  // we slice locally instead of refetching per tab. Calendar share
  // links and editing projects are kept in separate slices so each
  // can refresh independently and so the row-shape projection is
  // local to the editing slice.
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [editingProjects, setEditingProjects] = useState<EditingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Editing-detail dialog + new-project dialog state. Lifted out of
  // the deleted `EditingProjectsPanel` so editing rows in the unified
  // table can pop the detail dialog directly.
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const [newEditingOpen, setNewEditingOpen] = useState(false);

  // Calendar-link detail dialog. Holds the full row so the dialog can
  // show counts + timestamps without re-fetching. Click on a calendar
  // row in the unified table opens this; the dialog's "Open" button
  // is the explicit way to load the public share page.
  const [activeCalendarLink, setActiveCalendarLink] =
    useState<ReviewLinkRow | null>(null);

  // Promote-to-calendar dialog state. Right-click → "Promote to
  // calendar" opens this dialog, which collects a date range before
  // POSTing to the promote endpoint. Stored separately from the
  // editing-detail dialog so they don't fight over modal stacking.
  const [promoteFor, setPromoteFor] = useState<
    { projectId: string; brandSlug: string | null; projectName: string | null } | null
  >(null);
  const [promoteRange, setPromoteRange] = useState<ScheduleRange>(defaultPromoteRange);
  const [promoting, setPromoting] = useState(false);

  // Default sort is "Date sent, newest first" - same intent as the
  // previous SortMenu's default - but the user can now click any
  // column header to re-sort the whole table.
  const [sort, setSort] = useState<SortState>({ field: 'date_sent', dir: 'desc' });

  // Group-by-month view mode. When non-`none`, rows are bucketed into
  // <Month> sections (newest first) so the table reads like a list-view
  // calendar. The active value also forces the in-bucket sort onto the
  // chosen date so rows inside a month stay in temporal order.
  const [groupBy, setGroupBy] = useState<GroupBy>('default');

  // When grouped, the user focuses on one half-month period at a time
  // and pages with the chevrons. Stored as the bucket key
  // (`YYYY-MM-H1`, `YYYY-MM-H2`, or `null` for the no-date bucket).
  // Defaults to today's bucket so finance lands on the current billing
  // window on first paint instead of "No approval date".
  const [focusedMonthKey, setFocusedMonthKey] = useState<string | null>(() =>
    currentHalfMonthKey(),
  );

  async function loadProjects(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Calendar share links and editing projects load in parallel so
      // the merged table renders as soon as both slices arrive.
      const [calendarRes, editingRes] = await Promise.all([
        fetch('/api/calendar/review', { cache: 'no-store' }),
        fetch('/api/admin/editing/projects', { cache: 'no-store' }),
      ]);
      if (!calendarRes.ok) throw new Error('Failed to load projects');
      const calendarData = (await calendarRes.json()) as {
        links: ReviewLinkRow[];
      };
      setLinks(calendarData.links ?? []);

      // Editing-project failure is non-fatal so a flaky editing API
      // doesn't blank the whole table. Surface a toast instead.
      if (editingRes.ok) {
        const editingData = (await editingRes.json()) as {
          projects: EditingProject[];
        };
        setEditingProjects(editingData.projects ?? []);
      } else {
        setEditingProjects([]);
        toast.error('Failed to load editing projects');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  // Refetch the project list whenever a background upload batch
  // finishes anywhere (any project). The detail dialog can be closed
  // and the user can still see updated video counts on the table.
  useEffect(() => {
    return subscribeToCompletion(() => {
      void loadProjects(true);
      toast.success('Uploads finished');
    });
  }, []);

  // Keep the open calendar-link modal's data fresh when the unified
  // links list refetches. The modal itself doesn't load its own data;
  // it reads everything from the row passed in via the `link` prop. So
  // when an inner control (Notes blur, AssigneePicker save) calls
  // `onChanged` and we kick a `loadProjects(true)`, we have to re-pluck
  // the row by id and feed the modal the fresh copy. Without this the
  // strategist/editor chips and the notes textarea would lag a full
  // dialog re-open behind the server.
  useEffect(() => {
    if (!activeCalendarLink) return;
    const fresh = links.find((l) => l.id === activeCalendarLink.id);
    if (fresh && fresh !== activeCalendarLink) {
      setActiveCalendarLink(fresh);
    }
  }, [links, activeCalendarLink]);

  // Editing-project rows are projected into ReviewLinkRow shape so
  // the shared table renders both kinds side-by-side. Archived
  // editing rows are filtered out (the calendar slice already does
  // this server-side via `archived_at IS NULL`).
  const editingRows = useMemo<ReviewLinkRow[]>(
    () =>
      editingProjects
        .filter((p) => p.status !== 'archived')
        .map(editingProjectToRow),
    [editingProjects],
  );

  const allRows = useMemo<ReviewLinkRow[]>(
    () => [...links, ...editingRows],
    [links, editingRows],
  );

  const sortedLinks = useMemo(
    () => [...allRows].sort((a, b) => sortLinksBy(a, b, sort)),
    [allRows, sort],
  );

  const projectTabCounts = useMemo(() => {
    const counts: Record<ProjectTabSlug, number> = {
      projects: allRows.length,
      calendar: 0,
      editing: 0,
    };
    for (const row of allRows) {
      // Rows with NULL project_type bucket into Editing by default (it's
      // the binary's "everything that isn't a calendar" half). The
      // calendar tab only shows rows explicitly tagged as such.
      if (row.project_type === 'calendar') counts.calendar += 1;
      else counts.editing += 1;
    }
    return counts;
  }, [allRows]);

  const activeProjectTab: ProjectTabSlug | null = isProjectTab(tab) ? tab : null;
  const visibleProjects = useMemo(() => {
    if (!activeProjectTab) return [] as ReviewLinkRow[];
    const filter = PROJECT_TAB_FILTER[activeProjectTab];
    if (filter === null) return sortedLinks;
    return sortedLinks.filter((link) => {
      const type: ReviewProjectType = link.project_type ?? 'editing';
      return type === filter;
    });
  }, [sortedLinks, activeProjectTab]);

  // Month-grouped view: take the same `visibleProjects` slice and split
  // into bucketed sections. Inside each bucket, rows are sorted by the
  // grouping field descending so the most recent project in a month
  // sits at the top of its section regardless of the column the user
  // clicked. This deliberately overrides `sort` while group mode is
  // active because the column-sort intent ("show me by date sent") is
  // incompatible with "show me each month's batch in order."
  const monthGroups = useMemo(() => {
    const groups = groupRowsByMonth(visibleProjects, groupBy);
    return groups.map((g) => ({
      ...g,
      rows: [...g.rows].sort((a, b) => {
        const aIso = groupBy === 'approval' ? a.approved_at ?? '' : a.created_at;
        const bIso = groupBy === 'approval' ? b.approved_at ?? '' : b.created_at;
        return bIso.localeCompare(aIso);
      }),
    }));
  }, [visibleProjects, groupBy]);

  // Resolve the active month bucket from `focusedMonthKey`, falling
  // back to the newest group when the stored key isn't in the current
  // set (group field switched, tab changed, or first paint after
  // enabling group mode). The fallback is computed during render so
  // chevrons always operate against the freshest group list.
  const focusedGroupIndex = useMemo(() => {
    if (monthGroups.length === 0) return -1;
    const idx = monthGroups.findIndex((g) => g.key === focusedMonthKey);
    return idx >= 0 ? idx : 0;
  }, [monthGroups, focusedMonthKey]);
  const focusedGroup = focusedGroupIndex >= 0 ? monthGroups[focusedGroupIndex] : null;

  /**
   * Optimistic patch. The discriminator on the row id (`editing:<uuid>`)
   * tells us which slice owns the row so a rename or project-type
   * change updates the right state container without a refetch.
   */
  function patchLink(id: string, patch: Partial<ReviewLinkRow>) {
    if (id.startsWith('editing:')) {
      const projectId = id.slice('editing:'.length);
      setEditingProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                name: patch.name !== undefined ? (patch.name ?? p.name) : p.name,
                project_type:
                  patch.project_type !== undefined && patch.project_type !== null
                    ? (patch.project_type as EditingProjectType)
                    : p.project_type,
              }
            : p,
        ),
      );
      return;
    }
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /**
   * Delete a project (soft-delete under the hood). Calendar links
   * flip `archived_at` via PATCH; editing projects DELETE through the
   * editing API (which sets `status='archived'`). Both branches strip
   * the row optimistically and roll back on failure.
   *
   * Function + prop names still say "archive" because the underlying
   * DB columns are `archived_at` / `status='archived'`; user-facing
   * copy says "Delete" because that's the mental model (the row is
   * gone from the list, restoration is a DB-side action).
   */
  async function archiveLink(id: string) {
    if (id.startsWith('editing:')) {
      const projectId = id.slice('editing:'.length);
      const snapshot = editingProjects;
      setEditingProjects((prev) => prev.filter((p) => p.id !== projectId));
      try {
        const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Delete failed');
        toast.success('Project deleted');
      } catch (err) {
        setEditingProjects(snapshot);
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      }
      return;
    }
    const snapshot = links;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      const res = await fetch(`/api/calendar/review/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Project deleted');
    } catch (err) {
      setLinks(snapshot);
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  /**
   * Open the Promote-to-calendar dialog for an editing row. The actual
   * POST happens in `confirmPromote` after the admin picks a date
   * range; this just stages the dialog. Editing rows only — `id` is
   * `editing:<uuid>`.
   */
  function promoteToCalendar(id: string) {
    if (!id.startsWith('editing:')) return;
    const projectId = id.slice('editing:'.length);
    const project = editingProjects.find((p) => p.id === projectId);
    setPromoteFor({
      projectId,
      brandSlug: project?.client_slug ?? null,
      projectName: project?.name ?? null,
    });
    setPromoteRange(defaultPromoteRange());
  }

  /**
   * Fire the promote endpoint with the chosen range. Closes the
   * dialog on success and surfaces an "Open calendar" toast action so
   * the admin can jump to the brand's calendar without hunting through
   * the sidebar.
   */
  async function confirmPromote() {
    if (!promoteFor || promoting) return;
    setPromoting(true);
    const { projectId, brandSlug } = promoteFor;
    const toastId = toast.loading('Promoting to calendar…');
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/promote-to-calendar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_date: promoteRange.start,
            end_date: promoteRange.end,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        post_count?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(body.detail || body.error || 'Promote failed');
      }
      toast.success(
        `Added ${body.post_count ?? 0} draft posts to the calendar`,
        {
          id: toastId,
          action: brandSlug
            ? {
                label: 'Open calendar',
                onClick: () => router.push(`/calendar?brand=${brandSlug}`),
              }
            : undefined,
        },
      );
      setPromoteFor(null);
      void loadProjects(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Promote failed', {
        id: toastId,
      });
    } finally {
      setPromoting(false);
    }
  }

  // Editing detail dialog reads its project from the live editing
  // slice so renames + status changes inside the dialog propagate
  // back into the table without an extra round-trip.
  const activeEditingProject = activeEditingId
    ? editingProjects.find((p) => p.id === activeEditingId) ?? null
    : null;

  const subtitle = describeSubtitle(tab, visibleProjects.length);

  // Wire counts onto the project-tab entries so the strip shows
  // "Organic social 4" / "Paid social 11" inline. Non-project tabs
  // skip the count slot.
  const tabsWithCounts = TABS.map((t) =>
    isProjectTab(t.slug) ? { ...t, count: projectTabCounts[t.slug] } : t,
  );

  return (
    <TooltipProvider>
      <div className="cortex-page-gutter mx-auto max-w-7xl space-y-5">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary">
              Content tools
            </h1>
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          </div>
          {activeProjectTab && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setNewEditingOpen(true)}
              >
                Upload content
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadProjects(true)}
                disabled={refreshing}
                aria-label="Refresh"
              >
                <RefreshCcw
                  size={14}
                  className={refreshing ? 'animate-spin' : ''}
                />
              </Button>
            </div>
          )}
        </header>

        <SubNav<ContentToolsTab>
          items={tabsWithCounts}
          active={tab}
          onChange={setTab}
          ariaLabel="Content tools sections"
        />

        {activeProjectTab && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium uppercase tracking-wide text-text-muted">
                  Group by:
                </span>
                <div
                  role="tablist"
                  aria-label="Group projects"
                  className="inline-flex rounded-md border border-nativz-border bg-surface p-0.5"
                >
                  {GROUP_BY_OPTIONS.map((opt) => {
                    const active = groupBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setGroupBy(opt.value)}
                        className={`rounded px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? 'bg-accent/15 text-accent-text'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {groupBy === 'approval' && focusedGroup && focusedGroup.rows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadApprovedPeriodCsv(focusedGroup.label, focusedGroup.rows)
                  }
                >
                  <Download size={14} />
                  Export CSV
                </Button>
              )}
            </div>
            {loading ? (
              <ProjectsTableSkeleton />
            ) : allRows.length === 0 ? (
              <ProjectsEmptyState />
            ) : focusedGroup ? (
              // Month-grouped mode: focus a single month and page between
              // them with the chevrons so the page reads like a
              // list-view calendar (one batch at a time, not a giant
              // scroll). The card's own `sort` is suppressed (rows
              // pre-sorted by month field) but the header still passes
              // `sort` so column labels render the same.
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = monthGroups[focusedGroupIndex + 1];
                        if (next) setFocusedMonthKey(next.key);
                      }}
                      disabled={focusedGroupIndex >= monthGroups.length - 1}
                      aria-label="Older month"
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <h2 className="text-base font-semibold text-text-primary tabular-nums">
                      {focusedGroup.label}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = monthGroups[focusedGroupIndex - 1];
                        if (prev) setFocusedMonthKey(prev.key);
                      }}
                      disabled={focusedGroupIndex <= 0}
                      aria-label="Newer month"
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                <ReviewTableCard
                  rows={focusedGroup.rows}
                  showBrand
                  onPatchLink={patchLink}
                  onArchiveLink={archiveLink}
                  onPromoteToCalendar={promoteToCalendar}
                  sort={sort}
                  onSortChange={setSort}
                  hideColumns={
                    // The Approved date column is opt-in: only the
                    // Approval group-by view surfaces it as a dedicated
                    // column. In Default grouping it's redundant noise
                    // (date sent is the primary signal) so we hide it.
                    groupBy === 'approval'
                      ? PROJECT_TAB_HIDE[activeProjectTab]
                      : [...PROJECT_TAB_HIDE[activeProjectTab], 'approved_date']
                  }
                  onOpenEditingProject={(id) => setActiveEditingId(id)}
                  onOpenCalendarLink={(link) => setActiveCalendarLink(link)}
                />
              </section>
            ) : (
              <ProjectsEmptyState />
            )}
          </>
        )}
        {tab === 'quick-schedule' && <QuickScheduleTab />}
        {tab === 'history' && <PostingHistoryTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}

        {/*
          Editing-project dialogs live at the shell root so they can be
          opened from any project tab and so their state survives tab
          switches without remounting. `EditingProjectDetail` is
          mounted with `project={null}` when nothing is active so it
          stays in the React tree and animates closed cleanly.
        */}
        <EditingProjectDetail
          project={activeEditingProject}
          onClose={() => setActiveEditingId(null)}
          onChanged={() => void loadProjects(true)}
        />
        <EditingNewProjectDialog
          open={newEditingOpen}
          onClose={() => setNewEditingOpen(false)}
          onCreated={(id, kind) => {
            setNewEditingOpen(false);
            void loadProjects(true);
            if (kind === 'editing') {
              // Editing API returns the project id directly, which is the
              // same id the table keys by, so we can pop the detail
              // dialog open without waiting on the refresh.
              setActiveEditingId(id);
              return;
            }
            // Calendar API returns a content_drop id, while the table
            // keys by share_link id. Switch to the All projects tab so
            // the new row is visible, but let Jack click in himself
            // once it appears. Saves us a stale-closure dance over a
            // second-or-two refresh window.
            setTab('projects');
            toast.success('Calendar added. Open it from the table once captions finish.');
          }}
        />
        <Dialog
          open={!!promoteFor}
          onClose={() => {
            if (!promoting) setPromoteFor(null);
          }}
          title="Promote to calendar"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {promoteFor?.projectName
                ? `Drop "${promoteFor.projectName}" onto the content calendar as draft posts, spread across weekdays in the window below.`
                : 'Drop this project onto the content calendar as draft posts, spread across weekdays in the window below.'}
            </p>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
                Schedule window
              </label>
              <ScheduleRangePicker
                value={promoteRange}
                onChange={setPromoteRange}
                disabled={promoting}
              />
            </div>
            <p className="text-[11px] text-text-muted">
              Posts go out at the brand&apos;s default posting time. AI
              captions fill in within ~60s — you can edit them on the
              calendar once they land.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPromoteFor(null)}
                disabled={promoting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void confirmPromote()}
                disabled={promoting}
              >
                {promoting ? 'Promoting…' : 'Promote'}
              </Button>
            </div>
          </div>
        </Dialog>
        <CalendarLinkDetail
          link={activeCalendarLink}
          onClose={() => setActiveCalendarLink(null)}
          onRevoked={() => void loadProjects(true)}
          onSent={(patch) => {
            // Optimistically refresh the open row + the table so DATE
            // SENT flips and the variant default switches to "revised"
            // without forcing a full reload.
            if (activeCalendarLink) {
              const next = { ...activeCalendarLink, ...patch };
              setActiveCalendarLink(next);
              patchLink(next.id, patch);
            }
          }}
          onFollowupRecorded={(patch) => {
            if (activeCalendarLink) {
              const next = { ...activeCalendarLink, ...patch };
              setActiveCalendarLink(next);
              patchLink(next.id, patch);
            }
          }}
          onApprovedAll={(patch) => {
            // Counters + status flip immediately; the Posts section in
            // the open dialog and the row in the parent table both
            // reflect the new state without waiting on a refetch.
            if (activeCalendarLink) {
              const next = { ...activeCalendarLink, ...patch };
              setActiveCalendarLink(next);
              patchLink(next.id, patch);
            }
          }}
          onChanged={() => void loadProjects(true)}
        />
      </div>
    </TooltipProvider>
  );
}

function describeSubtitle(tab: ContentToolsTab, filteredCount: number): string {
  if (isProjectTab(tab)) {
    const word = filteredCount === 1 ? 'project' : 'projects';
    if (tab === 'projects') {
      return `${filteredCount} ${word} across every brand`;
    }
    const label = PROJECT_TAB_LABEL[tab].toLowerCase();
    return `${filteredCount} ${label} ${word}`;
  }
  switch (tab) {
    case 'quick-schedule':
      return 'Pull editor-approved videos out of Monday and queue them up';
    case 'history':
      return 'Every publish attempt across every brand, succeeded or failed';
    case 'connections':
      return 'Every integration the content pipeline depends on';
    case 'notifications':
      return 'Review POCs and the transactional email feed';
  }
}

