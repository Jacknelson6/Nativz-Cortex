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
        .select('id, todoist_api_key'),
    ]);

    const members = teamRes.data ?? [];
    const assignments: Assignment[] = assignmentsRes.data ?? [];
    const todos: TodoRow[] = todosRes.data ?? [];
    const userIntegrations: UserIntegration[] = usersRes.data ?? [];

    // Map user_id → integrations
    const integrationsByUser: Record<string, { todoist: boolean; calendar: boolean }> = {};
    for (const u of userIntegrations) {
      integrationsByUser[u.id] = {
        todoist: !!u.todoist_api_key,
        calendar: false, // TODO: Check google_tokens table for calendar connection status
      };
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

    return (
      <div className="p-6 space-y-6">
        <TeamGrid
          initialMembers={members}
          assignmentsByMember={assignmentsByMember}
          todoCountByUser={todoCountByUser}
          integrationsByUser={integrationsByUser}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    );
  } catch (error) {
    console.error('TeamPage error:', error);
    return <PageError />;
  }
}
