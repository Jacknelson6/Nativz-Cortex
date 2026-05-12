import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  notifyConnectionExpired,
  type ConnectionExpiredCandidate,
} from '@/lib/posting/notify-connection-expired';

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
  const alertCandidates: ConnectionExpiredCandidate[] = [];

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

  const { alerted, groupsAlerted } = await notifyConnectionExpired(
    admin,
    alertCandidates,
    'connection-expired-watch',
  );

  return NextResponse.json({
    probed,
    probeSkipped,
    alertedCleared,
    reprobed: pendingReprobes.length,
    reprobeRescued,
    alerted,
    groupsAlerted,
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
