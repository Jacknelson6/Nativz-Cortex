import { describe, expect, it } from 'vitest';
import {
  isConsumed,
  isGranted,
  isRefunded,
  isReset,
  type ConsumeResult,
  type GrantResult,
  type RefundResult,
  type ResetBalanceRowResult,
} from './types';

describe('isConsumed', () => {
  it('narrows the consumed branch', () => {
    const r: ConsumeResult = { consumed: true, tx_id: 't', new_balance: 4 };
    expect(isConsumed(r)).toBe(true);
  });

  it('rejects already_consumed (idempotent replay)', () => {
    const r: ConsumeResult = { already_consumed: true, consume_id: 'c' };
    expect(isConsumed(r)).toBe(false);
  });
});

describe('isRefunded', () => {
  it('narrows the refunded-with-balance branch', () => {
    const r: RefundResult = { refunded: true, tx_id: 't', new_balance: 7 };
    expect(isRefunded(r)).toBe(true);
  });

  it('narrows the orphan refund branch (no balance row)', () => {
    const r: RefundResult = { refunded: true, tx_id: 't', orphan: true };
    expect(isRefunded(r)).toBe(true);
  });

  it('rejects no_consume_to_refund', () => {
    const r: RefundResult = { no_consume_to_refund: true };
    expect(isRefunded(r)).toBe(false);
  });
});

describe('isGranted', () => {
  it('narrows the granted branch', () => {
    const r: GrantResult = { granted: true, tx_id: 't', new_balance: 60 };
    expect(isGranted(r)).toBe(true);
  });

  it('rejects already_granted (idempotent replay)', () => {
    const r: GrantResult = { already_granted: true };
    expect(isGranted(r)).toBe(false);
  });
});

describe('isReset', () => {
  it('narrows the reset branch', () => {
    const r: ResetBalanceRowResult = {
      reset: true,
      tx_id: 't',
      grant_delta: 60,
      new_balance: 60,
    };
    expect(isReset(r)).toBe(true);
  });

  it('rejects every other variant', () => {
    expect(isReset({ not_found: true } as ResetBalanceRowResult)).toBe(false);
    expect(isReset({ already_reset: true } as ResetBalanceRowResult)).toBe(false);
    expect(isReset({ skipped_paused: true } as ResetBalanceRowResult)).toBe(false);
    expect(isReset({ zero_allowance_advanced: true } as ResetBalanceRowResult)).toBe(false);
  });
});
