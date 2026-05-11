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
 *    `social_profiles` row that's missing it.
 *
 *    Primary match key: `(clients.late_profile_id, platform)`. Zernio
 *    accounts hang under a Zernio profile; we store that profile id on
 *    the client. So if a brand has a `late_profile_id` and Zernio
 *    returns an account on `instagram` under that profile, that account
 *    is unambiguously that brand's IG connection — no username compare
 *    needed (which used to break on `avondaleprivatelending` vs
 *    `avondale_private_lending`).
 *
 *    Fallback match key: `(platform, normalized_username)`. Kept for
 *    legacy rows that predate `late_profile_id`, or when Zernio's
 *    `/accounts` payload doesn't echo `profileId` on a given row.
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
  // Pull every Zernio account + every Cortex client w/ a Zernio profile
  // id + every social_profiles row, in parallel. We only need rows whose
  // `late_account_id` is null for the link step; rows already linked are
  // handled in pass 2.
  const [zernioAccountsResult, profilesResult, clientsResult] =
    await Promise.allSettled([
      service.getConnectedProfiles(),
      admin
        .from('social_profiles')
        .select(
          'id, client_id, platform, username, late_account_id, is_active',
        ),
      admin
        .from('clients')
        .select('id, late_profile_id')
        .not('late_profile_id', 'is', null),
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
    const clients =
      clientsResult.status === 'fulfilled' && !clientsResult.value.error
        ? clientsResult.value.data ?? []
        : [];

    type ProfileRow = {
      id: string;
      client_id: string;
      platform: string;
      username: string | null;
      late_account_id: string | null;
      is_active: boolean | null;
    };
    type ClientRow = { id: string; late_profile_id: string | null };

    // Primary index: `${client_id}|${platform}` → unlinked row(s) for
    // that brand+platform. This is the no-username path.
    const unlinkedByClientPlatform = new Map<string, ProfileRow[]>();
    // Fallback index: `${platform}|${normalizedUsername}` for legacy
    // rows where neither side has a profile id we can use.
    const unlinkedByPlatformUsername = new Map<string, ProfileRow[]>();
    for (const p of profiles as ProfileRow[]) {
      if (p.late_account_id) continue;
      const cpKey = `${p.client_id}|${p.platform}`;
      const cpBucket = unlinkedByClientPlatform.get(cpKey) ?? [];
      cpBucket.push(p);
      unlinkedByClientPlatform.set(cpKey, cpBucket);
      const puKey = `${p.platform}|${normalizeUsername(p.username)}`;
      const puBucket = unlinkedByPlatformUsername.get(puKey) ?? [];
      puBucket.push(p);
      unlinkedByPlatformUsername.set(puKey, puBucket);
    }

    // Zernio profile id → Cortex client id, so we can route an incoming
    // Zernio account directly to the owning brand.
    const clientByZernioProfile = new Map<string, string>();
    for (const c of clients as ClientRow[]) {
      if (c.late_profile_id) clientByZernioProfile.set(c.late_profile_id, c.id);
    }

    // Track which Zernio account IDs are already linked so we don't
    // accidentally double-link the same Zernio account to a different
    // brand.
    const alreadyLinkedIds = new Set(
      (profiles as ProfileRow[])
        .map((p) => p.late_account_id)
        .filter((v): v is string => Boolean(v)),
    );

    await Promise.all(
      zernioAccounts.map(async (acct) => {
        if (!acct.id) return;
        if (alreadyLinkedIds.has(acct.id)) return;

        // Path 1: profile-id match. Zernio echoes the parent profile id
        // on each account; if it lines up with a Cortex client's
        // `late_profile_id`, that's an unambiguous link regardless of
        // how the platform mangled the username.
        let target: ProfileRow | null = null;
        const clientId = acct.profileId
          ? clientByZernioProfile.get(acct.profileId) ?? null
          : null;
        if (clientId) {
          const candidates = unlinkedByClientPlatform.get(
            `${clientId}|${acct.platform}`,
          );
          if (candidates && candidates.length > 0) {
            target = candidates[0];
          }
        }

        // Path 2 (fallback): username match. Kept for legacy data and
        // for accounts where Zernio doesn't echo the profile id.
        if (!target && acct.username) {
          const candidates = unlinkedByPlatformUsername.get(
            `${acct.platform}|${normalizeUsername(acct.username)}`,
          );
          if (candidates && candidates.length === 1) {
            target = candidates[0];
          } else if (candidates && candidates.length > 1) {
            ambiguous.push({
              platform: acct.platform,
              username: acct.username,
              matches: candidates.length,
            });
            return;
          }
        }

        if (!target) return;

        const { error: linkErr } = await admin
          .from('social_profiles')
          .update({
            late_account_id: acct.id,
            // Refresh the username while we're here so the matrix shows
            // the handle the platform actually uses (e.g. underscores).
            // Only overwrite if Zernio sent one; never clobber to null.
            ...(acct.username ? { username: acct.username } : {}),
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
