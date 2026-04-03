import { createAdminClient } from '@/lib/supabase/admin';
import { notifyTopicSearchFailedOnce, notifyTopicSearchStuckOnce } from '@/lib/topic-search/ops-notify';

type TopicSearchOpsRow = {
  id: string;
  query: string;
  status: string;
  client_id: string | null;
  created_at: string;
  processing_started_at: string | null;
  created_by: string | null;
  summary: string | null;
  ops_failed_notified_at: string | null;
  ops_stuck_notified_at: string | null;
};

function processingThresholdMs(): number {
  const m = Number(process.env.TOPIC_SEARCH_STUCK_PROCESSING_MINUTES ?? 25);
  return (Number.isFinite(m) && m > 0 ? m : 25) * 60 * 1000;
}

function queueThresholdMs(): number {
  const m = Number(process.env.TOPIC_SEARCH_STUCK_QUEUE_MINUTES ?? 90);
  return (Number.isFinite(m) && m > 0 ? m : 90) * 60 * 1000;
}

function isStuck(row: TopicSearchOpsRow, now: number): { stuck: boolean; reason: string } {
  const created = new Date(row.created_at).getTime();
  const procStart = row.processing_started_at
    ? new Date(row.processing_started_at).getTime()
    : created;

  if (row.status === 'processing') {
    const delta = now - procStart;
    const limit = processingThresholdMs();
    if (delta > limit) {
      return {
        stuck: true,
        reason: `Processing for ${Math.round(delta / 60000)}m (threshold ${Math.round(limit / 60000)}m).`,
      };
    }
    return { stuck: false, reason: '' };
  }

  if (row.status === 'pending' || row.status === 'pending_subtopics') {
    const delta = now - created;
    const limit = queueThresholdMs();
    if (delta > limit) {
      return {
        stuck: true,
        reason: `Status "${row.status}" for ${Math.round(delta / 60000)}m (threshold ${Math.round(limit / 60000)}m).`,
      };
    }
    return { stuck: false, reason: '' };
  }

  return { stuck: false, reason: '' };
}

/**
 * Cron: notify on failed searches we have not alerted on yet, and on stuck non-terminal rows.
 */
export async function runTopicSearchOpsCron(): Promise<{
  failedNotified: number;
  stuckNotified: number;
}> {
  const admin = createAdminClient();
  const now = Date.now();
  let failedNotified = 0;
  let stuckNotified = 0;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: failedRows } = await admin
    .from('topic_searches')
    .select('id')
    .eq('status', 'failed')
    .is('ops_failed_notified_at', null)
    .gte('created_at', weekAgo)
    .limit(100);

  for (const r of failedRows ?? []) {
    await notifyTopicSearchFailedOnce(admin, r.id);
    failedNotified += 1;
  }

  const { data: activeRows } = await admin
    .from('topic_searches')
    .select(
      'id, query, status, client_id, created_at, processing_started_at, created_by, summary, ops_failed_notified_at, ops_stuck_notified_at',
    )
    .in('status', ['pending', 'pending_subtopics', 'processing'])
    .is('ops_stuck_notified_at', null)
    .limit(300);

  for (const raw of activeRows ?? []) {
    const row = raw as TopicSearchOpsRow;
    const { stuck, reason } = isStuck(row, now);
    if (!stuck) continue;
    await notifyTopicSearchStuckOnce(admin, row.id, reason);
    stuckNotified += 1;
  }

  return { failedNotified, stuckNotified };
}
