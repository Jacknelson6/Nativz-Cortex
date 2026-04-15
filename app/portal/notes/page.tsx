import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { NotesDashboard } from '@/components/notes/notes-dashboard';
import { PageError } from '@/components/shared/page-error';

export const dynamic = 'force-dynamic';

/**
 * /portal/notes — viewer notes dashboard. Scoped to the currently active
 * brand (from x-portal-active-client or impersonation). Every board listed
 * here is a client-scope moodboard whose client_id matches the viewer's
 * access list, and the "New note" modal creates more of the same.
 */
export default async function PortalNotesDashboardPage() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/admin/login');

    const portal = await getPortalClient();
    if (!portal) redirect('/admin/login');

    return (
      <NotesDashboard
        clients={[]}
        isAdmin={false}
        portalClientId={portal.client.id}
        routePrefix="/portal"
      />
    );
  } catch (error) {
    console.error('PortalNotesDashboardPage error:', error);
    return <PageError />;
  }
}
