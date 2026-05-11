import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/connection-expired-watch
 *
 * Probes Zernio's `/accounts/{id}/health` for every social_profiles row
 * with a Zernio account id and persists `token_status` +
 * `token_expires_at` so the Connections matrix reflects reality.
 *
 * When a row newly transitions to a bad state (token expired,
 * needs_refresh) AND we haven't pinged about it yet
 * (`disconnect_alerted_at IS NULL`), we:
 *   1. Stamp `disconnect_alerted_at` so the matrix shows it as
 *      disconnected and we don't re-ping next tick.
 *   2. Fire a Google Chat ping to the team's webhook (client's own,
 *      then agency miscellaneous-catchall, then OPS_GOOGLE_CHAT_WEBHOOK
 *      env). The ping includes the platform, brand, and account_owner
 *      tag so the team knows whether to fix internally (agency-owned)
 *      or hand-send a reconnect invite from the matrix (client-owned,
 *      or unknown to be triaged first).
 *
 * No client-facing email goes out from this cron. Reconnect emails are
 * hand-sent from the Connections matrix.
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
      const wasAlerted = r.disconnect_alerted_at != null;
      const wasInactive = r.is_active === false;
      const nowBad = isBadStatus(status);
      const shouldFlag = nowBad && !wasAlerted && !wasInactive;

      const update: Record<string, unknown> = {
        token_expires_at: health.tokenExpiresAt,
        token_status: status,
      };
      if (shouldFlag) {
        update.disconnect_alerted_at = new Date().toISOString();
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

      if (shouldFlag) {
        alertCandidates.push({
          profileId: r.id as string,
          clientId: r.client_id as string,
          platform: r.platform as string,
          accountOwner: (r.account_owner as string | null) ?? 'unknown',
          username: (r.username as string | null) ?? null,
        });
      }
    }),
  );

  if (alertCandidates.length === 0) {
    return NextResponse.json({
      probed,
      probeSkipped,
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

  const byClient = new Map<string, AlertCandidate[]>();
  for (const cand of alertCandidates) {
    const list = byClient.get(cand.clientId) ?? [];
    list.push(cand);
    byClient.set(cand.clientId, list);
  }

  let alerted = 0;
  for (const [clientId, group] of byClient) {
    const client = clientById.get(clientId);
    if (!client) continue;

    const webhook = await resolveTeamChatWebhook(admin, {
      primaryUrl: client.chat_webhook_url,
      agency: client.agency,
    });
    const finalWebhook = webhook ?? process.env.OPS_GOOGLE_CHAT_WEBHOOK ?? null;
    if (!finalWebhook) continue;

    const ownership = group[0]?.accountOwner ?? 'unknown';
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
        ? 'Action: refresh internally, do NOT email the client.'
        : ownership === 'client'
          ? 'Action: hand-send a reconnect invite from the Connections matrix.'
          : 'Action: triage ownership in the Connections matrix, then act.';

    const text = [
      `🔌 *Internal alert:* *${client.name}* social authorization expired`,
      platformLines,
      ``,
      `Owner: ${ownerLine}`,
      `Client has NOT been auto-emailed about this. ${fixHint}`,
    ].join('\n');

    postToGoogleChatSafe(
      finalWebhook,
      { text },
      `connection-expired-watch:${clientId}`,
    );
    alerted += group.length;
  }

  return NextResponse.json({
    probed,
    probeSkipped,
    alerted,
    clientsAlerted: byClient.size,
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
