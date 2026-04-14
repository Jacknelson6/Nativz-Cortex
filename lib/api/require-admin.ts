import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { User } from '@supabase/supabase-js';

export type AdminAuthResult =
  | {
      ok: true;
      user: User;
      adminRow: { id: string; full_name: string | null; email: string | null; role: string };
    }
  | { ok: false; response: NextResponse };

/**
 * Requires an authenticated caller with role='admin' in the public users table.
 * Returns the auth user + their admin row on success, or a NextResponse on failure.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  if (!adminRow || adminRow.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user, adminRow };
}
