import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getPostingService } from '@/lib/posting';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import type { SocialPlatform } from '@/lib/posting/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/synthetic-publish-canary
 *
 * Synthetic publish smoke test (PUB-04). Posts a Cortex-owned canary
 * post on each of the four core platforms once a day (1:00 PM UTC,
 * 8:00 AM CT), then re-probes Zernio 30 min later to confirm the
 * platform actually accepted the post. Fires a chat alert on two
 * consecutive failures per platform.
 *
 * Cadence reduced from every-6h to daily 2026-05-13: chat-noise diet,
 * one publish/verify pair per day is enough signal for "publish path
 * still works" without flooding ops on legit short outages.
 *
 * The canary is the same code path real client posts use (Zernio
 * publishPost), so it catches:
 *   1. Cortex -> Zernio outages (publishPost throws)
 *   2. Zernio -> platform outages (Zernio reports failed)
 *   3. Silent platform rejects (Zernio says published, but verify returns failed)
 *
 * On each tick the cron does three things, in order:
 *   1. PROBE pending canaries: fetch Zernio status for each canary still
 *      in `publish_status='pending'` and flip to published / failed.
 *   2. VERIFY published canaries: any row older than 30min and still
 *      `verification_status='pending'` gets a second Zernio probe to
 *      confirm round-trip success. Deletes the post on success.
 *   3. SCHEDULE new canaries: for each configured platform, if no canary
 *      is currently in flight (pending or pending-verify), schedule a
 *      fresh one.
 *
 * Config via env (cron is a no-op until both are set):
 *   - `CORTEX_CANARY_VIDEO_URL`: public URL to a 3-sec 9:16 MP4
 *     (Mux-hosted, shared across all platforms).
 *   - `CORTEX_CANARY_ACCOUNT_IDS`: JSON map of
 *     `{ "facebook": "<late_account_id>", "instagram": "...", ... }`
 *     Only platforms present in the map are canary-checked.
 *
 * Auth: Bearer `CRON_SECRET`. Schedule: `0 13 * * *` (daily, 8 AM CT).
 */

const CORE_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'tiktok', 'youtube'];

/** Two consecutive failures triggers the alert. Single failures are noise. */
const ALERT_CONSECUTIVE_FAIL_THRESHOLD = 2;

/** Window before a published canary is eligible for verify (matches PUB-02). */
const VERIFY_FLOOR_MS = 30 * 60 * 1000;

/** Window after which we stop trying to verify and stamp 'unverifiable'. */
const VERIFY_CEILING_MS = 24 * 60 * 60 * 1000;

interface CanaryConfig {
  videoUrl: string;
  accountIdByPlatform: Map<SocialPlatform, string>;
}

interface CanaryRow {
  id: string;
  platform: string;
  late_account_id: string | null;
  late_post_id: string | null;
  publish_status: 'pending' | 'published' | 'failed';
  publish_error: string | null;
  published_at: string | null;
  verification_status: string | null;
  alerted_at: string | null;
  created_at: string;
}

function loadConfig(): CanaryConfig | null {
  const videoUrl = process.env.CORTEX_CANARY_VIDEO_URL?.trim();
  const rawAccountIds = process.env.CORTEX_CANARY_ACCOUNT_IDS?.trim();
  if (!videoUrl || !rawAccountIds) return null;

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(rawAccountIds) as Record<string, string>;
  } catch (err) {
    console.error('[synthetic-canary] CORTEX_CANARY_ACCOUNT_IDS is not valid JSON:', err);
    return null;
  }

  const map = new Map<SocialPlatform, string>();
  for (const platform of CORE_PLATFORMS) {
    const accountId = parsed[platform];
    if (typeof accountId === 'string' && accountId.trim().length > 0) {
      map.set(platform, accountId.trim());
    }
  }
  if (map.size === 0) {
    console.warn('[synthetic-canary] CORTEX_CANARY_ACCOUNT_IDS parsed but no core-four mappings present.');
    return null;
  }
  return { videoUrl, accountIdByPlatform: map };
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = loadConfig();
  if (!config) {
    return NextResponse.json({
      skipped: 'CORTEX_CANARY_VIDEO_URL or CORTEX_CANARY_ACCOUNT_IDS not configured',
      probed: 0,
      verified: 0,
      scheduled: 0,
      alerted: 0,
    });
  }

  const admin = createAdminClient();
  const service = getPostingService();
  const nowMs = Date.now();

  // --- Phase 1: probe pending canaries that Zernio has had time to publish.
  const { data: pendingRowsRaw } = await admin
    .from('synthetic_publish_canaries')
    .select('id, platform, late_account_id, late_post_id, publish_status, publish_error, published_at, verification_status, alerted_at, created_at')
    .eq('publish_status', 'pending')
    .not('late_post_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50);
  const pendingRows = (pendingRowsRaw ?? []) as unknown as CanaryRow[];

  let probed = 0;
  const justFailed: CanaryRow[] = [];
  for (const row of pendingRows) {
    if (!row.late_post_id) continue;
    probed += 1;
    try {
      const status = await service.getPostStatus(row.late_post_id);
      const platformLeg = row.late_account_id
        ? status.platforms.find((p) => p.profileId === row.late_account_id)
        : status.platforms[0];

      if (!platformLeg) {
        // Zernio doesn't know the leg yet; leave pending for next tick.
        continue;
      }

      if (platformLeg.status === 'published') {
        await admin
          .from('synthetic_publish_canaries')
          .update({
            publish_status: 'published',
            published_at: new Date().toISOString(),
            verification_status: 'pending',
          })
          .eq('id', row.id);
      } else if (platformLeg.status === 'failed') {
        const reason = platformLeg.error ?? 'Zernio reported failed without an error string.';
        await admin
          .from('synthetic_publish_canaries')
          .update({
            publish_status: 'failed',
            publish_error: reason.slice(0, 1000),
          })
          .eq('id', row.id);
        justFailed.push({ ...row, publish_status: 'failed', publish_error: reason });
      }
      // 'scheduled' / other: leave pending; the next tick re-probes.
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[synthetic-canary] probe ${row.id} (${row.platform}) failed: ${msg}`);
      // Don't flip to failed on a Zernio API error; that's an infra blip,
      // not a canary failure. Stay pending; next tick retries.
    }
  }

  // --- Phase 2: verify published canaries past the 30-min floor.
  const verifyFloorIso = new Date(nowMs - VERIFY_FLOOR_MS).toISOString();
  const verifyCeilIso = new Date(nowMs - VERIFY_CEILING_MS).toISOString();
  const { data: verifyRowsRaw } = await admin
    .from('synthetic_publish_canaries')
    .select('id, platform, late_account_id, late_post_id, publish_status, publish_error, published_at, verification_status, alerted_at, created_at')
    .eq('publish_status', 'published')
    .eq('verification_status', 'pending')
    .lte('published_at', verifyFloorIso)
    .gte('published_at', verifyCeilIso)
    .order('published_at', { ascending: true })
    .limit(50);
  const verifyRows = (verifyRowsRaw ?? []) as unknown as CanaryRow[];

  let verified = 0;
  for (const row of verifyRows) {
    if (!row.late_post_id) continue;
    try {
      const status = await service.getPostStatus(row.late_post_id);
      const platformLeg = row.late_account_id
        ? status.platforms.find((p) => p.profileId === row.late_account_id)
        : status.platforms[0];

      if (!platformLeg) {
        await admin
          .from('synthetic_publish_canaries')
          .update({
            verification_status: 'unverifiable',
            verification_detail: 'Zernio /posts response missing this leg at verify time.',
            verified_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        continue;
      }

      if (platformLeg.status === 'published') {
        await admin
          .from('synthetic_publish_canaries')
          .update({
            verification_status: 'confirmed',
            verified_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        verified += 1;

        // Best-effort cleanup: delete the canary post from the platform so
        // we don't litter the test feed. Delete failure is silent because
        // the test account is private and the content is innocuous.
        try {
          await service.deletePost(row.late_post_id);
          await admin
            .from('synthetic_publish_canaries')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', row.id);
        } catch (delErr) {
          console.warn(
            `[synthetic-canary] deletePost ${row.late_post_id} (${row.platform}) failed:`,
            delErr,
          );
        }
      } else if (platformLeg.status === 'failed') {
        const reason = platformLeg.error ?? 'Platform rejected the canary after publish.';
        await admin
          .from('synthetic_publish_canaries')
          .update({
            verification_status: 'platform_reject',
            verification_detail: reason.slice(0, 1000),
            verified_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        justFailed.push({
          ...row,
          publish_status: 'failed',
          publish_error: reason,
        });
      } else {
        await admin
          .from('synthetic_publish_canaries')
          .update({
            verification_status: 'unverifiable',
            verification_detail: `Zernio leg still '${platformLeg.status}' after 30 min.`,
            verified_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[synthetic-canary] verify ${row.id} (${row.platform}) failed: ${msg}`);
    }
  }

  // --- Phase 3: schedule a new canary for each platform that has no
  // in-flight row (pending publish or pending verify).
  const { data: inFlightRaw } = await admin
    .from('synthetic_publish_canaries')
    .select('platform')
    .or('publish_status.eq.pending,and(publish_status.eq.published,verification_status.eq.pending)');
  const inFlight = new Set<string>(((inFlightRaw ?? []) as { platform: string }[]).map((r) => r.platform));

  let scheduled = 0;
  for (const [platform, accountId] of config.accountIdByPlatform.entries()) {
    if (inFlight.has(platform)) continue;

    const caption = `Cortex canary ${new Date().toISOString()}`;
    try {
      const result = await service.publishPost({
        videoUrl: config.videoUrl,
        caption,
        hashtags: [],
        platformProfileIds: [accountId],
        platformHints: { [accountId]: platform },
      });

      // Find the leg matching our requested account; fall back to the
      // first leg if Zernio renamed the id on the way back.
      const leg =
        result.platforms.find((p) => p.profileId === accountId) ?? result.platforms[0];
      const initialStatus =
        leg?.status === 'published' ? 'published' : leg?.status === 'failed' ? 'failed' : 'pending';
      const insertRow = {
        platform,
        late_account_id: accountId,
        late_post_id: result.externalPostId || null,
        publish_status: initialStatus,
        publish_error: leg?.error ?? null,
        published_at: initialStatus === 'published' ? new Date().toISOString() : null,
        verification_status: initialStatus === 'published' ? 'pending' : null,
      };
      const { data: inserted } = await admin
        .from('synthetic_publish_canaries')
        .insert(insertRow)
        .select('id, platform, late_account_id, late_post_id, publish_status, publish_error, published_at, verification_status, alerted_at, created_at')
        .single();
      scheduled += 1;

      if (initialStatus === 'failed' && inserted) {
        justFailed.push(inserted as unknown as CanaryRow);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[synthetic-canary] publishPost ${platform} failed:`, msg);

      // Cortex -> Zernio outright failure. Stamp a failed row so the
      // two-strike check can fire if the next tick also fails.
      const { data: inserted } = await admin
        .from('synthetic_publish_canaries')
        .insert({
          platform,
          late_account_id: accountId,
          publish_status: 'failed',
          publish_error: msg.slice(0, 1000),
        })
        .select('id, platform, late_account_id, late_post_id, publish_status, publish_error, published_at, verification_status, alerted_at, created_at')
        .single();
      scheduled += 1;
      if (inserted) justFailed.push(inserted as unknown as CanaryRow);
    }
  }

  // --- Phase 4: two-strike alert. For each platform that just produced a
  // failed canary, check whether the prior canary on the same platform
  // also failed. If so, fire one chat alert.
  let alerted = 0;
  if (justFailed.length > 0) {
    const platforms = new Set(justFailed.map((r) => r.platform));
    for (const platform of platforms) {
      const { data: recentRaw } = await admin
        .from('synthetic_publish_canaries')
        .select('id, platform, late_account_id, late_post_id, publish_status, publish_error, published_at, verification_status, alerted_at, created_at')
        .eq('platform', platform)
        .order('created_at', { ascending: false })
        .limit(ALERT_CONSECUTIVE_FAIL_THRESHOLD);
      const recent = (recentRaw ?? []) as unknown as CanaryRow[];
      if (recent.length < ALERT_CONSECUTIVE_FAIL_THRESHOLD) continue;
      const allFailed = recent.every((r) => r.publish_status === 'failed');
      if (!allFailed) continue;

      // Already alerted on the most recent run? Skip; don't spam.
      if (recent[0]?.alerted_at) continue;

      const top = recent[0];
      const reason = top?.publish_error ?? 'Unknown failure.';
      const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL?.trim() || null;
      if (!opsWebhook) {
        console.warn(
          `[synthetic-canary] 2-strike fail on ${platform} but no OPS_CHAT_WEBHOOK_URL configured.`,
        );
        continue;
      }

      const reasonTrunc = reason.length > 200 ? reason.slice(0, 200) + '...' : reason;
      const fallback = [
        `🚨 Pipeline canary failed: ${platform}`,
        `${ALERT_CONSECUTIVE_FAIL_THRESHOLD} consecutive synthetic publishes failed.`,
        '',
        `Latest error: ${reasonTrunc}`,
      ].join('\n');

      postToGoogleChatSafe(
        opsWebhook,
        buildChatCardMessage({
          cardId: `canary-${platform}-${top?.id ?? Date.now()}`,
          title: `🚨 Pipeline canary failed: ${platform}`,
          subtitle: `${ALERT_CONSECUTIVE_FAIL_THRESHOLD} consecutive failures`,
          paragraphs: [
            {
              html: `<b>Platform:</b> ${platform}<br><b>Latest error:</b> ${reasonTrunc}`,
            },
            {
              html: '<i>Synthetic canary publishes on a Cortex-owned account have failed twice in a row. This is a leading indicator that the platform API or Zernio integration is degraded.</i>',
            },
          ],
          fallback,
        }),
        `synthetic-canary:${platform}`,
      );

      if (top) {
        await admin
          .from('synthetic_publish_canaries')
          .update({ alerted_at: new Date().toISOString() })
          .eq('id', top.id);
      }
      alerted += 1;
    }
  }

  return NextResponse.json({
    probed,
    verified,
    scheduled,
    alerted,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/synthetic-publish-canary',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as { probed?: number; verified?: number; scheduled?: number };
      const total = (b.probed ?? 0) + (b.verified ?? 0) + (b.scheduled ?? 0);
      return total > 0 ? total : undefined;
    },
    extractMetadata: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as {
        probed?: number;
        verified?: number;
        scheduled?: number;
        alerted?: number;
        skipped?: string;
      };
      return {
        probed: b.probed,
        verified: b.verified,
        scheduled: b.scheduled,
        alerted: b.alerted,
        skipped: b.skipped,
      };
    },
  },
  handleGet,
);
