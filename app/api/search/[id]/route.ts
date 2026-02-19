import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: search, error: fetchError } = await supabase
      .from('topic_searches')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    return NextResponse.json(search);
  } catch (error) {
    console.error('GET /api/search/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user is admin
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
    const { action } = body as { action: 'approve' | 'reject' };

    if (action === 'approve') {
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error approving search:', updateError);
        return NextResponse.json({ error: 'Failed to approve search' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'approved' });
    }

    if (action === 'reject') {
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          approved_at: null,
          approved_by: null,
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error rejecting search:', updateError);
        return NextResponse.json({ error: 'Failed to reject search' }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject".' }, { status: 400 });
  } catch (error) {
    console.error('PATCH /api/search/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
