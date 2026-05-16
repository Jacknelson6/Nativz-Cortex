import { describe, expect, it } from 'vitest';
import {
  appendHistory,
  canTransition,
  LEGAL_TRANSITIONS,
  type HandoffHistoryEntry,
  type HandoffState,
} from './handoff-state';

const ALL_STATES: HandoffState[] = [
  'editing',
  'smm_review',
  'smm_approved',
  'smm_rejected',
  'client_sent',
];

describe('canTransition', () => {
  it('covers every from/to pair in the 5x5 grid', () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const expected = LEGAL_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('allows editor handoff: editing -> smm_review', () => {
    expect(canTransition('editing', 'smm_review')).toBe(true);
  });

  it('allows editor re-submit: smm_rejected -> smm_review', () => {
    expect(canTransition('smm_rejected', 'smm_review')).toBe(true);
  });

  it('allows SMM approve: smm_review -> smm_approved', () => {
    expect(canTransition('smm_review', 'smm_approved')).toBe(true);
  });

  it('allows SMM reject from review or approved', () => {
    expect(canTransition('smm_review', 'smm_rejected')).toBe(true);
    expect(canTransition('smm_approved', 'smm_rejected')).toBe(true);
  });

  it('allows un-approve back to editing', () => {
    expect(canTransition('smm_approved', 'editing')).toBe(true);
  });

  it('allows send: smm_approved -> client_sent', () => {
    expect(canTransition('smm_approved', 'client_sent')).toBe(true);
  });

  it('keeps client_sent idempotent (self-transition allowed)', () => {
    expect(canTransition('client_sent', 'client_sent')).toBe(true);
  });

  it('locks client_sent against rollback', () => {
    expect(canTransition('client_sent', 'editing')).toBe(false);
    expect(canTransition('client_sent', 'smm_review')).toBe(false);
    expect(canTransition('client_sent', 'smm_approved')).toBe(false);
    expect(canTransition('client_sent', 'smm_rejected')).toBe(false);
  });

  it('refuses skipping straight from editing to approval or send', () => {
    expect(canTransition('editing', 'smm_approved')).toBe(false);
    expect(canTransition('editing', 'client_sent')).toBe(false);
  });
});

describe('appendHistory', () => {
  it('appends to an existing list', () => {
    const prev: HandoffHistoryEntry[] = [
      { state: 'editing', at: '2026-05-16T00:00:00Z', actor: 'system' },
    ];
    const next = appendHistory(prev, { state: 'smm_review', actor: 'user-1' });
    expect(next).toHaveLength(2);
    expect(next[1].state).toBe('smm_review');
    expect(next[1].actor).toBe('user-1');
    expect(next[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('treats null prev as empty', () => {
    const next = appendHistory(null, { state: 'smm_review', actor: 'user-1' });
    expect(next).toEqual([
      expect.objectContaining({ state: 'smm_review', actor: 'user-1' }),
    ]);
  });

  it('treats undefined prev as empty', () => {
    const next = appendHistory(undefined, { state: 'smm_review', actor: 'user-1' });
    expect(next).toHaveLength(1);
  });

  it('honors explicit at when provided', () => {
    const next = appendHistory([], {
      state: 'smm_approved',
      actor: 'user-2',
      at: '2026-05-16T12:00:00Z',
    });
    expect(next[0].at).toBe('2026-05-16T12:00:00Z');
  });

  it('includes note when provided, omits when empty', () => {
    const withNote = appendHistory([], {
      state: 'smm_rejected',
      actor: 'user-2',
      note: 'fix the caption',
    });
    expect(withNote[0].note).toBe('fix the caption');

    const withoutNote = appendHistory([], { state: 'smm_review', actor: 'user-1' });
    expect(withoutNote[0]).not.toHaveProperty('note');
  });

  it('does not mutate the input array', () => {
    const prev: HandoffHistoryEntry[] = [
      { state: 'editing', at: '2026-05-16T00:00:00Z', actor: 'system' },
    ];
    appendHistory(prev, { state: 'smm_review', actor: 'user-1' });
    expect(prev).toHaveLength(1);
  });
});
