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
 * GET /api/cron/missing-platforms-watch
 *
 * Daily sweep that pings ops when an active client is missing one or more
 * of the "core four" social platforms (Facebook, Instagram, TikTok, YouTube).
 * Every active client should publish on all four; rooted in the 2026-05-11
 * National Lenders silent-failure incident where IG/TT/YT rows didn't exist
 * when the calendar shipped, so weeks of posts only fired on FB+LinkedIn.
 *
 * Connected = `social_profiles` row with `is_active=true` AND `late_account_id IS NOT NULL`
 * for that platform. Anything else (no row, inactive, no Zernio link, expired
 * token, awaiting refresh) counts as missing because the calendar build path
 * (`scheduleDrop` in lib/calendar/schedule-drop.ts) filters identically.
 *
 * Dedup uses two scaffold columns on `clients` (migration 230-ish):
 *   - `missing_platforms_last_set` (text, comma-joined sorted list)
 *   - `missing_platforms_alerted_at` (timestamptz)
 *
 * We fire a fresh chat card when:
 *   - the current missing set is non-empty AND
 *   - (the set changed since last alert OR last alert was >7 days ago)
 *
 * We clear both columns silently when the client completes the set, so the
 * next regression alerts as a brand-new event.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

type CorePlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';
const CORE_FOUR: CorePlatform[] = ['facebook', 'instagram', 'tiktok', 'youtube'];

const PLATFORM_LABEL: Record<CorePlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const REALERT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function sortedKey(missing: CorePlatform[]): string {
  return [...missing].sort().join(',');
}

interface ClientRow {
  id: string;
  name: string;
  agency: string | null;
  chat_webhook_url: string | null;
  missing_platforms_last_set: string | null;
  missing_platforms_alerted_at: string | null;
}

interface ProfileRow {
  client_id: string;
  platform: string;
  is_active: boolean | null;
  late_account_id: string | null;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Active, unpaused, roster-visible clients only. Lifecycle gate matches
  // every other "real customer" cron in the codebase.
  const { data: clients, error: clientErr } = await admin
    .from('clients')
    .select(
      'id, name, agency, chat_webhook_url, missing_platforms_last_set, missing_platforms_alerted_at',
    )
    .eq('is_active', true)
    .eq('is_paused', false)
    .eq('hide_from_roster', false)
    .returns<ClientRow[]>();
  if (clientErr) {
    return NextResponse.json(
      { error: 'db_error', detail: clientErr.message },
      { status: 500 },
    );
  }
  const clientList = clients ?? [];
  if (clientList.length === 0) {
    return NextResponse.json({ checked: 0, alerted: 0, cleared: 0 });
  }

  const clientIds = clientList.map((c) => c.id);

  const { data: profiles, error: profileErr } = await admin
    .from('social_profiles')
    .select('client_id, platform, is_active, late_account_id')
    .in('client_id', clientIds)
    .in('platform', CORE_FOUR)
    .returns<ProfileRow[]>();
  if (profileErr) {
    return NextResponse.json(
      { error: 'db_error', detail: profileErr.message },
      { status: 500 },
    );
  }

  // Group connected platforms per client.
  const connectedByClient = new Map<string, Set<CorePlatform>>();
  for (const p of profiles ?? []) {
    if (!p.is_active) continue;
    if (!p.late_account_id) continue;
    if (!CORE_FOUR.includes(p.platform as CorePlatform)) continue;
    const set = connectedByClient.get(p.client_id) ?? new Set<CorePlatform>();
    set.add(p.platform as CorePlatform);
    connectedByClient.set(p.client_id, set);
  }

  const nowIso = new Date().toISOString();
  let alerted = 0;
  let cleared = 0;
  let skipped = 0;

  for (const client of clientList) {
    const connected = connectedByClient.get(client.id) ?? new Set<CorePlatform>();
    const missing = CORE_FOUR.filter((p) => !connected.has(p));
    const missingKey = sortedKey(missing);
    const previousKey = client.missing_platforms_last_set ?? '';
    const lastAlertedAt = client.missing_platforms_alerted_at
      ? new Date(client.missing_platforms_alerted_at).getTime()
      : null;

    // Fully-unconnected clients are a different problem (not yet onboarded);
    // don't alert on them. The silent-failure pattern this cron catches is
    // "partially connected, some posts silently dropping legs" — which by
    // definition requires at least one core-four profile already wired up.
    if (connected.size === 0) {
      skipped += 1;
      continue;
    }

    // 1. Complete set, clear sentinels if any were stored.
    if (missing.length === 0) {
      if (previousKey || lastAlertedAt) {
        await admin
          .from('clients')
          .update({
            missing_platforms_last_set: null,
            missing_platforms_alerted_at: null,
          })
          .eq('id', client.id);
        cleared += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    // 2. Incomplete + the set just changed → fresh alert.
    // 3. Same set but last ping was >7d ago → re-alert.
    // 4. Same set and we pinged recently → skip.
    const changed = missingKey !== previousKey;
    const stale =
      lastAlertedAt != null && Date.now() - lastAlertedAt >= REALERT_AFTER_MS;
    const fresh = previousKey === '' || lastAlertedAt == null;
    const shouldAlert = changed || stale || fresh;

    if (!shouldAlert) {
      skipped += 1;
      continue;
    }

    await sendAlert(admin, client, missing);
    await admin
      .from('clients')
      .update({
        missing_platforms_last_set: missingKey,
        missing_platforms_alerted_at: nowIso,
      })
      .eq('id', client.id);
    alerted += 1;
  }

  return NextResponse.json({
    checked: clientList.length,
    alerted,
    cleared,
    skipped,
  });
}

async function sendAlert(
  admin: ReturnType<typeof createAdminClient>,
  client: ClientRow,
  missing: CorePlatform[],
): Promise<void> {
  const teamWebhook = await resolveTeamChatWebhook(admin, {
    primaryUrl: client.chat_webhook_url,
    agency: client.agency,
  });
  const finalWebhook = teamWebhook ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (!finalWebhook) return;

  const baseUrl = getCortexAppUrl(((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand);
  const deepLink =
    `${baseUrl}/admin/content-tools?tab=connections` +
    `&clientId=${encodeURIComponent(client.id)}` +
    `&platforms=${encodeURIComponent(missing.join(','))}`;

  const missingLabels = missing.map((p) => `• ${PLATFORM_LABEL[p]}`).join('\n');
  const fallback = [
    `⚠️ *${client.name}* is missing core-four platform${missing.length === 1 ? '' : 's'}:`,
    missingLabels,
    ``,
    `New posts will silently skip ${missing.length === 1 ? 'this platform' : 'these platforms'} until a Zernio account is connected.`,
    ``,
    `Connect now: ${deepLink}`,
  ].join('\n');

  postToGoogleChatSafe(
    finalWebhook,
    buildChatCardMessage({
      cardId: `missing-platforms-${client.id}`,
      title: `⚠️ ${client.name} is missing ${missing.length} core platform${missing.length === 1 ? '' : 's'}`,
      subtitle: 'New posts will silently skip these legs',
      paragraphs: [
        missingLabels,
        {
          html: `<b>Why this matters:</b> every active client should publish on Facebook, Instagram, TikTok, and YouTube. Until ${missing.length === 1 ? 'this profile is' : 'these profiles are'} connected to Zernio, scheduled posts won't fan out there.`,
        },
      ],
      buttons: [{ text: 'Connect now', url: deepLink }],
      fallback,
    }),
    `missing-platforms ${client.id}`,
  );
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/missing-platforms-watch',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const checked = (body as { checked?: number }).checked;
      return typeof checked === 'number' ? checked : undefined;
    },
  },
  handleGet,
);
