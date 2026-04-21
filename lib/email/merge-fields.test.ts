import { describe, expect, it } from 'vitest';
import { resolveMergeFields } from './merge-fields';
import type { MergeContext } from './types';

const fullCtx: MergeContext = {
  recipient: { full_name: 'Jack Nelson', email: 'jack@nativz.io' },
  sender: { full_name: 'Alex Rivera', email: 'alex@nativz.io' },
  client: { name: 'Toastique' },
};

describe('resolveMergeFields', () => {
  it('replaces every documented token', () => {
    const tpl = 'Hi {{user.first_name}} ({{user.full_name}}, {{user.email}}) — from {{sender.name}} <{{sender.email}}> about {{client.name}}';
    expect(resolveMergeFields(tpl, fullCtx)).toBe(
      'Hi Jack (Jack Nelson, jack@nativz.io) — from Alex Rivera <alex@nativz.io> about Toastique',
    );
  });

  it('derives first_name from full_name first token', () => {
    const ctx: MergeContext = { ...fullCtx, recipient: { full_name: '  Jack  Allen  Nelson', email: 'j@x.com' } };
    expect(resolveMergeFields('Hi {{user.first_name}}', ctx)).toBe('Hi Jack');
  });

  it('renders unknown placeholders as empty string', () => {
    expect(resolveMergeFields('Hi {{user.phone}} — {{nonsense}}', fullCtx)).toBe('Hi  — ');
  });

  it('handles missing recipient name as empty string', () => {
    const ctx: MergeContext = { ...fullCtx, recipient: { full_name: null, email: 'j@x.com' } };
    expect(resolveMergeFields('Hi {{user.first_name}}', ctx)).toBe('Hi ');
    expect(resolveMergeFields('Hi {{user.full_name}}', ctx)).toBe('Hi ');
  });

  it('handles empty-ish context without throwing', () => {
    const ctx: MergeContext = {
      recipient: { full_name: null, email: null },
      sender: { full_name: null, email: null },
      client: { name: null },
    };
    expect(resolveMergeFields('Hi {{user.first_name}}, from {{sender.name}}', ctx)).toBe('Hi , from ');
  });

  it('is idempotent on strings with no placeholders', () => {
    expect(resolveMergeFields('Hello world', fullCtx)).toBe('Hello world');
  });

  it('uses the default when the token resolves to empty', () => {
    const ctx: MergeContext = {
      recipient: { full_name: null, email: null },
      sender: { full_name: null, email: null },
      client: { name: null },
    };
    expect(resolveMergeFields('Hey {{user.first_name|there}},', ctx)).toBe('Hey there,');
    expect(resolveMergeFields('From {{ sender.name | the team }}', ctx)).toBe(
      'From the team',
    );
  });

  it('prefers the resolved value over the default when present', () => {
    expect(resolveMergeFields('Hey {{user.first_name|there}}', fullCtx)).toBe('Hey Jack');
  });
});
