import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export type CreatedShareLink = {
  id: string;
  token: string;
  url: string;
  expires_at: string;
  created_at: string;
};

/**
 * Mints a fresh share link for an editing project. Used by both the manual
 * POST /api/admin/editing/projects/:id/share endpoint and the Mux webhook
 * auto-deliver hook. Returns the row plus the public review URL resolved
 * through the client's agency brand.
 *
 * `createdBy` is null for system-issued links (auto-deliver path). The
 * editing_project_share_links table allows null on that column.
 */
export async function createEditingShareLink(
  admin: SupabaseClient,
  projectId: string,
  createdBy: string | null,
): Promise<{ link: CreatedShareLink } | { error: string }> {
  const { data: project, error: projectErr } = await admin
    .from('editing_projects')
    .select('id, clients(agency)')
    .eq('id', projectId)
    .single<{ id: string; clients: { agency: string | null } | null }>();
  if (projectErr || !project) {
    return { error: projectErr?.message ?? 'project_not_found' };
  }

  const { count } = await admin
    .from('editing_project_videos')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (!count || count === 0) {
    return { error: 'no_videos' };
  }

  const insert: { project_id: string; created_by?: string } = { project_id: projectId };
  if (createdBy) insert.created_by = createdBy;

  const { data: link, error } = await admin
    .from('editing_project_share_links')
    .insert(insert)
    .select('id, token, expires_at, created_at')
    .single<{ id: string; token: string; expires_at: string; created_at: string }>();
  if (error || !link) {
    return { error: error?.message ?? 'create_failed' };
  }

  const brand = getBrandFromAgency(project.clients?.agency);
  const appUrl =
    process.env.NODE_ENV !== 'production'
      ? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
      : getCortexAppUrl(brand);

  return {
    link: {
      id: link.id,
      token: link.token,
      url: `${appUrl}/s/${link.token}`,
      expires_at: link.expires_at,
      created_at: link.created_at,
    },
  };
}
