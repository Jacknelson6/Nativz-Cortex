import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ADMIN_ACTIVE_CLIENT_COOKIE } from '@/lib/admin/get-active-client';

/**
 * POST /api/auth/logout
 *
 * Sign out the current user via Supabase Auth. Always redirects to the
 * unified login page at /admin/login.
 *
 * @auth None required (no-op if not authenticated)
 * @returns {{ redirectTo: string }} Redirect path for the client to navigate to
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();

    const response = NextResponse.json({ redirectTo: '/login' });
    // Clear cached role cookies so the next login doesn't inherit a stale role
    response.cookies.set('x-user-role', '', { maxAge: 0, path: '/' });
    response.cookies.set('x-user-role-uid', '', { maxAge: 0, path: '/' });
    // Clear the admin's pinned brand (NAT-58). On shared machines, the
    // next admin to sign in would briefly see the previous user's brand
    // until they picked a new one — the server would 403 their actions
    // (re-authorized on every read), but the pill label would read wrong.
    response.cookies.set(ADMIN_ACTIVE_CLIENT_COOKIE, '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}
