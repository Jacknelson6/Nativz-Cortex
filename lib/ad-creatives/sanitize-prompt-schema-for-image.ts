import type { AdPromptSchema } from './types';

/**
 * Vision-extracted template schemas often contain phrases the image model copies
 * onto the canvas as fake labels ("Accent-colored", design-token wording).
 * Scrub before sending to Gemini image generation.
 */
const PHRASE_SUBSTITUTIONS: Array<{ re: RegExp; replace: string }> = [
  { re: /\baccent[\s-]*colou?red\b/gi, replace: 'accent color treatment' },
  { re: /\bprimary[\s-]*colou?red\b/gi, replace: 'primary brand color' },
  { re: /\bsecondary[\s-]*colou?red\b/gi, replace: 'secondary brand color' },
  { re: /\bin\s+an?\s+accent[\s-]*colou?red\s+pill\b/gi, replace: 'with subtle emphasis' },
  { re: /\baccent[\s-]*tags?\b/gi, replace: 'emphasis' },
];

function scrubField(s: string): string {
  let out = s;
  for (const { re, replace } of PHRASE_SUBSTITUTIONS) {
    out = out.replace(re, replace);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function garbageContentBlock(block: { type: string; content: string }): boolean {
  const c = block.content.trim();
  if (!c) return false;
  const lower = c.toLowerCase();
  if (/^accent[\s-]*colou?red\.?$/.test(lower)) return true;
  if (/^(primary|secondary|accent)[\s-]*(colou?red|color|tone)\.?$/i.test(c)) return true;
  if (/^lorem\b|^placeholder\b|^tbd\b|^sample\s*text$/i.test(lower)) return true;
  return false;
}

/**
 * Returns a shallow-safe copy of the schema with scrubbed strings and junk blocks removed.
 */
export function sanitizeAdPromptSchemaForImagePrompt(schema: AdPromptSchema): AdPromptSchema {
  const t = schema.typography;
  const layout = schema.layout;
  const comp = schema.composition;
  const cs = schema.colorStrategy;
  const cta = schema.ctaStyle;

  return {
    ...schema,
    layout: {
      textPosition: scrubField(layout.textPosition),
      imagePosition: scrubField(layout.imagePosition),
      ctaPosition: scrubField(layout.ctaPosition),
      visualHierarchy: scrubField(layout.visualHierarchy),
    },
    composition: {
      backgroundType: scrubField(comp.backgroundType),
      overlayStyle: scrubField(comp.overlayStyle),
      borderTreatment: scrubField(comp.borderTreatment),
    },
    typography: {
      headlineStyle: scrubField(t.headlineStyle),
      subheadlineStyle: scrubField(t.subheadlineStyle),
      ctaTextStyle: scrubField(t.ctaTextStyle),
      fontPairingNotes: scrubField(t.fontPairingNotes),
    },
    colorStrategy: {
      dominantColors: cs.dominantColors.map((c) => scrubField(c)),
      contrastApproach: scrubField(cs.contrastApproach),
      accentUsage: scrubField(cs.accentUsage),
    },
    ctaStyle: {
      buttonShape: scrubField(cta.buttonShape),
      position: scrubField(cta.position),
      textPattern: scrubField(cta.textPattern),
    },
    contentBlocks: schema.contentBlocks
      .filter((b) => !garbageContentBlock(b))
      .map((b) => ({
        ...b,
        type: scrubField(b.type),
        content: scrubField(b.content),
        position: scrubField(b.position),
      })),
  };
}
