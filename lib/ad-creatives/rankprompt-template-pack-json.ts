import type { AdPromptSchema, OnScreenText } from '@/lib/ad-creatives/types';
import { assembleImagePrompt } from '@/lib/ad-creatives/assemble-prompt';
import type { BrandContext } from '@/lib/knowledge/brand-context';
import {
  RANKPROMPT_OFFER,
  RANKPROMPT_PRODUCT_SERVICE,
  RANKPROMPT_STYLE_DIRECTION_GLOBAL,
} from '@/lib/ad-creatives/rankprompt-brand-pack';

export const RANKPROMPT_TEMPLATE_PACK_VERSION = 1 as const;

export type RankPromptTemplatePackFile = {
  version: typeof RANKPROMPT_TEMPLATE_PACK_VERSION;
  brandDnaKey: 'rankprompt';
  templateId: string;
  collectionName: string;
  pageIndex: number;
  vertical: string | null;
  adCategory: string | null;
  referenceImageUrl: string;
  /** Vision-extracted layout — swap brand by changing rankPrompt + on-screen text, then re-run assemble or edit assembledImagePrompt. */
  promptSchema: AdPromptSchema;
  rankPrompt: {
    productService: string;
    offer: string;
    styleDirectionGlobal: string;
    aspectRatio: '1:1';
    agentInstructionsExcerpt: string;
  };
  sampleOnScreenText: OnScreenText;
  /** Full Gemini image prompt with RankPrompt DNA + this template’s schema + sample copy. */
  assembledImagePrompt: string;
  usage: string;
};

type TemplateRow = {
  id: string;
  collection_name: string;
  page_index: number;
  image_url: string;
  vertical: string | null;
  ad_category: string | null;
};

/**
 * Build one portable JSON document for Storage (RankPrompt DNA baked into assembledImagePrompt).
 */
export function buildRankPromptTemplatePackFile(
  row: TemplateRow,
  promptSchema: AdPromptSchema,
  sampleCopy: OnScreenText,
  brandContext: BrandContext,
  agentInstructionsExcerpt: string,
): RankPromptTemplatePackFile {
  const aspectRatio = '1:1' as const;
  const assembledImagePrompt = assembleImagePrompt({
    brandContext,
    promptSchema,
    productService: RANKPROMPT_PRODUCT_SERVICE,
    offer: RANKPROMPT_OFFER,
    onScreenText: sampleCopy,
    aspectRatio,
    styleDirection: RANKPROMPT_STYLE_DIRECTION_GLOBAL,
  });

  return {
    version: RANKPROMPT_TEMPLATE_PACK_VERSION,
    brandDnaKey: 'rankprompt',
    templateId: row.id,
    collectionName: row.collection_name,
    pageIndex: row.page_index,
    vertical: row.vertical,
    adCategory: row.ad_category,
    referenceImageUrl: row.image_url,
    promptSchema,
    rankPrompt: {
      productService: RANKPROMPT_PRODUCT_SERVICE,
      offer: RANKPROMPT_OFFER,
      styleDirectionGlobal: RANKPROMPT_STYLE_DIRECTION_GLOBAL,
      aspectRatio,
      agentInstructionsExcerpt,
    },
    sampleOnScreenText: sampleCopy,
    assembledImagePrompt,
    usage:
      'Send assembledImagePrompt to Gemini 3.1 Flash Image with referenceImageUrl as layout reference. Replace sampleOnScreenText for new copy; full ad renders in one Gemini pass in Cortex.',
  };
}
