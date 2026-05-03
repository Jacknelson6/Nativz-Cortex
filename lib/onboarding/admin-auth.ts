/**
 * requireOnboardingAdmin: shared admin gate for /api/admin/onboardings/*
 * routes. Mirrors lib/credits/admin-auth.ts so the role check is
 * identical across admin surfaces.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface OnboardingAdminContext {
  user: User;
  admin: SupabaseClient;
}

export async function getOnboardingAdminContext(): Promise<
  | { ok: false; status: 401 | 403; error: string }
  | { ok: true; ctx: OnboardingAdminContext }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

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

  return { ok: true, ctx: { user, admin } };
}
