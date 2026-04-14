import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotesDashboard } from '@/components/notes/notes-dashboard';

export const dynamic = 'force-dynamic';

/**
 * /admin/notes — Notes dashboard. Lists every moodboard the caller can open
 * (personal + team + client), grouped by scope. Individual boards open at
 * /admin/notes/[id]. The old single-personal-board behavior moved to the
 * create flow — if the user has no boards yet, the dashboard shows a create-
 * first state.
 */
export default async function NotesDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  // Fetch the admin's clients for the New Note modal's client-scope option.
  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
  const isAdmin = userRow?.role === 'admin';

  let clients: { id: string; name: string; slug: string }[] = [];
  if (isAdmin) {
    const { data } = await admin
      .from('clients')
      .select('id, name, slug')
      .order('name', { ascending: true });
    clients = (data ?? []) as { id: string; name: string; slug: string }[];
  }

  return <NotesDashboard clients={clients} isAdmin={isAdmin} />;
}
