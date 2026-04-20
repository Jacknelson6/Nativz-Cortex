import { redirect } from 'next/navigation';

/**
 * Users moved to /admin/tools/users. Redirect kept so stale admin bookmarks
 * and the occasional internal link don't 404.
 */
export default function UsersRedirect() {
  redirect('/admin/tools/users');
}
