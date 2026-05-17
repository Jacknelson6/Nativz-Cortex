import { describe, expect, it } from 'vitest';
import { buttonsForState, canSendRejectNote } from './button-spec';

describe('buttonsForState', () => {
  it('renders Approve + Reject + Send back to editor when state is smm_review', () => {
    const out = buttonsForState('smm_review');
    expect(out.map((b) => b.key)).toEqual(['approve', 'reject', 'send-editor']);
    expect(out.find((b) => b.key === 'approve')?.variant).toBe('success');
    expect(out.find((b) => b.key === 'reject')?.variant).toBe('danger');
  });

  it('renders the same trio when state is smm_rejected (editor resubmitted)', () => {
    const out = buttonsForState('smm_rejected');
    expect(out.map((b) => b.key)).toEqual(['approve', 'reject', 'send-editor']);
  });

  it('renders Send to client + Reject (outline) when state is smm_approved', () => {
    const out = buttonsForState('smm_approved');
    expect(out.map((b) => b.key)).toEqual(['send-client', 'reject']);
    expect(out.find((b) => b.key === 'reject')?.variant).toBe('outline');
    expect(out.find((b) => b.key === 'send-client')?.variant).toBe('primary');
  });

  it('renders Resend only when state is client_sent', () => {
    const out = buttonsForState('client_sent');
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('resend');
  });

  it('renders nothing in the editing state (bar should not show)', () => {
    expect(buttonsForState('editing')).toEqual([]);
  });

  it('marks send/approve/resend handlers as async (busy-guarded) and reject as sync', () => {
    const review = buttonsForState('smm_review');
    expect(review.find((b) => b.key === 'approve')?.async).toBe(true);
    expect(review.find((b) => b.key === 'send-editor')?.async).toBe(true);
    expect(review.find((b) => b.key === 'reject')?.async).toBe(false);
    expect(buttonsForState('client_sent')[0].async).toBe(true);
  });
});

describe('canSendRejectNote', () => {
  it('rejects empty strings', () => {
    expect(canSendRejectNote('')).toBe(false);
  });

  it('rejects whitespace-only strings', () => {
    expect(canSendRejectNote('   \n\t  ')).toBe(false);
  });

  it('accepts strings with at least one non-whitespace character', () => {
    expect(canSendRejectNote('hi')).toBe(true);
    expect(canSendRejectNote('   needs caption tweak   ')).toBe(true);
  });

  it('accepts strings exactly at the 2000-char cap', () => {
    expect(canSendRejectNote('a'.repeat(2000))).toBe(true);
  });

  it('rejects strings over the 2000-char cap', () => {
    expect(canSendRejectNote('a'.repeat(2001))).toBe(false);
  });
});
