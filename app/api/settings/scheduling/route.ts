import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/settings/scheduling
 *
 * Fetch scheduling link settings for all agencies (nativz and ac).
 *
 * @auth Required (admin)
 * @returns {{ settings: { agency: string, scheduling_link: string | null, updated_at: string }[] }}
 */
export async function GET() {
  try {
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

    const { data, error } = await adminClient
      .from('agency_settings')
      .select('agency, scheduling_link, updated_at')
      .order('agency');

    if (error) {
      return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }

    return NextResponse.json({ settings: data ?? [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/settings/scheduling
 *
 * Update the scheduling link for a specific agency (nativz or ac).
 *
 * @auth Required (admin)
 * @body agency - Agency identifier: 'nativz' | 'ac' (required)
 * @body scheduling_link - Scheduling link URL (or null to clear)
 * @returns {{ success: true }}
 */
export async function PUT(request: NextRequest) {
  try {
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

    const body = await request.json();
    const { agency, scheduling_link } = body;

    if (!agency || !['nativz', 'ac'].includes(agency)) {
      return NextResponse.json({ error: 'Invalid agency' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('agency_settings')
      .update({ scheduling_link: scheduling_link || null, updated_at: new Date().toISOString() })
      .eq('agency', agency);

    if (error) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
