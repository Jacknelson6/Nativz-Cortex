import { permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy alias for /admin/content-tools. The cross-brand share link
 * oversight page used to live here, but iter 14.1 folded it into the
 * Projects tab on the new Content Tools shell. Permanent redirect so
 * stale bookmarks + deep links keep working.
 */
export default function AdminShareLinksRedirect(): never {
  permanentRedirect('/admin/content-tools');
}
