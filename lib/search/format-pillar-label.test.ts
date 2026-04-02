import { describe, expect, it } from 'vitest';
import { formatPillarLabelForDisplay } from './format-pillar-label';

describe('formatPillarLabelForDisplay', () => {
  it('splits middle dot into headline + breakdown', () => {
    expect(formatPillarLabelForDisplay('How-to · checklists')).toEqual({
      headline: 'How To',
      detail: 'checklists',
    });
  });

  it('splits spaced hyphen (News-style …)', () => {
    expect(formatPillarLabelForDisplay('News-style - commentary comparisons')).toEqual({
      headline: 'News style',
      detail: 'commentary comparisons',
    });
  });

  it('joins multi-part breakdown after first segment', () => {
    expect(formatPillarLabelForDisplay('Scenario walkthroughs · before · after underwriting')).toEqual({
      headline: 'Scenario walkthroughs',
      detail: 'before · after underwriting',
    });
  });

  it('handles parentheses detail', () => {
    expect(formatPillarLabelForDisplay('Explainers (definitions, structures, examples)')).toEqual({
      headline: 'Explainers',
      detail: 'definitions · structures · examples',
    });
  });

  it('passes through short single labels', () => {
    expect(formatPillarLabelForDisplay('Explainers')).toEqual({ headline: 'Explainers' });
  });
});
