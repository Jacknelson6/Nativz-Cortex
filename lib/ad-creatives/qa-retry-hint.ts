import type { QAIssue } from './qa-check';

/**
 * Extra style direction appended on QA retry so Gemini corrects common failures
 * (duplicate logos, wrong hero subject, fake UI).
 */
export function buildQaRetryStyleSuffix(issues: QAIssue[]): string {
  if (!issues.length) return '';

  const desc = issues.map((i) => i.description).join(' ').toLowerCase();
  const parts: string[] = [];

  const logoDup =
    issues.some((i) => i.type === 'logo_issue') ||
    /duplicate.*(logo|wordmark|brand)|brand name.*more than once|two.*(logo|wordmark)/i.test(desc);

  const wrongProduct =
    issues.some((i) => i.type === 'wrong_product') ||
    /does not match|unrelated|wrong product|medical|dating|extension/i.test(desc);

  const badUi =
    issues.some((i) => i.type === 'gibberish' || i.type === 'extra_text') ||
    /optional|hex|placeholder|gibberish|illegible|fake|fabricated|secondary|soap|duplicate.*cta|parentheses.*offer/i.test(
      desc,
    );

  const urlIssue =
    issues.some(
      (i) =>
        i.type === 'fabricated_info' &&
        /url|domain|www\.|http|website/i.test(i.description),
    ) || /wrong website|not in approved copy/i.test(desc);

  const cornerText =
    /bottom.right|stacked.*brand|wordmark.*corner|duplicate.*tagline/i.test(desc);

  const boxyOrRepeatedCopy =
    /repeated|four times|multiple times|tiny text|small text.*large|oversized.*(card|box|panel|rectangle)|huge.*(card|frame)|redundant|cluttered|stutter|duplicate.*sentence/i.test(
      desc,
    );

  const badCtaForm =
    /hashtag|#\s*try|twitter|tweet|post frame|profile (picture|avatar|photo)/i.test(desc);

  const statChrome =
    /kpi|dashboard|progress bar|percentage tile|\d+\.\d+%|stat box|metric card/i.test(desc);

  const templateLeak =
    /accent[\s-]*colou?red|placeholder (pill|tag|label)/i.test(desc);

  if (logoDup || cornerText) {
    parts.push(
      'QA RETRY — BRANDING: Use exactly ONE integrated brand mark (logo and/or wordmark) — remove duplicate lockups, favicon strips, stacked wordmarks, and extra decorative “logo” sparkles. The quoted headline, subhead, CTA, and offer (if any) remain the primary readable copy.',
    );
  }

  if (wrongProduct) {
    parts.push(
      'QA RETRY — HERO: Replace the hero with abstract B2B marketing visuals only — soft 3D shape, gradient mesh, subtle grid, or one device with blurred screen. No SOAP notes, medical charts, EHR transcripts, LLM vendor logo tiles (OpenAI/Gemini/Claude), node-and-arrow diagrams, hands holding tablets, or unrelated stock scenes.',
    );
  }

  if (badUi) {
    parts.push(
      'QA RETRY — UI / COPY: No hex codes as fake KPIs. No buttons labeled Optional, Secondary, or N/A. The CTA text must appear on exactly ONE button — not again inside a fake floating card. No checkmark bullet rows unless specified. No decorative icons inside headline pills. No extra parentheses around the offer. No duplicate taglines in two zones.',
    );
  }

  if (boxyOrRepeatedCopy) {
    parts.push(
      'QA RETRY — LAYOUT: Headline appears once; subheadline once; offer once if listed — never duplicate the same sentence. No oversized rounded cards, browser shells, or modal frames wrapping tiny copy — use large headline/subhead typography directly on the background or a simple soft band.',
    );
  }

  if (badCtaForm) {
    parts.push(
      'QA RETRY — CTA: Render the CTA as a single filled button or pill with the exact label — never as a hashtag, never #prefix, never social-post link styling.',
    );
  }

  if (statChrome) {
    parts.push(
      'QA RETRY — NO FAKE STATS: Remove all KPI tiles, percentage widgets, progress bars, and mini charts — the product is not selling a dashboard screenshot.',
    );
  }

  if (templateLeak) {
    parts.push(
      'QA RETRY — NO INTERNAL LABELS: Remove any pill or tag that looks like a design note (e.g. accent labels). Only approved headline, subheadline, offer, and CTA text may appear.',
    );
  }

  if (urlIssue) {
    parts.push(
      'QA RETRY — NO URLS: Remove every website URL, www. line, domain footer, and invented TLD. Do not show any domain unless it is a verbatim substring of the approved headline/subhead/CTA/offer strings (usually none).',
    );
  }

  return parts.join('\n\n');
}
