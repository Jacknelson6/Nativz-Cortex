import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Remove the ad-creatives bucket object for a stored public URL, if it matches our storage path. */
export async function removeAdCreativeStorageFile(
  admin: AdminClient,
  imageUrl: string | null,
): Promise<void> {
  if (!imageUrl) return;
  try {
    const url = new URL(imageUrl);
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/ad-creatives\/(.+)/);
    if (match) {
      await admin.storage.from('ad-creatives').remove([match[1]]);
    }
  } catch {
    console.warn('Failed to delete storage file for creative URL:', imageUrl);
  }
}
