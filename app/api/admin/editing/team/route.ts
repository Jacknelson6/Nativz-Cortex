import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/editing/team
 *
 * Returns every admin user as a picker option for the editing project
 * detail panel. The role assignments (`assignee_id` / `videographer_id`
 * / `strategist_id`) all FK into `users`, so the same list backs all
 * three pickers, the consumer just labels the dropdown.
 *
 * Sorted by full_name asc (then email) so the picker is stable. We
 * intentionally include the user's role + super-admin flag so the UI
 * can render a small badge if Jack ever wants to call out the
 * super-admin in the list (not needed today).
 *
 * Auth: any admin can read this (we want editors / strategists able
 * to use the picker, not just super-admins).
 */

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  is_super_admin: boolean;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, email, full_name, avatar_url, role, is_super_admin')
    .in('role', ['admin', 'super_admin'])
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('email', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'db_error', detail: error.message },
      { status: 500 },
    );
  }

  const members: TeamMember[] = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name ?? null,
    avatar_url: u.avatar_url ?? null,
    role: u.role,
    is_super_admin: !!u.is_super_admin,
  }));

  return NextResponse.json({ members });
}
