'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Search,
  Camera,
  Image,
  UserPlus,
  FileText,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils/format';

type ActivityEvent = {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, string> | null;
  created_at: string;
};

const actionIcons: Record<string, React.ReactNode> = {
  search_completed: <Search size={14} className="text-blue-400" />,
  search_started: <Search size={14} className="text-blue-400/60" />,
  shoot_scheduled: <Camera size={14} className="text-accent2-text" />,
  shoot_completed: <Camera size={14} className="text-emerald-400" />,
  client_created: <UserPlus size={14} className="text-emerald-400" />,
  report_approved: <CheckCircle2 size={14} className="text-emerald-400" />,
  idea_submitted: <FileText size={14} className="text-amber-400" />,
  moodboard_created: <Image size={14} className="text-pink-400" />,
};

const entityIcons: Record<string, React.ReactNode> = {
  search: <Search size={14} className="text-blue-400" />,
  shoot: <Camera size={14} className="text-accent2-text" />,
  client: <UserPlus size={14} className="text-emerald-400" />,
  idea: <FileText size={14} className="text-amber-400" />,
  report: <CheckCircle2 size={14} className="text-emerald-400" />,
};

function getIcon(event: ActivityEvent) {
  return actionIcons[event.action] ?? entityIcons[event.entity_type] ?? <Activity size={14} className="text-text-muted" />;
}

function getDescription(event: ActivityEvent): string {
  const meta = event.metadata ?? {};
  const name = meta.client_name || meta.query || meta.title || '';

  switch (event.action) {
    case 'search_completed': return `Search completed${name ? `: "${name}"` : ''}`;
    case 'search_started': return `Search started${name ? `: "${name}"` : ''}`;
    case 'shoot_scheduled': return `Shoot scheduled${name ? ` · ${name}` : ''}`;
    case 'shoot_completed': return `Shoot completed${name ? ` · ${name}` : ''}`;
    case 'client_created': return `Client onboarded${name ? `: ${name}` : ''}`;
    case 'report_approved': return `Report approved${name ? ` · ${name}` : ''}`;
    case 'idea_submitted': return `Idea submitted${name ? `: "${name}"` : ''}`;
    case 'moodboard_created': return `Moodboard created${name ? `: ${name}` : ''}`;
    default: return `${event.action.replace(/_/g, ' ')}${name ? ` · ${name}` : ''}`;
  }
}

function getLink(event: ActivityEvent): string | null {
  switch (event.entity_type) {
    case 'search': return `/admin/finder/${event.entity_id}`;
    case 'client': return `/admin/clients`;
    case 'shoot': return `/admin/shoots`;
    default: return null;
  }
}

export function ActivityFeed({ initialEvents }: { initialEvents?: ActivityEvent[] }) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents ?? []);
  const [loading, setLoading] = useState(!initialEvents);

  useEffect(() => {
    if (initialEvents) return;
    fetch('/api/activity?limit=20')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [initialEvents]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          <Activity size={16} className="text-blue-400" />
          Recent activity
        </h2>
      </div>

      {loading ? (
        <div className="h-40 w-full rounded-[var(--nz-radius-md)] bg-surface-elevated animate-pulse" />
      ) : events.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No recent activity</p>
      ) : (
        <div className="space-y-1">
          {events.map((event, i) => {
            const link = getLink(event);
            const content = (
              <div
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 hover:bg-surface-elevated group"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated shrink-0">
                  {getIcon(event)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                    {getDescription(event)}
                  </p>
                </div>
                <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                  <Clock size={10} />
                  {formatRelativeTime(event.created_at)}
                </span>
              </div>
            );

            return link ? (
              <Link key={event.id} href={link}>{content}</Link>
            ) : (
              <div key={event.id}>{content}</div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
