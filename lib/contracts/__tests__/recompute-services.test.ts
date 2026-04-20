import { describe, it, expect } from 'vitest';
import { computeServicesFromRows } from '../recompute-services';

describe('computeServicesFromRows', () => {
  it('returns sorted unique tags from active contracts', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: 'SMM' },
        { status: 'active', service_tag: 'Editing' },
        { status: 'active', service_tag: 'SMM' },
      ]),
    ).toEqual(['Editing', 'SMM']);
  });

  it('ignores non-active contracts', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: 'Editing' },
        { status: 'ended', service_tag: 'Paid media' },
        { status: 'draft', service_tag: 'Strategy' },
      ]),
    ).toEqual(['Editing']);
  });

  it('returns [] when nothing is active', () => {
    expect(
      computeServicesFromRows([
        { status: 'ended', service_tag: 'Editing' },
      ]),
    ).toEqual([]);
  });

  it('normalizes whitespace but preserves case', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: '  Editing ' },
        { status: 'active', service_tag: 'editing' },
      ]),
    ).toEqual(['Editing', 'editing']);
  });
});
