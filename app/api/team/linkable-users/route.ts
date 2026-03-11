import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get users from BOTH sources: public.users table AND auth.users (via admin API)
    // This ensures we find accounts that exist in auth but not yet in the users table
    const [publicUsersRes, authUsersRes, linkedMembersRes] = await Promise.all([
      adminClient.from('users').select('id, full_name, email, role').order('full_name'),
      adminClient.auth.admin.listUsers({ perPage: 500 }),
      adminClient.from('team_members').select('user_id').not('user_id', 'is', null),
    ]);

    const linkedIds = new Set((linkedMembersRes.data ?? []).map((m) => m.user_id));

    // Build a map of all users (public.users first, then fill in from auth.users)
    const userMap = new Map<string, { id: string; full_name: string; email: string }>();

    for (const u of publicUsersRes.data ?? []) {
      if (!linkedIds.has(u.id)) {
        userMap.set(u.id, { id: u.id, full_name: u.full_name ?? u.email ?? 'Unknown', email: u.email ?? '' });
      }
    }

    // Add auth users that aren't in public.users yet
    for (const au of authUsersRes.data?.users ?? []) {
      if (!linkedIds.has(au.id) && !userMap.has(au.id)) {
        const name = au.user_metadata?.full_name ?? au.user_metadata?.name ?? au.email ?? 'Unknown';
        userMap.set(au.id, { id: au.id, full_name: name, email: au.email ?? '' });
      }
    }

    // Sort by name and return
    const available = Array.from(userMap.values()).sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );

    return NextResponse.json(available);
  } catch (error) {
    console.error('GET /api/team/linkable-users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
