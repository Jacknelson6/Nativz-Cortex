/**
 * Single source of truth for static ad → Gemini: JSON schema + brand DNA → one text prompt.
 * Edit this file (and `generate-image.ts` multimodal order) to iterate end-to-end.
 *
 * Brand-specific add-ons live in `resolveBrandStyleAppendix()` — add cases there, not in the orchestrator.
 */

import type { BrandContext } from '@/lib/knowledge/brand-context';
import type { AdPromptSchema, OnScreenText, AspectRatio } from './types';
import { ASPECT_RATIOS } from './types';
import { resolveOfferForAdImage } from './resolve-offer-for-ad';
import { sanitizeAdPromptSchemaForImagePrompt } from './sanitize-prompt-schema-for-image';
import { isRankPromptStudioClient, RANKPROMPT_STYLE_DIRECTION_GLOBAL } from './rankprompt-brand-pack';

/** Shipped as the text part after the reference `inlineData` in `generateAdImage`. */
export const REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION =
  `The above image is a LAYOUT REFERENCE ONLY — loose grid for where headline block, hero, and CTA might sit (CTA left/center — avoid cramming all type into the bottom-right).

Do NOT copy its composition tricks if they use huge empty cards, browser mockups, or oversized panels around small text — override those with editorial typography (big type on open canvas). Do NOT copy its text, logos, inset photos, pill banners with icons, fake dashboards, SOAP/medical UI, node graphs, LLM vendor tiles, hex labels, or product category. The reference hero is often WRONG — replace with visuals that match the product/service described in the text prompt.

If the reference shows fashion retail (clothing racks, hangers, mannequins, boutique interiors, shoes on shelves) and the advertised product is software, data, analytics, or AI visibility — you MUST NOT keep that hero. Replace entirely with abstract gradients, soft 3D shapes, a single laptop with blurred screen, or calm editorial negative space.

Render the COMPLETE ad in this one image: headline, subheadline, CTA, offer line if specified, and one integrated brand mark — no empty “reserved for post-production” corners.

CRITICAL: The ONLY marketing copy words allowed are those explicitly listed in the text prompt below. Ignore every character of text visible in the reference. Never add URL footers or domains from the reference.\n\n`;

export interface BuildGeminiStaticAdPromptParams {
  brandContext: BrandContext;
  promptSchema: AdPromptSchema;
  productService: string;
  offer: string | null;
  onScreenText: OnScreenText;
  aspectRatio: AspectRatio;
  styleDirection?: string;
  /** One-shot batch brief (LLM); injected before brand appendix */
  creativeBrief?: string;
}

/**
 * Optional per-brand visual copy blocks. Centralize special cases here only.
 */
export function resolveBrandStyleAppendix(ctx: BrandContext): string | null {
  if (isRankPromptStudioClient(ctx.clientName)) {
    return RANKPROMPT_STYLE_DIRECTION_GLOBAL;
  }
  return null;
}

/**
 * Full Gemini user text prompt for a single static ad (everything on-canvas in one generation).
 */
export function buildGeminiStaticAdPrompt(config: BuildGeminiStaticAdPromptParams): string {
  const {
    brandContext,
    promptSchema: rawSchema,
    productService,
    offer,
    onScreenText,
    aspectRatio,
    styleDirection,
    creativeBrief,
  } = config;
  const promptSchema = sanitizeAdPromptSchemaForImagePrompt(rawSchema);
  const offerForImage = resolveOfferForAdImage(offer, onScreenText);

  const dimensions = ASPECT_RATIOS.find((r) => r.value === aspectRatio) ?? ASPECT_RATIOS[0];
  const vi = brandContext.visualIdentity;
  const verbal = brandContext.verbalIdentity;

  const brandColors =
    vi.colors.length > 0
      ? vi.colors.map((c) => `${c.name ?? c.role}: ${c.hex}`).join(', ')
      : promptSchema.colorStrategy.dominantColors.join(', ');

  const fontDescription =
    vi.fonts.length > 0
      ? vi.fonts.map((f) => `${f.role ?? 'body'}: ${f.family}${f.weight ? ` (${f.weight})` : ''}`).join('; ')
      : null;

  const sections: string[] = [];

  sections.push(
    `Create a professional static advertisement image at ${dimensions.width}x${dimensions.height}px (${aspectRatio} aspect ratio). The entire creative — background, hero visual, ALL typography (headline, subheadline, CTA, offer), and brand mark — must appear in this single output. No follow-up compositing.`,
  );

  sections.push(
    `CREATIVE INTENT (READ FIRST):\n` +
      `- This is an ORIGINAL ad for "${brandContext.clientName}" — not a remake of any template brand.\n` +
      `- If a layout reference image is supplied separately, use it ONLY for rough spatial rhythm (e.g. headline zone, hero area, CTA area). IGNORE its subject matter, fake UI, node graphs, pills-with-icons, inset photos, and product category when they conflict with: ${productService}.\n` +
      `- The hero visual MUST support that product only. Never recreate unrelated heroes (clothing racks, hangers, fashion retail, mannequins, medical scribe / EHR / SOAP note UI, clinical charts, dating apps, random “extension” grids, etc.). If the layout reference shows apparel retail but this product is B2B SaaS or analytics, treat that photo as forbidden — substitute abstract or tech-appropriate art only.\n` +
      `- Static social ad = ONE headline + ONE subheadline + ONE primary CTA button` +
      (offerForImage ? ` + ONE short offer line (listed below).` : ` — no extra tagline; the subheadline already carries the value prop.`) +
      ` No checkmark bullet rows, no second CTA inside a fake window, no “feature cards,” no fake settings panels, no window chrome with readable menus.\n` +
      `- Do NOT invent SaaS UI: no multi-tile LLM vendor boards (ChatGPT/Gemini/Claude logos), no workflow node diagrams with cables and hex hubs, no “transcript” or “SOAP” panels, no hands holding tablets/phones with readable app chrome — unless the product is literally that app. Prefer abstract 3D shapes, soft gradients, or a single device with a blurred screen.\n` +
      `- The CTA phrase must appear exactly ONCE on a single filled button or pill — never as a hashtag (no # prefix), never as blue link-only text, never repeated inside illustrated cards, device bezels, or floating UI mockups. No second button labeled “Secondary,” “Optional,” or generic placeholders.\n` +
      `- TYPOGRAPHY INTEGRITY: Headline and subheadline must show EVERY word in full at readable size — never clip mid-word (forbidden examples: “AI-genera”, “misrepres”, “conditio”). Use 2–4 wrapped lines if needed; scale type down slightly before truncating. Offer line and CTA must also be fully visible.\n` +
      `- Subheadline: render the quoted subheadline exactly once as one continuous line or paragraph — never duplicate a phrase, never stutter mid-sentence, never split it into two conflicting sentences.\n` +
      `- No fake data widgets: no KPI tiles, percentage callouts, progress bars, mini bar charts, or “dashboard” stat boxes unless those exact numbers are in the approved copy (they never are).\n` +
      `- No social-post chrome: no fake profile avatars, @handles, timelines, or tweet/post frames unless the product is literally a social app.\n` +
      `- No fake data: no hex codes as metrics, no “Optional” or “N/A” buttons, no star ratings with numbers.\n` +
      `- Do not add decorative symbols inside headline text or pill shapes (no random arrows, refresh icons, or ornaments) unless those characters appear verbatim in the quoted headline string.\n` +
      `- Do not wrap the headline in large decorative quotation marks unless quotation marks appear in the headline string itself.\n` +
      `- For B2B / SaaS: generous whitespace, one focal abstract visual — premium and calm, not collage.\n` +
      `- Avoid “tiny text inside a huge UI frame”: do not put headline or subheadline inside oversized rounded rectangles, fake browser chrome, or empty card shells. Prefer large display type directly on the background (or a light translucent band), not nested boxes.\n` +
      `- Use the stated brand palette; do not lift off-brand colors from the reference when they clash.`,
  );

  sections.push(
    `Product/Service: ${productService}` +
      (offerForImage ? `\nSpecial offer (render once as plain text if listed in allowed copy): ${offerForImage}` : ''),
  );

  if (brandContext.positioning?.trim()) {
    sections.push(
      `Brand positioning (honor this; do not contradict with visuals or extra copy): ${brandContext.positioning.trim()}`,
    );
  }
  if (brandContext.audience?.summary?.trim()) {
    sections.push(`Target audience: ${brandContext.audience.summary.trim()}`);
  }
  if (verbal.tonePrimary?.trim()) {
    sections.push(
      `Brand voice (for mood and palette discipline only — never paint this paragraph as on-image text): ${verbal.tonePrimary.trim()}`,
    );
  }

  sections.push(
    `LAYOUT (from template schema — zones only; replace irrelevant reference subjects):\n` +
      `- Text placement: ${promptSchema.layout.textPosition}\n` +
      `- Primary visual placement: ${promptSchema.layout.imagePosition}\n` +
      `- CTA placement: ${promptSchema.layout.ctaPosition}\n` +
      `- Visual hierarchy / reading flow: ${promptSchema.layout.visualHierarchy}`,
  );

  sections.push(
    `COMPOSITION:\n` +
      `- Background: ${promptSchema.composition.backgroundType}\n` +
      `- Overlay: ${promptSchema.composition.overlayStyle}\n` +
      `- Border treatment: ${promptSchema.composition.borderTreatment}`,
  );

  const typo = promptSchema.typography;
  let typoSection =
    `TYPOGRAPHY (invisible art direction — NEVER render any word from this block as user-visible copy; only the quoted headline/subhead/CTA/offer below may appear as text):\n` +
    `- Headline style: ${typo.headlineStyle}\n` +
    `- Subheadline style: ${typo.subheadlineStyle}\n` +
    `- CTA text style: ${typo.ctaTextStyle}\n` +
    `- Font pairing: ${typo.fontPairingNotes}`;
  if (fontDescription) {
    typoSection += `\n- Brand fonts to use: ${fontDescription}`;
  }
  sections.push(typoSection);

  sections.push(
    `COLOR PALETTE:\n` +
      `- Brand colors (use these): ${brandColors}\n` +
      `- Contrast approach: ${promptSchema.colorStrategy.contrastApproach}\n` +
      `- Accent usage: ${promptSchema.colorStrategy.accentUsage}`,
  );

  sections.push(`IMAGERY STYLE: ${promptSchema.imageryStyle.replace(/_/g, ' ')}`);
  sections.push(`EMOTIONAL TONE: ${promptSchema.emotionalTone.replace(/_/g, ' ')}`);

  sections.push(
    `CTA BUTTON:\n` +
      `- Shape: ${promptSchema.ctaStyle.buttonShape}\n` +
      `- Schema position hint: ${promptSchema.ctaStyle.position}\n` +
      `- Place the primary CTA in the main text column (typically left or center-bottom). Keep the layout balanced with a single brand mark if you include one — do not duplicate the CTA inside nested fake UI.`,
  );

  sections.push(
    `THE ONLY MARKETING COPY ALLOWED ON THIS IMAGE (render these EXACTLY as written — same spelling, casing, and punctuation; do not add periods, quotation marks, or decorative ornaments that are not in the string):\n` +
      `- Headline: "${onScreenText.headline}"\n` +
      `- Subheadline: "${onScreenText.subheadline}"\n` +
      `- CTA button text: "${onScreenText.cta}"` +
      (offerForImage ? `\n- Offer line (show once as plain text only — near headline or above CTA, never inside fake UI cards): "${offerForImage}"` : '') +
      `\n\nBRAND MARK (on-canvas, single instance):\n` +
      `- Include exactly ONE tasteful brand mark for "${brandContext.clientName}" (logo mark and/or wordmark) integrated into the layout — header, footer, or corner per the template rhythm. Do not duplicate the same logo twice; do not add a second “favicon + wordmark” stack that repeats the same brand.\n` +
      `- If the brand name already appears inside the quoted headline/subhead/CTA strings, you may still add a small discrete logo for recognition — but never three or four separate brand treatments.\n` +
      `\nNO URLS OR CONTACT FOOTERS (unless one appears verbatim in the allowed strings above — normally none):\n` +
      `- Do not render website URLs, domain names, “www.”, “http”, email addresses, phone numbers, or QR codes. Do not invent alternate TLDs (.ai, .io, etc.) or competitor domains.\n` +
      (brandContext.clientWebsiteUrl
        ? `- Official site for product context only (never paint on canvas): ${brandContext.clientWebsiteUrl}\n`
        : '') +
      `\nREFERENCE IMAGE:\n` +
      `- Ignore all text, UI, and product imagery in the reference for content; use at most loose layout zones only.`,
  );

  const brief = creativeBrief?.trim();
  if (brief) {
    sections.push(`BATCH CREATIVE DIRECTION (hero mood only — still obey allowed copy strings above):\n${brief}`);
  }

  const brandAppendix = resolveBrandStyleAppendix(brandContext);
  if (brandAppendix?.trim()) {
    sections.push(`BRAND STYLE APPENDIX:\n${brandAppendix.trim()}`);
  }

  const trimmedDirection = styleDirection?.trim();
  if (trimmedDirection) {
    sections.push(`USER STYLE DIRECTION:\n${trimmedDirection}`);
  }

  const supplement = brandContext.creativeSupplementBlock?.trim();
  if (supplement) {
    const capped = supplement.length > 8000 ? `${supplement.slice(0, 8000)}\n...(truncated)` : supplement;
    sections.push(
      `ADDITIONAL BRAND MATERIALS (from uploaded guidelines, PDFs, notes, and internal docs — honor typography, color, claims, and tone):\n${capped}`,
    );
  }

  return sections.join('\n\n');
}
