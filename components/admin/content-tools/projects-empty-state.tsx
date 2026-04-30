import { MessagesSquare } from 'lucide-react';

/** Empty state for the Projects tab. Mirrors the look of the legacy
 *  `<EmptyState>` in review-table.tsx so the move from "Share Links"
 *  to "Content tools" doesn't change what an admin sees on day zero. */
export function ProjectsEmptyState() {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
      <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
      <p className="text-sm text-text-secondary">No projects yet.</p>
      <p className="mt-1 text-xs text-text-muted">
        When your team sends a calendar to a client for review, it will show up here.
      </p>
    </div>
  );
}
