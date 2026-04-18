'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { InviteUsersDialog } from '@/components/users/invite-users-dialog';

interface InviteButtonProps {
  clientId: string;
  clientName: string;
}

/**
 * Thin trigger that opens the shared `InviteUsersDialog` with the client
 * pre-selected and locked. Keeps the per-client "Invite to portal" entry
 * point (used in onboarding) on the exact same form as the admin users
 * page, so there is only one invite UX to maintain.
 */
export function InviteButton({ clientId, clientName }: InviteButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-nativz-border bg-surface-hover px-4 py-3 text-sm text-text-muted hover:border-accent/30 hover:text-accent-text hover:bg-accent-surface/30 transition-colors"
      >
        <Send size={14} />
        Invite to portal
      </button>

      <InviteUsersDialog
        open={open}
        onClose={() => setOpen(false)}
        lockedClient={{ id: clientId, name: clientName }}
      />
    </>
  );
}
