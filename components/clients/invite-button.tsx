'use client';

import { useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { InviteUsersDialog } from '@/components/users/invite-users-dialog';

interface InviteButtonProps {
  clientId: string;
  clientName: string;
  /**
   * `empty-state` (default) — full-width dashed outline, used by the
   * onboard-review card where the invite slot is the card's main action.
   * `compact` — small accent pill that sits next to other action-bar
   * buttons (client detail page header).
   */
  variant?: 'empty-state' | 'compact';
}

/**
 * Thin trigger that opens the shared `InviteUsersDialog` with the client
 * pre-selected and locked. Keeps the per-client "Invite to portal" entry
 * point (used in onboarding) on the exact same form as the admin users
 * page, so there is only one invite UX to maintain.
 */
export function InviteButton({ clientId, clientName, variant = 'empty-state' }: InviteButtonProps) {
  const [open, setOpen] = useState(false);

  const compact = variant === 'compact';

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer shrink-0"
        >
          <UserPlus size={14} />
          Invite to portal
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-nativz-border bg-surface-hover px-4 py-3 text-sm text-text-muted hover:border-accent/30 hover:text-accent-text hover:bg-accent-surface/30 transition-colors"
        >
          <Send size={14} />
          Invite to portal
        </button>
      )}

      <InviteUsersDialog
        open={open}
        onClose={() => setOpen(false)}
        lockedClient={{ id: clientId, name: clientName }}
      />
    </>
  );
}
