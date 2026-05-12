import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import {
  CORE_PLATFORM_LABEL,
  isCorePlatform,
  type CorePlatform,
} from '@/lib/posting/core-platforms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/core-four-audit
 *
 * End-of-day failsafe. For every active client, walks every `scheduled_posts`
 * row whose `scheduled_at` falls inside the previous UTC day, groups the
 * `scheduled_post_platforms` legs by core platform (TikTok / Instagram /
 * YouTube / Facebook), and fires a single Ops Chat card summarizing what
 * shipped clean vs what missed.
 *
 * Why this exists: the publish cron pings once on partial failure and then
 * goes silent. A post stuck at `partially_failed` with `retry_count =
 * MAX_RETRIES` has no end-of-day reminder. If Jack missed the original
 * chat ping, he never knew. This cron is the daily backstop that catches
 * everything else falling through.
 *
 * Window: previous UTC midnight to midnight (so 6am UTC = 1-2am ET runs
 * right after the day rolls over, gives Jack a digest in his morning).
 *
 * Idempotency: keyed on `metadata.audit_date` in `cron_runs`. A second
 * call the same UTC day no-ops with `{ skipped: 'already_audited' }`.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

const STATUS_PUBLISHED = 'published';

interface LegRow {
  id: string;
  status: string;
  failure_reason: string | null;
  profile: {
    platform: string;
    username: string | null;
  } | null;
}

interface PostRow {
  id: string;
  scheduled_at: string | null;
  status: string;
  client: {
    id: string;
    name: string;
    agency: string | null;
  } | null;
  platforms: LegRow[];
}

interface ClientMiss {
  clientId: string;
  clientName: string;
  agency: string | null;
  /** Per-platform: how many legs missed yesterday for this client. */
  byPlatform: Map<CorePlatform, MissDetail[]>;
  /** Total core-four legs scheduled for this client in window. */
  totalLegs: number;
  /** Total core-four legs that shipped cleanly. */
  shippedLegs: number;
}

interface MissDetail {
  postId: string;
  legStatus: string;
  reason: string | null;
  username: string | null;
}

function previousUtcDayWindow(now: Date): {
  startIso: string;
  endIso: string;
  auditDate: string;
} {
  // Anchor on UTC midnight of "today", then back up one day for the window.
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const auditDate = startUtc.toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    startIso: startUtc.toISOString(),
    endIso: todayUtc.toISOString(),
    auditDate,
  };
}

function describeReason(leg: LegRow, postStatus: string): string {
  if (leg.failure_reason && leg.failure_reason.trim().length > 0) {
    return leg.failure_reason.trim();
  }
  if (leg.status === 'pending' || leg.status === 'publishing') {
    return `Leg stuck in '${leg.status}' (post is '${postStatus}')`;
  }
  if (leg.status === 'failed') return 'Leg failed (no reason recorded)';
  return `Unknown leg status '${leg.status}'`;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const { startIso, endIso, auditDate } = previousUtcDayWindow(now);

  // Idempotency: bail if we've already produced a successful audit for
  // this calendar day. Re-running the cron in the same window should be
  // a no-op so a manual re-trigger or Vercel retry doesn't re-page Jack.
  const { data: priorRuns } = await admin
    .from('cron_runs')
    .select('id, status, metadata')
    .eq('route', '/api/cron/core-four-audit')
    .eq('status', 'ok')
    .gte('started_at', new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(20);

  const alreadyAudited = (priorRuns ?? []).some((r) => {
    const m = (r.metadata ?? {}) as { audit_date?: string };
    return m.audit_date === auditDate;
  });

  if (alreadyAudited) {
    return NextResponse.json({
      audit_date: auditDate,
      skipped: 'already_audited',
    });
  }

  // Pull every scheduled_posts row in window with its legs + client +
  // each leg's platform via social_profiles. Drafts and cancelled posts
  // are excluded — they were never expected to ship.
  const { data: postsRaw, error: queryErr } = await admin
    .from('scheduled_posts')
    .select(
      `
      id,
      scheduled_at,
      status,
      client:clients!inner ( id, name, agency ),
      platforms:scheduled_post_platforms (
        id,
        status,
        failure_reason,
        profile:social_profiles ( platform, username )
      )
    `,
    )
    .gte('scheduled_at', startIso)
    .lt('scheduled_at', endIso)
    .not('status', 'in', '(draft,cancelled)');

  if (queryErr) {
    return NextResponse.json(
      { error: 'db_error', detail: queryErr.message },
      { status: 500 },
    );
  }

  const posts = (postsRaw ?? []) as unknown as PostRow[];

  let totalCoreLegs = 0;
  let shippedCoreLegs = 0;
  let totalNonCoreLegs = 0;
  const missesByClient = new Map<string, ClientMiss>();

  for (const post of posts) {
    if (!post.client) continue;
    for (const leg of post.platforms ?? []) {
      const platform = leg.profile?.platform ?? null;
      if (!isCorePlatform(platform)) {
        totalNonCoreLegs += 1;
        continue;
      }
      totalCoreLegs += 1;
      const shipped = leg.status === STATUS_PUBLISHED;
      if (shipped) {
        shippedCoreLegs += 1;
        continue;
      }

      const clientId = post.client.id;
      let entry = missesByClient.get(clientId);
      if (!entry) {
        entry = {
          clientId,
          clientName: post.client.name,
          agency: post.client.agency,
          byPlatform: new Map(),
          totalLegs: 0,
          shippedLegs: 0,
        };
        missesByClient.set(clientId, entry);
      }
      const detailList = entry.byPlatform.get(platform) ?? [];
      detailList.push({
        postId: post.id,
        legStatus: leg.status,
        reason: describeReason(leg, post.status),
        username: leg.profile?.username ?? null,
      });
      entry.byPlatform.set(platform, detailList);
    }
  }

  // Roll per-client totals for the digest tail.
  for (const entry of missesByClient.values()) {
    for (const post of posts) {
      if (post.client?.id !== entry.clientId) continue;
      for (const leg of post.platforms ?? []) {
        const platform = leg.profile?.platform ?? null;
        if (!isCorePlatform(platform)) continue;
        entry.totalLegs += 1;
        if (leg.status === STATUS_PUBLISHED) entry.shippedLegs += 1;
      }
    }
  }

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;

  const totalMissingLegs = totalCoreLegs - shippedCoreLegs;
  const missedClientCount = missesByClient.size;
  const totalClientsInWindow = new Set(posts.map((p) => p.client?.id).filter(Boolean))
    .size;

  // Always fire a card — a clean ✅ heartbeat is the proof that the cron
  // itself is alive on quiet days. Without it, "no card today" is
  // ambiguous (did everything ship, or did the cron crash?).
  if (opsWebhook) {
    if (totalMissingLegs === 0) {
      const cleanBody = totalCoreLegs === 0
        ? `No core-four legs were scheduled for ${auditDate} (UTC). Pipeline idle.`
        : `${shippedCoreLegs} of ${totalCoreLegs} core-four legs shipped clean across ${totalClientsInWindow} clients.`;

      postToGoogleChatSafe(
        opsWebhook,
        buildChatCardMessage({
          cardId: `core-four-audit-${auditDate}`,
          title: `✅ Core four delivery: ${auditDate}`,
          subtitle: totalCoreLegs === 0 ? 'pipeline idle' : 'all clean',
          paragraphs: [cleanBody],
        }),
        `core-four-audit:${auditDate}:clean`,
      );
    } else {
      const missLines: string[] = [];
      for (const entry of missesByClient.values()) {
        const platforms = Array.from(entry.byPlatform.keys()).sort();
        for (const platform of platforms) {
          const details = entry.byPlatform.get(platform) ?? [];
          const handle = details[0]?.username ? ` (@${details[0].username})` : '';
          const reason = details[0]?.reason ?? '';
          missLines.push(
            `• <b>${entry.clientName}</b> — ${CORE_PLATFORM_LABEL[platform]}${handle}: ${details.length} miss${details.length === 1 ? '' : 'es'}${reason ? ` — ${reason}` : ''}`,
          );
        }
      }

      const nativzCortex = getCortexAppUrl('nativz');
      const calendarUrl = `${nativzCortex}/admin/calendar?date=${auditDate}`;

      const fallback = [
        `🚨 Core four delivery: ${totalMissingLegs} miss${totalMissingLegs === 1 ? '' : 'es'} on ${auditDate}`,
        ...missLines.map((l) => l.replace(/<\/?b>/g, '*')),
        `Open: ${calendarUrl}`,
      ].join('\n');

      postToGoogleChatSafe(
        opsWebhook,
        buildChatCardMessage({
          cardId: `core-four-audit-${auditDate}`,
          title: `🚨 Core four delivery: ${auditDate}`,
          subtitle: `${totalMissingLegs} miss${totalMissingLegs === 1 ? '' : 'es'} across ${missedClientCount} client${missedClientCount === 1 ? '' : 's'}`,
          paragraphs: [
            { html: missLines.join('<br>') },
            { html: `<i>${shippedCoreLegs} of ${totalCoreLegs} core-four legs shipped; ${totalNonCoreLegs} non-core legs not gated.</i>` },
          ],
          buttons: [{ text: 'Open calendar', url: calendarUrl }],
          fallback,
        }),
        `core-four-audit:${auditDate}:misses`,
      );
    }
  }

  return NextResponse.json({
    audit_date: auditDate,
    total_core_legs: totalCoreLegs,
    shipped_core_legs: shippedCoreLegs,
    missing_core_legs: totalMissingLegs,
    missed_clients: missedClientCount,
    clients_in_window: totalClientsInWindow,
    non_core_legs: totalNonCoreLegs,
    chat_card_fired: opsWebhook != null,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/core-four-audit',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const total = (body as { total_core_legs?: number }).total_core_legs;
      return typeof total === 'number' ? total : undefined;
    },
    extractMetadata: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as {
        audit_date?: string;
        missing_core_legs?: number;
        missed_clients?: number;
        skipped?: string;
      };
      // `audit_date` is the idempotency key that handleGet checks for on
      // its next run. The other fields make the cron_runs row useful to
      // eyeball without re-querying the audit.
      return {
        audit_date: b.audit_date,
        missing_core_legs: b.missing_core_legs,
        missed_clients: b.missed_clients,
        skipped: b.skipped,
      };
    },
  },
  handleGet,
);
