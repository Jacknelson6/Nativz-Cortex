import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
import { mapCompetitorReportToBranded } from '@/lib/pdf/branded/adapters';
import { getTheme, type AgencySlug } from '@/lib/branding';
import type { CompetitorReportData } from './competitor-report-types';

/**
 * Render the competitor report as a branded PDF buffer. Safe to call from a
 * cron or server action. Swallows rendering errors — callers should treat a
 * null return as "PDF unavailable" and continue with the HTML email.
 */
export async function renderCompetitorReportPdf(
  data: CompetitorReportData,
): Promise<Buffer | null> {
  try {
    const slug: AgencySlug = data.client_agency === 'anderson' ? 'anderson' : 'nativz';
    const theme = getTheme(slug);
    const branded = mapCompetitorReportToBranded(data);
    // BrandedDeliverableDocument returns a <Document>; the TS type of the
    // element isn't narrow enough for renderToBuffer's DocumentProps
    // constraint, but the runtime contract is correct. Matches the cast
    // pattern used by scripts/render-branded-preview.tsx's tsx runtime.
    const element = createElement(BrandedDeliverableDocument, { data: branded, theme });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await renderToBuffer(element as any);
  } catch (err) {
    console.error('[competitor-report-pdf] render failed', err);
    return null;
  }
}
