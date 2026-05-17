'use client';

/**
 * Phase strip section for the editing-project slide-over.
 *
 * Surfaces:
 *   - The full 9-state pipeline rendered as a horizontal track, with the
 *     current phase highlighted and prior phases dimmed.
 *   - Forward + backward CTA buttons that hit
 *     POST /api/admin/editing/projects/:id/phase.
 *
 * Role lens (Videographer / Editor / PM) filters which CTAs are visible
 * via `nextActionsFor`. PM (the default lens for Jack) sees every action;
 * Videographer sees Planning -> Raw uploaded; Editor sees Raw uploaded
 * onward. The dropdown lives in the slide-over header so it persists
 * across phase changes.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EDITING_PHASES, type EditingProjectPhase } from '@/lib/editing/types';
import {
  nextActionsFor,
  type PhaseAction,
  type PhaseRole,
} from '@/lib/content-projects/phase-state-machine';
import { PhasePill } from './phase-pill';

interface PhaseStripProps {
  projectId: string;
  phase: EditingProjectPhase;
  role: PhaseRole;
  /**
   * Per-action preconditions resolved by the parent (we don't want this
   * component fetching share-link / video state on its own — it lives
   * inside a detail panel that already has those facts).
   */
  preconditions: {
    drive_folder_url: boolean;
    editing_videos: boolean;
    share_link: boolean;
    scheduled_posts: boolean;
  };
  onChanged: (nextPhase: EditingProjectPhase) => void;
}

export function PhaseStrip({
  projectId,
  phase,
  role,
  preconditions,
  onChanged,
}: PhaseStripProps) {
  const [pending, setPending] = useState<EditingProjectPhase | null>(null);
  const actions = nextActionsFor(phase, role);

  async function runTransition(action: PhaseAction) {
    if (pending) return;
    const blocker = preconditionBlocker(action, preconditions);
    if (blocker) {
      toast.error(blocker);
      return;
    }
    setPending(action.toPhase);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_phase: action.toPhase }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        toast.error(json.detail ?? json.error ?? 'Phase update failed');
        return;
      }
      toast.success(`Moved to ${action.toPhase}`);
      onChanged(action.toPhase);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Phase update failed');
    } finally {
      setPending(null);
    }
  }

  const currentIndex = EDITING_PHASES.indexOf(phase);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">
            Phase
          </span>
          <PhasePill phase={phase} size="md" />
        </div>
      </div>

      <ol className="flex flex-wrap gap-1">
        {EDITING_PHASES.map((p, i) => {
          const isCurrent = p === phase;
          const isPast = i < currentIndex;
          return (
            <li
              key={p}
              className={`flex-1 min-w-[64px] rounded-md border px-2 py-1 text-center text-[10.5px] font-medium leading-tight transition-colors ${
                isCurrent
                  ? 'border-accent bg-accent-surface/30 text-accent-text'
                  : isPast
                    ? 'border-nativz-border bg-background text-text-secondary'
                    : 'border-dashed border-nativz-border bg-surface text-text-muted'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {p}
            </li>
          );
        })}
      </ol>

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const blocker = preconditionBlocker(action, preconditions);
            const isPending = pending === action.toPhase;
            const variant =
              action.emphasis === 'primary'
                ? ('primary' as const)
                : action.emphasis === 'secondary'
                  ? ('outline' as const)
                  : ('ghost' as const);
            return (
              <Button
                key={`${action.toPhase}-${action.label}`}
                type="button"
                size="sm"
                variant={variant}
                disabled={!!blocker || isPending}
                title={blocker ?? undefined}
                onClick={() => void runTransition(action)}
              >
                {isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function preconditionBlocker(
  action: PhaseAction,
  facts: PhaseStripProps['preconditions'],
): string | null {
  switch (action.precondition) {
    case 'drive_folder_url':
      return facts.drive_folder_url
        ? null
        : 'Paste the Drive folder URL before marking raws uploaded.';
    case 'editing_videos':
      return facts.editing_videos
        ? null
        : 'Upload at least one edited cut before sending to client.';
    case 'share_link':
      return facts.share_link
        ? null
        : 'Mint a share link before advancing.';
    case 'scheduled_posts':
      return facts.scheduled_posts
        ? null
        : 'Schedule at least one post before advancing.';
    default:
      return null;
  }
}
