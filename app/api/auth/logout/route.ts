import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

    return NextResponse.json({ redirectTo: redirectPath });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to sign out' },
      { status: 500 }
    );
  }
}
