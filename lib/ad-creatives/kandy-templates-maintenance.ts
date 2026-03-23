import type { SupabaseClient } from '@supabase/supabase-js';

const KANDY_TEMPLATES_BUCKET = 'kandy-templates';

/**
 * Deletes every row in `kandy_templates`. `ad_creatives.template_id` is not a FK — historical rows keep their uuid.
 */
export async function deleteAllKandyTemplateRows(
  admin: SupabaseClient,
): Promise<{ deletedApprox: number; error: Error | null }> {
  const { count } = await admin.from('kandy_templates').select('id', { count: 'exact', head: true });

  const { error } = await admin
    .from('kandy_templates')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  return {
    deletedApprox: count ?? 0,
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Recursively removes all objects under `prefix` in the Kandy templates bucket (nested paths like `saas/digital-products-1/...`).
 */
export async function emptyKandyTemplatesStorage(
  admin: SupabaseClient,
  prefix = '',
): Promise<{ removed: number; error: Error | null }> {
  let removed = 0;

  try {
    removed = await removeStoragePrefixRecursive(admin, KANDY_TEMPLATES_BUCKET, prefix);
    return { removed, error: null };
  } catch (e) {
    return {
      removed,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

async function removeStoragePrefixRecursive(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  let count = 0;
  const { data: items, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });

  if (error) throw new Error(error.message);
  if (!items?.length) return 0;

  const filePaths: string[] = [];

  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = item.metadata === null || item.metadata === undefined;
    if (isFolder) {
      count += await removeStoragePrefixRecursive(admin, bucket, path);
    } else {
      filePaths.push(path);
    }
  }

  if (filePaths.length > 0) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(filePaths);
    if (rmErr) throw new Error(rmErr.message);
    count += filePaths.length;
  }

  return count;
}
