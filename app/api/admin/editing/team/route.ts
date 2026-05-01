import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/editing/team?role=strategist|editor|videographer
 *
 * Returns the agency roster as picker options for the editing project
 * detail panel. The three role assignments on `editing_projects`
 * (`assignee_id` / `videographer_id` / `strategist_id`) FK into
 * `team_members` (migration 212), which is the canonical agency-people
 * table and includes folks without auth accounts (Jaime, Jashan, Jed,
 * Khen, Kiet, etc.).
 *
 * The optional `role` filter narrows the list to members tagged with
 * that editing role via `team_members.editing_roles`. The picker uses
 * this so the strategist dropdown only shows strategists, etc. With no
 * filter we return any member that has at least one editing role tag,
 * so unrelated roster entries (CEO, CMO, test rows) don't pollute the
 * picker.
 *
 * Sorted by full_name asc (then email) for a stable list.
 *
 * Auth: any admin can read this.
 */

const VALID_ROLES = new Set(['strategist', 'editor', 'videographer']);

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  is_super_admin: boolean;
  editing_roles: string[];
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const roleParam = url.searchParams.get('role');
  const filterRole =
    roleParam && VALID_ROLES.has(roleParam) ? roleParam : null;

  const admin = createAdminClient();
  let query = admin
    .from('team_members')
    .select('id, email, full_name, role, avatar_url, editing_roles, is_active')
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('email', { ascending: true });

  if (filterRole) {
    // Members tagged with the requested editing role.
    query = query.contains('editing_roles', [filterRole]);
  } else {
    // Any member with at least one editing role tag.
    query = query.not('editing_roles', 'eq', '{}');
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: 'db_error', detail: error.message },
      { status: 500 },
    );
  }

  const members: TeamMember[] = (data ?? [])
    .filter((m) => m.is_active !== false)
    .map((m) => ({
      id: m.id as string,
      email: (m.email as string | null) ?? '',
      full_name: (m.full_name as string | null) ?? null,
      avatar_url: (m.avatar_url as string | null) ?? null,
      role: (m.role as string | null) ?? '',
      is_super_admin: false,
      editing_roles: ((m.editing_roles as string[] | null) ?? []) as string[],
    }));

  return NextResponse.json({ members });
}
