'use client';

import Link from 'next/link';
import { Clock, Camera, Palette, Lightbulb, Search, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { formatRelativeTime } from '@/lib/utils/format';

interface RecentShoot {
  id: string;
  title: string;
  shoot_date: string;
  location: string | null;
}

interface RecentMoodboard {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface Idea {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
  submitted_by: string | null;
}

interface SearchItem {
  id: string;
  query: string;
  status: string;
  search_mode: string;
  created_at: string;
  approved_at: string | null;
}

export function ClientActivityCards({
  slug,
  clientId,
  clientName,
  recentShoots,
  recentMoodboards,
  ideas,
  ideaCount,
  searches,
}: {
  slug: string;
  clientId: string;
  clientName: string;
  recentShoots: RecentShoot[];
  recentMoodboards: RecentMoodboard[];
  ideas: Idea[];
  ideaCount: number;
  searches: SearchItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Recent shoots */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Recent shoots</h2>
          <div className="flex items-center gap-2">
            <Link href="/admin/calendar">
              <Button size="xs" variant="ghost" className="text-accent-text">
                <Plus size={12} />
                Add
              </Button>
            </Link>
            <Link href="/admin/calendar">
              <Button size="xs" variant="outline">
                <Camera size={12} />
                View all
              </Button>
            </Link>
          </div>
        </div>
        {recentShoots.length === 0 ? (
          <EmptyState icon={<Camera size={24} />} title="No shoots" description="No shoots scheduled yet." />
        ) : (
          <div className="space-y-2">
            {recentShoots.map((shoot) => (
              <div key={shoot.id} className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{shoot.title}</p>
                  <span className="text-xs text-text-muted flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(shoot.shoot_date).toLocaleDateString()}
                    {shoot.location && ` · ${shoot.location}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Moodboards */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Moodboards</h2>
          <div className="flex items-center gap-2">
            <Link href={`/admin/clients/${slug}/moodboard`}>
              <Button size="xs" variant="ghost" className="text-accent-text">
                <Plus size={12} />
                Add
              </Button>
            </Link>
            <Link href={`/admin/clients/${slug}/moodboard`}>
              <Button size="xs" variant="outline">
                <Palette size={12} />
                Open
              </Button>
            </Link>
          </div>
        </div>
        {recentMoodboards.length === 0 ? (
          <EmptyState icon={<Palette size={24} />} title="No moodboards" description="Create a moodboard for this client." />
        ) : (
          <div className="space-y-2">
            {recentMoodboards.map((board) => (
              <Link key={board.id} href={`/admin/analysis/${board.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{board.name}</p>
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Clock size={10} />
                      Updated {formatRelativeTime(board.updated_at)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Saved ideas */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Saved ideas</h2>
          <Link href={`/admin/clients/${slug}/ideas`}>
            <Button size="xs" variant="outline">
              <Lightbulb size={12} />
              View all
              {ideaCount > 0 && <Badge variant="info" className="ml-1">{ideaCount}</Badge>}
            </Button>
          </Link>
        </div>
        {ideas.length === 0 ? (
          <EmptyState icon={<Lightbulb size={24} />} title="No ideas yet" description={`Ideas from ${clientName} or your team appear here.`} />
        ) : (
          <div className="space-y-2">
            {ideas.map((idea) => (
              <Link key={idea.id} href={`/admin/clients/${slug}/ideas`}>
                <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{idea.title}</p>
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Clock size={10} />
                      {formatRelativeTime(idea.created_at)}
                    </span>
                  </div>
                  <Badge variant={idea.status === 'new' ? 'info' : idea.status === 'accepted' ? 'success' : 'default'}>
                    {idea.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Recent searches */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Recent searches</h2>
          <Link href={`/admin/search/new?client=${clientId}`}>
            <Button size="xs" variant="outline">
              <Search size={12} />
              New search
            </Button>
          </Link>
        </div>
        {searches.length === 0 ? (
          <EmptyState icon={<Search size={24} />} title="No searches yet" description={`Run a search for ${clientName} to get started.`} />
        ) : (
          <div className="space-y-2">
            {searches.map((search) => (
              <Link key={search.id} href={`/admin/search/${search.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{search.query}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={search.search_mode === 'client_strategy' ? 'info' : 'default'} className="text-[10px] px-1.5 py-0">
                        {search.search_mode === 'client_strategy' ? 'Brand' : 'Topic'}
                      </Badge>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(search.created_at)}
                      </span>
                      {search.approved_at && <Badge variant="emerald" className="text-[10px] px-1.5 py-0">Sent</Badge>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
