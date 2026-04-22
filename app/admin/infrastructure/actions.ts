'use server';

import { revalidateTag } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INFRA_CACHE_TAG } from '@/components/admin/infrastructure/cache';

/**
 * Bust every infrastructure tab's cache so the next render re-reads from
 * Postgres. Admin-only.
 */
export async function refreshInfrastructure() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' } as const;

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { ok: false, error: 'forbidden' } as const;
  }

  revalidateTag(INFRA_CACHE_TAG);
  return { ok: true } as const;
}
