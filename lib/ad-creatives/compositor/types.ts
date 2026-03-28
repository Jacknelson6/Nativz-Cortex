import type { AdPromptSchema, AspectRatio } from '@/lib/ad-creatives/types';
import type { BrandContext } from '@/lib/knowledge/brand-context';

/** Layout archetypes for zone-based placement (see PRD). */
export type LayoutArchetype =
  | 'left_stack'
  | 'right_stack'
  | 'center_overlay'
  | 'top_text'
  | 'bottom_text'
  | 'full_overlay';

/** Normalized rectangle: x,y = top-left as fraction of canvas (0–1); w,h = size as fraction. */
export interface ElementZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositeLayout {
  headline: ElementZone;
  subheadline: ElementZone;
  cta: ElementZone;
  offer: ElementZone | null;
  logo: ElementZone;
}

export interface CompositeAdParams {
  backgroundImage: Buffer;
  brandContext: BrandContext;
  onScreenText: { headline: string; subheadline: string; cta: string };
  offer: string | null;
  promptSchema: AdPromptSchema;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
}

export interface CompositeResult {
  image: Buffer;
  metadata: {
    layoutArchetype: LayoutArchetype;
    fontsUsed: { display: string; body: string };
    ctaBackgroundColor: string;
    ctaTextColor: string;
    logoPlaced: boolean;
    gradientOverlayApplied: boolean;
  };
}

/** Fallback when global Nano slots have no client `prompt_schema`. */
export const DEFAULT_COMPOSITOR_PROMPT_SCHEMA: AdPromptSchema = {
  layout: {
    textPosition: 'center overlay stack',
    imagePosition: 'full bleed hero',
    ctaPosition: 'bottom center',
    visualHierarchy: 'headline subheadline cta centered',
  },
  composition: {
    backgroundType: 'photography',
    overlayStyle: 'gradient bottom',
    borderTreatment: 'none',
  },
  typography: {
    headlineStyle: 'bold',
    subheadlineStyle: 'regular',
    ctaTextStyle: 'semibold',
    fontPairingNotes: '',
  },
  colorStrategy: {
    dominantColors: [],
    contrastApproach: 'high',
    accentUsage: 'cta',
  },
  imageryStyle: 'photography',
  emotionalTone: 'trust',
  ctaStyle: {
    buttonShape: 'pill',
    position: 'bottom',
    textPattern: 'action',
  },
  contentBlocks: [],
};
