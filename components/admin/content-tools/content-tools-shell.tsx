'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BadgeDollarSign,
  Bell,
  Cable,
  FileText,
  Layers,
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
  ReviewProjectType,
} from '@/components/scheduler/review-board';
import { ProjectsEmptyState } from './projects-empty-state';
import { ProjectsTableSkeleton } from './projects-table-skeleton';
import { QuickScheduleTab } from './quick-schedule-tab';
import { ConnectionsTab } from './connections-tab';
import { NotificationsTab } from './notifications-tab';

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
  | 'ctv'
  | 'other';

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
  other: 'other',
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
  other: ['project_type'],
};

const PROJECT_TAB_LABEL: Record<ProjectTabSlug, string> = {
  projects: 'All projects',
  organic_social: 'Organic social',
  paid_social: 'Paid social',
  ctv: 'CTV',
  other: 'Other',
};

function isProjectTab(tab: ContentToolsTab): tab is ProjectTabSlug {
  return tab in PROJECT_TAB_FILTER;
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
    slug: 'other',
    label: 'Other',
    icon: <Layers className="size-3.5" />,
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
  // we slice locally instead of refetching per tab.
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  // Per-tab counts feed the badges in the top-level tab strip so Jack
  // can see "11 organic social, 4 paid social, 0 CTV" at a glance.
  const projectTabCounts = useMemo(() => {
    const counts: Record<ProjectTabSlug, number> = {
      projects: links.length,
      organic_social: 0,
      paid_social: 0,
      ctv: 0,
      other: 0,
    };
    for (const link of links) {
      // Untyped rows fall into "Other" so nothing slips through the
      // cracks when a project hasn't been classified yet.
      const type: ReviewProjectType = link.project_type ?? 'other';
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
          counts.other += 1;
          break;
      }
    }
    return counts;
  }, [links]);

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

  const subtitle = describeSubtitle(tab, visibleProjects.length);

  // Wire counts onto the project-tab entries so the strip shows
  // "Organic social 4" / "Paid social 11" inline. Non-project tabs
  // skip the count slot.
  const tabsWithCounts = TABS.map((t) =>
    isProjectTab(t.slug) ? { ...t, count: projectTabCounts[t.slug] } : t,
  );

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
          {activeProjectTab && (
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
          items={tabsWithCounts}
          active={tab}
          onChange={setTab}
          ariaLabel="Content tools sections"
        />

        {activeProjectTab &&
          (loading ? (
            <ProjectsTableSkeleton />
          ) : links.length === 0 ? (
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
            />
          ))}
        {tab === 'quick-schedule' && <QuickScheduleTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
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

