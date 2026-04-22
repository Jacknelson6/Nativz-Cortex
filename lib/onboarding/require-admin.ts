import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Shared admin gate for /api/onboarding/* routes. Returns either an
 * `admin` Supabase client + the authenticated user, or an `error`
 * NextResponse to return immediately. Keeps the 8-line boilerplate out
 * of every route handler.
 */
export async function requireOnboardingAdmin(): Promise<
  | { admin: AdminClient; userId: string; error?: undefined }
  | { admin?: undefined; userId?: undefined; error: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { admin, userId: user.id };
}
