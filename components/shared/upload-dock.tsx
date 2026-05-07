'use client';

import { useState, useSyncExternalStore } from 'react';
import { CheckCircle2, ChevronDown, Loader2, X } from 'lucide-react';
import {
  clearAllCompleted,
  getAllUploads,
  subscribe as subscribeUploads,
} from '@/lib/editing/upload-store';
import { UploadRow } from '@/components/admin/content-tools/edited-videos-box';

/**
 * Drive-style global upload indicator. Sits in the bottom-right of every
 * admin page (mounted once in `app/admin/layout.tsx`) and surfaces uploads
 * across every editing project the user has touched this session.
 *
 * The point: Jack can kick off a 10-file batch in one editing project's
 * detail dialog, close the dialog, navigate anywhere, and still see the
 * upload progress + a "done" affordance without re-opening the project.
 *
 * Auto-hides when the store is empty. When all jobs in the dock have
 * finished (done or error), the X button appears so the user can dismiss
 * the completed batch via `clearAllCompleted()`.
 */
export function UploadDock() {
  const groups = useSyncExternalStore(
    subscribeUploads,
    getAllUploads,
    getAllUploads,
  );
  const [collapsed, setCollapsed] = useState(false);

  if (groups.length === 0) return null;

  const allJobs = groups.flatMap((g) => g.jobs);
  const total = allJobs.length;
  const done = allJobs.filter((j) => j.state === 'done').length;
  const errors = allJobs.filter((j) => j.state === 'error').length;
  const inFlight = total - done - errors;

  const summary =
    inFlight > 0
      ? `Uploading ${done + errors}/${total}`
      : errors > 0
        ? `${done} done · ${errors} failed`
        : `${total} upload${total === 1 ? '' : 's'} complete`;

  const allFinished = inFlight === 0;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-xl"
      // The dock sits on top of everything, including dialog backdrops, so
      // a fast-fired batch from an open detail dialog still shows progress
      // immediately. Open <dialog> elements live in the top-layer; this
      // fixed element doesn't share that layer, so when a dialog is open
      // the dock is hidden behind its backdrop. That's fine: the dialog's
      // own progress UI covers it. The dock's job is the rest of the time.
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {inFlight > 0 ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-accent-text" />
          ) : errors > 0 ? (
            <X size={14} className="shrink-0 text-[color:var(--status-danger)]" />
          ) : (
            <CheckCircle2
              size={14}
              className="shrink-0 text-[color:var(--status-success)]"
            />
          )}
          <span className="truncate text-sm font-medium text-text-primary">
            {summary}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>
          {allFinished && (
            <button
              type="button"
              aria-label="Dismiss completed uploads"
              onClick={() => clearAllCompleted()}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto border-t border-nativz-border/60 px-4 py-3">
          <ul className="space-y-2.5">
            {allJobs.map((job) => (
              <UploadRow key={job.id} job={job} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
