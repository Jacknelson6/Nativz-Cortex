import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAdmins, truncateNotificationBody } from '@/lib/notifications';

const TITLE_MAX = 100;

function truncateTitle(q: string): string {
  const t = q.trim();
  if (t.length <= TITLE_MAX) return t;
  return `${t.slice(0, TITLE_MAX - 1)}…`;
}

/**
 * Notify admins once per search when a topic search fails (deduped via `ops_failed_notified_at`).
 * Scoped to client when `client_id` is set (assignments + owners), else broadcast to all admins.
 */
export async function notifyTopicSearchFailedOnce(
  admin: SupabaseClient,
  searchId: string,
): Promise<void> {
  const { data: row, error } = await admin
    .from('topic_searches')
    .select('id, query, client_id, summary, ops_failed_notified_at')
    .eq('id', searchId)
    .maybeSingle();

  if (error || !row || row.ops_failed_notified_at) return;

  const detail = truncateNotificationBody((row.summary as string | null)?.trim() || 'No error detail saved.');
  await notifyAdmins({
    type: 'topic_search_failed',
    title: `Topic search failed: ${truncateTitle(row.query as string)}`,
    body: `A topic search did not complete successfully.\n\n${detail}`,
    linkPath: `/admin/finder/${row.id}`,
    clientId: row.client_id ?? undefined,
  });

  await admin
    .from('topic_searches')
    .update({ ops_failed_notified_at: new Date().toISOString() })
    .eq('id', searchId);
}

/**
 * Notify admins once per search when a run looks stuck (deduped via `ops_stuck_notified_at`).
 */
export async function notifyTopicSearchStuckOnce(
  admin: SupabaseClient,
  searchId: string,
  reason: string,
): Promise<void> {
  const { data: row, error } = await admin
    .from('topic_searches')
    .select('id, query, client_id, status, ops_stuck_notified_at')
    .eq('id', searchId)
    .maybeSingle();

  if (error || !row || row.ops_stuck_notified_at) return;

  await notifyAdmins({
    type: 'topic_search_stuck',
    title: `Topic search may be stuck (${row.status}): ${truncateTitle(row.query as string)}`,
    body: truncateNotificationBody(
      `A topic search is taking longer than expected.\n\n${reason}`,
    ),
    linkPath: `/admin/finder/${row.id}`,
    clientId: row.client_id ?? undefined,
  });

  await admin
    .from('topic_searches')
    .update({ ops_stuck_notified_at: new Date().toISOString() })
    .eq('id', searchId);
}
