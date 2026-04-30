import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { ContentToolsShell } from '@/components/admin/content-tools/content-tools-shell';

export const dynamic = 'force-dynamic';

/**
 * /admin/content-tools, admin-only command surface for the content
 * pipeline. Replaces the legacy /admin/share-links page (which only
 * showed cross-brand share links) with a 4-tab shell:
 *
 *   1. Projects        : every share link across every brand
 *   2. Quick schedule  : Monday EM-approved queue + caption pre-fill
 *   3. Connections     : env probes for every external integration
 *   4. Notifications   : recent transactional emails + POC overview
 *
 * Iter 14.1 paints the shell + wires Projects, Connections, and the
 * Notifications activity feed. Quick Schedule and reachability probes
 * land in iter 14.2 / 14.4. Old /admin/share-links 308-redirects here.
 */
export default async function AdminContentToolsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/review');

  return <ContentToolsShell />;
}
