/**
 * Pure helpers shared between the public share pages (/c/[token],
 * /c/edit/[token]) and the dedicated download pages
 * (/c/[token]/download, /c/edit/[token]/download).
 *
 * Keeping these here lets the download surfaces stay thin without
 * duplicating the URL / filename / zip-naming logic that drives the
 * "Download all" button on the full review pages.
 */

export interface DownloadTarget {
  url: string;
  filename: string;
  /** Thumbnail URL for grid rendering. Falls back to the asset itself for images. */
  thumbnail: string | null;
  /** True for image assets, false for videos. Drives the grid tile treatment. */
  isImage: boolean;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function stripExt(name: string | null | undefined): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function mimeToExt(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[mime.toLowerCase()] ?? null;
}

export function extFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
}

/**
 * Pad a zip with `-2`, `-3`... when the same filename collides. JSZip
 * silently overwrites duplicate keys, which would drop files from the bundle.
 */
export function uniqueZipName(used: Set<string>, base: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let i = 2;
  for (;;) {
    const candidate = `${stem}-${i}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    i++;
  }
}

export function buildCalendarZipFilename(
  clientName: string | null | undefined,
  startDate: string,
  endDate: string,
): string {
  const parts: string[] = [];
  const clientSlug = clientName ? slugify(clientName) : '';
  if (clientSlug) parts.push(clientSlug);
  parts.push('calendar');
  const startSlug = startDate ? startDate.slice(0, 10) : '';
  if (startSlug) parts.push(startSlug);
  if (endDate && endDate.slice(0, 10) !== startSlug) {
    parts.push(endDate.slice(0, 10));
  }
  const stem = parts.filter(Boolean).join('-') || 'calendar-share';
  return `${stem}.zip`;
}

export function buildEditZipFilename(
  clientName: string | null | undefined,
  projectName: string | null | undefined,
): string {
  const parts = [clientName ? slugify(clientName) : '', projectName ? slugify(projectName) : '']
    .filter(Boolean);
  return `${parts.join('-') || 'cuts'}.zip`;
}

/**
 * Cross-origin friendly download: fetch as blob, mint an object URL, click
 * a synthetic anchor. The `download` HTML attribute is ignored on most
 * cross-origin assets (Mux, Supabase Storage public bucket), so we go via
 * blob to guarantee an actual save instead of a navigation.
 */
export async function downloadAsset(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
  }
}
