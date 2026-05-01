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
 * Walks every social_profiles row that has a `late_account_id`, hits
 * Zernio's `/accounts/{id}/health` for each, and persists
 * `token_expires_at` + `token_status` so the matrix can surface "expires
 * in 4 days" pills without the client ever needing to re-enter the flow.
 *
 * Best-effort: a single 404 or timeout from Zernio doesn't abort the
 * whole sync. Rows we can't probe keep whatever values they already had
 * (the matrix already shows the disconnect state from
 * `disconnect_alerted_at` / `is_active` if a real revoke happened).
 *
 * Auth: admin-only. Cross-brand scope.
 */

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

  const service = new ZernioPostingService();
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

  return NextResponse.json({ synced, skipped });
}
