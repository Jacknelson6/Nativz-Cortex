// ---------------------------------------------------------------------------
// Static Ad Generation — QA Layer
// ---------------------------------------------------------------------------
// Sends the generated ad to Gemini Vision to OCR all text and check visual
// quality, then compares against the intended text. Flags misspellings,
// gibberish, missing text, duplicate logos, wrong products, fabricated
// contact info, composition issues, and dimension mismatches.
// ---------------------------------------------------------------------------

import sharp from 'sharp';
import type { OnScreenText } from './types';
import { resolveOfferForAdImage } from './resolve-offer-for-ad';
import {
  extractLikelyUrlsFromStrings,
  intendedCopyAllowsUrlOnImage,
  surfaceUrlAllowedByCopy,
  surfaceUrlConflictsWithCanonical,
} from './ad-surface-url-scan';

const GOOGLE_AI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface QAResult {
  passed: boolean;
  issues: QAIssue[];
  extractedText: string[];
  confidence: number; // 0-100
}

export interface QAIssue {
  type:
    | 'misspelling'
    | 'missing_text'
    | 'gibberish'
    | 'extra_text'
    | 'logo_issue'
    | 'wrong_product'
    | 'fabricated_info'
    | 'composition_issue'
    | 'dimension_mismatch';
  severity: 'error' | 'warning';
  description: string;
  expected?: string;
  found?: string;
}

interface QACheckParams {
  imageBuffer: Buffer;
  intendedText: OnScreenText;
  offer: string | null;
  brandName: string;
  productService: string;
  /** Official site from Brand DNA — used to flag wrong domains (e.g. .ai vs .com). */
  canonicalClientWebsiteUrl?: string | null;
  expectedWidth?: number;
  expectedHeight?: number;
}

/**
 * QA check a generated ad image by extracting text via Gemini Vision,
 * checking visual quality, and comparing against the intended copy.
 * Also validates dimensions programmatically via sharp.
 */
export async function qaCheckAd(params: QACheckParams): Promise<QAResult> {
  const {
    imageBuffer,
    intendedText,
    offer,
    brandName,
    productService,
    canonicalClientWebsiteUrl,
    expectedWidth,
    expectedHeight,
  } = params;

  const offerForImage = resolveOfferForAdImage(offer, intendedText);
  const intendedAllowsUrl = intendedCopyAllowsUrlOnImage(intendedText, offerForImage);

  const issues: QAIssue[] = [];

  // -------------------------------------------------------------------------
  // 1. Dimension check (programmatic via sharp — no Gemini needed)
  // -------------------------------------------------------------------------
  if (expectedWidth || expectedHeight) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const actualW = metadata.width ?? 0;
      const actualH = metadata.height ?? 0;

      if (expectedWidth && actualW !== expectedWidth) {
        issues.push({
          type: 'dimension_mismatch',
          severity: 'warning',
          description: `Image width ${actualW}px does not match expected ${expectedWidth}px`,
          expected: `${expectedWidth}`,
          found: `${actualW}`,
        });
      }
      if (expectedHeight && actualH !== expectedHeight) {
        issues.push({
          type: 'dimension_mismatch',
          severity: 'warning',
          description: `Image height ${actualH}px does not match expected ${expectedHeight}px`,
          expected: `${expectedHeight}`,
          found: `${actualH}`,
        });
      }
    } catch (err) {
      console.warn('[qa-check] sharp metadata read failed:', err instanceof Error ? err.message : err);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Gemini Vision analysis (text OCR + visual quality)
  // -------------------------------------------------------------------------
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    // Skip vision QA if no API key — don't block generation
    return { passed: issues.length === 0, issues, extractedText: [], confidence: 0 };
  }

  const base64 = imageBuffer.toString('base64');

  const prompt = buildQAPrompt({
    intendedText,
    offer: offerForImage,
    brandName,
    productService,
    canonicalClientWebsiteUrl: canonicalClientWebsiteUrl ?? null,
    intendedAllowsUrl,
  });

  try {
    const res = await fetch(`${GOOGLE_AI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { maxOutputTokens: 3072 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn('[qa-check] Gemini API error, skipping vision QA');
      return { passed: issues.length === 0, issues, extractedText: [], confidence: 0 };
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Parse JSON from response
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ?? text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: issues.length === 0, issues, extractedText: [], confidence: 0 };
    }

    const jsonStr = jsonMatch[1] ?? jsonMatch[0];
    const qaData = JSON.parse(jsonStr);

    // ----- Map Gemini-detected issues -----
    if (qaData.textQuality === 'gibberish' || qaData.textQuality === 'major_issues') {
      issues.push({
        type: 'gibberish',
        severity: 'error',
        description: 'Major text quality issues detected',
      });
    }

    for (const issue of qaData.issues ?? []) {
      const type = mapIssueType(issue.type);
      issues.push({
        type,
        severity: isErrorSeverity(type) ? 'error' : 'warning',
        description: issue.description ?? '',
        expected: issue.expected,
        found: issue.found,
      });
    }

    // ----- Headline similarity check -----
    if (qaData.headlineFound) {
      const similarity = textSimilarity(intendedText.headline, qaData.headlineFound);
      if (similarity < 0.7) {
        issues.push({
          type: 'misspelling',
          severity: 'error',
          description: `Headline doesn't match intended text`,
          expected: intendedText.headline,
          found: qaData.headlineFound,
        });
      }
    } else {
      issues.push({
        type: 'missing_text',
        severity: 'warning',
        description: 'Headline not found on the ad',
        expected: intendedText.headline,
      });
    }

    // ----- Subheadline similarity check -----
    if (qaData.subheadlineFound) {
      const similarity = textSimilarity(intendedText.subheadline, qaData.subheadlineFound);
      if (similarity < 0.7) {
        issues.push({
          type: 'misspelling',
          severity: 'error',
          description: `Subheadline doesn't match intended text`,
          expected: intendedText.subheadline,
          found: qaData.subheadlineFound,
        });
      }
    } else if (intendedText.subheadline) {
      issues.push({
        type: 'missing_text',
        severity: 'warning',
        description: 'Subheadline not found on the ad',
        expected: intendedText.subheadline,
      });
    }

    // ----- CTA similarity check -----
    if (qaData.ctaFound) {
      const similarity = textSimilarity(intendedText.cta, qaData.ctaFound);
      if (similarity < 0.7) {
        issues.push({
          type: 'misspelling',
          severity: 'error',
          description: `CTA doesn't match intended text`,
          expected: intendedText.cta,
          found: qaData.ctaFound,
        });
      }
    }

    // ----- Offer accuracy check (only when offer should appear on image) -----
    if (offerForImage && qaData.offerFound) {
      const similarity = textSimilarity(offerForImage, qaData.offerFound);
      if (similarity < 0.8) {
        issues.push({
          type: 'misspelling',
          severity: 'error',
          description: `Offer text doesn't match — "${qaData.offerFound}" should be "${offerForImage}"`,
          expected: offerForImage,
          found: qaData.offerFound,
        });
      }
    }

    // ----- Duplicate logos -----
    if (qaData.duplicateLogos) {
      issues.push({
        type: 'logo_issue',
        severity: 'error',
        description: `Brand name or logo "${brandName}" appears more than once on the image`,
        found: qaData.duplicateLogosDetail ?? 'Multiple instances detected',
      });
    }

    // ----- Wrong product imagery -----
    if (qaData.wrongProduct) {
      issues.push({
        type: 'wrong_product',
        severity: 'error',
        description: qaData.wrongProductDetail ?? `Product shown does not match "${productService}"`,
        expected: productService,
        found: qaData.wrongProductDetail,
      });
    }

    // ----- Fabricated contact info -----
    if (qaData.fabricatedContactInfo && (qaData.fabricatedContactInfo as string[]).length > 0) {
      for (const info of qaData.fabricatedContactInfo as string[]) {
        issues.push({
          type: 'fabricated_info',
          severity: 'error',
          description: `AI-fabricated contact info detected: ${info}`,
          found: info,
        });
      }
    }

    // ----- Composition issues -----
    if (qaData.compositionIssues && (qaData.compositionIssues as string[]).length > 0) {
      for (const comp of qaData.compositionIssues as string[]) {
        issues.push({
          type: 'composition_issue',
          severity: 'warning',
          description: comp,
        });
      }
    }

    // ----- URLs / domains (programmatic on OCR strings — catches wrong TLDs) -----
    const extractedList = (qaData.extractedTexts ?? []) as string[];
    const urlCandidates = extractLikelyUrlsFromStrings([
      ...extractedList,
      extractedList.join(' '),
    ]);
    const canon = canonicalClientWebsiteUrl?.trim() || null;
    const seenUrl = new Set<string>();
    for (const u of urlCandidates) {
      const key = u.toLowerCase();
      if (seenUrl.has(key)) continue;
      seenUrl.add(key);

      if (!intendedAllowsUrl) {
        issues.push({
          type: 'fabricated_info',
          severity: 'error',
          description: `URL or domain must not appear on this static ad (not in approved copy): ${u}`,
          found: u,
        });
        continue;
      }

      if (!surfaceUrlAllowedByCopy(u, intendedText, offerForImage)) {
        issues.push({
          type: 'fabricated_info',
          severity: 'error',
          description: `URL or domain is not in approved copy: ${u}`,
          found: u,
        });
      } else if (canon && surfaceUrlConflictsWithCanonical(u, canon)) {
        issues.push({
          type: 'fabricated_info',
          severity: 'error',
          description: `Wrong website on ad — "${u}" does not match official ${canon}`,
          found: u,
          expected: canon,
        });
      }
    }

    const score = qaData.overallScore ?? 50;
    const hasErrors = issues.some((i) => i.severity === 'error');
    const passed = !hasErrors && score >= 60;

    return {
      passed,
      issues,
      extractedText: qaData.extractedTexts ?? [],
      confidence: score,
    };
  } catch (err) {
    console.warn('[qa-check] QA check failed, skipping:', err instanceof Error ? err.message : err);
    return { passed: issues.length === 0, issues, extractedText: [], confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Gemini prompt builder
// ---------------------------------------------------------------------------

function buildQAPrompt(params: {
  intendedText: OnScreenText;
  offer: string | null;
  brandName: string;
  productService: string;
  canonicalClientWebsiteUrl: string | null;
  intendedAllowsUrl: boolean;
}): string {
  const {
    intendedText,
    offer,
    brandName,
    productService,
    canonicalClientWebsiteUrl,
    intendedAllowsUrl,
  } = params;

  return `You are a QA reviewer for advertising creatives. Analyze this ad image thoroughly.

Return JSON with this exact schema:
{
  "extractedTexts": ["every visible text string on the image, one per array entry"],
  "headlineFound": "the main headline text you see (or null if missing)",
  "subheadlineFound": "the subheadline text (or null)",
  "ctaFound": "the CTA button text (or null)",
  "offerFound": "any offer/discount text (or null)",
  "brandNameFound": "any brand name visible (or null)",
  "textQuality": "perfect" | "minor_issues" | "major_issues" | "gibberish",
  "duplicateLogos": true/false,
  "duplicateLogosDetail": "description of duplicate logo/brand issue or null",
  "wrongProduct": true/false,
  "wrongProductDetail": "description of product mismatch or null",
  "fabricatedContactInfo": ["any phone numbers, emails, URLs, or physical addresses found on the image"],
  "compositionIssues": ["any visual composition problems found"],
  "issues": [
    { "type": "misspelling|gibberish|missing|extra|logo_issue|wrong_product|fabricated_info|composition_issue|inappropriate", "description": "what's wrong", "found": "what you see", "expected": "what it should say" }
  ],
  "overallScore": 0-100
}

The intended text for this ad was:
- Headline: "${intendedText.headline}"
- Subheadline: "${intendedText.subheadline}"
- CTA: "${intendedText.cta}"
${offer ? `- Offer: "${offer}"` : '- No offer text'}
- Brand: "${brandName}"
- Product/service being advertised: "${productService}"
- Official brand website (for judging wrong domains only — this URL is usually NOT on the image): "${canonicalClientWebsiteUrl ?? 'not provided'}"
- Intended copy ${intendedAllowsUrl ? 'may include an explicit URL (http/https or www.)' : 'does NOT include any URL — no domain or www. footer should appear'}

Check for ALL of the following:

1. **WRONG BRAND/PRODUCT** — text mentioning brands or products that are NOT "${brandName}" (e.g., reference template text leaked through). This is the #1 critical failure — score 0.

2. **DUPLICATE LOGOS** — Set duplicateLogos=true if a stylized logo mark or wordmark appears TWO OR MORE times as separate graphic treatments (e.g. drawn logo in the hero plus a corner logo, favicon strip + wordmark + corner mark, or two different logo styles). Plain-text "${brandName}" inside the intended headline/subheadline/CTA/offer strings only does NOT count as an extra logo. If there is exactly ONE small logo graphic in the bottom-right and no other logo marks or app icons elsewhere, duplicateLogos=false (headline words may still name the brand).

3. **MISSPELLINGS** — (e.g., "Handcanfted" instead of "Handcrafted"). Check headline, subheadline, CTA, and all other text.

4. **MISSING TEXT** — Any intended text that should be on the ad but isn't.

5. **GIBBERISH** — Nonsensical, garbled, or partially rendered text.

6. **WRONG PRODUCT IMAGERY** — The product/imagery shown should relate to "${productService}". If the ad is for "${productService}" but shows something completely unrelated, set wrongProduct=true.

7. **OFFER ACCURACY** — ${offer ? `An offer line was intended ("${offer}"). It must appear once (plain text) and match — no extra parentheses or quotes around it.` : 'No separate offer line was required (it was folded into the subheadline). Do not flag a missing offer.'}

8. **FABRICATED CONTACT INFO** — Flag ANY phone numbers, email addresses, physical addresses, or URLs visible on the image. AI commonly fabricates these. List each one in fabricatedContactInfo array. ${intendedAllowsUrl ? 'If a URL is allowed, it must match intended copy exactly; otherwise flag wrong or extra domains.' : 'For this ad format, ANY visible URL or domain (including www.brand.ai when official is .com) is a critical error — list in fabricatedContactInfo.'}

9. **INAPPROPRIATE CONTENT** — Content that doesn't match the brand's industry/tone for "${productService}".

10. **VISUAL COMPOSITION** — Check for:
    - Text overlapping product imagery making either unreadable
    - Text with unreadable contrast against background
    - Text cut off at edges of the image
    - Key elements obscured or poorly placed
    - Oversized empty cards, browser chrome, or panels framing unusually small headline/subhead copy (bad “big box, tiny text” layout) — list in compositionIssues
    - The same sentence repeated multiple times as duplicate UI labels — compositionIssues
    - Fake or placeholder UI (e.g. buttons labeled "Optional", hex codes as fake KPIs, unreadable multi-window dashboards) that hurts ad quality — list in compositionIssues or issues as appropriate.

11. **FAKE PRODUCT CHROME** — If the hero shows detailed app UI, LLM vendor tiles, SOAP/medical charting, EHR “transcript” panels, or workflow diagrams that do not match "${productService}", set wrongProduct=true or add a composition issue.

12. **DUPLICATE CTA / REPEATED TAGLINE** — If the CTA phrase appears on more than one button, or inside a fake floating card as well as the real CTA, add an issue. If the subheadline theme is repeated as a second banner (e.g. same idea in two zones), add composition_issue.

13. **BOTTOM-RIGHT TYPOGRAPHY** — If the brand name appears as plain text in the bottom-right logo corner *in addition to* a logo lockup (stacked duplicate), set duplicateLogos=true.

14. **DECORATIVE PUNCTUATION** — Headline should not have trailing periods or odd colored punctuation unless present in the intended headline string above.

15. **WRONG DOMAIN** — If you see any domain on the image and the official site is "${canonicalClientWebsiteUrl ?? 'unknown'}", flag a mismatch (e.g. .ai vs .com) as fabricated_info.

16. **CTA FORMAT** — The CTA must read as a real button or pill. If it appears only as a hashtag (e.g. #Tryforfree) or plain link text with no button shape, add compositionIssues.

17. **TEMPLATE / DESIGN LEAKS** — Visible labels like "Accent-colored", "Primary-colored", or bare placeholder tags are failures — add compositionIssues or issues.

18. **SUBHEAD GARBLE** — If the subheadline is duplicated, stuttered, or clearly broken mid-sentence, add compositionIssues or misspelling.

Be VERY strict about #1 (wrong brand). ${offer ? 'Be strict about #7 (offer accuracy).' : ''}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapIssueType(raw: string): QAIssue['type'] {
  switch (raw) {
    case 'misspelling':
      return 'misspelling';
    case 'gibberish':
      return 'gibberish';
    case 'missing':
      return 'missing_text';
    case 'extra':
      return 'extra_text';
    case 'logo_issue':
      return 'logo_issue';
    case 'wrong_product':
      return 'wrong_product';
    case 'fabricated_info':
      return 'fabricated_info';
    case 'composition_issue':
      return 'composition_issue';
    case 'inappropriate':
      return 'extra_text'; // map inappropriate to extra_text as closest match
    default:
      return 'extra_text';
  }
}

function isErrorSeverity(type: QAIssue['type']): boolean {
  return (
    type === 'gibberish' ||
    type === 'misspelling' ||
    type === 'wrong_product' ||
    type === 'fabricated_info' ||
    type === 'logo_issue'
  );
}

/** Simple text similarity (case-insensitive Jaccard on words) */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}
