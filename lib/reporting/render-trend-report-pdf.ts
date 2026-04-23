import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
import { mapTrendReportToBranded } from '@/lib/pdf/branded/adapters';
import { getTheme, type AgencySlug } from '@/lib/branding';
import type { TrendReportData } from './trend-report-types';

export async function renderTrendReportPdf(data: TrendReportData): Promise<Buffer | null> {
  try {
    const slug: AgencySlug = data.client_agency === 'anderson' ? 'anderson' : 'nativz';
    const theme = getTheme(slug);
    const branded = mapTrendReportToBranded(data);
    const element = createElement(BrandedDeliverableDocument, { data: branded, theme });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await renderToBuffer(element as any);
  } catch (err) {
    console.error('[trend-report-pdf] render failed', err);
    return null;
  }
}
