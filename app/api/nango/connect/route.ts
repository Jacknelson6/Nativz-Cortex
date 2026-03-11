import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createConnectSession, isNangoConfigured } from '@/lib/nango/client';

/**
 * POST /api/nango/connect
 * Returns a Nango connect session token for the frontend OAuth popup.
 */
export async function POST() {
  try {
    if (!isNangoConfigured()) {
      return NextResponse.json(
        { error: 'Nango is not configured. Set NANGO_SECRET_KEY.' },
        { status: 503 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const session = await createConnectSession(user.id);

    return NextResponse.json({ token: session.token });
  } catch (error) {
    console.error('POST /api/nango/connect error:', error);
    return NextResponse.json({ error: 'Failed to create connect session' }, { status: 500 });
  }
}
