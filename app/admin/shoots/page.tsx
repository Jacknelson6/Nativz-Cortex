import { redirect } from 'next/navigation';

// Shoots have moved into the unified Project Management surface. The legacy
// page queried `shoot_events`, a table that was never created in any
// migration; the new surface stores shoots in `tasks` with task_type='shoot'.
// See docs/superpowers/specs/2026-04-25-project-management-design.md
export default function ShootsRedirect() {
  redirect('/admin/projects?type=shoot');
}
