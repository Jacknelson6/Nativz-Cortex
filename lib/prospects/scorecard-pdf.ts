// SPY-04: render a prospect scorecard as a branded PDF buffer.
// Mirrors lib/reporting/render-competitor-report-pdf.ts.

import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
import {
  mapProspectScorecardToBranded,
  type ProspectScorecardBrandedInput,
} from '@/lib/pdf/branded/adapters';
import { getTheme } from '@/lib/branding';

export async function renderProspectScorecardPdf(
  input: ProspectScorecardBrandedInput,
): Promise<Buffer | null> {
  try {
    // Cortex prospect tooling always uses the Nativz theme. Switching to
    // a per-prospect theme would require carrying agency context on the
    // prospect row, which doesn't exist today.
    const theme = getTheme('nativz');
    const branded = mapProspectScorecardToBranded(input);
    const element = createElement(BrandedDeliverableDocument, { data: branded, theme });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await renderToBuffer(element as any);
  } catch (err) {
    console.error('[prospect-scorecard-pdf] render failed', err);
    return null;
  }
}
