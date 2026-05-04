import { describe, expect, it } from 'vitest';
import { selectPayrollTeamMembers } from './team-directory';

describe('selectPayrollTeamMembers', () => {
  it('returns an empty list for an empty input', () => {
    expect(selectPayrollTeamMembers([])).toEqual([]);
  });

  it('drops rows where is_active is false', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice', is_active: true },
      { id: '2', full_name: 'Bob', is_active: false },
    ]);
    expect(out.map((r) => r.full_name)).toEqual(['Alice']);
  });

  it('keeps rows where is_active is undefined or null (treats them as active)', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice' },
      { id: '2', full_name: 'Bob', is_active: null },
    ]);
    expect(out.map((r) => r.full_name)).toEqual(['Alice', 'Bob']);
  });

  it('drops rows with blank or null full_name', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice' },
      { id: '2', full_name: null },
      { id: '3', full_name: '' },
      { id: '4', full_name: '   ' },
    ]);
    expect(out.map((r) => r.full_name)).toEqual(['Alice']);
  });

  it('drops junk names case-insensitively', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice' },
      { id: '2', full_name: 'test' },
      { id: '3', full_name: 'TESTER' },
      { id: '4', full_name: 'Demo' },
      { id: '5', full_name: 'placeholder' },
    ]);
    expect(out.map((r) => r.full_name)).toEqual(['Alice']);
  });

  it('dedupes by case-insensitive name with whitespace collapsed', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Jack Nelson', created_at: '2026-01-01' },
      { id: '2', full_name: 'jack nelson', created_at: '2026-02-01' },
      { id: '3', full_name: 'Jack  Nelson', created_at: '2026-03-01' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('prefers the row with a user_id over rows without, regardless of recency', () => {
    const out = selectPayrollTeamMembers([
      { id: 'old-with-auth', full_name: 'Jack', user_id: 'auth-1', created_at: '2025-01-01' },
      { id: 'new-no-auth', full_name: 'Jack', user_id: null, created_at: '2026-04-01' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('old-with-auth');
  });

  it('prefers the newer row when both have a user_id', () => {
    const out = selectPayrollTeamMembers([
      { id: 'older', full_name: 'Jack', user_id: 'auth-1', created_at: '2025-01-01' },
      { id: 'newer', full_name: 'Jack', user_id: 'auth-2', created_at: '2026-04-01' },
    ]);
    expect(out[0].id).toBe('newer');
  });

  it('prefers the newer row when neither has a user_id', () => {
    const out = selectPayrollTeamMembers([
      { id: 'older', full_name: 'Jack', created_at: '2025-01-01' },
      { id: 'newer', full_name: 'Jack', created_at: '2026-04-01' },
    ]);
    expect(out[0].id).toBe('newer');
  });

  it('treats missing created_at as epoch 0 when comparing', () => {
    const out = selectPayrollTeamMembers([
      { id: 'has-date', full_name: 'Jack', created_at: '2025-01-01' },
      { id: 'no-date', full_name: 'Jack' },
    ]);
    expect(out[0].id).toBe('has-date');
  });

  it('returns members sorted alphabetically by full_name', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Charlie' },
      { id: '2', full_name: 'Alice' },
      { id: '3', full_name: 'Bob' },
    ]);
    expect(out.map((r) => r.full_name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('trims surrounding whitespace from the returned full_name', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: '  Alice  ' },
    ]);
    expect(out[0].full_name).toBe('Alice');
  });

  it('defaults role to null when the source row omits it', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice' },
    ]);
    expect(out[0].role).toBeNull();
  });

  it('passes role through when present', () => {
    const out = selectPayrollTeamMembers([
      { id: '1', full_name: 'Alice', role: 'editor' },
    ]);
    expect(out[0].role).toBe('editor');
  });
});
