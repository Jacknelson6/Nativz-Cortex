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

const EXCLUDE_CONTACT_ROLES = [/paid media only/i, /avoid bulk/i];

/**
 * GET /api/cron/calendar-reminders
 *
 * Three nudge types per share link, each fires at most once. Suppressed when:
 *   • pending count == 0 (everything is approved or actively in our court), or
 *   • another share link on the same drop already nudged that type recently.
 *
 *   1. no_open_nudge      — share link not opened   (default 48h after sent)
 *   2. no_action_nudge    — opened, posts still pending (default 72h)
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
    revisions_ops_nudged_at: string | null;
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
      revisions_ops_nudged_at,
      expires_at,
      content_drops!inner (
        id,
        client_id,
        clients!inner ( id, name, agency, chat_webhook_url )
      )
    `)
    .or('no_open_nudge_sent_at.is.null,no_action_nudge_sent_at.is.null,final_call_sent_at.is.null,revisions_ops_nudged_at.is.null')
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
    // contacts when the client hasn't onboarded any portal users yet.
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

    // The single source of truth: how many posts in this link still need
    // the client's eyes. Drives whether we email at all and what the copy
    // says. Replaces the old binary "any-action / ball-in-court" guards.
    const {
      pending,
      total,
      hasRevisionFeedback,
      ourCourtCount,
      oldestOurCourtAt,
    } = await countPendingPosts(admin, link.included_post_ids);
    const sentMs = new Date(link.created_at).getTime();
    const ageHours = (now - sentMs) / (1000 * 60 * 60);

    // ── Ops nudge: revisions sitting in our court ───────────────────
    //
    // When the client leaves revisions and we've sat on them for
    // OPS_NUDGE_HOURS, ping ops chat once. The stamp clears in
    // revision/complete when the drop becomes clean, so the next
    // round of feedback can re-trigger.
    const OPS_NUDGE_HOURS = 48;
    if (
      ourCourtCount > 0
      && !link.revisions_ops_nudged_at
      && oldestOurCourtAt
      && (now - new Date(oldestOurCourtAt).getTime()) / (1000 * 60 * 60) >= OPS_NUDGE_HOURS
    ) {
      const oldestHours = Math.round(
        (now - new Date(oldestOurCourtAt).getTime()) / (1000 * 60 * 60),
      );
      const noun = ourCourtCount === 1 ? 'post' : 'posts';
      postToGoogleChatSafe(
        process.env.OPS_CHAT_WEBHOOK_URL ?? null,
        {
          text:
            `🛠 Revisions overdue — *${client.name}* has ${ourCourtCount} ${noun} `
            + `awaiting our edits (oldest ${oldestHours}h ago). ${shareUrl}`,
        },
        `revisions_ops:${link.id}`,
      );
      await admin
        .from('content_drop_share_links')
        .update({ revisions_ops_nudged_at: new Date().toISOString() })
        .eq('id', link.id);
    }

    // Suppress all client-facing nudges when:
    //   • nothing is pending (everything approved or in our court), or
    //   • the client has left ANY revision feedback in this drop. Their
    //     comment on one post often applies to others, so we'd rather wait
    //     for them to come back on their own than badger them to review
    //     posts they may have implicitly addressed already.
    if (pending === 0 || hasRevisionFeedback) {
      const stamps: Record<string, string> = {};
      const nowIso = new Date().toISOString();
      if (!link.no_open_nudge_sent_at) stamps.no_open_nudge_sent_at = nowIso;
      if (!link.no_action_nudge_sent_at) stamps.no_action_nudge_sent_at = nowIso;
      if (!link.final_call_sent_at) stamps.final_call_sent_at = nowIso;
      if (Object.keys(stamps).length > 0) {
        await admin
          .from('content_drop_share_links')
          .update(stamps)
          .eq('id', link.id);
      }
      sent.skipped += 1;
      continue;
    }

    // ── 1. no_open_nudge ────────────────────────────────────────────────
    if (
      noOpenSetting.enabled
      && !link.no_open_nudge_sent_at
      && link.last_viewed_at === null
      && ageHours >= toNumber(noOpenSetting.params.windowHours, 48)
    ) {
      const dropAlreadyNudged = await alreadyNudgedDrop(
        admin,
        link.drop_id,
        link.id,
        'no_open_nudge_sent_at',
      );
      if (dropAlreadyNudged) {
        await admin
          .from('content_drop_share_links')
          .update({ no_open_nudge_sent_at: new Date().toISOString() })
          .eq('id', link.id);
        sent.skipped += 1;
      } else {
        try {
          await Promise.all(
            recipientEmails.map((to) => sendCalendarNoOpenReminderEmail({
              to,
              clientName: client.name,
              shareUrl,
              hours: Math.round(ageHours),
              pending,
              total,
              agency: brand,
              clientId: client.id,
              dropId: link.drop_id,
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
    }

    // ── 2. no_action_nudge ──────────────────────────────────────────────
    if (
      noActionSetting.enabled
      && !link.no_action_nudge_sent_at
      && link.last_viewed_at !== null
      && ageHours >= toNumber(noActionSetting.params.windowHours, 72)
    ) {
      const dropAlreadyNudged = await alreadyNudgedDrop(
        admin,
        link.drop_id,
        link.id,
        'no_action_nudge_sent_at',
      );
      if (dropAlreadyNudged) {
        await admin
          .from('content_drop_share_links')
          .update({ no_action_nudge_sent_at: new Date().toISOString() })
          .eq('id', link.id);
        sent.skipped += 1;
      } else {
        try {
          await Promise.all(
            recipientEmails.map((to) => sendCalendarNoActionReminderEmail({
              to,
              clientName: client.name,
              shareUrl,
              hours: Math.round(ageHours),
              pending,
              total,
              agency: brand,
              clientId: client.id,
              dropId: link.drop_id,
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
    ) {
      const earliestPostAt = await getEarliestScheduledPostAt(admin, link.included_post_ids);
      if (earliestPostAt) {
        const firstMs = new Date(earliestPostAt).getTime();
        const hoursUntilFirst = (firstMs - now) / (1000 * 60 * 60);
        const window = toNumber(finalCallSetting.params.hoursBeforeFirstPost, 24);
        if (hoursUntilFirst > 0 && hoursUntilFirst <= window) {
          const dropAlreadyNudged = await alreadyNudgedDrop(
            admin,
            link.drop_id,
            link.id,
            'final_call_sent_at',
          );
          if (dropAlreadyNudged) {
            await admin
              .from('content_drop_share_links')
              .update({ final_call_sent_at: new Date().toISOString() })
              .eq('id', link.id);
            sent.skipped += 1;
          } else {
            const firstPostLabel = formatPostDateTime(earliestPostAt);
            try {
              await Promise.all(
                recipientEmails.map((to) => sendCalendarFinalCallEmail({
                  to,
                  clientName: client.name,
                  shareUrl,
                  firstPostAt: firstPostLabel,
                  pending,
                  total,
                  agency: brand,
                  clientId: client.id,
                  dropId: link.drop_id,
                })),
              );
              postToGoogleChatSafe(
                client.chat_webhook_url,
                {
                  text: `*Final call before publishing* — ${pending} of ${total} ${pending === 1 ? 'post' : 'posts'} still pending. Your first scheduled post goes live ${firstPostLabel}. ${shareUrl}`,
                },
                `final_call:${link.id}`,
              );
              const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
              postToGoogleChatSafe(
                opsWebhook,
                {
                  text: `📣 Final-call ping sent to *${client.name}* — ${pending}/${total} pending, first post ${firstPostLabel}. ${shareUrl}`,
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

/**
 * For each post in `postIds`, find its newest meaningful comment
 * (`approved` or `changes_requested`) and decide whose court it's in:
 *   • approved                                    → done, ignore
 *   • changes_requested newer than revisions_completed_at → ours, ignore
 *   • changes_requested older than the marker     → back in client's court, pending
 *   • no comments                                 → pending
 *
 * Returns the count of "pending" posts (need the client's eyes) so the
 * cron can decide whether to nudge AND surface the count in the email.
 */
async function countPendingPosts(
  admin: ReturnType<typeof createAdminClient>,
  postIds: string[],
): Promise<{
  pending: number;
  total: number;
  hasRevisionFeedback: boolean;
  ourCourtCount: number;
  oldestOurCourtAt: string | null;
}> {
  const total = postIds.length;
  if (total === 0) {
    return {
      pending: 0,
      total: 0,
      hasRevisionFeedback: false,
      ourCourtCount: 0,
      oldestOurCourtAt: null,
    };
  }

  type Row = {
    created_at: string;
    status: 'approved' | 'changes_requested';
    post_review_links:
      | { post_id: string; revisions_completed_at: string | null }
      | { post_id: string; revisions_completed_at: string | null }[]
      | null;
  };
  const { data } = await admin
    .from('post_review_comments')
    .select('created_at, status, post_review_links!inner(post_id, revisions_completed_at)')
    .in('status', ['approved', 'changes_requested'])
    .in('post_review_links.post_id', postIds)
    .order('created_at', { ascending: false })
    .returns<Row[]>();

  // Latest comment per post (data is already ordered DESC, so first hit wins).
  const latestByPost = new Map<
    string,
    { status: 'approved' | 'changes_requested'; created_at: string; revisions_completed_at: string | null }
  >();
  let hasRevisionFeedback = false;
  for (const row of data ?? []) {
    const link = Array.isArray(row.post_review_links)
      ? row.post_review_links[0] ?? null
      : row.post_review_links;
    if (!link) continue;
    if (row.status === 'changes_requested') hasRevisionFeedback = true;
    if (latestByPost.has(link.post_id)) continue;
    latestByPost.set(link.post_id, {
      status: row.status,
      created_at: row.created_at,
      revisions_completed_at: link.revisions_completed_at,
    });
  }

  let pending = 0;
  let ourCourtCount = 0;
  let oldestOurCourtAt: string | null = null;
  for (const id of postIds) {
    const latest = latestByPost.get(id);
    if (!latest) {
      pending += 1;
      continue;
    }
    if (latest.status === 'approved') continue;
    const completedAt = latest.revisions_completed_at;
    if (!completedAt || new Date(latest.created_at) > new Date(completedAt)) {
      // Latest is changes_requested with no matching revision-complete marker
      // (or older one) — ball is in OUR court, not the client's.
      ourCourtCount += 1;
      if (!oldestOurCourtAt || new Date(latest.created_at) < new Date(oldestOurCourtAt)) {
        oldestOurCourtAt = latest.created_at;
      }
      continue;
    }
    // We delivered revisions after the changes_requested → client owes us.
    pending += 1;
  }

  return { pending, total, hasRevisionFeedback, ourCourtCount, oldestOurCourtAt };
}

/**
 * Drop-level dedupe. If another share link on the same drop already sent
 * this nudge type within the last 7 days, skip and stamp this link so we
 * don't keep evaluating. Prevents re-mint flows from double-emailing
 * clients who got the same nudge through the prior link.
 */
async function alreadyNudgedDrop(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
  excludeLinkId: string,
  column: 'no_open_nudge_sent_at' | 'no_action_nudge_sent_at' | 'final_call_sent_at',
): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('content_drop_share_links')
    .select('id')
    .eq('drop_id', dropId)
    .neq('id', excludeLinkId)
    .not(column, 'is', null)
    .gte(column, since)
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
