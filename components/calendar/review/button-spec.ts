/**
 * Pure helpers for the SMM review surface, extracted so they can be
 * unit-tested without a React renderer. The repo's vitest setup runs in a
 * node environment (no jsdom, no testing-library), so rendering the
 * components themselves is out of scope; the decision logic lives here.
 */

import type { HandoffState } from '@/lib/calendar/handoff-state';

export type ButtonKey = 'approve' | 'reject' | 'send-editor' | 'send-client' | 'resend';

export interface ReviewButtonSpec {
  key: ButtonKey;
  label: string;
  /** Whether the bar should wrap this handler in the shared busy guard. */
  async: boolean;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
}

const APPROVE: ReviewButtonSpec = {
  key: 'approve',
  label: 'Approve',
  async: true,
  variant: 'success',
};
const REJECT_DANGER: ReviewButtonSpec = {
  key: 'reject',
  label: 'Reject with note',
  async: false,
  variant: 'danger',
};
const REJECT_OUTLINE: ReviewButtonSpec = {
  key: 'reject',
  label: 'Reject with note',
  async: false,
  variant: 'outline',
};
const SEND_EDITOR: ReviewButtonSpec = {
  key: 'send-editor',
  label: 'Send back to editor',
  async: true,
  variant: 'outline',
};
const SEND_CLIENT: ReviewButtonSpec = {
  key: 'send-client',
  label: 'Send to client',
  async: true,
  variant: 'primary',
};
const RESEND: ReviewButtonSpec = {
  key: 'resend',
  label: 'Resend to client',
  async: true,
  variant: 'outline',
};

export function buttonsForState(state: HandoffState): ReviewButtonSpec[] {
  if (state === 'smm_review' || state === 'smm_rejected') {
    return [APPROVE, REJECT_DANGER, SEND_EDITOR];
  }
  if (state === 'smm_approved') {
    return [SEND_CLIENT, REJECT_OUTLINE];
  }
  if (state === 'client_sent') {
    return [RESEND];
  }
  return [];
}

const MAX_REJECT_NOTE = 2000;

export function canSendRejectNote(rawNote: string): boolean {
  const trimmed = rawNote.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_REJECT_NOTE;
}
