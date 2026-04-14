import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotesDashboard } from '@/components/notes/notes-dashboard';

export const dynamic = 'force-dynamic';

/**
 * /portal/notes — Notes dashboard for portal (viewer) users. Same component
 * as the admin dashboard, but the client list stays empty and isAdmin=false
 * so the create modal only offers Personal-scope boards.
 */
export default async function PortalNotesDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).single();
  // Portal uses the same dashboard component; non-admins just can't create
  // team/client boards — the modal gates those options on isAdmin.
  const isAdmin = userRow?.role === 'admin';

  return <NotesDashboard clients={[]} isAdmin={isAdmin} />;
}
