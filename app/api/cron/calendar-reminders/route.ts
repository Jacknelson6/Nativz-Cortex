import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendCalendarNoOpenReminderEmail,
  sendCalendarNoActionReminderEmail,
  sendCalendarFinalCallEmail,
} from '@/lib/email/resend';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getNotificationSetting } from '@/lib/notifications/get-setting';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';

export const maxDuration = 60;

// Same role filter used by scripts/send-calendar-batch.ts so the cron's
// contacts-fallback can't accidentally email media buyers or aliases that the
// initial bulk-send deliberately skipped.
const EXCLUDE_CONTACT_ROLES = [/paid media only/i, /avoid bulk/i];

/**
 * GET /api/cron/calendar-reminders
 *
 * Three nudge types per share link, each fires at most once (we stamp the
 * column when we ship). Suppressed when the ball is in our court — i.e. there
 * are open `changes_requested` comments without a corresponding admin
 * revision-complete marker.
 *
 *   1. no_open_nudge      — share link not opened   (default 48h after sent)
 *   2. no_action_nudge    — opened, no approvals/revisions (default 72h)
 *   3. final_call         — Xh before earliest scheduled post
 *                           (email client + chat client + chat us)
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [noOpenSetting, noActionSetting, finalCallSetting] = await Promise.all([
    getNotificationSetting('calendar_no_open_nudge'),
    getNotificationSetting('calendar_no_action_nudge'),
    getNotificationSetting('calendar_final_call'),
  ]);

  const admin = createAdminClient();

  type ShareLinkRow = {
    id: string;
    drop_id: string;
    token: string;
    included_post_ids: string[];
    created_at: string;
    last_viewed_at: string | null;
    no_open_nudge_sent_at: string | null;
    no_action_nudge_sent_at: string | null;
    final_call_sent_at: string | null;
    expires_at: string;
    content_drops: {
      id: string;
      client_id: string;
      clients: {
        id: string;
        name: string;
        agency: string | null;
        chat_webhook_url: string | null;
      } | null;
    } | null;
  };

  const { data: shareLinks, error } = await admin
    .from('content_drop_share_links')
    .select(`
      id,
      drop_id,
      token,
      included_post_ids,
      created_at,
      last_viewed_at,
      no_open_nudge_sent_at,
      no_action_nudge_sent_at,
      final_call_sent_at,
      expires_at,
      content_drops!inner (
        id,
        client_id,
        clients!inner ( id, name, agency, chat_webhook_url )
      )
    `)
    .or('no_open_nudge_sent_at.is.null,no_action_nudge_sent_at.is.null,final_call_sent_at.is.null')
    .gt('expires_at', new Date().toISOString())
    .returns<ShareLinkRow[]>();

  if (error) {
    console.error('calendar-reminders: query failed:', error);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const now = Date.now();
  const sent = { no_open: 0, no_action: 0, final_call: 0, skipped: 0 };

  for (const link of shareLinks ?? []) {
    const client = link.content_drops?.clients;
    if (!client) continue;

    const brand = getBrandFromAgency(client.agency);
    const appUrl = process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);
    const shareUrl = `${appUrl}/c/${link.token}`;

    // Recipients: portal users (role=viewer) first; fall back to eligible
    // contacts when the client hasn't onboarded any portal users yet. Contact
    // roles tagged "Paid Media only" or "Avoid bulk" are filtered to match
    // scripts/send-calendar-batch.ts behavior.
    const { data: portalUsers } = await admin
      .from('user_client_access')
      .select('users!inner(email, role)')
      .eq('client_id', client.id)
      .returns<{ users: { email: string; role: string } | null }[]>();
    let recipientEmails = Array.from(
      new Set(
        (portalUsers ?? [])
          .map((r) => r.users?.email)
          .filter((e): e is string => !!e),
      ),
    );

    if (recipientEmails.length === 0) {
      const { data: contacts } = await admin
        .from('contacts')
        .select('email, role')
        .eq('client_id', client.id)
        .returns<{ email: string | null; role: string | null }[]>();
      recipientEmails = Array.from(
        new Set(
          (contacts ?? [])
            .filter((c) => !!c.email)
            .filter((c) => !EXCLUDE_CONTACT_ROLES.some((re) => re.test(c.role ?? '')))
            .map((c) => c.email!.trim())
            .filter((e) => e.length > 0),
        ),
      );
    }

    if (recipientEmails.length === 0) {
      sent.skipped += 1;
      continue;
    }

    // Ball-in-court check: any open `changes_requested` on any post in this
    // share link without a matching revision-complete marker means we owe the
    // client work — skip all nudges until we're done.
    const ballInCourtIsOurs = await isBallInOurCourt(admin, link.included_post_ids);
    const sentMs = new Date(link.created_at).getTime();
    const ageHours = (now - sentMs) / (1000 * 60 * 60);

    // ── 1. no_open_nudge ────────────────────────────────────────────────
    if (
      noOpenSetting.enabled
      && !link.no_open_nudge_sent_at
      && !ballInCourtIsOurs
      && link.last_viewed_at === null
      && ageHours >= toNumber(noOpenSetting.params.windowHours, 48)
    ) {
      try {
        await Promise.all(
          recipientEmails.map((to) => sendCalendarNoOpenReminderEmail({
            to,
            clientName: client.name,
            shareUrl,
            hours: Math.round(ageHours),
            agency: brand,
          })),
        );
        await admin
          .from('content_drop_share_links')
          .update({ no_open_nudge_sent_at: new Date().toISOString() })
          .eq('id', link.id);
        sent.no_open += 1;
      } catch (e) {
        console.error('calendar-reminders: no_open send failed:', e);
      }
    }

    // ── 2. no_action_nudge ──────────────────────────────────────────────
    if (
      noActionSetting.enabled
      && !link.no_action_nudge_sent_at
      && !ballInCourtIsOurs
      && link.last_viewed_at !== null
      && ageHours >= toNumber(noActionSetting.params.windowHours, 72)
    ) {
      const hasAnyAction = await hasApprovalsOrRevisions(admin, link.included_post_ids);
      if (!hasAnyAction) {
        try {
          await Promise.all(
            recipientEmails.map((to) => sendCalendarNoActionReminderEmail({
              to,
              clientName: client.name,
              shareUrl,
              hours: Math.round(ageHours),
              agency: brand,
            })),
          );
          await admin
            .from('content_drop_share_links')
            .update({ no_action_nudge_sent_at: new Date().toISOString() })
            .eq('id', link.id);
          sent.no_action += 1;
        } catch (e) {
          console.error('calendar-reminders: no_action send failed:', e);
        }
      }
    }

    // ── 3. final_call ───────────────────────────────────────────────────
    if (
      finalCallSetting.enabled
      && !link.final_call_sent_at
      && !ballInCourtIsOurs
    ) {
      const earliestPostAt = await getEarliestScheduledPostAt(admin, link.included_post_ids);
      if (earliestPostAt) {
        const firstMs = new Date(earliestPostAt).getTime();
        const hoursUntilFirst = (firstMs - now) / (1000 * 60 * 60);
        const window = toNumber(finalCallSetting.params.hoursBeforeFirstPost, 24);
        if (hoursUntilFirst > 0 && hoursUntilFirst <= window) {
          const firstPostLabel = formatPostDateTime(earliestPostAt);
          try {
            await Promise.all(
              recipientEmails.map((to) => sendCalendarFinalCallEmail({
                to,
                clientName: client.name,
                shareUrl,
                firstPostAt: firstPostLabel,
                agency: brand,
              })),
            );
            // Chat the client space.
            postToGoogleChatSafe(
              client.chat_webhook_url,
              {
                text: `*Final call before publishing* — your first scheduled post goes live ${firstPostLabel}. We'll publish on the dates you saw unless you flag changes. ${shareUrl}`,
              },
              `final_call:${link.id}`,
            );
            // Chat us (Nativz/AC ops space).
            const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
            postToGoogleChatSafe(
              opsWebhook,
              {
                text: `📣 Final-call ping sent to *${client.name}* — first post ${firstPostLabel}. ${shareUrl}`,
              },
              `final_call_ops:${link.id}`,
            );
            await admin
              .from('content_drop_share_links')
              .update({ final_call_sent_at: new Date().toISOString() })
              .eq('id', link.id);
            sent.final_call += 1;
          } catch (e) {
            console.error('calendar-reminders: final_call send failed:', e);
          }
        }
      }
    }
  }

  return NextResponse.json({
    message: 'reminder sweep complete',
    scanned: shareLinks?.length ?? 0,
    ...sent,
  });
}

function toNumber(v: number | string | boolean | string[], fallback: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

async function isBallInOurCourt(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
): Promise<boolean> {
  if (postIds.length === 0) return false;
  // For each post, find the newest changes_requested comment and the
  // matching post_review_links.revisions_completed_at marker. The ball is in
  // our court only when the newest changes_requested is newer than the
  // marker (or the marker is null).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('post_review_comments')
    .select('created_at, review_link_id, post_review_links!inner(post_id, revisions_completed_at)')
    .eq('status', 'changes_requested')
    .gte('created_at', since)
    .in('post_review_links.post_id', postIds)
    .order('created_at', { ascending: false });
  type Row = {
    created_at: string;
    post_review_links:
      | { post_id: string; revisions_completed_at: string | null }
      | { post_id: string; revisions_completed_at: string | null }[]
      | null;
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    const link = Array.isArray(row.post_review_links)
      ? row.post_review_links[0] ?? null
      : row.post_review_links;
    const completedAt = link?.revisions_completed_at ?? null;
    if (!completedAt || new Date(row.created_at) > new Date(completedAt)) {
      return true;
    }
  }
  return false;
}

async function hasApprovalsOrRevisions(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
): Promise<boolean> {
  if (postIds.length === 0) return false;
  const { data } = await admin
    .from('post_review_comments')
    .select('id, post_review_links!inner(post_id)')
    .in('status', ['approved', 'changes_requested'])
    .in('post_review_links.post_id', postIds)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function getEarliestScheduledPostAt(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
): Promise<string | null> {
  if (postIds.length === 0) return null;
  const { data } = await admin
    .from('scheduled_posts')
    .select('scheduled_at')
    .in('id', postIds)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ scheduled_at: string }>();
  return data?.scheduled_at ?? null;
}

function formatPostDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/calendar-reminders' },
  handleGet,
);
