'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  Cable,
  Camera,
  FileText,
  RefreshCcw,
  Scissors,
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
  ReviewProjectType,
} from '@/components/scheduler/review-board';
import { ProjectsEmptyState } from './projects-empty-state';
import { ProjectsTableSkeleton } from './projects-table-skeleton';
import { QuickScheduleTab } from './quick-schedule-tab';
import { ConnectionsTab } from './connections-tab';
import { NotificationsTab } from './notifications-tab';
import { EditingTab } from './editing-tab';
import { VideographerTab } from './videographer-tab';

/**
 * `/admin/content-tools` shell. Replaces the old single-purpose
 * "Share Links" page with a 4-tab operations console:
 *
 *   Projects        - cross-brand share-link inventory (the original
 *                     share-links table; everything pending across the
 *                     agency right now).
 *   Quick schedule  - Monday "EM Approved" videos -> thumbnail extract
 *                     + transcribe + caption write -> kick off scheduler.
 *   Connections     - integration health (Drive / Monday / Resend /
 *                     Zernio / Supabase / OpenRouter / Anthropic /
 *                     Nango). Connected vs. missing at a glance.
 *   Notifications   - POC contacts panel + recent transactional email
 *                     activity feed. The "what just went out" view.
 *
 * The Projects tab owns the same data the legacy `/admin/share-links`
 * page rendered. We load it from `/api/calendar/review` (no clientId
 * filter, isAdmin server-side) and feed it into the existing
 * `<ReviewTableCard>` primitive so styling stays identical.
 *
 * Other tabs are independent panes - no cross-coupled state, no shared
 * fetches. Each pane handles its own loading + error rendering so a
 * Connections probe failure can't block the Projects table from
 * rendering.
 */

type ContentToolsTab =
  | 'projects'
  | 'videographer'
  | 'editing'
  | 'quick-schedule'
  | 'connections'
  | 'notifications';

const TABS: {
  slug: ContentToolsTab;
  label: string;
  icon: React.ReactNode;
}[] = [
  { slug: 'projects', label: 'Projects', icon: <FileText className="size-3.5" /> },
  {
    slug: 'videographer',
    label: 'Videographer',
    icon: <Camera className="size-3.5" />,
  },
  {
    slug: 'editing',
    label: 'Editing',
    icon: <Scissors className="size-3.5" />,
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

/**
 * Project-type filter for the Projects tab. Mirrors `ReviewProjectType`
 * from the scheduler with an extra `'all'` slot for the default view.
 * Each filter slug pairs with a customised column set so the table
 * reads cleanly without a redundant "Project type" column.
 */
type ProjectTypeFilter = 'all' | ReviewProjectType;

const PROJECT_TYPE_TABS: {
  slug: ProjectTypeFilter;
  label: string;
}[] = [
  { slug: 'all', label: 'All projects' },
  { slug: 'organic_content', label: 'Organic social' },
  { slug: 'social_ads', label: 'Paid social' },
  { slug: 'ctv_ads', label: 'CTV' },
  { slug: 'other', label: 'Other' },
];

/**
 * Per-tab column visibility. Type-specific tabs hide the "Project type"
 * column because every row already shares the same type. The "All
 * projects" tab keeps the full layout identical to the old behavior so
 * cross-type comparison stays one click away.
 */
const PROJECT_TYPE_HIDE: Record<ProjectTypeFilter, ReviewHideableColumn[]> = {
  all: [],
  organic_content: ['project_type'],
  social_ads: ['project_type'],
  ctv_ads: ['project_type'],
  other: ['project_type'],
};

export function ContentToolsShell() {
  const [tab, setTab] = useState<ContentToolsTab>('projects');

  // Projects tab state lives at the shell level so the count badge in
  // the header (and a future "X open" header chip) stays consistent
  // even when the user clicks away to another tab.
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projectTypeFilter, setProjectTypeFilter] =
    useState<ProjectTypeFilter>('all');
  // Default sort is "Date sent, newest first" - same intent as the
  // previous SortMenu's default - but the user can now click any
  // column header to re-sort the whole table.
  const [sort, setSort] = useState<SortState>({ field: 'date_sent', dir: 'desc' });

  async function loadProjects(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/calendar/review', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { links: ReviewLinkRow[] };
      setLinks(data.links ?? []);
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

  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => sortLinksBy(a, b, sort)),
    [links, sort],
  );

  // Per-type counts feed the SubNav badges. Computed off the unsorted
  // list since we only need totals.
  const projectTypeCounts = useMemo(() => {
    const counts: Record<ProjectTypeFilter, number> = {
      all: links.length,
      organic_content: 0,
      social_ads: 0,
      ctv_ads: 0,
      other: 0,
    };
    for (const link of links) {
      const key: ProjectTypeFilter = link.project_type ?? 'other';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [links]);

  const visibleProjects = useMemo(() => {
    if (projectTypeFilter === 'all') return sortedLinks;
    return sortedLinks.filter((link) => {
      // Untyped rows fall into "Other" so nothing slips through the
      // cracks when a project hasn't been classified yet.
      const key: ProjectTypeFilter = link.project_type ?? 'other';
      return key === projectTypeFilter;
    });
  }, [sortedLinks, projectTypeFilter]);

  function patchLink(id: string, patch: Partial<ReviewLinkRow>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  /**
   * Archive a project (soft-delete via `archived_at`). The row vanishes
   * from local state immediately so the UI feels instant; on failure we
   * pull the snapshot back so the row reappears with everything intact.
   */
  async function archiveLink(id: string) {
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

  const projectsHeaderCount =
    projectTypeFilter === 'all' ? links.length : visibleProjects.length;
  const subtitle = describeSubtitle(tab, projectsHeaderCount, projectTypeFilter);

  return (
    <TooltipProvider>
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-5">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary">
              Content tools
            </h1>
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          </div>
          {tab === 'projects' && (
            <div className="flex items-center gap-2">
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
          items={TABS}
          active={tab}
          onChange={setTab}
          ariaLabel="Content tools sections"
        />

        {tab === 'projects' &&
          (loading ? (
            <ProjectsTableSkeleton />
          ) : links.length === 0 ? (
            <ProjectsEmptyState />
          ) : (
            <div className="space-y-3">
              <SubNav<ProjectTypeFilter>
                items={PROJECT_TYPE_TABS.map((t) => ({
                  ...t,
                  count: projectTypeCounts[t.slug],
                }))}
                active={projectTypeFilter}
                onChange={setProjectTypeFilter}
                ariaLabel="Project type"
              />
              <ReviewTableCard
                rows={visibleProjects}
                showBrand
                onPatchLink={patchLink}
                onArchiveLink={archiveLink}
                title={
                  PROJECT_TYPE_TABS.find((t) => t.slug === projectTypeFilter)
                    ?.label ?? 'Projects'
                }
                sort={sort}
                onSortChange={setSort}
                hideColumns={PROJECT_TYPE_HIDE[projectTypeFilter]}
              />
            </div>
          ))}
        {tab === 'videographer' && <VideographerTab />}
        {tab === 'editing' && <EditingTab />}
        {tab === 'quick-schedule' && <QuickScheduleTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
      </div>
    </TooltipProvider>
  );
}

function describeSubtitle(
  tab: ContentToolsTab,
  projectCount: number,
  projectTypeFilter: ProjectTypeFilter,
): string {
  switch (tab) {
    case 'projects': {
      const word = projectCount === 1 ? 'project' : 'projects';
      if (projectTypeFilter === 'all') {
        return `${projectCount} ${word} across every brand`;
      }
      const raw = PROJECT_TYPE_TABS.find(
        (t) => t.slug === projectTypeFilter,
      )?.label;
      // Preserve "CTV" casing; lowercase everything else so the
      // sentence reads naturally ("5 organic social projects").
      const label = raw === 'CTV' ? 'CTV' : raw?.toLowerCase();
      return `${projectCount} ${label} ${word}`;
    }
    case 'videographer':
      return 'Strategy briefs, shoot dates, and raw footage hand-offs';
    case 'editing':
      return 'Internal pipeline for short-form video projects';
    case 'quick-schedule':
      return 'Pull editor-approved videos out of Monday and queue them up';
    case 'connections':
      return 'Every integration the content pipeline depends on';
    case 'notifications':
      return 'Review POCs and the transactional email feed';
  }
}

