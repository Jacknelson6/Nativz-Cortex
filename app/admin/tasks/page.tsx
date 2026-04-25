import { redirect } from 'next/navigation';

// Tasks were folded into the Project Management page on 2026-04-25.
// The today/upcoming/all task UI now lives under /admin/projects?tab=tasks.
// Existing /admin/tasks bookmarks land there via this redirect.
export default function TasksRedirect() {
  redirect('/admin/projects?tab=tasks');
}
