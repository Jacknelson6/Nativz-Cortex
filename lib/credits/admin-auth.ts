/**
 * requireCreditsAdmin — shared admin gate for /api/credits/* routes.
 *
 * Mirrors the role check used in app/admin/clients/[slug]/billing/page.tsx:
 *   `is_super_admin === true || role === 'admin' || role === 'super_admin'`.
 *
 * Returns the resolved user + whether they're admin. Routes that only allow
 * admin should return 401/403 if `isAdmin === false`.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface CreditsAdminContext {
  user: User;
  admin: SupabaseClient;
  isAdmin: boolean;
}

export async function getCreditsAdminContext(): Promise<
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true; ctx: CreditsAdminContext }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  const isAdmin =
    (me as { is_super_admin?: boolean | null } | null)?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';

  if (!isAdmin) {
    return { ok: false, status: 403, error: 'Admin access required' };
  }

  return { ok: true, ctx: { user, admin, isAdmin } };
}
