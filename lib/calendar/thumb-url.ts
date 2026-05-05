/**
 * Returns a thumbnail-sized variant of a Supabase Storage public URL by
 * routing through the `/render/image/public/` transform endpoint instead
 * of `/object/public/`. Supabase's image transformer returns a resized,
 * re-encoded WebP that's typically 10-50x smaller than the original.
 *
 * Used to keep calendar list/grid render times responsive when a brand
 * (e.g. Land Shark) has many image-post drops with large originals.
 *
 * Non-Supabase URLs (Mux thumbnails, Drive previews, external CDNs) and
 * already-transformed URLs are returned unchanged.
 */
export function thumbUrl(
  url: string | null | undefined,
  width: number,
): string | null {
  if (!url) return null;
  if (!url.includes('/storage/v1/object/public/')) return url;
  const transformed = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  const sep = transformed.includes('?') ? '&' : '?';
  return `${transformed}${sep}width=${width}&quality=75&resize=cover`;
}
