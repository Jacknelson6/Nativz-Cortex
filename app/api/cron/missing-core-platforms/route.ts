import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import type { AgencyBrand } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/missing-core-platforms
 *
 * Walks every active, non-paused client that has scheduled at least one post
 * in the last 30 days, and alerts via Google Chat when one of the "core four"
 * platforms (Facebook, Instagram, TikTok, YouTube) has no connected
 * social_profiles row.
 *
 * This catches the gap we hit with National Lenders, where IG and TikTok
 * had no profile rows at all, so the calendar quietly scheduled FB+LinkedIn
 * only and we didn't know we were under-posting until a client meeting.
 *
 * Idempotency: each client carries `missing_platforms_alerted_at` and
 * `missing_platforms_last_set`. We re-alert only if more than 7 days have
 * passed OR the gap set has changed (e.g. they reconnected IG but lost
 * TikTok). When the gap clears entirely we wipe the stamps so a future gap
 * re-alerts immediately.
 *
 * Routes to Google Chat via the same webhook ladder as
 * connection-expired-watch: client-specific webhook, agency
 * miscellaneous-catchall, then OPS_CHAT_WEBHOOK_URL fallback.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

const CORE_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'] as const;
type CorePlatform = (typeof CORE_PLATFORMS)[number];

const PLATFORM_LABEL: Record<CorePlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const RECENT_POST_WINDOW_DAYS = 30;
const ALERT_THROTTLE_DAYS = 7;

interface ClientRow {
  id: string;
  name: string;
  agency: string | null;
  chat_webhook_url: string | null;
  missing_platforms_alerted_at: string | null;
  missing_platforms_last_set: string | null;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: clientRows, error: clientsErr } = await admin
    .from('clients')
    .select(
      'id, name, agency, chat_webhook_url, missing_platforms_alerted_at, missing_platforms_last_set',
    )
    .eq('is_active', true)
    .eq('is_paused', false);

  if (clientsErr) {
    return NextResponse.json(
      { error: 'db_error', detail: clientsErr.message },
      { status: 500 },
    );
  }

  const clients = (clientRows ?? []) as ClientRow[];
  if (clients.length === 0) {
    return NextResponse.json({ scanned: 0, alerted: 0, cleared: 0 });
  }

  const clientIds = clients.map((c) => c.id);

  // Profile lookup: only rows that are still considered live get to count
  // as "connected." A row with token_status='expired' is just as broken
  // from a publishing standpoint as a missing row, so we treat both as
  // gaps here. The connection-expired-watch cron pings on the expiry
  // transition; this cron catches the "never connected to start with"
  // half of the same problem.
  const { data: profileRows } = await admin
    .from('social_profiles')
    .select('client_id, platform, is_active, token_status')
    .in('client_id', clientIds);

  const connectedByClient = new Map<string, Set<string>>();
  for (const row of profileRows ?? []) {
    const cid = row.client_id as string;
    const platform = row.platform as string;
    const active = row.is_active !== false;
    const tokenStatus = (row.token_status as string | null) ?? 'valid';
    if (!active) continue;
    if (tokenStatus === 'expired') continue;
    const set = connectedByClient.get(cid) ?? new Set<string>();
    set.add(platform);
    connectedByClient.set(cid, set);
  }

  // Recent-poster filter: only clients we are actually publishing for. A
  // brand we haven't scheduled in 30+ days is either onboarding or paused
  // in spirit, and pinging about missing platforms there is noise.
  const sinceIso = new Date(
    Date.now() - RECENT_POST_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: recentPosts } = await admin
    .from('scheduled_posts')
    .select('client_id')
    .in('client_id', clientIds)
    .gte('created_at', sinceIso);

  const recentPosters = new Set<string>(
    (recentPosts ?? []).map((p) => p.client_id as string),
  );

  let scanned = 0;
  let alerted = 0;
  let cleared = 0;

  for (const client of clients) {
    if (!recentPosters.has(client.id)) continue;
    scanned += 1;

    const connected = connectedByClient.get(client.id) ?? new Set<string>();
    const missing = CORE_PLATFORMS.filter((p) => !connected.has(p));

    if (missing.length === 0) {
      // Gap closed. Wipe the dedup stamps so a future regression alerts
      // right away instead of waiting out the throttle.
      if (
        client.missing_platforms_alerted_at ||
        client.missing_platforms_last_set
      ) {
        const { error: clearErr } = await admin
          .from('clients')
          .update({
            missing_platforms_alerted_at: null,
            missing_platforms_last_set: null,
          })
          .eq('id', client.id);
        if (!clearErr) cleared += 1;
      }
      continue;
    }

    const gapKey = missing.slice().sort().join(',');
    const sameGap = client.missing_platforms_last_set === gapKey;
    const lastAlertMs = client.missing_platforms_alerted_at
      ? new Date(client.missing_platforms_alerted_at).getTime()
      : 0;
    const throttleMs = ALERT_THROTTLE_DAYS * 24 * 60 * 60 * 1000;
    const withinThrottle =
      sameGap && lastAlertMs > 0 && Date.now() - lastAlertMs < throttleMs;
    if (withinThrottle) continue;

    const webhook = await resolveTeamChatWebhook(admin, {
      primaryUrl: client.chat_webhook_url,
      agency: client.agency,
    });
    const finalWebhook = webhook ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
    if (!finalWebhook) continue;

    const platformLines = missing
      .map((p) => `• ${PLATFORM_LABEL[p]}`)
      .join('\n');

    const baseUrl = getCortexAppUrl(
      ((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand,
    );
    const platformsParam = missing.join(',');
    const deepLink =
      `${baseUrl}/admin/content-tools` +
      `?tab=connections` +
      `&clientId=${encodeURIComponent(client.id)}` +
      `&platforms=${encodeURIComponent(platformsParam)}`;

    const fallbackText = [
      `📵 Internal alert: ${client.name} is missing core platform connections`,
      platformLines,
      ``,
      `Cortex is actively scheduling posts for this client but these platforms have no connected account, so nothing is going out there. ` +
        `Client has NOT been emailed about this. Action required: send a reconnect invite from the Connections matrix.`,
      ``,
      `Open reconnect form: ${deepLink}`,
    ].join('\n');

    postToGoogleChatSafe(
      finalWebhook,
      buildChatCardMessage({
        cardId: `missing-core-platforms-${client.id}`,
        title: `📵 ${client.name}`,
        subtitle: 'Missing core platform connections',
        paragraphs: [
          platformLines,
          {
            html:
              `Cortex is actively scheduling posts for this client but these platforms have <b>no connected account</b>, ` +
              `so nothing is going out there. Client has NOT been emailed about this.<br><br>` +
              `<b>Action required:</b> send a reconnect invite from the Connections matrix.`,
          },
        ],
        buttons: [{ text: 'Open reconnect form', url: deepLink }],
        fallback: fallbackText,
      }),
      `missing-core-platforms:${client.id}`,
    );

    const { error: stampErr } = await admin
      .from('clients')
      .update({
        missing_platforms_alerted_at: new Date().toISOString(),
        missing_platforms_last_set: gapKey,
      })
      .eq('id', client.id);
    if (!stampErr) alerted += 1;
  }

  return NextResponse.json({ scanned, alerted, cleared });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/missing-core-platforms',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const scanned = (body as { scanned?: number }).scanned;
      return typeof scanned === 'number' ? scanned : undefined;
    },
  },
  handleGet,
);
