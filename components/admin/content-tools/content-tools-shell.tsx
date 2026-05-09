'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BadgeDollarSign,
  Bell,
  Cable,
  FileText,
  History,
  Megaphone,
  RefreshCcw,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { MonthlyTargetPills } from './monthly-target-pills';
import { subscribeToCompletion } from '@/lib/editing/upload-store';

function firstOfMonthUTC(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * Group rows into month buckets keyed by `YYYY-MM`, using whichever
 * date the user chose ("created" or "approved"). Rows missing the
 * chosen date land in the `null` bucket so they still render under a
 * fallback "No date" header instead of vanishing.
 */
type GroupByMonth = 'none' | 'created' | 'approved';

function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map((n) => Number(n));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function groupRowsByMonth(
  rows: ReviewLinkRow[],
  field: Exclude<GroupByMonth, 'none'>,
): { key: string | null; label: string; rows: ReviewLinkRow[] }[] {
  const buckets = new Map<string | null, ReviewLinkRow[]>();
  for (const row of rows) {
    const iso = field === 'created' ? row.created_at : row.approved_at ?? null;
    const key = monthKey(iso);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }
  // Sort buckets newest first, with the null/no-date bucket last so it
  // doesn't visually anchor the page above real months.
  const keys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b.localeCompare(a);
  });
  return keys.map((key) => ({
    key,
    label: key ? monthLabel(key) : 'No date',
    rows: buckets.get(key) ?? [],
  }));
}

/**
 * `/admin/content-tools` shell. Reorganised around project type so
 * Jack can pivot between the cross-brand "everything in flight" view
 * and a single-type breakdown without reaching for filters.
 *
 *   All projects    - every share-link the agency has out (default).
 *   Organic social  - filtered to project_type = organic_content.
 *   Paid social     - filtered to project_type = social_ads.
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
  | 'organic_social'
  | 'paid_social';

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
  organic_social: 'organic_content',
  paid_social: 'social_ads',
};

const PROJECT_TAB_HIDE: Record<ProjectTabSlug, ReviewHideableColumn[]> = {
  projects: [],
  organic_social: ['project_type'],
  paid_social: ['project_type'],
};

const PROJECT_TAB_LABEL: Record<ProjectTabSlug, string> = {
  projects: 'All projects',
  organic_social: 'Organic social',
  paid_social: 'Paid social',
};

function isProjectTab(tab: ContentToolsTab): tab is ProjectTabSlug {
  return tab in PROJECT_TAB_FILTER;
}

/**
 * Map an editing project's `project_type` into a `ReviewProjectType`
 * so it can ride in the unified table. The editing model carries an
 * extra `general` bucket for pre-typed legacy rows; we collapse that
 * into `other` here so a row never falls outside the four shared
 * project tabs.
 */
function projectTypeForReview(
  type: EditingProjectType,
): ReviewProjectType {
  switch (type) {
    case 'organic_content':
    case 'social_ads':
    case 'ctv_ads':
      return type;
    case 'general':
    case 'other':
      return 'other';
  }
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
    slug: 'organic_social',
    label: 'Organic social',
    icon: <Megaphone className="size-3.5" />,
  },
  {
    slug: 'paid_social',
    label: 'Paid social',
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

  // Default sort is "Date sent, newest first" - same intent as the
  // previous SortMenu's default - but the user can now click any
  // column header to re-sort the whole table.
  const [sort, setSort] = useState<SortState>({ field: 'date_sent', dir: 'desc' });

  // Group-by-month view mode. When non-`none`, rows are bucketed into
  // <Month> sections (newest first) so the table reads like a list-view
  // calendar. The active value also forces the in-bucket sort onto the
  // chosen date so rows inside a month stay in temporal order.
  const [groupBy, setGroupBy] = useState<GroupByMonth>('none');

  // Month strip lives at the shell level so the pills + (future)
  // by-month row filter share a single source of truth. Defaults to
  // the current UTC month; nudged via the strip's chevrons.
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    firstOfMonthUTC(new Date()),
  );
  // Tick-bumped after a delivery completes so the pills re-fetch
  // without forcing a full table reload.
  const [monthRefreshKey, setMonthRefreshKey] = useState(0);

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
      // A finished upload may flip a `monthly_deliverable_slots` row to
      // `delivered` via auto-deliver; refresh the pills too.
      setMonthRefreshKey((k) => k + 1);
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
      organic_social: 0,
      paid_social: 0,
    };
    for (const row of allRows) {
      const type: ReviewProjectType = row.project_type ?? 'other';
      switch (type) {
        case 'organic_content':
          counts.organic_social += 1;
          break;
        case 'social_ads':
          counts.paid_social += 1;
          break;
        case 'ctv_ads':
        case 'other':
          break;
      }
    }
    return counts;
  }, [allRows]);

  const activeProjectTab: ProjectTabSlug | null = isProjectTab(tab) ? tab : null;
  const visibleProjects = useMemo(() => {
    if (!activeProjectTab) return [] as ReviewLinkRow[];
    const filter = PROJECT_TAB_FILTER[activeProjectTab];
    if (filter === null) return sortedLinks;
    return sortedLinks.filter((link) => {
      const type: ReviewProjectType = link.project_type ?? 'other';
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
    if (groupBy === 'none') return [];
    const groups = groupRowsByMonth(visibleProjects, groupBy);
    return groups.map((g) => ({
      ...g,
      rows: [...g.rows].sort((a, b) => {
        const aIso = groupBy === 'created' ? a.created_at : a.approved_at ?? '';
        const bIso = groupBy === 'created' ? b.created_at : b.approved_at ?? '';
        return bIso.localeCompare(aIso);
      }),
    }));
  }, [visibleProjects, groupBy]);

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
   * Archive a project (soft-delete). Calendar links flip
   * `archived_at` via PATCH; editing projects DELETE through the
   * editing API (which sets `status='archived'`). Both branches strip
   * the row optimistically and roll back on failure.
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
        if (!res.ok) throw new Error('Archive failed');
        toast.success('Project archived');
      } catch (err) {
        setEditingProjects(snapshot);
        toast.error(err instanceof Error ? err.message : 'Archive failed');
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
      if (!res.ok) throw new Error('Archive failed');
      toast.success('Project archived');
    } catch (err) {
      setLinks(snapshot);
      toast.error(err instanceof Error ? err.message : 'Archive failed');
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
                New editing project
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
            <MonthlyTargetPills
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              refreshKey={monthRefreshKey}
            />
            <div className="flex items-center justify-end gap-2 text-xs text-text-muted">
              <label htmlFor="group-by-month" className="font-medium uppercase tracking-wide">
                Group by
              </label>
              <select
                id="group-by-month"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByMonth)}
                className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="none">None</option>
                <option value="created">Created month</option>
                <option value="approved">Approved month</option>
              </select>
            </div>
            {loading ? (
              <ProjectsTableSkeleton />
            ) : allRows.length === 0 ? (
              <ProjectsEmptyState />
            ) : groupBy === 'none' ? (
              <ReviewTableCard
                rows={visibleProjects}
                showBrand
                onPatchLink={patchLink}
                onArchiveLink={archiveLink}
                title={PROJECT_TAB_LABEL[activeProjectTab]}
                sort={sort}
                onSortChange={setSort}
                hideColumns={PROJECT_TAB_HIDE[activeProjectTab]}
                onOpenEditingProject={(id) => setActiveEditingId(id)}
                onOpenCalendarLink={(link) => setActiveCalendarLink(link)}
              />
            ) : (
              // Month-grouped mode: one ReviewTableCard per bucket so
              // each section gets its own header + counter without
              // needing the table to know about grouping. The card's
              // own `sort` is suppressed (rows pre-sorted by month
              // field) but the header still passes `sort` so column
              // labels render the same.
              <div className="space-y-6">
                {monthGroups.map((group) => (
                  <section key={group.key ?? 'no-date'} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <h2 className="text-base font-semibold text-text-primary">
                        {group.label}
                      </h2>
                      <span className="text-xs text-text-muted">
                        {group.rows.length} {group.rows.length === 1 ? 'project' : 'projects'}
                      </span>
                    </div>
                    <ReviewTableCard
                      rows={group.rows}
                      showBrand
                      onPatchLink={patchLink}
                      onArchiveLink={archiveLink}
                      sort={sort}
                      onSortChange={setSort}
                      hideColumns={PROJECT_TAB_HIDE[activeProjectTab]}
                      onOpenEditingProject={(id) => setActiveEditingId(id)}
                      onOpenCalendarLink={(link) => setActiveCalendarLink(link)}
                    />
                  </section>
                ))}
              </div>
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
          onCreated={async (id) => {
            setNewEditingOpen(false);
            await loadProjects(true);
            setActiveEditingId(id);
          }}
        />
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

