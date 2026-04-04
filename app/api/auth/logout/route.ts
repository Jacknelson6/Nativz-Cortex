import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/logout
 *
 * Sign out the current user via Supabase Auth. Returns the appropriate redirect path
 * based on the user's role: admins are sent to /admin/login, viewers to /portal/login.
 *
 * @auth None required (no-op if not authenticated)
 * @returns {{ redirectTo: string }} Redirect path for the client to navigate to
 */
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get user role before signing out to redirect appropriately
    const { data: { user } } = await supabase.auth.getUser();
    let redirectPath = '/admin/login';

    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'viewer') {
        redirectPath = '/portal/login';
      }
    }

    await supabase.auth.signOut();

    const response = NextResponse.json({ redirectTo: redirectPath });
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
