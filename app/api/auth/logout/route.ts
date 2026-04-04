import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    const response = NextResponse.json({ redirectTo: '/admin/login' });
    // Clear cached role cookies so the next login doesn't inherit a stale role
    response.cookies.set('x-user-role', '', { maxAge: 0, path: '/' });
    response.cookies.set('x-user-role-uid', '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}
