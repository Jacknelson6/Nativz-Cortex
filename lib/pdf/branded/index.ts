/**
 * Branded deliverable PDFs — single template, theme-swappable per agency.
 *
 * Usage:
 *   import { BrandedDeliverableDocument } from '@/lib/pdf/branded';
 *   import { getTheme } from '@/lib/branding';
 *   import { renderToStream } from '@react-pdf/renderer';
 *
 *   const theme = getTheme(agencySlug);
 *   const stream = await renderToStream(
 *     <BrandedDeliverableDocument data={deliverable} theme={theme} />
 *   );
 */

export { BrandedDeliverableDocument } from './document';
export type {
  BrandedDeliverableData,
  BrandedDeliverableSeries,
  BrandedDeliverableTopic,
  BrandedDeliverableMetric,
  BrandedDeliverableStat,
  BrandedDeliverableLegendItem,
} from './types';
