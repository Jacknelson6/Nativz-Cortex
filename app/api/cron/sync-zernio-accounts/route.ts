import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ZernioPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/sync-zernio-accounts
 *
 * Reconciles Zernio's connected-accounts truth into our `social_profiles`
 * table. Catches the National Lenders class of bug: Zernio shows IG/TT/YT
 * connected for a client, but our DB has no rows for them, so the calendar
 * silently schedules to FB+LI only and we under-publish without knowing.
 *
 * For each account Zernio holds:
 *   - If the account's `profileId` matches a client's `late_profile_id`
 *     AND we have no matching `social_profiles` row, INSERT one (status =
 *     'valid', is_active = true, account_owner = 'client' as a safe
 *     default — admins can flip ownership in the Connections matrix later).
 *   - If we already have a row, leave it alone. Token state + ownership
 *     are owned by other crons (connection-expired-watch) and by the
 *     OAuth callback.
 *
 * Never DELETES local rows here. Zernio could drop an account from its
 * /accounts response transiently (rate-limit, partial response, etc.); a
 * delete-on-absence policy would create flapping. Instead, the existing
 * `connection-expired-watch` cron handles the explicit-expired path.
 *
 * Emits a Google Chat ping per client when we inserted at least one new
 * profile, so the team sees a "wait, we picked up new accounts for X"
 * line in chat instead of a silent backfill.
 *
 * Runs hourly so a client connecting an account through Zernio's flow
 * gets picked up in <60min even if the OAuth callback drops.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

interface InsertCandidate {
  clientId: string;
  platform: SocialPlatform;
  lateAccountId: string;
  username: string;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Build the Zernio-profile-id → client map. A handful of clients share
  // their `late_profile_id` historically; we pick the most recently
  // updated client when there's a tie (most likely the active one).
  const { data: clientRows, error: clientsErr } = await admin
    .from('clients')
    .select('id, name, agency, chat_webhook_url, late_profile_id, updated_at')
    .not('late_profile_id', 'is', null);
  if (clientsErr) {
    return NextResponse.json(
      { error: 'db_error', detail: clientsErr.message },
      { status: 500 },
    );
  }
  const clients = clientRows ?? [];
  const profileToClient = new Map<
    string,
    {
      clientId: string;
      name: string;
      agency: string | null;
      chatWebhookUrl: string | null;
    }
  >();
  for (const c of [...clients].sort((a, b) =>
    (b.updated_at as string).localeCompare(a.updated_at as string),
  )) {
    const pid = c.late_profile_id as string;
    if (profileToClient.has(pid)) continue;
    profileToClient.set(pid, {
      clientId: c.id as string,
      name: c.name as string,
      agency: (c.agency as string | null) ?? null,
      chatWebhookUrl: (c.chat_webhook_url as string | null) ?? null,
    });
  }

  // Pull every connected account from Zernio. The dataset is small enough
  // (~hundreds of rows across the whole org) that a full scan beats paging.
  const service = new ZernioPostingService();
  const zernioAccounts = await service.getConnectedProfiles();

  // Existing social_profiles, indexed by (client_id, platform). Used to
  // skip inserts when a row already exists for the (client, platform)
  // pair — we never overwrite a row, only add what's missing.
  const { data: existingProfiles } = await admin
    .from('social_profiles')
    .select('client_id, platform, late_account_id');
  const existingKeys = new Set<string>();
  for (const row of existingProfiles ?? []) {
    existingKeys.add(`${row.client_id}:${row.platform}`);
  }

  const candidates: InsertCandidate[] = [];
  let scanned = 0;
  let skippedNoProfile = 0;
  let skippedUnmatched = 0;
  let skippedExisting = 0;
  for (const acct of zernioAccounts) {
    scanned += 1;
    if (!acct.profileId) {
      skippedNoProfile += 1;
      continue;
    }
    const client = profileToClient.get(acct.profileId);
    if (!client) {
      skippedUnmatched += 1;
      continue;
    }
    const key = `${client.clientId}:${acct.platform}`;
    if (existingKeys.has(key)) {
      skippedExisting += 1;
      continue;
    }
    candidates.push({
      clientId: client.clientId,
      platform: acct.platform,
      lateAccountId: acct.id,
      username: acct.username || '',
    });
    // Mark as existing for the rest of this run so two Zernio rows of the
    // same platform under one client only insert once (shouldn't happen,
    // but a defensive guard).
    existingKeys.add(key);
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      scanned,
      skippedNoProfile,
      skippedUnmatched,
      skippedExisting,
      inserted: 0,
    });
  }

  const rowsToInsert = candidates.map((c) => ({
    client_id: c.clientId,
    platform: c.platform,
    platform_user_id: c.lateAccountId,
    username: c.username,
    late_account_id: c.lateAccountId,
    is_active: true,
    token_status: 'valid' as const,
    account_owner: 'client' as const,
  }));

  const { error: insertErr } = await admin
    .from('social_profiles')
    .insert(rowsToInsert);
  if (insertErr) {
    return NextResponse.json(
      { error: 'insert_failed', detail: insertErr.message },
      { status: 500 },
    );
  }

  // Group by client for one Google Chat ping per client.
  const byClient = new Map<string, InsertCandidate[]>();
  for (const c of candidates) {
    const list = byClient.get(c.clientId) ?? [];
    list.push(c);
    byClient.set(c.clientId, list);
  }

  let pinged = 0;
  for (const [clientId, group] of byClient) {
    const meta = clients.find((c) => c.id === clientId);
    if (!meta) continue;
    const webhook = await resolveTeamChatWebhook(admin, {
      primaryUrl: meta.chat_webhook_url as string | null,
      agency: meta.agency as string | null,
    });
    const finalWebhook = webhook ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
    if (!finalWebhook) continue;

    const lines = group
      .map((g) => {
        const label = PLATFORM_LABEL[g.platform] ?? g.platform;
        const handle = g.username ? ` (@${g.username})` : '';
        return `• ${label}${handle}`;
      })
      .join('\n');
    const text = [
      `🔄 *Internal:* Cortex picked up new social accounts on *${meta.name}* from Zernio`,
      lines,
      ``,
      `These accounts were connected on Zernio's side but missing from Cortex. Cron backfilled them automatically; future posts will include them on the cadence. ` +
        `Client was NOT emailed, this is a behind-the-scenes sync. No team action needed unless an account looks wrong.`,
    ].join('\n');
    postToGoogleChatSafe(
      finalWebhook,
      { text },
      `sync-zernio-accounts:${clientId}`,
    );
    pinged += 1;
  }

  return NextResponse.json({
    scanned,
    skippedNoProfile,
    skippedUnmatched,
    skippedExisting,
    inserted: candidates.length,
    clientsPinged: pinged,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/sync-zernio-accounts',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const inserted = (body as { inserted?: number }).inserted;
      return typeof inserted === 'number' ? inserted : undefined;
    },
  },
  handleGet,
);
