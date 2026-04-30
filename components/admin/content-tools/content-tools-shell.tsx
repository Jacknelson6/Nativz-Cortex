'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  Cable,
  ChevronDown,
  FileText,
  RefreshCcw,
  Scissors,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SubNav } from '@/components/ui/sub-nav';
import {
  ReviewTableCard,
  sortLinks,
  type SortKey,
} from '@/components/scheduler/review-table';
import type { ReviewLinkRow } from '@/components/scheduler/review-board';
import { ProjectsEmptyState } from './projects-empty-state';
import { ProjectsTableSkeleton } from './projects-table-skeleton';
import { QuickScheduleTab } from './quick-schedule-tab';
import { ConnectionsTab } from './connections-tab';
import { NotificationsTab } from './notifications-tab';
import { EditingTab } from './editing-tab';

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

export function ContentToolsShell() {
  const [tab, setTab] = useState<ContentToolsTab>('projects');

  // Projects tab state lives at the shell level so the count badge in
  // the header (and a future "X open" header chip) stays consistent
  // even when the user clicks away to another tab.
  const [links, setLinks] = useState<ReviewLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');

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
    () => [...links].sort((a, b) => sortLinks(a, b, sort)),
    [links, sort],
  );

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

  const subtitle = describeSubtitle(tab, links.length);

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
              <SortMenu sort={sort} onChange={setSort} />
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
            <ReviewTableCard
              rows={sortedLinks}
              showBrand
              onPatchLink={patchLink}
              onArchiveLink={archiveLink}
              title="Projects"
            />
          ))}
        {tab === 'editing' && <EditingTab />}
        {tab === 'quick-schedule' && <QuickScheduleTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
      </div>
    </TooltipProvider>
  );
}

function describeSubtitle(tab: ContentToolsTab, projectCount: number): string {
  switch (tab) {
    case 'projects': {
      const word = projectCount === 1 ? 'project' : 'projects';
      return `${projectCount} ${word} across every brand`;
    }
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

function SortMenu({
  sort,
  onChange,
}: {
  sort: SortKey;
  onChange: (s: SortKey) => void;
}) {
  const label =
    sort === 'newest'
      ? 'Sort by date'
      : sort === 'oldest'
        ? 'Oldest first'
        : 'Most progress';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <span>{label}</span>
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(v) => onChange(v as SortKey)}
        >
          <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="progress">Most progress</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
