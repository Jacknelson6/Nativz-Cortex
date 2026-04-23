import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';
import { zernioToPlatformKeys } from '@/lib/onboarding/platform-to-zernio';
import { detectPlatform } from '@/lib/onboarding/platform-matcher';
import { queueOnboardingNotification } from '@/lib/onboarding/queue-notification';
import { recomputePhaseStatuses } from '@/lib/onboarding/recompute-phase-statuses';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** First non-empty string among keys on obj. */
function pickStr(obj: Record<string, unknown> | null, ...keys: string[]): string {
  if (!obj) return '';
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

/**
 * Zernio sends either `data: { postId }` (legacy) or top-level `post: { id, ... }`.
 * Account events may use `data` or top-level `account`.
 */
function extractZernioWebhookIds(body: Record<string, unknown>): {
  postId: string;
  accountId: string;
  post: Record<string, unknown> | null;
  account: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
} {
  const data = asRecord(body.data);
  const post = asRecord(body.post);
  const account = asRecord(body.account);

  const postId =
    pickStr(data, 'postId', 'post_id', '_id', 'id') ||
    pickStr(post, 'id', '_id', 'postId') ||
    '';

  const accountId =
    pickStr(data, 'accountId', 'account_id') ||
    pickStr(account, 'id', '_id', 'accountId') ||
    '';

  return { postId, accountId, post, account, data };
}

function normalizeWebhookEvent(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '.');
}

/**
 * POST /api/scheduler/webhooks
 *
 * Receive **Zernio** webhooks and update scheduled post statuses.
 * Handles post.published, post.failed, post.scheduled, post.partial / post.partial_publish,
 * account.connected, and account.disconnected. Verifies HMAC when the **Zernio webhook secret**
 * is configured via `ZERNIO_WEBHOOK_SECRET` (legacy alias: `LATE_WEBHOOK_SECRET`).
 *
 * @auth HMAC SHA-256 in X-Zernio-Signature, X-Late-Signature, or X-Signature (secret required)
 * @returns {{ received: true }}
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook HMAC-SHA256 signature
    const secret = process.env.ZERNIO_WEBHOOK_SECRET ?? process.env.LATE_WEBHOOK_SECRET;
    const rawBody = await request.text();

    if (secret) {
      const signature =
        request.headers.get('x-zernio-signature') ??
        request.headers.get('x-late-signature') ??
        request.headers.get('x-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
      const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
      const actual = signature.replace(/^sha256=/, '');
      // Constant-time comparison to prevent timing attacks
      const a = encoder.encode(expected);
      const b = encoder.encode(actual);
      if (a.byteLength !== b.byteLength) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      let diff = 0;
      for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
      if (diff !== 0) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const event = normalizeWebhookEvent(
      typeof body.event === 'string' ? body.event : typeof body.type === 'string' ? body.type : '',
    );
    const {
      postId,
      accountId,
      post: postPayload,
      account: accountPayload,
      data: dataObj,
    } = extractZernioWebhookIds(body);
    const data = dataObj ?? {};
    const adminClient = createAdminClient();

    switch (event) {
      case 'post.published': {
        if (postId) {
          await adminClient
            .from('scheduled_posts')
            .update({ status: 'published' })
            .eq('late_post_id', postId);
        }
        break;
      }
      case 'post.failed': {
        if (postId) {
          await adminClient
            .from('scheduled_posts')
            .update({ status: 'failed' })
            .eq('late_post_id', postId);
        }

        const failDetail =
          pickStr(asRecord(data) ?? null, 'error', 'message', 'reason') ||
          pickStr(postPayload, 'error', 'message', 'reason', 'failureReason', 'failure_reason') ||
          '';

        const { data: sched } = postId
          ? await adminClient
              .from('scheduled_posts')
              .select('caption, client_id, clients(name)')
              .eq('late_post_id', postId)
              .maybeSingle()
          : { data: null };

        const clientName =
          (sched?.clients as { name?: string } | null)?.name ?? 'Unknown client';
        const dbCaption = (sched?.caption as string | null)?.slice(0, 120) ?? '';
        const webhookCaption = pickStr(postPayload, 'content').slice(0, 120);
        const captionPreview = dbCaption || webhookCaption;

        await notifyZernioWebhookRecipients({
          type: 'post_failed',
          title: `Scheduled post failed — ${clientName}`,
          body: [captionPreview && `Caption: ${captionPreview}`, failDetail && `Detail: ${failDetail}`]
            .filter(Boolean)
            .join('\n'),
          linkPath: '/admin/scheduler',
        });
        break;
      }
      case 'post.scheduled': {
        if (postId) {
          await adminClient
            .from('scheduled_posts')
            .update({ status: 'scheduled' })
            .eq('late_post_id', postId);
        }
        break;
      }
      case 'post.partial_publish':
      case 'post.partial': {
        if (postId) {
          await adminClient
            .from('scheduled_posts')
            .update({ status: 'partially_failed' })
            .eq('late_post_id', postId);
        }
        break;
      }
      case 'account.connected': {
        if (accountId) {
          await adminClient
            .from('social_profiles')
            .update({ is_active: true })
            .eq('late_account_id', accountId);

          // Auto-advance onboarding: find the social profile we just
          // flipped, figure out its client + platform, then tick the
          // matching client-owned checklist item across any active
          // onboarding tracker for that client. Event + manager
          // notification fire automatically.
          await autoTickOnboardingForConnection(adminClient, accountId, accountPayload);
        }
        break;
      }
      case 'account.disconnected': {
        if (accountId) {
          await adminClient
            .from('social_profiles')
            .update({ is_active: false })
            .eq('late_account_id', accountId);
        }

        const { data: prof } = accountId
          ? await adminClient
              .from('social_profiles')
              .select('platform, username, client_id, clients(name)')
              .eq('late_account_id', accountId)
              .maybeSingle()
          : { data: null };

        const clientName =
          (prof?.clients as { name?: string } | null)?.name ?? 'Unknown client';
        const platform =
          (prof?.platform as string) ||
          pickStr(accountPayload, 'platform') ||
          'social';
        const username =
          (prof?.username as string) ||
          pickStr(accountPayload, 'username', 'handle') ||
          '';

        await notifyZernioWebhookRecipients({
          type: 'account_disconnected',
          title: `Social account disconnected — ${clientName}`,
          body: `${platform}${username ? ` (@${username})` : ''} lost connection in Zernio. Reconnect in scheduler or Zernio dashboard.`,
          linkPath: '/admin/scheduler',
        });
        break;
      }
      default: {
        // message.received, comment.received — log for now
        console.log(`Zernio webhook: ${event}`, { postId, accountId, hasPost: !!postPayload });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('POST /api/scheduler/webhooks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * When a Zernio account.connected fires, cross-reference the newly-linked
 * social_profile back to an onboarding tracker and tick the matching
 * client-owned checklist item. "Matching" means the item's task text
 * contains the platform keyword (e.g. a task named "Instagram account
 * access" matches platform=instagram).
 *
 * Silent no-op when:
 *   - No social_profile row found (webhook landed before callback upserted it — the
 *     callback is what creates the row; we rely on its ordering holding)
 *   - No active non-template tracker for the client
 *   - No matching checklist item (the admin didn't add one; still valid)
 *   - Item is owner='agency' (we never tick agency items from webhooks)
 *
 * Errors are swallowed + logged — notifications and checklist side-effects
 * should never bubble up and fail the webhook response, which Zernio
 * retries on non-2xx.
 */
async function autoTickOnboardingForConnection(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  accountPayload: Record<string, unknown> | null,
): Promise<void> {
  try {
    // Resolve the social_profile we just flipped → client + platform
    const { data: profile } = await admin
      .from('social_profiles')
      .select('client_id, platform, username')
      .eq('late_account_id', accountId)
      .maybeSingle();
    if (!profile?.client_id || !profile.platform) return;

    // Find active trackers for this client (can be multiple services).
    const { data: trackers } = await admin
      .from('onboarding_trackers')
      .select('id')
      .eq('client_id', profile.client_id)
      .eq('is_template', false)
      .in('status', ['active', 'paused']);
    const trackerIds = (trackers ?? []).map((t) => t.id);
    if (trackerIds.length === 0) return;

    const platformKeys = zernioToPlatformKeys(profile.platform);
    if (platformKeys.length === 0) return;

    // Pull all groups for these trackers, then all client-owned pending items
    // in those groups whose platform-detected key is one we're matching.
    const { data: groups } = await admin
      .from('onboarding_checklist_groups')
      .select('id, tracker_id')
      .in('tracker_id', trackerIds);
    const groupIds = (groups ?? []).map((g) => g.id);
    if (groupIds.length === 0) return;
    const groupToTracker = new Map((groups ?? []).map((g) => [g.id, g.tracker_id]));

    const { data: items } = await admin
      .from('onboarding_checklist_items')
      .select('id, task, group_id, owner, status')
      .in('group_id', groupIds)
      .eq('owner', 'client')
      .eq('status', 'pending');

    const displayName =
      pickStr(accountPayload, 'username', 'handle', 'display_name', 'displayName') ||
      (typeof profile.username === 'string' ? profile.username : '');

    for (const item of items ?? []) {
      const detected = detectPlatform(item.task);
      if (!detected) continue;
      if (!platformKeys.includes(detected.key)) continue;

      // Tick it.
      await admin.from('onboarding_checklist_items').update({ status: 'done' }).eq('id', item.id);

      const trackerId = groupToTracker.get(item.group_id);
      if (!trackerId) continue;

      // Event + batched notification so the admin feed + digests reflect it.
      await admin.from('onboarding_events').insert({
        tracker_id: trackerId,
        kind: 'connection_confirmed',
        item_id: item.id,
        metadata: {
          task: item.task,
          platform: profile.platform,
          username: displayName || null,
        },
        actor: 'client',
      });
      await queueOnboardingNotification(admin, trackerId, {
        kind: 'connection_confirmed',
        detail: displayName ? `${detected.name} (@${displayName})` : detected.name,
      });
      await recomputePhaseStatuses(admin, trackerId);
    }
  } catch (err) {
    console.error('[webhook account.connected] auto-tick failed:', err);
  }
}
