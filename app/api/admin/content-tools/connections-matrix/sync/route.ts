import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { ZernioPostingService } from '@/lib/posting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/content-tools/connections-matrix/sync
 *
 * Two-pass sync against Zernio:
 *
 * 1. Discover-and-link: list every account in our Zernio workspace
 *    (`/accounts`) and back-fill `late_account_id` on any matching
 *    `social_profiles` row that's missing it. Match key is
 *    `(platform, normalized_username)`. This catches the case where a
 *    client connected directly inside Zernio (not via our invite flow),
 *    so the matrix kept reading "Not connected" even though Zernio had
 *    a live token.
 *
 * 2. Health refresh: for every row that now has a `late_account_id`
 *    (including ones we just linked), hit `/accounts/{id}/health` and
 *    persist `token_expires_at` + `token_status` so the matrix surfaces
 *    "expires in 4 days" pills without the client re-entering the flow.
 *
 * Best-effort: a single 404 or timeout from Zernio doesn't abort the
 * whole sync. Rows we can't probe keep their existing values (the
 * matrix already shows the disconnect state from `disconnect_alerted_at`
 * / `is_active` if a real revoke happened).
 *
 * Auth: admin-only. Cross-brand scope.
 */

function normalizeUsername(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^@+/, '').toLowerCase();
}

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

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const service = new ZernioPostingService();

  // ── Pass 1: discover-and-link ────────────────────────────────────────
  // Pull every Zernio account + every social_profiles row we know about
  // in parallel. We only care about rows whose `late_account_id` is null
  // for the link step; rows already linked are handled in pass 2.
  const [zernioAccountsResult, profilesResult] = await Promise.allSettled([
    service.getConnectedProfiles(),
    admin
      .from('social_profiles')
      .select('id, client_id, platform, username, late_account_id, is_active'),
  ]);

  let linked = 0;
  const ambiguous: { platform: string; username: string; matches: number }[] =
    [];

  if (
    zernioAccountsResult.status === 'fulfilled' &&
    profilesResult.status === 'fulfilled' &&
    !profilesResult.value.error
  ) {
    const zernioAccounts = zernioAccountsResult.value;
    const profiles = profilesResult.value.data ?? [];

    // Index unlinked rows by `${platform}|${normalizedUsername}` so we can
    // O(1) match each Zernio account against candidate Supabase rows.
    type ProfileRow = {
      id: string;
      client_id: string;
      platform: string;
      username: string | null;
      late_account_id: string | null;
      is_active: boolean | null;
    };
    const unlinkedByKey = new Map<string, ProfileRow[]>();
    for (const p of profiles as ProfileRow[]) {
      if (p.late_account_id) continue;
      const key = `${p.platform}|${normalizeUsername(p.username)}`;
      const bucket = unlinkedByKey.get(key) ?? [];
      bucket.push(p);
      unlinkedByKey.set(key, bucket);
    }

    // Track which Zernio account IDs are already linked so we don't
    // accidentally double-link the same Zernio account to a different
    // brand (would happen if two brands stored the same handle).
    const alreadyLinkedIds = new Set(
      (profiles as ProfileRow[])
        .map((p) => p.late_account_id)
        .filter((v): v is string => Boolean(v)),
    );

    await Promise.all(
      zernioAccounts.map(async (acct) => {
        if (!acct.id || !acct.username) return;
        if (alreadyLinkedIds.has(acct.id)) return;
        const key = `${acct.platform}|${normalizeUsername(acct.username)}`;
        const candidates = unlinkedByKey.get(key);
        if (!candidates || candidates.length === 0) return;
        if (candidates.length > 1) {
          // Two brands claim the same handle on the same platform.
          // Don't guess — let an admin sort it out manually.
          ambiguous.push({
            platform: acct.platform,
            username: acct.username,
            matches: candidates.length,
          });
          return;
        }
        const target = candidates[0];
        const { error: linkErr } = await admin
          .from('social_profiles')
          .update({
            late_account_id: acct.id,
            // Zernio is the source of truth for active state at link time;
            // if it returned the account, treat the row as active.
            is_active:
              target.is_active === false ? acct.isActive : target.is_active,
          })
          .eq('id', target.id);
        if (linkErr) {
          console.error(
            '[connections-matrix/sync] back-fill failed:',
            linkErr.message,
          );
          return;
        }
        // Mutate our in-memory copy so pass 2 picks it up immediately.
        target.late_account_id = acct.id;
        alreadyLinkedIds.add(acct.id);
        linked += 1;
      }),
    );
  }

  // ── Pass 2: health refresh ───────────────────────────────────────────
  const { data: rows, error } = await admin
    .from('social_profiles')
    .select('id, late_account_id')
    .not('late_account_id', 'is', null);

  if (error) {
    return NextResponse.json(
      { error: 'db_error', detail: error.message },
      { status: 500 },
    );
  }

  let synced = 0;
  let skipped = 0;

  await Promise.all(
    (rows ?? []).map(async (r) => {
      const accountId = r.late_account_id as string | null;
      if (!accountId) {
        skipped += 1;
        return;
      }
      const health = await service.getAccountHealth(accountId);
      if (!health) {
        skipped += 1;
        return;
      }
      const status = deriveStatus(health);
      const { error: updateErr } = await admin
        .from('social_profiles')
        .update({
          token_expires_at: health.tokenExpiresAt,
          token_status: status,
        })
        .eq('id', r.id);
      if (updateErr) {
        console.error(
          '[connections-matrix/sync] update failed:',
          updateErr.message,
        );
        skipped += 1;
        return;
      }
      synced += 1;
    }),
  );

  return NextResponse.json({ synced, skipped, linked, ambiguous });
}
