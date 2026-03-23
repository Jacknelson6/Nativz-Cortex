import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isAdminWorkspaceNavVisible,
  normalizeAdminWorkspaceModules,
  type AdminWorkspaceToggleKey,
} from '@/lib/clients/admin-workspace-modules';

/**
 * Resolves 404 when this workspace module is turned off for the client.
 * Use on every admin client workspace page except overview and settings.
 */
export async function requireAdminWorkspaceModuleAccess(
  slug: string,
  moduleKey: AdminWorkspaceToggleKey,
): Promise<void> {
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('admin_workspace_modules')
    .eq('slug', slug)
    .maybeSingle();

  if (!client) notFound();

  const modules = normalizeAdminWorkspaceModules(client.admin_workspace_modules);
  if (!isAdminWorkspaceNavVisible(modules, moduleKey)) notFound();
}
