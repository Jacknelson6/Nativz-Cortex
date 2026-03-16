import { Calendar, Lock, CalendarDays } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatDate, formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

interface ScheduledPost {
  id: string;
  caption: string;
  scheduled_at: string | null;
  status: string;
  post_type: string | null;
  created_at: string;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' }> = {
  scheduled: { label: 'Scheduled', variant: 'info' },
  published: { label: 'Published', variant: 'success' },
  draft: { label: 'Draft', variant: 'default' },
};

function groupByDate(posts: ScheduledPost[]): Record<string, ScheduledPost[]> {
  const groups: Record<string, ScheduledPost[]> = {};
  for (const post of posts) {
    const dateKey = post.scheduled_at
      ? formatDate(post.scheduled_at)
      : 'Unscheduled';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(post);
  }
  return groups;
}

export default async function PortalCalendarPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if ((client.feature_flags as unknown as Record<string, boolean>).can_view_calendar === false) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Lock size={24} />}
            title="Calendar not enabled"
            description="Contact your Nativz team to enable the content calendar."
          />
        </div>
      );
    }

    const adminClient = createAdminClient();
    const { data: posts } = await adminClient
      .from('scheduled_posts')
      .select('id, caption, scheduled_at, status, post_type, created_at')
      .eq('client_id', client.id)
      .in('status', ['scheduled', 'published'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(100);

    const allPosts = (posts ?? []) as ScheduledPost[];

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2.5">
            <CalendarDays size={20} className="text-accent-text" />
            Content calendar
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Upcoming and published content for your brand.
          </p>
        </div>

        {allPosts.length === 0 ? (
          <EmptyState
            icon={<Calendar size={24} />}
            title="No content scheduled yet"
            description="Your Nativz team will share scheduled posts here when they're ready."
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(groupByDate(allPosts)).map(([dateLabel, datePosts]) => (
              <div key={dateLabel}>
                <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {dateLabel}
                </h2>
                <div className="space-y-2">
                  {datePosts.map((post) => {
                    const statusInfo = STATUS_BADGE[post.status] ?? STATUS_BADGE.draft;
                    return (
                      <Card key={post.id} padding="none">
                        <div className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary line-clamp-2">
                                {post.caption || 'No caption'}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                                {post.post_type && (
                                  <Badge variant="purple">{post.post_type}</Badge>
                                )}
                                {post.scheduled_at && (
                                  <span className="text-xs text-text-muted">
                                    {formatDateTime(post.scheduled_at)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalCalendarPage error:', error);
    return <PageError />;
  }
}
