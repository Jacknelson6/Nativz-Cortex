'use client';

/**
 * CUP-03 T08/T09 client wrapper: owns the action handlers + reject dialog
 * for the review surface. Server page passes dropId + current state; this
 * component hits the cup-01 routes and refreshes server data on success.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ApproveAndSendBar } from './approve-and-send-bar';
import { RejectDialog } from './reject-dialog';
import type { HandoffState } from '@/lib/calendar/handoff-state';

interface ReviewActionsClientProps {
  dropId: string;
  state: HandoffState;
  /** Present when this is the post-approval / client_sent variant. */
  shareToken?: string;
}

export function ReviewActionsClient({ dropId, state, shareToken }: ReviewActionsClientProps) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectMode, setRejectMode] = useState<'reject' | 'send-back'>('reject');

  async function postJson(path: string, body: unknown): Promise<void> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `request failed (${res.status})`);
    }
  }

  async function handleApprove() {
    try {
      await postJson(`/api/calendar/drops/${dropId}/handoff/approve`, {});
      toast.success('Drop approved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    }
  }

  function handleSendBackToEditor() {
    setRejectMode('send-back');
    setRejectOpen(true);
  }

  function handleReject() {
    setRejectMode('reject');
    setRejectOpen(true);
  }

  async function handleSendToClient() {
    try {
      const mintRes = await fetch(`/api/calendar/drops/${dropId}/share`, { method: 'POST' });
      if (!mintRes.ok) {
        const data = (await mintRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `mint failed (${mintRes.status})`);
      }
      const mint = (await mintRes.json()) as { link?: { token?: string } };
      const token = mint.link?.token;
      if (!token) throw new Error('Share link token missing from response');
      await postJson(`/api/calendar/share/${token}/send`, { variant: 'initial' });
      toast.success('Sent to client');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    }
  }

  async function handleResend() {
    if (!shareToken) {
      toast.error('No share link to resend');
      return;
    }
    try {
      await postJson(`/api/calendar/share/${shareToken}/send`, { variant: 'revised' });
      toast.success('Resent to client');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resend failed');
    }
  }

  return (
    <>
      <ApproveAndSendBar
        dropId={dropId}
        state={state}
        onApprove={handleApprove}
        onReject={handleReject}
        onSendBackToEditor={handleSendBackToEditor}
        onSendToClient={handleSendToClient}
        onResend={handleResend}
      />
      <RejectDialog
        open={rejectOpen}
        dropId={dropId}
        sendBackToEditor={rejectMode === 'send-back'}
        onClose={() => setRejectOpen(false)}
        onRejected={() => router.refresh()}
      />
    </>
  );
}
