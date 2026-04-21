import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotesDashboard } from '@/components/notes/notes-dashboard';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

export const dynamic = 'force-dynamic';

/**
 * /admin/notes — Notes dashboard. Lists every moodboard the caller can open
 * (personal + team + client), grouped by scope. Individual boards open at
 * /admin/notes/[id]. The old single-personal-board behavior moved to the
 * create flow — if the user has no boards yet, the dashboard shows a create-
 * first state.
 *
 * NAT-57 follow-up (2026-04-21): when the top-bar brand pill is set, the
 * board list filters to that brand's boards + personal notes. Clearing
 * the pill (or unpinning) reverts to the full cross-brand view. The
 * create modal's scope picker stays fully enabled either way — admins
 * can always create a note for any scope.
 */
export default async function NotesDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  // Fetch the admin's clients for the New Note modal's client-scope option.
  const admin = createAdminClient();
  const [userResult, active] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    getActiveAdminClient().catch(() => null),
  ]);
  const isAdmin = userResult.data?.role === 'admin';
  const adminScopedClientId = active?.brand?.id ?? null;

  let clients: { id: string; name: string; slug: string }[] = [];
  if (isAdmin) {
    const { data } = await admin
      .from('clients')
      .select('id, name, slug')
      .order('name', { ascending: true });
    clients = (data ?? []) as { id: string; name: string; slug: string }[];
  }

  return (
    <NotesDashboard
      clients={clients}
      isAdmin={isAdmin}
      adminScopedClientId={adminScopedClientId}
    />
  );
}
