import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotesDashboard } from '@/components/notes/notes-dashboard';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

export const dynamic = 'force-dynamic';

/**
 * /notes — Notes dashboard. Lists every moodboard the caller can open
 * (personal + team + client), grouped by scope. Individual boards open at
 * /notes/[id]. The old single-personal-board behavior moved to the
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
  if (!user) redirect('/login');

  // Fetch the admin's clients for the New Note modal's client-scope option.
  // Clients list is fetched unconditionally so it joins the same Promise.all;
  // if the caller isn't admin we discard it. One extra query vs. an extra
  // serial round-trip — worth it for the perceived-perf win.
  const admin = createAdminClient();
  const [userResult, active, { data: clientRows }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    getActiveAdminClient().catch(() => null),
    admin.from('clients').select('id, name, slug').order('name', { ascending: true }),
  ]);
  const isAdmin = userResult.data?.role === 'admin';
  const adminScopedClientId = active?.brand?.id ?? null;
  const clients = isAdmin
    ? ((clientRows ?? []) as { id: string; name: string; slug: string }[])
    : [];

  return (
    <NotesDashboard
      clients={clients}
      isAdmin={isAdmin}
      adminScopedClientId={adminScopedClientId}
    />
  );
}
