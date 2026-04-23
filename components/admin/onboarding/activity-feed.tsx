import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import {
  CheckCircle2,
  CircleDashed,
  Link2,
  Upload,
  Eye,
  Activity,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatRelativeTime } from '@/lib/utils/format';
import { ONBOARDING_CACHE_TAG, ONBOARDING_CACHE_TTL } from './cache';

type EventKind =
  | 'item_completed'
  | 'item_uncompleted'
  | 'file_uploaded'
  | 'file_deleted'
  | 'connection_confirmed'
  | 'phase_viewed';

type FeedRow = {
  id: string;
  tracker_id: string;
  kind: EventKind;
  metadata: Record<string, unknown> | null;
  actor: 'client' | 'admin';
  created_at: string;
  tracker: {
    service: string;
    client: { name: string; slug: string } | null;
  } | null;
};

/**
 * Live activity feed — the last 20 events fired across every onboarding
 * tracker in the agency. Renders under the overview tiles so admins get a
 * glance-able pulse of what clients are doing right now.
 *
 * Cached with a short TTL + tag invalidation so it updates on next load
 * after any write. Staleness is fine — this is informational, not load-bearing.
 */
const loadRecentEvents = unstable_cache(
  loadRecentEventsUncached,
  ['onboarding-activity-feed'],
  { revalidate: ONBOARDING_CACHE_TTL, tags: [ONBOARDING_CACHE_TAG] },
);

async function loadRecentEventsUncached(): Promise<FeedRow[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('onboarding_events')
      .select(`
        id, tracker_id, kind, metadata, actor, created_at,
        tracker:onboarding_trackers!inner (
          service,
          client:clients (name, slug)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);
    return (data as unknown as FeedRow[] | null) ?? [];
  } catch (err) {
    console.error('[onboarding activity] load failed:', err);
    return [];
  }
}

export async function OnboardingActivityFeed() {
  const events = await loadRecentEvents();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
            <Activity size={15} className="text-accent-text" />
            Recent activity
          </h3>
          <p className="text-[12px] text-text-muted">
            Every client action across every onboarding, newest first.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-nativz-border/60 px-4 py-8 text-center text-[13px] text-text-muted">
          No activity yet. Client events appear here as they tick tasks, upload files, or confirm connections.
        </div>
      ) : (
        <ul className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden divide-y divide-nativz-border">
          {events.map((e) => (
            <FeedItem key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeedItem({ event }: { event: FeedRow }) {
  const { icon, tint, verb } = describe(event.kind);
  const clientName = event.tracker?.client?.name ?? 'Unknown client';
  const service = event.tracker?.service ?? 'unknown';
  const detail = describeDetail(event);
  const href = event.tracker?.client?.slug
    ? `/admin/onboarding/${event.tracker_id}`
    : '/admin/onboarding';

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover/30 transition-colors"
      >
        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${tint}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-primary truncate">
            <span className="font-semibold">{clientName}</span>
            <span className="text-text-muted"> {verb} </span>
            {detail && <span className="text-text-secondary">{detail}</span>}
          </p>
          <p className="text-[11px] text-text-muted">
            {service} · {event.actor === 'client' ? 'Client action' : 'Admin action'}
          </p>
        </div>
        <span className="text-[11px] text-text-muted tabular-nums shrink-0">
          {formatRelativeTime(event.created_at)}
        </span>
      </Link>
    </li>
  );
}

function describe(kind: EventKind): { icon: React.ReactNode; tint: string; verb: string } {
  switch (kind) {
    case 'item_completed':
      return { icon: <CheckCircle2 size={14} />, tint: 'bg-emerald-500/15 text-emerald-400', verb: 'ticked off' };
    case 'item_uncompleted':
      return { icon: <CircleDashed size={14} />, tint: 'bg-surface-hover text-text-muted', verb: 'un-ticked' };
    case 'file_uploaded':
      return { icon: <Upload size={14} />, tint: 'bg-accent-surface text-accent-text', verb: 'uploaded' };
    case 'file_deleted':
      return { icon: <Upload size={14} />, tint: 'bg-red-500/15 text-red-400', verb: 'removed' };
    case 'connection_confirmed':
      return { icon: <Link2 size={14} />, tint: 'bg-purple-500/15 text-purple-400', verb: 'connected' };
    case 'phase_viewed':
      return { icon: <Eye size={14} />, tint: 'bg-surface-hover text-text-muted', verb: 'opened' };
  }
}

function describeDetail(event: FeedRow): string | null {
  const m = event.metadata ?? {};
  if (typeof m.task === 'string') return m.task;
  if (typeof m.filename === 'string') return m.filename;
  if (typeof m.platform === 'string') return m.platform;
  return null;
}
