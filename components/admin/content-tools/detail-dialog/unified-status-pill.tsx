'use client';

import {
  UNIFIED_STATUS_LABEL,
  type UnifiedStatus,
} from '@/lib/content-tools/unified-status';

/**
 * Compact 4-state pill rendered in the header of both content-tools
 * detail modals. Source-of-truth status mapping lives in
 * `lib/content-tools/unified-status.ts`; this component is purely the
 * visual shell. Read-only by design: the editing modal still exposes an
 * editable status select inside "Project settings" (so the backend can
 * keep stamping `ready_at` / `approved_at` from the legacy enum), and
 * the SMM bundle status is derived, not directly editable.
 */

const TONE_CLASSES: Record<UnifiedStatus, string> = {
  ready_to_send:
    'border-text-muted/20 bg-text-muted/10 text-text-secondary',
  needs_approval:
    'border-status-warning/20 bg-status-warning/10 text-status-warning',
  revising:
    'border-accent-text/20 bg-accent-surface/30 text-accent-text',
  approved:
    'border-status-success/20 bg-status-success/10 text-status-success',
};

export function UnifiedStatusPill({ status }: { status: UnifiedStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[status]}`}
    >
      {UNIFIED_STATUS_LABEL[status]}
    </span>
  );
}

const KIND_LABEL = {
  calendar: 'Content calendar',
  editing: 'Editing project',
} as const;

export function ContentKindBadge({
  kind,
}: {
  kind: 'calendar' | 'editing';
}) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-nativz-border bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted">
      {KIND_LABEL[kind]}
    </span>
  );
}
