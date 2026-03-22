import { describe, expect, it } from 'vitest';
import {
  coerceStringList,
  normalizeKgKind,
  normalizeKnowledgeIngest,
} from './kg-ingest-normalize';

describe('coerceStringList', () => {
  it('handles arrays and strings', () => {
    expect(coerceStringList([' a ', 'b'])).toEqual(['a', 'b']);
    expect(coerceStringList('x')).toEqual(['x']);
    expect(coerceStringList('')).toEqual([]);
    expect(coerceStringList(null)).toEqual([]);
  });
});

describe('normalizeKgKind', () => {
  it('passes through allowed kinds', () => {
    expect(normalizeKgKind('playbook')).toEqual({ kind: 'playbook', changed: false });
    expect(normalizeKgKind('insight')).toEqual({ kind: 'insight', changed: false });
  });

  it('maps legacy kinds', () => {
    expect(normalizeKgKind('skill')).toEqual({ kind: 'playbook', changed: true });
    expect(normalizeKgKind('pattern')).toEqual({ kind: 'insight', changed: true });
  });

  it('defaults unknown to playbook', () => {
    expect(normalizeKgKind('totally-unknown')).toEqual({ kind: 'playbook', changed: true });
  });
});

describe('normalizeKnowledgeIngest', () => {
  it('uses first markdown heading when title missing', () => {
    const r = normalizeKnowledgeIngest({
      rawKind: 'sop',
      rawSlug: 'foo',
      titleFromFm: undefined,
      body: 'Some intro\n\n# Real title here\n\nBody',
      domain: 'sales',
      tags: ['a'],
      connections: [],
    });
    expect(r.kind).toBe('playbook');
    expect(r.title).toBe('Real title here');
    expect(r.domain).toEqual(['sales']);
    expect(r.ingest_kind_raw).toBe('sop');
  });

  it('slugifies slug segment', () => {
    const r = normalizeKnowledgeIngest({
      rawKind: 'playbook',
      rawSlug: 'Weird   Slug!',
      titleFromFm: 'T',
      body: '',
      domain: [],
      tags: [],
      connections: [],
    });
    expect(r.slug).toBe('weird-slug');
  });
});
