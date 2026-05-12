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
 * Post-expiry token-health watcher. Probes Zernio's `/accounts/{id}/health`
 * for every social_profiles row with a Zernio account id and persists
 * `token_status` + `token_expires_at` so the Connections matrix reflects
 * reality.
 *
 * Fires a Google Chat alert only when a token is *actually* expired
 * (`expired` or `needs_refresh`) AND a confirming re-probe a few seconds
 * later still reports bad status. The two-shot confirm exists because
 * Zernio auto-refreshes tokens on demand for many platforms (notably
 * Facebook Pages / IG via Pages), so a single probe right at the
 * `tokenExpiresAt` boundary can return `expired` for a token that gets
 * silently refreshed milliseconds later. Pre-expiry warnings were
 * removed entirely for the same reason: a "expires in ~0h" notification
 * is almost always a false alarm for an account whose token will renew
 * before the next post even runs.
 *
 * Alerts ship as Google Chat `cardsV2` payloads with an "Open reconnect
 * form" button that deep-links to the Connections tab with
 * `?clientId=...&platforms=...` URL params, so clicking it pops the
 * Invite Builder modal pre-filtered to the affected platforms with
 * zero matrix navigation.
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

/**
 * Delay before the confirming re-probe of a token that came back bad on
 * the first call. Zernio's auto-refresh path can take a couple seconds
 * to swap a Facebook/IG token in-place when called near the expiry
 * boundary, so we give it a small grace window before deciding the
 * token is truly dead and pinging Jack.
 */
const REPROBE_DELAY_MS = 4000;

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
  profileId: string;
  clientId: string;
  platform: string;
  accountOwner: string;
  username: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      'id, client_id, platform, late_account_id, account_owner, username, disconnect_alerted_at, is_active',
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
  let alertedCleared = 0;
  let reprobeRescued = 0;
  const alertCandidates: AlertCandidate[] = [];

  // First pass: probe everything, persist `token_status` + `token_expires_at`,
  // and short-list anything that looks bad for a confirming re-probe below.
  type PendingReprobe = {
    accountId: string;
    row: (typeof probeRows extends Array<infer T> ? T : never);
  };
  const pendingReprobes: PendingReprobe[] = [];

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
      const wasInactive = r.is_active === false;
      const nowBad = isBadStatus(status);

      const update: Record<string, unknown> = {
        token_expires_at: health.tokenExpiresAt,
        token_status: status,
      };

      // Token came back healthy after a prior expiry alert -> clear the
      // sentinel so the next real expiry can fire a fresh notification.
      if (!nowBad && wasExpiredAlerted) {
        update.disconnect_alerted_at = null;
        alertedCleared += 1;
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

      // Queue a confirming re-probe only when the first probe reports
      // bad AND we haven't already pinged for this expiry cycle. This
      // is the "double-check Zernio" guard: a single bad read right at
      // the expiry boundary can be a token that Zernio's about to auto-
      // refresh, so we wait a few seconds and ask again before alerting.
      if (nowBad && !wasExpiredAlerted && !wasInactive) {
        pendingReprobes.push({ accountId, row: r });
      }
    }),
  );

  if (pendingReprobes.length > 0) {
    await sleep(REPROBE_DELAY_MS);

    await Promise.all(
      pendingReprobes.map(async ({ accountId, row }) => {
        const health = await service.getAccountHealth(accountId);
        if (!health) {
          // Zernio went sideways on the confirm probe; don't alert on
          // a transient API blip, just wait for the next cron tick.
          reprobeRescued += 1;
          return;
        }
        const status = deriveStatus(health);
        if (!isBadStatus(status)) {
          // Token refreshed itself between probes. Persist the good
          // status and skip the alert entirely.
          await admin
            .from('social_profiles')
            .update({
              token_expires_at: health.tokenExpiresAt,
              token_status: status,
            })
            .eq('id', row.id);
          reprobeRescued += 1;
          return;
        }

        // Still bad on the second look -> mark + queue the alert.
        await admin
          .from('social_profiles')
          .update({
            token_expires_at: health.tokenExpiresAt,
            token_status: status,
            disconnect_alerted_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        alertCandidates.push({
          profileId: row.id as string,
          clientId: row.client_id as string,
          platform: row.platform as string,
          accountOwner: (row.account_owner as string | null) ?? 'unknown',
          username: (row.username as string | null) ?? null,
        });
      }),
    );
  }

  if (alertCandidates.length === 0) {
    return NextResponse.json({
      probed,
      probeSkipped,
      alertedCleared,
      reprobed: pendingReprobes.length,
      reprobeRescued,
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

  // One card per client: all freshly-confirmed-bad platforms for a
  // single brand collapse into a single chat ping with one deep-link
  // pre-filtering the Connections matrix to all of them.
  const groups = new Map<string, AlertCandidate[]>();
  for (const cand of alertCandidates) {
    const list = groups.get(cand.clientId) ?? [];
    list.push(cand);
    groups.set(cand.clientId, list);
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
        return `• ${label}${handle}`;
      })
      .join('\n');

    const fixHint =
      ownership === 'agency'
        ? 'Refresh internally, do not email the client.'
        : ownership === 'client'
          ? 'Hand-send a reconnect invite from the Connections matrix.'
          : 'Triage ownership in the Connections matrix, then act.';

    const titleEmoji = '🔌';
    const titleVerb = 'social authorization expired';
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

    const buttonText = 'Open reconnect form';

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
        cardId: `conn-expiry-${sample.clientId}`,
        title: headerTitle,
        subtitle: headerSubtitle,
        paragraphs: [
          platformLines,
          { html: `<b>Owner:</b> ${ownerLine}<br>${fixHint}` },
        ],
        buttons: [{ text: buttonText, url: deepLink }],
        fallback: fallbackText,
      }),
      `connection-expired-watch:${sample.clientId}`,
    );
    alerted += group.length;
  }

  return NextResponse.json({
    probed,
    probeSkipped,
    alertedCleared,
    reprobed: pendingReprobes.length,
    reprobeRescued,
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
