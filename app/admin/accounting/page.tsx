import { redirect } from 'next/navigation';

/**
 * Accounting moved to /admin/tools/accounting. Redirect kept so magic links,
 * bookmarks, and email CTAs don't break.
 */
export default function AccountingRedirect() {
  redirect('/admin/tools/accounting');
}
