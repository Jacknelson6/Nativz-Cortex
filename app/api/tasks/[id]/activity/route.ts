import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function verifyAdmin(userId: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

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

    if (!(await verifyAdmin(user.id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: activity, error } = await adminClient
      .from('task_activity')
      .select('*')
      .eq('task_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('GET /api/tasks/[id]/activity error:', error);
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }

    return NextResponse.json(activity ?? []);
  } catch (error) {
    console.error('GET /api/tasks/[id]/activity error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
