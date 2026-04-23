import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Shared admin gate for server actions. Returns `{ ok: true }` when the
 * caller is an admin / super-admin, else `{ ok: false, error }`. Keeps the
 * per-section action files (refresh-*, invalidate-*) tiny.
 */
export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: 'unauthenticated' | 'forbidden' }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return { ok: false, error: 'forbidden' };
  }
  return { ok: true };
}
