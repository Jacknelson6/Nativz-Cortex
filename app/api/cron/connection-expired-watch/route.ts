import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { buildChatCardMessage, postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import type { AgencyBrand } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/connection-expired-watch
 *
 * Two-phase token-health watcher. Probes Zernio's `/accounts/{id}/health`
 * for every social_profiles row with a Zernio account id and persists
 * `token_status` + `token_expires_at` so the Connections matrix reflects
 * reality.
 *
 * Fires Google Chat alerts on two transitions:
 *
 *   A. EXPIRED: token just went bad (expired / needs_refresh) and we
 *      haven't pinged about it yet (`disconnect_alerted_at IS NULL`).
 *      Stamp `disconnect_alerted_at` and fire a "🔌 expired" card.
 *
 *   B. PRE-EXPIRY (3-day window): token still `valid` but expires
 *      within the next 72 hours and `pre_expiry_alerted_at IS NULL`.
 *      Stamp `pre_expiry_alerted_at` and fire a "⏰ expiring soon" card
 *      so the team has time to send the reconnect invite before the
 *      token actually breaks.
 *
 * Both alerts ship as Google Chat `cardsV2` payloads with an "Open
 * reconnect form" button that deep-links to the Connections tab with
 * `?clientId=...&platforms=...` URL params, so clicking it pops the
 * Invite Builder modal pre-filtered to the expiring platforms with
 * zero matrix navigation.
 *
 * Side effect: `pre_expiry_alerted_at` is cleared whenever the token
 * gets refreshed to a new expiry > 7 days out, so the next expiry
 * cycle's 3-day alert fires again for the same profile.
 *
 * No client-facing email goes out from this cron. Reconnect emails are
 * hand-sent from the Connections matrix via the modal the button opens.
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

const OWNER_LABEL: Record<string, string> = {
  agency: 'agency-owned (we created it)',
  client: 'client-owned',
  unknown: 'ownership unknown',
};

const PRE_EXPIRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 72h
const PRE_EXPIRY_CLEAR_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // refresh detector

function deriveStatus(health: {
  tokenValid: boolean;
  needsRefresh: boolean;
  tokenExpiresAt: string | null;
}): string {
  if (!health.tokenValid) return 'expired';
  if (health.needsRefresh) return 'needs_refresh';
  if (
    health.tokenExpiresAt &&
    new Date(health.tokenExpiresAt).getTime() < Date.now()
  ) {
    return 'expired';
  }
  return 'valid';
}

function isBadStatus(status: string): boolean {
  return status === 'expired' || status === 'needs_refresh';
}

interface AlertCandidate {
  kind: 'expired' | 'pre_expiry';
  profileId: string;
  clientId: string;
  platform: string;
  accountOwner: string;
  username: string | null;
  /** Only set for kind='pre_expiry'; informs "expires in X days/hours" copy. */
  expiresAt: string | null;
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / (60 * 60 * 1000)));
}

function describeExpiry(iso: string | null): string {
  const hrs = hoursUntil(iso);
  if (hrs == null) return 'soon';
  if (hrs < 24) return `in ~${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ~${days}d`;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: probeRows, error: probeErr } = await admin
    .from('social_profiles')
    .select(
      'id, client_id, platform, late_account_id, account_owner, username, disconnect_alerted_at, pre_expiry_alerted_at, is_active',
    )
    .not('late_account_id', 'is', null);

  if (probeErr) {
    return NextResponse.json(
      { error: 'db_error', detail: probeErr.message },
      { status: 500 },
    );
  }

  const service = new ZernioPostingService();
  let probed = 0;
  let probeSkipped = 0;
  let preExpiryCleared = 0;
  const alertCandidates: AlertCandidate[] = [];

  await Promise.all(
    (probeRows ?? []).map(async (r) => {
      const accountId = r.late_account_id as string | null;
      if (!accountId) {
        probeSkipped += 1;
        return;
      }
      const health = await service.getAccountHealth(accountId);
      if (!health) {
        probeSkipped += 1;
        return;
      }
      const status = deriveStatus(health);
      const wasExpiredAlerted = r.disconnect_alerted_at != null;
      const wasPreAlerted = r.pre_expiry_alerted_at != null;
      const wasInactive = r.is_active === false;
      const nowBad = isBadStatus(status);

      const expiresAtMs = health.tokenExpiresAt
        ? new Date(health.tokenExpiresAt).getTime()
        : null;
      const msUntilExpiry = expiresAtMs != null ? expiresAtMs - Date.now() : null;
      const inPreExpiryWindow =
        status === 'valid' &&
        msUntilExpiry != null &&
        msUntilExpiry > 0 &&
        msUntilExpiry <= PRE_EXPIRY_WINDOW_MS;

      const shouldFlagExpired = nowBad && !wasExpiredAlerted && !wasInactive;
      const shouldFlagPreExpiry =
        inPreExpiryWindow && !wasPreAlerted && !wasInactive;

      // Clear the pre-expiry sentinel when the token has been refreshed
      // far enough into the future to start the cycle fresh. The 7-day
      // threshold avoids flapping if Zernio returns expiry timestamps
      // that wobble by a few hours across probes.
      const shouldClearPreExpiry =
        wasPreAlerted &&
        status === 'valid' &&
        msUntilExpiry != null &&
        msUntilExpiry > PRE_EXPIRY_CLEAR_THRESHOLD_MS;

      const update: Record<string, unknown> = {
        token_expires_at: health.tokenExpiresAt,
        token_status: status,
      };
      if (shouldFlagExpired) {
        update.disconnect_alerted_at = new Date().toISOString();
      }
      if (shouldFlagPreExpiry) {
        update.pre_expiry_alerted_at = new Date().toISOString();
      }
      if (shouldClearPreExpiry) {
        update.pre_expiry_alerted_at = null;
      }

      const { error: updateErr } = await admin
        .from('social_profiles')
        .update(update)
        .eq('id', r.id);
      if (updateErr) {
        probeSkipped += 1;
        return;
      }
      probed += 1;
      if (shouldClearPreExpiry) preExpiryCleared += 1;

      const base = {
        profileId: r.id as string,
        clientId: r.client_id as string,
        platform: r.platform as string,
        accountOwner: (r.account_owner as string | null) ?? 'unknown',
        username: (r.username as string | null) ?? null,
      };
      if (shouldFlagExpired) {
        alertCandidates.push({ ...base, kind: 'expired', expiresAt: null });
      } else if (shouldFlagPreExpiry) {
        alertCandidates.push({
          ...base,
          kind: 'pre_expiry',
          expiresAt: health.tokenExpiresAt,
        });
      }
    }),
  );

  if (alertCandidates.length === 0) {
    return NextResponse.json({
      probed,
      probeSkipped,
      preExpiryCleared,
      alerted: 0,
    });
  }

  const clientIds = Array.from(new Set(alertCandidates.map((c) => c.clientId)));
  const { data: clients } = await admin
    .from('clients')
    .select('id, name, agency, chat_webhook_url')
    .in('id', clientIds);

  const clientById = new Map<
    string,
    { name: string; agency: string | null; chat_webhook_url: string | null }
  >(
    (clients ?? []).map((c) => [
      c.id as string,
      {
        name: c.name as string,
        agency: (c.agency as string | null) ?? null,
        chat_webhook_url: (c.chat_webhook_url as string | null) ?? null,
      },
    ]),
  );

  // Group by (clientId, kind) so a single client with both an expired
  // and a pre-expiry leg gets two separate cards, each card's button
  // deep-links to a different platform set, and the title copy differs.
  const groupKey = (c: AlertCandidate) => `${c.clientId}:${c.kind}`;
  const groups = new Map<string, AlertCandidate[]>();
  for (const cand of alertCandidates) {
    const k = groupKey(cand);
    const list = groups.get(k) ?? [];
    list.push(cand);
    groups.set(k, list);
  }

  let alerted = 0;
  for (const [, group] of groups) {
    const sample = group[0];
    if (!sample) continue;
    const client = clientById.get(sample.clientId);
    if (!client) continue;

    const webhook = await resolveTeamChatWebhook(admin, {
      primaryUrl: client.chat_webhook_url,
      agency: client.agency,
    });
    const finalWebhook = webhook ?? process.env.OPS_GOOGLE_CHAT_WEBHOOK ?? null;
    if (!finalWebhook) continue;

    const ownership = sample.accountOwner;
    const allSameOwner = group.every((g) => g.accountOwner === ownership);
    const ownerLine = allSameOwner
      ? OWNER_LABEL[ownership] ?? OWNER_LABEL.unknown
      : 'mixed ownership, check matrix';

    const platformLines = group
      .map((g) => {
        const label = PLATFORM_LABEL[g.platform] ?? g.platform;
        const handle = g.username ? ` (@${g.username})` : '';
        const when =
          g.kind === 'pre_expiry'
            ? `, expires ${describeExpiry(g.expiresAt)}`
            : '';
        return `• ${label}${handle}${when}`;
      })
      .join('\n');

    const fixHint =
      ownership === 'agency'
        ? 'Refresh internally, do not email the client.'
        : ownership === 'client'
          ? 'Hand-send a reconnect invite from the Connections matrix.'
          : 'Triage ownership in the Connections matrix, then act.';

    const isPreExpiry = sample.kind === 'pre_expiry';
    const titleEmoji = isPreExpiry ? '⏰' : '🔌';
    const titleVerb = isPreExpiry
      ? 'social authorization expires soon'
      : 'social authorization expired';
    const headerTitle = `${titleEmoji} ${client.name}`;
    const headerSubtitle = titleVerb;

    // Deep-link to the Connections tab with the brand pre-selected and
    // the affected platforms pre-checked, so one click pops the Invite
    // Builder modal ready to send. Team chat is always Nativz-themed.
    const baseUrl = getCortexAppUrl(
      ((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand,
    );
    const platformsParam = Array.from(
      new Set(group.map((g) => g.platform)),
    ).join(',');
    const deepLink =
      `${baseUrl}/admin/content-tools` +
      `?tab=connections` +
      `&clientId=${encodeURIComponent(sample.clientId)}` +
      `&platforms=${encodeURIComponent(platformsParam)}`;

    const buttonText = isPreExpiry
      ? 'Send reconnect invite now'
      : 'Open reconnect form';

    const fallbackText = [
      `${titleEmoji} *${client.name}* ${titleVerb}`,
      platformLines,
      ``,
      `Owner: ${ownerLine}`,
      fixHint,
      ``,
      `${buttonText}: ${deepLink}`,
    ].join('\n');

    postToGoogleChatSafe(
      finalWebhook,
      buildChatCardMessage({
        cardId: `conn-expiry-${sample.clientId}-${sample.kind}`,
        title: headerTitle,
        subtitle: headerSubtitle,
        paragraphs: [
          platformLines,
          { html: `<b>Owner:</b> ${ownerLine}<br>${fixHint}` },
        ],
        buttons: [{ text: buttonText, url: deepLink }],
        fallback: fallbackText,
      }),
      `connection-expired-watch:${sample.clientId}:${sample.kind}`,
    );
    alerted += group.length;
  }

  return NextResponse.json({
    probed,
    probeSkipped,
    preExpiryCleared,
    alerted,
    groupsAlerted: groups.size,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/connection-expired-watch',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const probed = (body as { probed?: number }).probed;
      return typeof probed === 'number' ? probed : undefined;
    },
  },
  handleGet,
);
