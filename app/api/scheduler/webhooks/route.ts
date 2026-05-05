import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';
import { markPlatformConnection } from '@/lib/onboarding/api';
import { getPostingService } from '@/lib/posting';

/**
 * After Zernio fires a terminal post event (`post.published`,
 * `post.partial_publish`, `post.failed`), pull the per-platform breakdown
 * from `GET /posts/{id}` and write it into `scheduled_post_platforms`.
 *
 * Why this is on the webhook path: Zernio publishes on its own schedule
 * and the webhook usually beats our 2-minute cron, so the cron's
 * per-platform write loop never runs for these. Without this sync,
 * `scheduled_post_platforms.status` stays `pending` and
 * `external_post_url` stays NULL forever even though the parent flips
 * to `published`. That's the bug that left 12+ recent posts stuck
 * with no link rendering in the calendar/share UI.
 *
 * Idempotent: re-running on the same webhook overwrites with the same
 * data. Best-effort: any error here is logged but does NOT fail the
 * webhook (the parent status update already landed).
 */
async function syncPlatformRowsFromZernio(
  adminClient: ReturnType<typeof createAdminClient>,
  latePostId: string,
): Promise<void> {
  // Find the parent post + its per-platform rows with the late_account_id
  // mapping needed to reverse Zernio's accountId echo.
  const { data: parent } = await adminClient
    .from('scheduled_posts')
    .select('id')
    .eq('late_post_id', latePostId)
    .maybeSingle();
  if (!parent) {
    console.warn(
      `[zernio-webhook] no scheduled_posts row for late_post_id=${latePostId}`,
    );
    return;
  }
  const { data: sppRows } = await adminClient
    .from('scheduled_post_platforms')
    .select('id, social_profile_id, status, external_post_url, social_profiles:social_profile_id (late_account_id, platform)')
    .eq('post_id', parent.id);
  if (!sppRows?.length) return;

  // Build late_account_id → spp.id map
  type Spp = {
    id: string;
    social_profile_id: string;
    status: string;
    external_post_url: string | null;
    social_profiles:
      | { late_account_id: string | null; platform: string | null }
      | { late_account_id: string | null; platform: string | null }[]
      | null;
  };
  const sppByLateId = new Map<string, Spp>();
  for (const row of sppRows as Spp[]) {
    const sp = row.social_profiles;
    const flat = Array.isArray(sp) ? sp : sp ? [sp] : [];
    for (const x of flat) {
      if (x.late_account_id) sppByLateId.set(x.late_account_id, row);
    }
  }
  if (sppByLateId.size === 0) return;

  // Pull the actual breakdown from Zernio
  const service = getPostingService();
  const status = await service.getPostStatus(latePostId);

  for (const platform of status.platforms) {
    const spp = sppByLateId.get(platform.profileId);
    if (!spp) continue;
    // Don't downgrade a leg that already published — Zernio's webhook can
    // arrive after we've already reconciled the row from a different
    // late_post_id (per-leg retry creates new Zernio posts but the older
    // legs keep their existing external_post_url). Stomp would erase the
    // public URL and confuse the calendar UI.
    if (spp.status === 'published' && platform.status !== 'published') continue;
    await adminClient
      .from('scheduled_post_platforms')
      .update({
        status: platform.status === 'published' ? 'published' : 'failed',
        external_post_id: platform.externalPostId ?? null,
        external_post_url: platform.externalPostUrl ?? null,
        failure_reason: platform.error ?? null,
      })
      .eq('id', spp.id);
  }
}

/**
 * Derive parent post status from the per-leg statuses after a webhook sync.
 *
 * Why this exists: Zernio fires `post.failed` whenever ANY leg failed in its
 * post, even when 3 of 4 platforms succeeded. The naive webhook handler used
 * to slam `scheduled_posts.status = 'failed'`, which stomped the cron's
 * `partially_failed` (still retrying) state. The cron's main publish loop
 * only picks up `scheduled | publishing | partially_failed`, so a stomped
 * row would never auto-retry — the failed leg was silently abandoned.
 *
 * This helper reads the spp rows after sync and writes the correct
 * aggregate. Mirrors the cron's status logic:
 *   - All legs published → `published`
 *   - Any failed + any published → `partially_failed`
 *   - All failed → `failed`
 *   - Any pending → leave parent alone (cron will resolve it)
 *
 * IMPORTANT: never downgrade `published` to anything else. Webhooks can
 * arrive out-of-order; if we already saw `post.published` and reconciled,
 * a late `post.failed` for an earlier per-leg retry must not erase that.
 */
async function reconcileParentStatusFromSpp(
  adminClient: ReturnType<typeof createAdminClient>,
  latePostId: string,
): Promise<void> {
  const { data: parent } = await adminClient
    .from('scheduled_posts')
    .select('id, status, retry_count, scheduled_at')
    .eq('late_post_id', latePostId)
    .maybeSingle();
  if (!parent) return;

  const { data: rows } = await adminClient
    .from('scheduled_post_platforms')
    .select('status')
    .eq('post_id', (parent as { id: string }).id);
  const statuses = (rows ?? []).map((r) => (r as { status: string }).status);
  if (statuses.length === 0) return;

  const allPublished = statuses.every((s) => s === 'published');
  const anyPending = statuses.some((s) => s === 'pending');
  const anyFailed = statuses.some((s) => s === 'failed');
  const anyPublished = statuses.some((s) => s === 'published');
  const currentStatus = (parent as { status: string }).status;

  // Never downgrade a `published` parent.
  if (currentStatus === 'published' && !allPublished) {
    return;
  }
  // Pending legs mean a per-leg retry is still in flight — let the cron
  // own this row's status.
  if (anyPending) return;

  let next: 'published' | 'partially_failed' | 'failed' | null = null;
  if (allPublished) next = 'published';
  else if (anyFailed && anyPublished) next = 'partially_failed';
  else if (anyFailed && !anyPublished) next = 'failed';

  if (!next || next === currentStatus) return;

  const update: Record<string, unknown> = {
    status: next,
    updated_at: new Date().toISOString(),
  };
  if (next === 'published') {
    update.published_at = new Date().toISOString();
    update.failure_reason = null;
  }
  await adminClient
    .from('scheduled_posts')
    .update(update)
    .eq('id', (parent as { id: string }).id);
}

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

    // Idempotency: Zernio at-least-once delivery (per docs, 7 retries
    // with exponential backoff up to 24h). Dedupe via the X-Zernio-Event-Id
    // header (preferred) or top-level `id` in the payload. A unique-
    // violation on insert means we've seen this event already — respond
    // 2xx immediately so Zernio drops it from its retry queue.
    const eventId =
      request.headers.get('x-zernio-event-id') ??
      request.headers.get('x-late-event-id') ??
      (typeof body.id === 'string' ? body.id : '');
    if (eventId) {
      const { error: dedupeErr } = await adminClient
        .from('zernio_webhook_events')
        .insert({ event_id: eventId, event_type: event });
      if (dedupeErr) {
        // Postgres 23505 is the unique-violation; anything else is
        // unexpected but we still process to avoid losing real events.
        if ((dedupeErr as { code?: string }).code === '23505') {
          return NextResponse.json({ received: true, deduped: true });
        }
        console.error('[zernio-webhook] dedupe insert failed:', dedupeErr);
      }
    }

    switch (event) {
      case 'post.published': {
        if (postId) {
          // Sync per-platform rows first, THEN derive parent status from the
          // spp rows. Avoids the prior race where the webhook stamped
          // `published` based purely on event type but the spp rows weren't
          // yet reconciled, leaving "all legs pending" but parent="published".
          try {
            await syncPlatformRowsFromZernio(adminClient, postId);
            await reconcileParentStatusFromSpp(adminClient, postId);
          } catch (syncErr) {
            console.error(
              `[zernio-webhook] post.published sync/reconcile failed for ${postId}:`,
              syncErr,
            );
            // Last-ditch fallback so the publish event isn't lost entirely.
            await adminClient
              .from('scheduled_posts')
              .update({ status: 'published', published_at: new Date().toISOString() })
              .eq('late_post_id', postId);
          }
        }
        break;
      }
      case 'post.failed': {
        if (postId) {
          // Per-leg fanout: Zernio fires `post.failed` for any per-leg
          // retry that fails — even though 3 of 4 platforms may have
          // already published from earlier passes. Trusting the event
          // type and slamming status='failed' stomped the cron's
          // `partially_failed` (still retrying) state, blocking any
          // further auto-retry. Now we sync spp rows and let
          // reconcileParentStatusFromSpp pick the right aggregate.
          try {
            await syncPlatformRowsFromZernio(adminClient, postId);
            await reconcileParentStatusFromSpp(adminClient, postId);
          } catch (syncErr) {
            console.error(
              `[zernio-webhook] post.failed sync/reconcile failed for ${postId}:`,
              syncErr,
            );
          }
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
          title: `Scheduled post failed, ${clientName}`,
          body: [captionPreview && `Caption: ${captionPreview}`, failDetail && `Detail: ${failDetail}`]
            .filter(Boolean)
            .join('\n'),
          linkPath: '/admin/scheduler',
        });
        break;
      }
      case 'post.scheduled': {
        if (postId) {
          // Only honour `post.scheduled` if the parent isn't already
          // resolved. Per-leg retry creates new Zernio posts that briefly
          // emit `scheduled` events; without this guard a late-arriving
          // event would downgrade `published`/`partially_failed` to
          // `scheduled` and re-enter the cron's publish loop, double-
          // posting already-published legs.
          const { data: parent } = await adminClient
            .from('scheduled_posts')
            .select('status')
            .eq('late_post_id', postId)
            .maybeSingle();
          const cur = (parent as { status?: string } | null)?.status;
          if (cur && cur !== 'published' && cur !== 'partially_failed' && cur !== 'failed') {
            await adminClient
              .from('scheduled_posts')
              .update({ status: 'scheduled' })
              .eq('late_post_id', postId);
          }
        }
        break;
      }
      case 'post.partial_publish':
      case 'post.partial': {
        if (postId) {
          try {
            await syncPlatformRowsFromZernio(adminClient, postId);
            await reconcileParentStatusFromSpp(adminClient, postId);
          } catch (syncErr) {
            console.error(
              `[zernio-webhook] post.partial sync/reconcile failed for ${postId}:`,
              syncErr,
            );
            await adminClient
              .from('scheduled_posts')
              .update({ status: 'partially_failed' })
              .eq('late_post_id', postId);
          }
        }
        break;
      }
      case 'account.connected': {
        if (accountId) {
          await adminClient
            .from('social_profiles')
            .update({ is_active: true })
            .eq('late_account_id', accountId);

          // Mirror the connection into the client's active SMM onboarding so
          // the social_connect step's connections map auto-ticks without the
          // client retapping the screen. No-op if there's no live onboarding.
          const { data: prof } = await adminClient
            .from('social_profiles')
            .select('platform, username, client_id')
            .eq('late_account_id', accountId)
            .maybeSingle();
          if (prof?.client_id && prof?.platform) {
            try {
              await markPlatformConnection({
                client_id: prof.client_id as string,
                platform: prof.platform as string,
                status: 'connected',
                zernio_account_id: accountId,
                username: (prof.username as string) ?? null,
              });
            } catch (err) {
              console.error('[zernio-webhook] markPlatformConnection (connected) failed:', err);
            }
          }
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

        // Flip the active SMM onboarding's connection back to pending so the
        // stepper / admin tracker reflect that the client owes us a reconnect.
        if (prof?.client_id && prof?.platform) {
          try {
            await markPlatformConnection({
              client_id: prof.client_id as string,
              platform: prof.platform as string,
              status: 'pending',
              zernio_account_id: accountId,
              username: username || null,
            });
          } catch (err) {
            console.error('[zernio-webhook] markPlatformConnection (disconnected) failed:', err);
          }
        }

        await notifyZernioWebhookRecipients({
          type: 'account_disconnected',
          title: `Social account disconnected, ${clientName}`,
          body: `${platform}${username ? ` (@${username})` : ''} lost connection in Zernio. Reconnect in scheduler or Zernio dashboard.`,
          linkPath: '/admin/scheduler',
        });
        break;
      }
      default: {
        // message.received, comment.received: log for now
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

