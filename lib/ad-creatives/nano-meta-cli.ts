import {
  aggregateSlotOrderToGlobalVariations,
  buildMetaPerformanceSlotOrder,
  NANO_BULK_META_STYLE_DIRECTION,
} from '@/lib/ad-creatives/nano-banana/bulk-presets';
import { assertValidNanoBananaSlugs } from '@/lib/ad-creatives/nano-banana/catalog';
import { DEFAULT_BATCH_CTA } from '@/lib/ad-creatives/batch-cta-presets';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';
import type { AdGenerationConfig } from '@/lib/ad-creatives/types';

export function clampNanoMetaAdCount(n: number): number {
  return Math.min(200, Math.max(1, Math.floor(n) || 50));
}

export type NanoMetaBatchParams = {
  adCount: number;
  brandUrl: string;
  productService: string;
  offer: string;
  /** Max 30 chars; defaults to DEFAULT_BATCH_CTA */
  batchCta?: string;
  /**
   * Hex colors from Brand DNA for gallery skeleton placeholders (optional).
   * If omitted, uses neutral zinc tones — never a misleading fake brand palette.
   */
  placeholderBrandColors?: string[];
};

export function buildNanoMetaBatchPayload(params: NanoMetaBatchParams): {
  config: AdGenerationConfig;
  placeholderConfig: AdBatchPlaceholderConfig;
  resolvedAdCount: number;
} {
  const resolvedAdCount = clampNanoMetaAdCount(params.adCount);
  const slotOrder = buildMetaPerformanceSlotOrder(resolvedAdCount);
  const gtv = aggregateSlotOrderToGlobalVariations(slotOrder);
  assertValidNanoBananaSlugs([...new Set(slotOrder)]);

  const batchCta = (params.batchCta?.trim() || DEFAULT_BATCH_CTA).slice(0, 30);

  const placeholderHexes =
    params.placeholderBrandColors?.map((c) => c.trim()).filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c)) ?? [];
  const placeholderBrandColors =
    placeholderHexes.length > 0 ? placeholderHexes.slice(0, 4) : ['#27272a', '#fafafa', '#18181b', '#a1a1aa'];

  const placeholderConfig: AdBatchPlaceholderConfig = {
    brandColors: placeholderBrandColors,
    skeletonOnly: true,
    templateThumbnails: (() => {
      const seen = new Map<string, number>();
      return slotOrder.map((slug) => {
        const i = seen.get(slug) ?? 0;
        seen.set(slug, i + 1);
        return { templateId: slug, imageUrl: '', variationIndex: i };
      });
    })(),
  };

  const config: AdGenerationConfig = {
    aspectRatio: '1:1',
    globalTemplateVariations: gtv,
    globalTemplateSlotOrder: slotOrder,
    templateIds: [],
    productService: params.productService,
    offer: params.offer,
    onScreenText: 'ai_generate',
    batchCta,
    brandLayoutMode: 'schema_only',
    brandUrl: params.brandUrl,
    styleDirectionGlobal: NANO_BULK_META_STYLE_DIRECTION,
  };

  return { config, placeholderConfig, resolvedAdCount };
}
