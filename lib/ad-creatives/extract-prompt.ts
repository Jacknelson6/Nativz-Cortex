import { z } from 'zod';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import type { AdPromptSchema } from './types';

const MODEL = 'google/gemini-2.5-flash';
const FEATURE = 'ad_template_extraction';

const SYSTEM_PROMPT = `You are an expert advertising creative analyst. Analyze the provided ad image and extract a structured JSON schema that captures every reproducible design decision.

Return ONLY valid JSON matching this exact structure — no markdown, no explanation:

{
  "layout": {
    "textPosition": "Description of where text blocks sit (e.g. 'center-aligned in upper third', 'left column 40%')",
    "imagePosition": "Where the primary image/visual sits (e.g. 'full bleed background', 'right half', 'circular cutout center')",
    "ctaPosition": "Where the call-to-action button/text sits (e.g. 'bottom center', 'lower right')",
    "visualHierarchy": "Reading flow description (e.g. 'headline > image > subtext > CTA', 'Z-pattern with logo top-left')"
  },
  "composition": {
    "backgroundType": "Describe the background (e.g. 'solid color', 'gradient', 'photo with dark overlay', 'split diagonal')",
    "overlayStyle": "Any overlay or filter applied (e.g. 'dark gradient from bottom 60%', 'none', 'frosted glass card')",
    "borderTreatment": "Border or frame style (e.g. 'none', 'thin white border', 'rounded corners 16px')"
  },
  "typography": {
    "headlineStyle": "Describe the headline typography (e.g. 'bold sans-serif, all caps, large scale, white with drop shadow')",
    "subheadlineStyle": "Describe the subheadline/body typography",
    "ctaTextStyle": "Describe the CTA text style (e.g. 'medium weight sans-serif inside rounded button')",
    "fontPairingNotes": "How the fonts relate (e.g. 'contrast between heavy headline and light body', 'single font family different weights')"
  },
  "colorStrategy": {
    "dominantColors": ["List the 3-5 most prominent colors as descriptive names (e.g. 'deep navy', 'warm coral')"],
    "contrastApproach": "How contrast is achieved (e.g. 'light text on dark photo', 'complementary orange on blue')",
    "accentUsage": "How accent color is used (e.g. 'CTA button only', 'underlines and icons', 'price highlight')"
  },
  "imageryStyle": "One of: product_focused | lifestyle | abstract_tech | illustration | 3d_render | photography",
  "emotionalTone": "One of: urgency | trust | aspiration | exclusivity | social_proof | value",
  "ctaStyle": {
    "buttonShape": "Describe the CTA button shape (e.g. 'pill-shaped', 'sharp rectangle', 'no button — text link', 'rounded corners')",
    "position": "CTA position on the ad",
    "textPattern": "CTA text pattern (e.g. 'Shop Now', 'Get Started', 'Learn More')"
  },
  "contentBlocks": [
    {
      "type": "Type of block (e.g. 'headline', 'subheadline', 'price', 'badge', 'logo', 'disclaimer', 'offer')",
      "content": "What content it contains (describe generically, not brand-specific)",
      "position": "Where on the ad this block sits"
    }
  ]
}

Important rules:
- Describe visual patterns generically — do NOT reference specific brand names, products, or copy from the original ad
- Focus on the STRUCTURAL and STYLISTIC decisions that can be replicated with different content
- Be precise about spatial relationships and proportions
- For contentBlocks, list every distinct text/visual block you can identify
- Never use design-token shorthand that could be mistaken for ad copy (e.g. avoid the exact phrases "accent-colored", "primary-colored", "Accent-colored" as standalone descriptions — say "small rounded tag using the accent color" instead)
- Typography fields describe type treatment only — they must never read like UI labels that could be painted on a new ad`;

const adPromptSchemaValidator = z.object({
  layout: z.object({
    textPosition: z.string(),
    imagePosition: z.string(),
    ctaPosition: z.string(),
    visualHierarchy: z.string(),
  }),
  composition: z.object({
    backgroundType: z.string(),
    overlayStyle: z.string(),
    borderTreatment: z.string(),
  }),
  typography: z.object({
    headlineStyle: z.string(),
    subheadlineStyle: z.string(),
    ctaTextStyle: z.string(),
    fontPairingNotes: z.string(),
  }),
  colorStrategy: z.object({
    dominantColors: z.array(z.string()),
    contrastApproach: z.string(),
    accentUsage: z.string(),
  }),
  imageryStyle: z.enum([
    'product_focused',
    'lifestyle',
    'abstract_tech',
    'illustration',
    '3d_render',
    'photography',
  ]),
  emotionalTone: z.enum([
    'urgency',
    'trust',
    'aspiration',
    'exclusivity',
    'social_proof',
    'value',
  ]),
  ctaStyle: z.object({
    buttonShape: z.string(),
    position: z.string(),
    textPattern: z.string(),
  }),
  contentBlocks: z.array(
    z.object({
      type: z.string(),
      content: z.string(),
      position: z.string(),
    })
  ),
});

export async function extractAdPrompt(imageUrl: string): Promise<AdPromptSchema> {
  const completion = await createOpenRouterRichCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: 'Analyze this ad image and extract the structured prompt schema.' },
        ],
      },
    ],
    maxTokens: 2000,
    feature: FEATURE,
    modelPreference: [MODEL],
  });
  const content = completion.text;

  if (!content) {
    throw new Error('Vision model returned an empty response. Try again.');
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Vision model did not return valid JSON. Raw response: ' + content.substring(0, 200));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse JSON from vision response: ' + jsonMatch[0].substring(0, 200));
  }

  const schemaResult = adPromptSchemaValidator.parse(parsed);
  return schemaResult as AdPromptSchema;
}
