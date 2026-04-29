import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  sendPostHealthAlertEmail,
  type PostHealthFailedPost,
  type PostHealthDisconnect,
} from '@/lib/email/resend';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { createNotification } from '@/lib/notifications/create';
import { getPostingService } from '@/lib/posting';

export const maxDuration = 60;

const ALERT_EMAIL = 'jack@nativz.io';

/**
 * GET /api/cron/post-health
 *
 * Two checks per run, deduped via per-row "alerted_at" stamps so a single
 * incident only fires once:
 *
 *   1. Failed posts — `scheduled_posts.status IN ('failed', 'partially_failed')`
 *      with `health_alerted_at IS NULL`. Cleared automatically when the
 *      publish cron retries and flips status back to 'scheduled' or 'published'
 *      (those rows are filtered out by status, so re-failure with a new error
 *      will re-alert because the column gets reset on retry success).
 *
 *   2. Disconnected social profiles — compare Zernio's `getConnectedProfiles()`
 *      against local `social_profiles WHERE is_active = true`. Anything we
 *      think is active but Zernio says is gone (or returns isActive=false) is
 *      flagged once via `disconnect_alerted_at`, and we flip `is_active=false`
 *      so the profile stops being treated as live.
 *
 * Fan-out is identical for both: digest email to Jack, Google Chat post to
 * `OPS_CHAT_WEBHOOK_URL`, in-app notification to Jack's user row.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 1. Find new failed posts ──────────────────────────────────────────────

  type FailedRow = {
    id: string;
    caption: string | null;
    scheduled_for: string | null;
    failure_reason: string | null;
    retry_count: number | null;
    drop_id: string | null;
    content_drops: { client_id: string; clients: { name: string } | null } | null;
  };

  const { data: failedRows, error: failedErr } = await admin
    .from('scheduled_posts')
    .select(`
      id,
      caption,
      scheduled_for,
      failure_reason,
      retry_count,
      drop_id,
      content_drops!inner ( client_id, clients!inner ( name ) )
    `)
    .in('status', ['failed', 'partially_failed'])
    .is('health_alerted_at', null)
    .returns<FailedRow[]>();

  if (failedErr) {
    console.error('[post-health] failed-posts query error:', failedErr);
  }

  const failedPosts: PostHealthFailedPost[] = (failedRows ?? []).map((r) => ({
    postId: r.id,
    clientName: r.content_drops?.clients?.name ?? '(unknown client)',
    caption: r.caption,
    scheduledFor: r.scheduled_for,
    failureReason: r.failure_reason,
    retryCount: r.retry_count ?? 0,
  }));

  // ── 2. Find disconnected social profiles ──────────────────────────────────

  type ProfileRow = {
    id: string;
    late_profile_id: string | null;
    platform: string;
    username: string | null;
    client_id: string;
    clients: { name: string } | null;
  };

  const { data: localProfiles, error: profileErr } = await admin
    .from('social_profiles')
    .select(`
      id,
      late_profile_id,
      platform,
      username,
      client_id,
      disconnect_alerted_at,
      clients!inner ( name )
    `)
    .eq('is_active', true)
    .is('disconnect_alerted_at', null)
    .returns<(ProfileRow & { disconnect_alerted_at: string | null })[]>();

  if (profileErr) {
    console.error('[post-health] profile query error:', profileErr);
  }

  const disconnects: PostHealthDisconnect[] = [];
  const disconnectedProfileIds: string[] = [];

  if ((localProfiles ?? []).length > 0) {
    let zernioProfiles: Awaited<
      ReturnType<ReturnType<typeof getPostingService>['getConnectedProfiles']>
    > = [];
    try {
      const posting = getPostingService();
      zernioProfiles = await posting.getConnectedProfiles();
    } catch (err) {
      console.error('[post-health] Zernio getConnectedProfiles failed:', err);
    }

    const liveByLateId = new Map<string, boolean>();
    for (const z of zernioProfiles) {
      liveByLateId.set(z.id, z.isActive !== false);
    }

    for (const p of localProfiles ?? []) {
      const lateId = p.late_profile_id;
      if (!lateId) continue; // unmapped local profiles aren't "disconnected" — they're never connected
      const live = liveByLateId.get(lateId);
      if (live === true) continue; // still connected
      // missing from Zernio entirely → disconnected; or returned isActive=false → also disconnected
      disconnects.push({
        profileId: p.id,
        clientName: p.clients?.name ?? '(unknown client)',
        platform: p.platform,
        username: p.username,
      });
      disconnectedProfileIds.push(p.id);
    }
  }

  // ── 3. Fan out (only when there's something to alert) ─────────────────────

  const hasAlerts = failedPosts.length > 0 || disconnects.length > 0;

  if (hasAlerts) {
    const summaryParts: string[] = [];
    if (failedPosts.length > 0) {
      summaryParts.push(`${failedPosts.length} failed post${failedPosts.length === 1 ? '' : 's'}`);
    }
    if (disconnects.length > 0) {
      summaryParts.push(`${disconnects.length} disconnected account${disconnects.length === 1 ? '' : 's'}`);
    }
    const summary = summaryParts.join(' · ');

    // Email
    try {
      await sendPostHealthAlertEmail({
        to: ALERT_EMAIL,
        failedPosts,
        disconnects,
      });
    } catch (err) {
      console.error('[post-health] email send failed:', err);
    }

    // Google Chat (ops space)
    const chatLines: string[] = [`*Cortex post-health alert* — ${summary}`];
    if (failedPosts.length > 0) {
      chatLines.push('', '*Failed posts:*');
      for (const p of failedPosts.slice(0, 10)) {
        const reason = p.failureReason ? ` — \`${p.failureReason.slice(0, 120)}\`` : '';
        chatLines.push(`• ${p.clientName} (retries: ${p.retryCount})${reason}`);
      }
      if (failedPosts.length > 10) chatLines.push(`…and ${failedPosts.length - 10} more.`);
    }
    if (disconnects.length > 0) {
      chatLines.push('', '*Disconnected accounts:*');
      for (const d of disconnects.slice(0, 10)) {
        chatLines.push(`• ${d.clientName} — ${d.platform}${d.username ? ` (@${d.username})` : ''}`);
      }
      if (disconnects.length > 10) chatLines.push(`…and ${disconnects.length - 10} more.`);
    }
    chatLines.push('', 'https://cortex.nativz.io/admin/calendar');
    postToGoogleChatSafe(process.env.OPS_CHAT_WEBHOOK_URL, { text: chatLines.join('\n') }, 'post-health');

    // In-app notification (lookup Jack's user id; super-admin always)
    const { data: jackRow } = await admin
      .from('users')
      .select('id')
      .ilike('email', ALERT_EMAIL)
      .maybeSingle();

    if (jackRow?.id) {
      await createNotification({
        recipientUserId: jackRow.id,
        type: 'post_health_alert',
        title: 'Posting health alert',
        body: summary,
        linkPath: '/admin/calendar',
      });
    }
  }

  // ── 4. Stamp dedup columns so we don't re-alert next run ──────────────────

  const now = new Date().toISOString();

  if (failedPosts.length > 0) {
    const ids = failedPosts.map((p) => p.postId);
    const { error: stampErr } = await admin
      .from('scheduled_posts')
      .update({ health_alerted_at: now })
      .in('id', ids);
    if (stampErr) console.error('[post-health] failed-posts stamp error:', stampErr);
  }

  if (disconnectedProfileIds.length > 0) {
    const { error: stampErr } = await admin
      .from('social_profiles')
      .update({ is_active: false, disconnect_alerted_at: now })
      .in('id', disconnectedProfileIds);
    if (stampErr) console.error('[post-health] disconnect stamp error:', stampErr);
  }

  return NextResponse.json({
    failed_posts_alerted: failedPosts.length,
    disconnects_alerted: disconnects.length,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/post-health',
    extractRowsProcessed: (body) => {
      const b = body as { failed_posts_alerted?: number; disconnects_alerted?: number } | null;
      if (!b) return undefined;
      return (b.failed_posts_alerted ?? 0) + (b.disconnects_alerted ?? 0);
    },
  },
  handleGet,
);
