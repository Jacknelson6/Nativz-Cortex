import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';
import { markPlatformConnection } from '@/lib/onboarding/api';
import {
  syncPlatformRowsFromZernio,
  reconcileParentStatusFromSpp,
} from '@/lib/posting/zernio-reconcile';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { autoBackfillNewPlatform } from '@/lib/scheduler/auto-backfill-platform';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

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
            .select('id, platform, username, client_id, invite_chat_pinged_at, clients(name, agency, chat_webhook_url)')
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

            // Auto-backfill the new platform onto every not-yet-shipped
            // scheduled/draft post so the client's calendar fans out
            // automatically without anyone touching the UI. Posts that
            // are already in Zernio's hands (`late_post_id` set) are
            // skipped — those need cloning, which is destructive enough
            // to leave to the manual Add platform dialog.
            let autoBackfillCount = 0;
            try {
              const result = await autoBackfillNewPlatform({
                admin: adminClient,
                clientId: prof.client_id as string,
                socialProfileId: prof.id as string,
              });
              autoBackfillCount = result.inserted;
            } catch (err) {
              console.error('[zernio-webhook] auto-backfill failed:', err);
            }

            // Ping the SMM team in the client's Google Chat space so they
            // know the account is live and can fan existing posts onto it
            // (calendar header → Add platform). Falls back to the agency
            // miscellaneous-catchall webhook, then OPS_GOOGLE_CHAT_WEBHOOK.
            //
            // Dedup: invite-link OAuth path already fires its own chat
            // ping via `handleInviteCompletion`, which stamps
            // `invite_chat_pinged_at` on the profile. Skip if that stamp
            // is within the last 5 min — the invite ping is the
            // authoritative one for self-serve flows. In-app notification
            // (below) still fires regardless so admins not in Chat see it.
            const recentInvitePing =
              prof.invite_chat_pinged_at &&
              Date.now() - new Date(prof.invite_chat_pinged_at as string).getTime() < 5 * 60_000;
            if (!recentInvitePing) {
              try {
                const client = prof.clients as { name?: string; agency?: string | null; chat_webhook_url?: string | null } | null;
                const webhookUrl =
                  (await resolveTeamChatWebhook(adminClient, {
                    primaryUrl: client?.chat_webhook_url ?? null,
                    agency: client?.agency ?? null,
                  })) ?? process.env.OPS_GOOGLE_CHAT_WEBHOOK ?? null;

                const platform = prof.platform as string;
                const platformLabel = PLATFORM_LABEL[platform] ?? platform;
                const username = (prof.username as string | null) ?? '';
                const handle = username ? `@${username}` : 'their account';
                const brand = client?.name ?? 'Unknown client';

                const backfillSuffix =
                  autoBackfillCount > 0
                    ? ` Auto-added to ${autoBackfillCount} upcoming post${autoBackfillCount === 1 ? '' : 's'}.`
                    : '';
                postToGoogleChatSafe(
                  webhookUrl,
                  {
                    text: `🔌 *${brand}* connected ${platformLabel} as ${handle}.${backfillSuffix} Open the scheduler → Add platform to fan past posts onto it.`,
                  },
                  `zernio-webhook:account.connected:${accountId}`,
                );
              } catch (err) {
                console.error('[zernio-webhook] account.connected chat ping failed:', err);
              }
            }
          }
        }

        // In-app notification (separate from Chat) — uses the same fanout
        // recipients as post.failed / account.disconnected so admins who
        // don't live in Google Chat still see it.
        const { data: profForNotif } = accountId
          ? await adminClient
              .from('social_profiles')
              .select('platform, username, clients(name)')
              .eq('late_account_id', accountId)
              .maybeSingle()
          : { data: null };
        const clientNameForNotif =
          (profForNotif?.clients as { name?: string } | null)?.name ?? 'Unknown client';
        const platformForNotif =
          (profForNotif?.platform as string) ||
          pickStr(accountPayload, 'platform') ||
          'social';
        const usernameForNotif =
          (profForNotif?.username as string) ||
          pickStr(accountPayload, 'username', 'handle') ||
          '';
        await notifyZernioWebhookRecipients({
          type: 'account_connected',
          title: `Social account connected, ${clientNameForNotif}`,
          body: `${platformForNotif}${usernameForNotif ? ` (@${usernameForNotif})` : ''} is live in Zernio. Open the scheduler → Add platform to fan existing posts onto it.`,
          linkPath: '/admin/scheduler',
        });
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

