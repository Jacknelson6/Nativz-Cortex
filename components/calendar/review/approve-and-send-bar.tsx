'use client';

/**
 * CUP-03 T04: SMM action bar. Mobile = fixed bottom bar with safe-area
 * padding. Desktop (lg+) = static stack rendered in-flow above the post
 * list. State-driven: smm_review surfaces Approve + Reject + Send-to-
 * editor; smm_approved surfaces Send-to-client + Reject; client_sent
 * surfaces Resend-to-client.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, ArrowLeft, Send, RefreshCcw } from 'lucide-react';
import type { HandoffState } from '@/lib/calendar/handoff-state';

interface ApproveAndSendBarProps {
  dropId: string;
  state: HandoffState;
  onApprove: () => Promise<void> | void;
  onReject: () => void;
  onSendBackToEditor: () => Promise<void> | void;
  onSendToClient: () => Promise<void> | void;
  onResend: () => Promise<void> | void;
}

export function ApproveAndSendBar({
  state,
  onApprove,
  onReject,
  onSendBackToEditor,
  onSendToClient,
  onResend,
}: ApproveAndSendBarProps) {
  const [busy, setBusy] = useState(false);

  async function withBusy(fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const buttons: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
    handler: () => void;
  }> = [];

  if (state === 'smm_review' || state === 'smm_rejected') {
    buttons.push({
      key: 'approve',
      label: 'Approve',
      icon: <Check size={16} />,
      variant: 'success',
      handler: () => withBusy(onApprove),
    });
    buttons.push({
      key: 'reject',
      label: 'Reject with note',
      icon: <X size={16} />,
      variant: 'danger',
      handler: onReject,
    });
    buttons.push({
      key: 'send-editor',
      label: 'Send back to editor',
      icon: <ArrowLeft size={16} />,
      variant: 'outline',
      handler: () => withBusy(onSendBackToEditor),
    });
  } else if (state === 'smm_approved') {
    buttons.push({
      key: 'send-client',
      label: 'Send to client',
      icon: <Send size={16} />,
      variant: 'primary',
      handler: () => withBusy(onSendToClient),
    });
    buttons.push({
      key: 'reject',
      label: 'Reject with note',
      icon: <X size={16} />,
      variant: 'outline',
      handler: onReject,
    });
  } else if (state === 'client_sent') {
    buttons.push({
      key: 'resend',
      label: 'Resend to client',
      icon: <RefreshCcw size={16} />,
      variant: 'outline',
      handler: () => withBusy(onResend),
    });
  }

  if (buttons.length === 0) return null;

  const renderButton = (b: (typeof buttons)[number], full: boolean) => (
    <Button
      key={b.key}
      variant={b.variant}
      size="md"
      disabled={busy}
      onClick={b.handler}
      className={`inline-flex items-center justify-center gap-2 ${full ? 'w-full' : ''}`}
    >
      {b.icon}
      {b.label}
    </Button>
  );

  return (
    <>
      {/* Mobile: fixed bottom bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-nativz-border bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex flex-col gap-2 px-4 py-3">
          {buttons.map((b) => renderButton(b, true))}
        </div>
      </div>

      {/* Desktop: static stack */}
      <div className="hidden lg:flex lg:flex-col lg:gap-2 lg:rounded-xl lg:border lg:border-nativz-border lg:bg-surface lg:p-4">
        {buttons.map((b) => renderButton(b, true))}
      </div>
    </>
  );
}
