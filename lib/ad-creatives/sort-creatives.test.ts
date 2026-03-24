import { describe, expect, it } from 'vitest';
import type { AdCreative } from './types';
import {
  compareAdCreativesBatchOrder,
  compareAdCreativesGallery,
  sortAdCreativesForBatch,
  sortAdCreativesForGallery,
} from './sort-creatives';

function mockCreative(partial: Partial<AdCreative> & Pick<AdCreative, 'id' | 'created_at'>): AdCreative {
  return {
    batch_id: 'b1',
    client_id: 'c1',
    template_id: null,
    template_source: 'global',
    image_url: 'https://example.com/x.png',
    aspect_ratio: '1:1',
    prompt_used: '',
    on_screen_text: { headline: '', subheadline: '', cta: '' },
    product_service: '',
    offer: '',
    is_favorite: false,
    metadata: {},
    ...partial,
  };
}

describe('sortAdCreativesForGallery', () => {
  it('orders newest created_at first, then id desc', () => {
    const a = mockCreative({ id: 'a', created_at: '2025-01-02T00:00:00.000Z' });
    const b = mockCreative({ id: 'b', created_at: '2025-01-03T00:00:00.000Z' });
    const c = mockCreative({ id: 'c', created_at: '2025-01-03T00:00:00.000Z' });
    expect(sortAdCreativesForGallery([a, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('compareAdCreativesGallery', () => {
  it('is consistent with sort', () => {
    const older = mockCreative({ id: 'x', created_at: '2025-01-01T00:00:00.000Z' });
    const newer = mockCreative({ id: 'y', created_at: '2025-01-02T00:00:00.000Z' });
    expect(compareAdCreativesGallery(older, newer)).toBeGreaterThan(0);
    expect(compareAdCreativesGallery(newer, older)).toBeLessThan(0);
  });
});

describe('sortAdCreativesForBatch', () => {
  it('orders by batch_item_index when set', () => {
    const third = mockCreative({
      id: 'c',
      created_at: '2025-01-01T00:00:03.000Z',
      metadata: { batch_item_index: 2 },
    });
    const first = mockCreative({
      id: 'a',
      created_at: '2025-01-01T00:00:01.000Z',
      metadata: { batch_item_index: 0 },
    });
    const second = mockCreative({
      id: 'b',
      created_at: '2025-01-01T00:00:00.000Z',
      metadata: { batch_item_index: 1 },
    });
    expect(sortAdCreativesForBatch([third, first, second]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to created_at when index missing', () => {
    const a = mockCreative({ id: 'a', created_at: '2025-01-01T00:00:01.000Z', metadata: {} });
    const b = mockCreative({ id: 'b', created_at: '2025-01-01T00:00:02.000Z', metadata: {} });
    expect(sortAdCreativesForBatch([b, a]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('compareAdCreativesBatchOrder', () => {
  it('places indexed items before non-indexed', () => {
    const withIdx = mockCreative({
      id: 'i',
      created_at: '2025-01-01T00:00:09.000Z',
      metadata: { batch_item_index: 0 },
    });
    const noIdx = mockCreative({ id: 'n', created_at: '2025-01-01T00:00:01.000Z', metadata: {} });
    expect(compareAdCreativesBatchOrder(withIdx, noIdx)).toBeLessThan(0);
  });
});
