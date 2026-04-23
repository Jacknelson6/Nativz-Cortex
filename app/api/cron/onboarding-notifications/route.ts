import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendOnboardingEmail } from '@/lib/email/resend';
import type { QueuedEvent } from '@/lib/onboarding/queue-notification';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/onboarding-notifications
 *
 * Drains the onboarding_notification_jobs queue. For every row where
 * scheduled_for <= now():
 *   1. Fetch the tracker + client + notify_emails
 *   2. Render a batched email summarising the queued events
 *   3. Send to each recipient in notify_emails[]
 *   4. Delete the row
 *
 * Designed to run every minute via vercel.json crons. CRON_SECRET must
 * match the Authorization header (same pattern as the weekly-report crons).
 */
function isAuthorisedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: due, error } = await admin
    .from('onboarding_notification_jobs')
    .select('tracker_id, events, scheduled_for')
    .lte('scheduled_for', now);

  if (error) {
    console.error('[cron onboarding-notifications] select error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = (due ?? []) as { tracker_id: string; events: QueuedEvent[]; scheduled_for: string }[];

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      // Fetch tracker + client in one query
      const { data: trackerRow } = await admin
        .from('onboarding_trackers')
        .select('id, service, share_token, notify_emails, clients!inner(name, slug)')
        .eq('id', job.tracker_id)
        .maybeSingle();

      if (!trackerRow) {
        // Tracker disappeared — drop the row
        await admin.from('onboarding_notification_jobs').delete().eq('tracker_id', job.tracker_id);
        continue;
      }

      const clientsField = (trackerRow as { clients: unknown }).clients;
      const client = Array.isArray(clientsField)
        ? (clientsField[0] as { name: string; slug: string } | undefined)
        : (clientsField as { name: string; slug: string } | null);
      const recipients = ((trackerRow as { notify_emails?: string[] | null }).notify_emails ?? [])
        .map((e) => e.trim())
        .filter(Boolean);

      if (!client || recipients.length === 0 || job.events.length === 0) {
        await admin.from('onboarding_notification_jobs').delete().eq('tracker_id', job.tracker_id);
        continue;
      }

      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://cortex.nativz.io';
      const shareUrl = `${baseUrl}/onboarding/${client.slug}?token=${(trackerRow as { share_token: string }).share_token}`;

      const { subject, bodyMarkdown } = renderBatchedEmail({
        clientName: client.name,
        service: (trackerRow as { service: string }).service,
        events: job.events,
        shareUrl,
      });

      // One email per recipient. Fire in parallel.
      const results = await Promise.all(
        recipients.map((to) => sendOnboardingEmail({ to, subject, bodyMarkdown })),
      );
      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) sent += 1;
      else failed += 1;

      await admin.from('onboarding_notification_jobs').delete().eq('tracker_id', job.tracker_id);
    } catch (err) {
      failed += 1;
      console.error('[cron onboarding-notifications] job error:', err);
    }
  }

  return NextResponse.json({ ok: true, jobsFound: jobs.length, sent, failed });
}

// ─── Email rendering ────────────────────────────────────────────────────

function renderBatchedEmail(opts: {
  clientName: string;
  service: string;
  events: QueuedEvent[];
  shareUrl: string;
}): { subject: string; bodyMarkdown: string } {
  const { clientName, service, events, shareUrl } = opts;

  const completedCount = events.filter((e) => e.kind === 'item_completed').length;
  const uploadedCount = events.filter((e) => e.kind === 'file_uploaded').length;
  const connectedCount = events.filter((e) => e.kind === 'connection_confirmed').length;

  // Subject summarises the heaviest dimension (completed > uploaded > connected)
  const subject =
    completedCount >= uploadedCount && completedCount >= connectedCount
      ? `${clientName} completed ${completedCount} task${completedCount === 1 ? '' : 's'}`
      : uploadedCount >= connectedCount
        ? `${clientName} uploaded ${uploadedCount} file${uploadedCount === 1 ? '' : 's'}`
        : `${clientName} connected ${connectedCount} platform${connectedCount === 1 ? '' : 's'}`;

  const lines: string[] = [];
  lines.push(`# ${clientName} is moving.`);
  lines.push('');
  lines.push(`Here's what happened in the last minute on their **${service}** onboarding.`);
  lines.push('');

  if (completedCount > 0) {
    lines.push(`## Tasks completed (${completedCount})`);
    for (const e of events.filter((e) => e.kind === 'item_completed')) {
      lines.push(`- ${e.detail}`);
    }
    lines.push('');
  }
  if (uploadedCount > 0) {
    lines.push(`## Files uploaded (${uploadedCount})`);
    for (const e of events.filter((e) => e.kind === 'file_uploaded')) {
      lines.push(`- ${e.detail}`);
    }
    lines.push('');
  }
  if (connectedCount > 0) {
    lines.push(`## Platforms connected (${connectedCount})`);
    for (const e of events.filter((e) => e.kind === 'connection_confirmed')) {
      lines.push(`- ${e.detail}`);
    }
    lines.push('');
  }

  lines.push(`[Open onboarding →](${shareUrl})`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`You're getting this because you're on the notify list for this tracker.`);

  return { subject, bodyMarkdown: lines.join('\n') };
}
