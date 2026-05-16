/**
 * CUP-02 dispatcher: when a drop enters smm_review state, ping the SMM
 * via the in-app notifications system + (optionally) Slack ops channel.
 *
 * Contract: never throws. Returns a small status object so the caller
 * (CUP-01 handoff route) can include it in the response body for debugging.
 *
 * Dedup: 60s window on content_drops.last_smm_review_notified_at, but
 * bypassed when the previous handoff_history entry was smm_rejected
 * (rejection-then-resubmit is a legitimate new ask per D-04).
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';
import { postOpsSlack, type SlackBlock } from '@/lib/social/slack-webhook';
import type { HandoffHistoryEntry } from '@/lib/calendar/handoff-state';

const DEDUP_WINDOW_MS = 60_000;

export interface NotifySmmReviewReadyArgs {
  dropId: string;
  actorUserId: string;
  note?: string;
}

export interface NotifySmmReviewReadyResult {
  inAppNotified: number;
  slackPosted: boolean;
  slackError?: string;
  skipped?: 'dedup' | 'missing_drop' | 'no_recipients';
}

function parseUserIdList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'date range pending';
  if (start && end) return `${start} to ${end}`;
  return start ?? end ?? '';
}

function priorEntryWasRejection(history: HandoffHistoryEntry[] | null | undefined): boolean {
  if (!Array.isArray(history) || history.length < 2) return false;
  return history[history.length - 2]?.state === 'smm_rejected';
}

export async function notifySmmReviewReady(
  admin: SupabaseClient,
  args: NotifySmmReviewReadyArgs,
): Promise<NotifySmmReviewReadyResult> {
  try {
    const { data: drop, error: dropErr } = await admin
      .from('content_drops')
      .select(
        'id, client_id, start_date, end_date, handoff_history, last_smm_review_notified_at, clients(name, organization_id, smm_reviewer_user_id)',
      )
      .eq('id', args.dropId)
      .maybeSingle();

    if (dropErr || !drop) {
      return { inAppNotified: 0, slackPosted: false, skipped: 'missing_drop' };
    }

    const lastNotifiedAt = drop.last_smm_review_notified_at
      ? new Date(drop.last_smm_review_notified_at as string).getTime()
      : 0;
    const withinDedup = lastNotifiedAt > 0 && Date.now() - lastNotifiedAt < DEDUP_WINDOW_MS;
    const bypassDedup = priorEntryWasRejection(drop.handoff_history as HandoffHistoryEntry[] | null);

    if (withinDedup && !bypassDedup) {
      return { inAppNotified: 0, slackPosted: false, skipped: 'dedup' };
    }

    const client = (drop.clients ?? {}) as {
      name?: string;
      organization_id?: string;
      smm_reviewer_user_id?: string | null;
    };
    const clientName = client.name ?? 'Unknown brand';

    const { count: postCount } = await admin
      .from('content_drop_videos')
      .select('id', { count: 'exact', head: true })
      .eq('drop_id', args.dropId);

    const recipientSet = new Set<string>();
    if (client.smm_reviewer_user_id) {
      recipientSet.add(client.smm_reviewer_user_id);
    } else {
      for (const id of parseUserIdList(process.env.ZERNIO_WEBHOOK_NOTIFY_USER_IDS)) {
        recipientSet.add(id);
      }
    }
    const recipients = [...recipientSet];

    if (recipients.length === 0) {
      return { inAppNotified: 0, slackPosted: false, skipped: 'no_recipients' };
    }

    const reviewUrl = `/admin/calendar/review/drop/${args.dropId}`;
    const dateRange = fmtRange(drop.start_date as string | null, drop.end_date as string | null);
    const title = `${clientName}: calendar ready for review`;
    const body = `${postCount ?? 0} posts, ${dateRange}${args.note ? `. editor note: ${args.note}` : ''}`;

    await Promise.all(
      recipients.map((recipientUserId) =>
        createNotification({
          recipientUserId,
          type: 'drop_smm_review_ready',
          title,
          body,
          linkPath: reviewUrl,
        }),
      ),
    );

    let slackPosted = false;
    let slackError: string | undefined;
    const slackEnabled = process.env.SLACK_OPS_WEBHOOK_ENABLED === 'true';
    const slackUrl = process.env.SLACK_OPS_WEBHOOK_URL;
    const digestOn = process.env.SMM_REVIEW_DIGEST_MODE === 'on';

    if (slackEnabled && slackUrl && !digestOn) {
      const blocks: SlackBlock[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              ':clipboard: *New drop awaiting SMM review*',
              `*Client:* ${clientName}`,
              `*Posts:* ${postCount ?? 0}`,
              `*Window:* ${dateRange}`,
              args.note ? `*Editor note:* ${args.note}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Review on Cortex' },
              url: reviewUrl,
              style: 'primary',
            },
          ],
        },
      ];

      const slackResult = await postOpsSlack({
        webhookUrl: slackUrl,
        text: `New drop awaiting SMM review: ${clientName}`,
        blocks,
      });
      slackPosted = slackResult.ok;
      if (!slackResult.ok) slackError = slackResult.error;
    }

    await admin
      .from('content_drops')
      .update({ last_smm_review_notified_at: new Date().toISOString() })
      .eq('id', args.dropId);

    return {
      inAppNotified: recipients.length,
      slackPosted,
      ...(slackError ? { slackError } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[notify-smm-review] dispatcher failed:', msg);
    return { inAppNotified: 0, slackPosted: false, slackError: msg };
  }
}
