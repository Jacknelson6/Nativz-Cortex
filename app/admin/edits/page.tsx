import { redirect } from 'next/navigation';

// /admin/edits never had its own page — the sidebar link pointed here but no
// implementation existed. Now redirects to the unified Project Management
// surface filtered to edits.
export default function EditsRedirect() {
  redirect('/admin/projects?type=edit');
}
