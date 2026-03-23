import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { DesignStyle } from '@/lib/knowledge/types';
import type { OnScreenText } from '@/lib/ad-creatives/types';

export const RANKPROMPT_BRAND_KIT_RAW =
  'https://raw.githubusercontent.com/Anderson-Collaborative/rankprompt-brand-kit/main';

/** Match Cortex client display name for RankPrompt (spacing / hyphen tolerant). */
export function isRankPromptStudioClient(clientName: string): boolean {
  const n = clientName.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return n === 'rankprompt';
}

export const RANKPROMPT_PRODUCT_SERVICE =
  'RankPrompt — visibility intelligence for brands: measure and improve how you are cited, summarized, and recommended in AI-generated answers (ChatGPT-style assistants, answer engines) — serious analytics for marketing leaders, not a one-click “generate my whole campaign from a URL” toy.';

export const RANKPROMPT_OFFER = 'See where you rank in AI answers';

/** Appended via `resolveBrandStyleAppendix` for full-canvas Gemini output (type + hero + one brand mark in one pass). */
export const RANKPROMPT_STYLE_DIRECTION_GLOBAL =
  [
    'RankPrompt visual system: purple #6b4eff primary; pink #ff5fb3 only in soft gradients. Inter bold headline, Roboto body.',
    'Hero: one calm abstract focal only (soft mesh, 3D torus/bars, subtle grid, or gradient orb) — not collages, not stock office photos, not device mockups with readable UI.',
    'Typography layout (critical): editorial social ad — large headline and readable subheadline as primary type on open background or soft gradient. Do NOT shrink copy into oversized rounded cards, fake browser windows, modal dialogs, or “dashboard shells” with tiny centered text (no big empty boxes around small sentences). CTA = one compact pill or button, not a second framed panel.',
    'Offer line "See where you rank in AI answers" must appear exactly once as normal-weight text (not inside a nested card, not repeated). Place near headline block or above the CTA.',
    'Exactly ONE integrated RankPrompt brand mark (logo and/or wordmark) in this image — no duplicate lockups, no favicon row + separate wordmark stack, no extra decorative “logo” sparkles.',
    'No fake analytics UI: no percentage KPI tiles, progress bars, stat dashboards, or mini charts with invented numbers.',
    'No social-post frames: no profile circles, @handles, or timeline chrome.',
    'Banned in hero or chrome: SOAP/EHR/medical panels; ChatGPT/Gemini/Claude marks or tiles; node graphs; hands holding phones/tablets with readable apps; duplicate CTA inside illustrated cards; checkmark bullet feature lists; random icons inside headline pills; URLs, www., or domains on canvas (rankprompt.com is never painted).',
  ].join(' ');

/** Five fallback rotations for RankPrompt exports / scripts — shared CTA for a consistent batch. */
export const RANKPROMPT_COPY_POOL: OnScreenText[] = [
  {
    headline: 'Show up in AI-generated answers',
    subheadline: 'See when your brand is cited, skipped, or misrepresented in answer-engine results',
    cta: 'Try for free',
  },
  {
    headline: 'Your share of voice in LLM answers',
    subheadline: 'Marketing and growth teams track citations and competitor presence in one place',
    cta: 'Try for free',
  },
  {
    headline: 'AI visibility, not guesswork',
    subheadline: 'Measure how often buyers encounter your brand when they ask assistants for recommendations',
    cta: 'Try for free',
  },
  {
    headline: 'Get cited where decisions start',
    subheadline: 'Close the gap between your site and what answer engines summarize about you',
    cta: 'Try for free',
  },
  {
    headline: 'Answer-engine SEO, quantified',
    subheadline: 'Structured metrics instead of anecdotal “we think the bots like us”',
    cta: 'Try for free',
  },
];

/**
 * BrandContext for RankPrompt static ads — pass an excerpt from AGENT-INSTRUCTIONS.md (or empty).
 */
export function buildRankPromptBrandContext(agentInstructionsExcerpt: string): BrandContext {
  /**
   * Omit OG / analytics thumbnails from multimodal image gen — they pull Gemini toward dashboard
   * chrome and charty heroes. Logo URL remains for brand DNA context in prompts only.
   */
  const data = {
    fromGuideline: false,
    guidelineId: null,
    guidelineContent: null,
    clientName: 'RankPrompt',
    clientIndustry:
      'B2B SaaS — AI visibility & answer-engine analytics (measurement and strategy, not automated creative factory output)',
    clientWebsiteUrl: 'https://rankprompt.com',
    visualIdentity: {
      colors: [
        { hex: '#6b4eff', name: 'Purple 700', role: 'primary' as const },
        { hex: '#ff5fb3', name: 'Pink accent', role: 'accent' as const },
        { hex: '#f8f7ff', name: 'Light purple tint', role: 'secondary' as const },
        { hex: '#2e1356', name: 'Deep purple', role: 'neutral' as const },
        { hex: '#0b0f19', name: 'Navy', role: 'neutral' as const },
      ],
      fonts: [
        { family: 'Inter Variable', role: 'display' as const, weight: '700' },
        { family: 'Roboto', role: 'body' as const, weight: '400' },
      ],
      logos: [
        {
          url: `${RANKPROMPT_BRAND_KIT_RAW}/assets/logos/logo-app-dark.png`,
          variant: 'primary' as const,
        },
      ],
      screenshots: [],
      designStyle: {
        theme: 'mixed',
        corners: 'rounded',
        density: 'minimal',
        imagery: 'illustration',
      } satisfies DesignStyle,
    },
    verbalIdentity: {
      tonePrimary: 'Confident, precise, forward-looking — expert on AI search visibility',
      voiceAttributes: ['data-informed', 'clear', 'premium', 'trustworthy'],
      messagingPillars: [
        'AI visibility monitoring',
        'Brand presence in LLM answers',
        'Actionable visibility insights',
        'Measurement over magic — clarity for teams who own the brand in answer engines',
      ],
      vocabularyPatterns: [
        'AI visibility',
        'answer engines',
        'LLM',
        'citations',
        'RankPrompt',
      ],
      avoidancePatterns: [
        'Rank Prompt',
        'generic growth hacks',
        'unverifiable claims',
        'sharp-corner brutalist UI',
      ],
    },
    products: [],
    audience: {
      summary:
        'Marketing and growth leaders at brands that care how they show up when buyers ask assistants for recommendations — not teams looking for a button that replaces creative and production.',
    },
    positioning:
      'Credibility and measurement for AI-era discovery: where you are cited, how you are summarized, and how to improve — distinct from tools that promise instant full-funnel campaigns from a single product URL.',
    metadata: null,
    creativeSupplementBlock: agentInstructionsExcerpt,
    creativeReferenceImageUrls: [],
  };

  return {
    ...data,
    toPromptBlock() {
      return `<brand_dna>
Name: RankPrompt (one word — never "Rank Prompt")
Primary: #6b4eff · Accent pink #ff5fb3 for gradients only · Generous whitespace · Min 16px radius
Fonts: Inter Bold headlines, Roboto body
${agentInstructionsExcerpt.slice(0, 3500)}
</brand_dna>`;
    },
    toFullContext() {
      return {
        clientName: data.clientName,
        clientIndustry: data.clientIndustry,
        clientWebsiteUrl: data.clientWebsiteUrl,
        visualIdentity: data.visualIdentity,
        verbalIdentity: data.verbalIdentity,
        products: data.products,
        audience: data.audience,
        positioning: data.positioning,
        guidelineContent: data.guidelineContent,
        metadata: data.metadata,
        creativeSupplementBlock: data.creativeSupplementBlock,
        creativeReferenceImageUrls: [],
      };
    },
  };
}
