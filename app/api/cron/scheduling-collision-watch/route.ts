import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { buildChatCardMessage, postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import { centralDateParts } from '@/lib/calendar/scheduling-rules';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { SocialPlatform } from '@/lib/posting/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/scheduling-collision-watch
 *
 * Safety net for the 1-per-(client, platform)-per-Central-day rule in
 * `lib/calendar/scheduling-rules.ts`. The write-path enforcement is
 * intentionally fail-open: if the collision check itself errors against
 * Postgres, the schedule still goes through (better than blocking
 * legitimate writes on a transient DB hiccup). This cron is the catch
 * for anything that slipped through that gap.
 *
 * Scans the next 14 Central days for live-pipeline posts
 * (`draft`, `scheduled`, `publishing`, `partially_failed`), groups by
 * (client, platform, Central day), and fires one Google Chat card per
 * client summarizing every (platform, day) that has 2+ posts queued.
 *
 * Card de-dup: `cardId` is `sched-collision-{clientId}-{yyyymmdd}`,
 * which uses today's Central date. Fresh card per run, so it acts as
 * a daily nag until the team clears the conflict.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

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

const LIVE_STATUSES = ['draft', 'scheduled', 'publishing', 'partially_failed'];
const LOOKAHEAD_DAYS = 14;

interface Collision {
  clientId: string;
  platform: SocialPlatform;
  centralDay: string; // YYYY-MM-DD
  postIds: string[];
}

type RawRow = {
  id: string;
  scheduled_at: string;
  client_id: string;
  scheduled_post_platforms: Array<{
    social_profiles:
      | { platform: SocialPlatform }
      | Array<{ platform: SocialPlatform }>
      | null;
  }>;
};

function fmtCentralDay(parts: { year: number; month: number; day: number }): string {
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${parts.year}-${m}-${d}`;
}

function todayCentralStamp(): string {
  return fmtCentralDay(centralDateParts(new Date().toISOString()));
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pull every live-pipeline post in a window that comfortably contains
  // the next 14 Central days. Cast a slightly wider UTC net (16 days) so
  // edge-of-window posts whose Central day falls inside the lookahead
  // aren't dropped by the UTC bounds.
  const nowMs = Date.now();
  const lo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const hi = new Date(nowMs + (LOOKAHEAD_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('scheduled_posts')
    .select(
      'id, scheduled_at, client_id, scheduled_post_platforms(social_profiles(platform))',
    )
    .gte('scheduled_at', lo)
    .lte('scheduled_at', hi)
    .in('status', LIVE_STATUSES);

  if (error) {
    return NextResponse.json(
      { error: 'db_error', detail: error.message },
      { status: 500 },
    );
  }

  // Compute today's Central day in YYYY-MM-DD so we can drop rows from
  // earlier Central days (already past, not a future collision).
  const todayStamp = todayCentralStamp();
  const horizonStampMs =
    new Date(`${todayStamp}T00:00:00Z`).getTime() +
    LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

  // Bucket key: clientId|platform|YYYY-MM-DD
  const buckets = new Map<string, { clientId: string; platform: SocialPlatform; centralDay: string; postIds: string[] }>();

  for (const row of (data ?? []) as unknown as RawRow[]) {
    const parts = centralDateParts(row.scheduled_at);
    const day = fmtCentralDay(parts);
    if (day < todayStamp) continue;
    if (new Date(`${day}T00:00:00Z`).getTime() > horizonStampMs) continue;

    const seenInRow = new Set<SocialPlatform>();
    for (const spp of row.scheduled_post_platforms ?? []) {
      const sp = spp.social_profiles;
      const platform = Array.isArray(sp) ? sp[0]?.platform : sp?.platform;
      if (!platform || seenInRow.has(platform)) continue;
      seenInRow.add(platform);
      const key = `${row.client_id}|${platform}|${day}`;
      const existing = buckets.get(key);
      if (existing) {
        if (!existing.postIds.includes(row.id)) existing.postIds.push(row.id);
      } else {
        buckets.set(key, {
          clientId: row.client_id,
          platform,
          centralDay: day,
          postIds: [row.id],
        });
      }
    }
  }

  const collisions: Collision[] = [];
  for (const v of buckets.values()) {
    if (v.postIds.length >= 2) collisions.push(v);
  }

  if (collisions.length === 0) {
    return NextResponse.json({ scanned: data?.length ?? 0, collisions: 0, alerted: 0 });
  }

  // Resolve client metadata in one pass for name + agency. Routing is
  // OPS-only (2026-05-13) — collisions never reach a client chat space.
  const clientIds = Array.from(new Set(collisions.map((c) => c.clientId)));
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency')
    .in('id', clientIds);

  const clientById = new Map<
    string,
    { name: string; agency: string | null }
  >(
    (clients ?? []).map((c) => [
      c.id as string,
      {
        name: c.name as string,
        agency: (c.agency as string | null) ?? null,
      },
    ]),
  );

  // Group by clientId — one card per client.
  const groups = new Map<string, Collision[]>();
  for (const c of collisions) {
    const list = groups.get(c.clientId) ?? [];
    list.push(c);
    groups.set(c.clientId, list);
  }

  let alerted = 0;
  for (const [clientId, group] of groups) {
    const client = clientById.get(clientId);
    if (!client) continue;

    // OPS only — collisions are an internal triage signal.
    const finalWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
    if (!finalWebhook) continue;

    // Order by day, then platform for readability.
    group.sort((a, b) =>
      a.centralDay === b.centralDay
        ? a.platform.localeCompare(b.platform)
        : a.centralDay.localeCompare(b.centralDay),
    );

    const lines = group.map((c) => {
      const label = PLATFORM_LABEL[c.platform] ?? c.platform;
      return `• ${c.centralDay} — ${label} (${c.postIds.length} posts)`;
    });

    const baseUrl = getCortexAppUrl(
      ((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand,
    );
    const deepLink = `${baseUrl}/calendar`;

    const totalConflicts = group.length;
    const headerTitle = `⚠️ ${client.name}`;
    const headerSubtitle = `${totalConflicts} same-day scheduling conflict${totalConflicts === 1 ? '' : 's'}`;

    const fallbackText = [
      `⚠️ *${client.name}* has ${totalConflicts} same-day scheduling conflict${totalConflicts === 1 ? '' : 's'}`,
      ...lines,
      ``,
      `Reschedule one of the duplicates so each platform gets at most one post per Central day.`,
      ``,
      `Open calendar: ${deepLink}`,
    ].join('\n');

    postToGoogleChatSafe(
      finalWebhook,
      buildChatCardMessage({
        cardId: `sched-collision-${clientId}-${todayStamp}`,
        title: headerTitle,
        subtitle: headerSubtitle,
        paragraphs: [
          lines.join('\n'),
          {
            html: 'Reschedule one of the duplicates so each platform gets at most one post per Central day.',
          },
        ],
        buttons: [{ text: 'Open calendar', url: deepLink }],
        fallback: fallbackText,
      }),
      `scheduling-collision-watch:${clientId}`,
    );
    alerted += group.length;
  }

  return NextResponse.json({
    scanned: data?.length ?? 0,
    collisions: collisions.length,
    clientsAlerted: groups.size,
    alerted,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/scheduling-collision-watch',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const c = (body as { collisions?: number }).collisions;
      return typeof c === 'number' ? c : undefined;
    },
  },
  handleGet,
);
