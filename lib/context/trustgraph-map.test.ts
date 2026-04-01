import { describe, expect, it } from 'vitest';
import { mapTrustGraphAgencyHits, mapTrustGraphClientHits } from '@/lib/context/trustgraph-http';

describe('mapTrustGraphClientHits', () => {
  it('parses hits array', () => {
    const raw = {
      hits: [
        { id: '1', title: 'T', content: 'C', score: 0.9, type: 'note' },
        { id: '2', text: 'body', similarity: 0.5 },
      ],
    };
    const out = mapTrustGraphClientHits(raw, 'client-uuid');
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe('1');
    expect(out[0]!.client_id).toBe('client-uuid');
    expect(out[1]!.score).toBe(0.5);
  });

  it('returns empty for invalid payload', () => {
    expect(mapTrustGraphClientHits(null, 'x')).toEqual([]);
  });
});

describe('mapTrustGraphAgencyHits', () => {
  it('maps minimal node', () => {
    const raw = {
      results: [{ id: 'playbook:foo', title: 'Foo', kind: 'playbook', content: 'x' }],
    };
    const out = mapTrustGraphAgencyHits(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('playbook:foo');
    expect(out[0]!.similarity).toBe(0);
  });
});
