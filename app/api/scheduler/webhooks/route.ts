import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';

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
 * Receive Zernio (formerly Late) webhooks and update scheduled post statuses.
 * Handles post.published, post.failed, post.scheduled, post.partial / post.partial_publish,
 * account.connected, and account.disconnected. Verifies HMAC if
 * ZERNIO_WEBHOOK_SECRET or LATE_WEBHOOK_SECRET is set.
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
