import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseExtractionText, extractTextFromFile } from '../extract';

describe('parseExtractionText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a valid JSON extraction result', () => {
    const raw = JSON.stringify({
      services: ['Editing', 'SMM'],
      deliverables: [
        { service_tag: 'Editing', name: 'Short-form videos', quantity_per_month: 8 },
        { service_tag: 'SMM', name: 'Posts', quantity_per_month: 12, notes: 'across IG + TikTok' },
      ],
      effective_start: '2026-01-01',
      suggested_label: 'Retainer 2026',
    });
    const result = parseExtractionText(raw);
    expect(result.services).toEqual(['Editing', 'SMM']);
    expect(result.deliverables).toHaveLength(2);
    expect(result.deliverables[0].quantity_per_month).toBe(8);
  });

  it('strips code fences around JSON', () => {
    const raw = '```json\n{"services":[],"deliverables":[]}\n```';
    const result = parseExtractionText(raw);
    expect(result.services).toEqual([]);
  });

  it('returns empty draft on unparseable output', () => {
    const result = parseExtractionText('I cannot parse this contract.');
    expect(result.services).toEqual([]);
    expect(result.deliverables).toEqual([]);
  });

  it('drops deliverables that fail schema validation', () => {
    const raw = JSON.stringify({
      services: ['Editing'],
      deliverables: [
        { service_tag: 'Editing', name: 'Valid', quantity_per_month: 1 },
        { service_tag: '', name: 'Invalid', quantity_per_month: 2 },
        { service_tag: 'SMM', name: 'Also valid', quantity_per_month: -5 },
      ],
    });
    const result = parseExtractionText(raw);
    expect(result.deliverables).toHaveLength(1);
    expect(result.deliverables[0].name).toBe('Valid');
  });
});

describe('extractTextFromFile', () => {
  it('passes through txt content', async () => {
    const buf = Buffer.from('hello contract');
    const text = await extractTextFromFile(buf, 'text/plain');
    expect(text).toBe('hello contract');
  });

  it('throws on unsupported mime', async () => {
    await expect(extractTextFromFile(Buffer.from(''), 'image/png')).rejects.toThrow(/unsupported/i);
  });
});
