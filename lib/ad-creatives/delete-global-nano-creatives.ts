import type { createAdminClient } from '@/lib/supabase/admin';
import { removeAdCreativeStorageFile } from '@/lib/ad-creatives/remove-creative-storage';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Deletes all Nano Banana (`template_source === 'global'`) creatives for a client
 * and removes their storage objects. Leaves Kandy/custom template ads untouched.
 */
export async function deleteGlobalNanoAdCreativesForClient(
  admin: AdminClient,
  clientId: string,
): Promise<{ deletedCount: number }> {
  const { data: rows, error } = await admin
    .from('ad_creatives')
    .select('id, image_url')
    .eq('client_id', clientId)
    .eq('template_source', 'global');

  if (error) {
    throw new Error(`Failed to list global ad creatives: ${error.message}`);
  }

  const list = rows ?? [];
  if (list.length === 0) {
    return { deletedCount: 0 };
  }

  for (const row of list) {
    await removeAdCreativeStorageFile(admin, row.image_url);
  }

  const ids = list.map((r) => r.id);
  const { error: delErr } = await admin.from('ad_creatives').delete().in('id', ids).eq('client_id', clientId);

  if (delErr) {
    throw new Error(`Failed to delete ad creatives: ${delErr.message}`);
  }

  return { deletedCount: ids.length };
}
