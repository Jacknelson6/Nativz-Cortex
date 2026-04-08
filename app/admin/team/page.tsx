import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PageError } from '@/components/shared/page-error';
import { TeamGrid } from '@/components/team/team-grid';

type Assignment = {
  team_member_id: string;
  client_id: string;
  role: string | null;
  clients: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type TodoRow = {
  user_id: string;
};

type UserIntegration = {
  id: string;
  email?: string;
  todoist_api_key: string | null;
};

function normalizeClient(c: Assignment['clients']): { name: string; slug: string } | null {
  if (!c) return null;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

export default async function TeamPage() {
  try {
    const admin = createAdminClient();

    // Check if current user is super admin
    const supabase = await createServerSupabaseClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let isSuperAdmin = false;
    if (currentUser) {
      const { data: currentUserData } = await admin
        .from('users')
        .select('is_super_admin')
        .eq('id', currentUser.id)
        .single();
      isSuperAdmin = currentUserData?.is_super_admin === true;
    }

    const [teamRes, assignmentsRes, todosRes, usersRes] = await Promise.all([
      admin
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
      admin
        .from('client_assignments')
        .select('team_member_id, client_id, role, clients(name, slug)'),
      admin
        .from('todos')
        .select('user_id')
        .eq('is_completed', false),
      admin
        .from('users')
        .select('id, email, todoist_api_key, is_super_admin, avatar_url, role'),
    ]);

    const members = teamRes.data ?? [];
    const assignments: Assignment[] = assignmentsRes.data ?? [];
    const todos: TodoRow[] = todosRes.data ?? [];
    const userIntegrations: (UserIntegration & { is_super_admin?: boolean; avatar_url?: string | null; role?: string })[] = usersRes.data ?? [];

    // Map user_id → integrations
    const integrationsByUser: Record<string, { todoist: boolean; calendar: boolean }> = {};
    const superAdminUserIds = new Set<string>();
    for (const u of userIntegrations) {
      integrationsByUser[u.id] = {
        todoist: !!u.todoist_api_key,
        calendar: false,
      };
      if (u.is_super_admin) superAdminUserIds.add(u.id);
    }

    // Build user_id → avatar_url map for syncing
    const userAvatars: Record<string, string> = {};
    for (const u of userIntegrations) {
      if (u.avatar_url) userAvatars[u.id] = u.avatar_url;
    }

    // Sync avatars from users → team_members (in-memory for display, no DB write here)
    for (const m of members) {
      if (m.user_id && !m.avatar_url && userAvatars[m.user_id]) {
        m.avatar_url = userAvatars[m.user_id];
      }
    }

    // Build set of super admin team member IDs
    const superAdminMemberIds = new Set<string>();
    for (const m of members) {
      if (m.user_id && superAdminUserIds.has(m.user_id)) {
        superAdminMemberIds.add(m.id);
      }
    }

    // Group assignments by team member → serializable record
    const assignmentsByMember: Record<string, { name: string; slug: string }[]> = {};
    for (const a of assignments) {
      const client = normalizeClient(a.clients);
      if (!client) continue;
      const list = assignmentsByMember[a.team_member_id] ?? [];
      list.push(client);
      assignmentsByMember[a.team_member_id] = list;
    }

    // Count open todos per user → serializable record
    const todoCountByUser: Record<string, number> = {};
    for (const t of todos) {
      todoCountByUser[t.user_id] = (todoCountByUser[t.user_id] ?? 0) + 1;
    }

    // Fetch last sign-in from Supabase Auth (admin API)
    const lastSignInByUser: Record<string, string | null> = {};
    const authEmailByUser: Record<string, string> = {};
    try {
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 200 });
      for (const u of authData?.users ?? []) {
        lastSignInByUser[u.id] = u.last_sign_in_at ?? null;
        if (u.email) authEmailByUser[u.id] = u.email;
      }
    } catch {
      // Auth admin API may not be available in all environments
    }

    // Fetch search counts per user (created_by)
    const searchCountByUser: Record<string, number> = {};
    try {
      const { data: searchCounts } = await admin
        .from('topic_searches')
        .select('created_by')
        .not('created_by', 'is', null);
      for (const s of searchCounts ?? []) {
        if (s.created_by) {
          searchCountByUser[s.created_by] = (searchCountByUser[s.created_by] ?? 0) + 1;
        }
      }
    } catch {
      // Non-critical
    }

    // Build user role map
    const userRoleByUser: Record<string, string> = {};
    for (const u of userIntegrations) {
      if (u.role) userRoleByUser[u.id] = u.role;
    }

    return (
      <div className="cortex-page-gutter space-y-6">
        <TeamGrid
          initialMembers={members}
          assignmentsByMember={assignmentsByMember}
          todoCountByUser={todoCountByUser}
          integrationsByUser={integrationsByUser}
          isSuperAdmin={isSuperAdmin}
          superAdminMemberIds={Array.from(superAdminMemberIds)}
          lastSignInByUser={lastSignInByUser}
          searchCountByUser={searchCountByUser}
          authEmailByUser={authEmailByUser}
          userRoleByUser={userRoleByUser}
        />
      </div>
    );
  } catch (error) {
    console.error('TeamPage error:', error);
    return <PageError />;
  }
}
