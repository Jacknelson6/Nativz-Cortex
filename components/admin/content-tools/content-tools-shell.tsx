'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BadgeDollarSign,
  Bell,
  Cable,
  FileText,
  Megaphone,
  RefreshCcw,
  Tv,
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
import { EditingNewProjectDialog } from './editing-new-project-dialog';
import { EditingProjectDetail } from './editing-project-detail';
import { CalendarLinkDetail } from './calendar-link-detail';
import { subscribeToCompletion } from '@/lib/editing/upload-store';

/**
 * `/admin/content-tools` shell. Reorganised around project type so
 * Jack can pivot between the cross-brand "everything in flight" view
 * and a single-type breakdown without reaching for filters.
 *
 *   All projects    - every share-link the agency has out (default).
 *   Organic social  - filtered to project_type = organic_content.
 *   Paid social     - filtered to project_type = social_ads.
 *   CTV             - filtered to project_type = ctv_ads.
 *   Other           - everything else (untyped or explicitly other).
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
  | 'paid_social'
  | 'ctv';

type ContentToolsTab =
  | ProjectTabSlug
  | 'quick-schedule'
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
  ctv: 'ctv_ads',
};

/**
 * Per-tab column visibility. Type-specific tabs hide the "Project
 * type" column because every row already shares the same type. Easy
 * to extend later when we want different shapes per tab (e.g. drop
 * "Last followup" on CTV because the cycle is longer there).
 */
const PROJECT_TAB_HIDE: Record<ProjectTabSlug, ReviewHideableColumn[]> = {
  projects: [],
  organic_social: ['project_type'],
  paid_social: ['project_type'],
  ctv: ['project_type'],
};

const PROJECT_TAB_LABEL: Record<ProjectTabSlug, string> = {
  projects: 'All projects',
  organic_social: 'Organic social',
  paid_social: 'Paid social',
  ctv: 'CTV',
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
  const isApproved = p.status === 'approved' || p.status === 'done';
  return {
    id: `editing:${p.id}`,
    token: '',
    drop_id: p.drop_id ?? '',
    drop_start: null,
    drop_end: null,
    client_id: p.client_id,
    client_name: p.client_name,
    client_logo_url: p.client_logo_url,
    post_count: p.video_count,
    approved_count: isApproved ? p.video_count : 0,
    changes_count: 0,
    pending_count: isApproved ? 0 : p.video_count,
    status: statusForReview(p.status),
    expires_at: p.created_at,
    created_at: p.created_at,
    last_viewed_at: null,
    name: p.name,
    project_type: projectTypeForReview(p.project_type),
    project_type_other: null,
    abandoned_at: p.archived_at,
    last_followup_at: null,
    followup_count: 0,
    kind: 'editing',
    editing_project_id: p.id,
    editing_status: p.status,
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
    slug: 'ctv',
    label: 'CTV',
    icon: <Tv className="size-3.5" />,
  },
  {
    slug: 'quick-schedule',
    label: 'Quick schedule',
    icon: <Wand2 className="size-3.5" />,
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

  // Per-tab counts feed the badges in the top-level tab strip so Jack
  // can see "11 organic social, 4 paid social, 0 CTV" at a glance.
  // Counts include both calendar share links and editing projects so
  // every row in the merged view is accounted for.
  const projectTabCounts = useMemo(() => {
    const counts: Record<ProjectTabSlug, number> = {
      projects: allRows.length,
      organic_social: 0,
      paid_social: 0,
      ctv: 0,
    };
    for (const row of allRows) {
      // Untyped/"other" rows still land in `All projects` but no longer
      // get their own tab. Skip the per-type counters for them.
      const type: ReviewProjectType = row.project_type ?? 'other';
      switch (type) {
        case 'organic_content':
          counts.organic_social += 1;
          break;
        case 'social_ads':
          counts.paid_social += 1;
          break;
        case 'ctv_ads':
          counts.ctv += 1;
          break;
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
            {loading ? (
              <ProjectsTableSkeleton />
            ) : allRows.length === 0 ? (
              <ProjectsEmptyState />
            ) : (
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
            )}
          </>
        )}
        {tab === 'quick-schedule' && <QuickScheduleTab />}
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
    // Preserve "CTV" casing; lowercase everything else so the
    // sentence reads naturally ("5 organic social projects").
    const raw = PROJECT_TAB_LABEL[tab];
    const label = raw === 'CTV' ? 'CTV' : raw.toLowerCase();
    return `${filteredCount} ${label} ${word}`;
  }
  switch (tab) {
    case 'quick-schedule':
      return 'Pull editor-approved videos out of Monday and queue them up';
    case 'connections':
      return 'Every integration the content pipeline depends on';
    case 'notifications':
      return 'Review POCs and the transactional email feed';
  }
}

