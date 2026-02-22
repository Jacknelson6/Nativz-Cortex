import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGoogleAuthUrl, isGoogleConfigured } from '@/lib/google/auth';

export async function GET() {
  try {
    if (!isGoogleConfigured()) {
      return NextResponse.json(
        { error: 'Google Calendar integration is not configured' },
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

    // Use the user ID as state to link the callback to the user
    const state = user.id;
    const authUrl = getGoogleAuthUrl(state);

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error('GET /api/calendar/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
