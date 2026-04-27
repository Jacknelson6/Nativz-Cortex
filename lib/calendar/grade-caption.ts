import type { CaptionGrade, GeminiContext } from '@/lib/types/calendar';

const CTA_VERBS = [
  'follow',
  'comment',
  'tag',
  'save',
  'share',
  'watch',
  'click',
  'dm',
  'try',
  'learn',
  'grab',
  'shop',
  'book',
  'join',
  'subscribe',
  'drop',
  'hit',
  'check',
  'visit',
  'sign',
  'reply',
  'tap',
  'swipe',
  'order',
  'buy',
  'download',
];

interface GradeInput {
  caption: string;
  hashtags: string[];
  context: GeminiContext;
  brandVoice?: string;
  brandKeywords?: string[];
  savedCaptions?: { caption_text: string; hashtags?: string[] | null }[];
}

export function gradeCaption(input: GradeInput): CaptionGrade {
  const reasons: string[] = [];
  const trimmed = input.caption.trim();

  if (!trimmed) {
    reasons.push('Caption is empty.');
    return {
      total: 0,
      body_length: 0,
      cta_separation: 0,
      hashtag_relevance: 0,
      voice_match: 0,
      reasons,
    };
  }

  const bodyText = stripTrailingHashtagBlock(trimmed);
  const bodyLengthScore = scoreBodyLength(bodyText, reasons);
  const ctaScore = scoreCtaSeparation(trimmed, reasons);
  const hashtagScore = scoreHashtagRelevance(
    input.hashtags,
    input.context,
    input.brandKeywords ?? [],
    reasons,
  );
  const voiceScore = scoreVoiceMatch(
    bodyText,
    input.brandVoice ?? '',
    input.savedCaptions ?? [],
    reasons,
  );

  return {
    total: bodyLengthScore + ctaScore + hashtagScore + voiceScore,
    body_length: bodyLengthScore,
    cta_separation: ctaScore,
    hashtag_relevance: hashtagScore,
    voice_match: voiceScore,
    reasons,
  };
}

function stripTrailingHashtagBlock(caption: string): string {
  const lines = caption.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === '' || /^(#\S+\s*)+$/.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  return lines.join('\n').trim();
}

function scoreBodyLength(body: string, reasons: string[]): number {
  const len = body.length;
  if (len === 0) {
    reasons.push('No body copy outside of hashtags.');
    return 0;
  }
  if (len >= 80 && len <= 280) {
    reasons.push(`Body length ${len} chars sits in the sweet spot (80-280).`);
    return 30;
  }
  if ((len >= 50 && len < 80) || (len > 280 && len <= 400)) {
    reasons.push(`Body length ${len} chars is acceptable but not ideal.`);
    return 20;
  }
  if ((len >= 30 && len < 50) || (len > 400 && len <= 600)) {
    reasons.push(`Body length ${len} chars drifts from the sweet spot.`);
    return 10;
  }
  reasons.push(`Body length ${len} chars is well outside the 80-280 sweet spot.`);
  return 0;
}

function scoreCtaSeparation(caption: string, reasons: string[]): number {
  let score = 0;

  const lines = caption.split('\n');
  const firstLine = lines.find((line) => line.trim() !== '') ?? '';
  if (firstLine && !firstLine.trim().startsWith('#') && !/^[*_`]/.test(firstLine.trim())) {
    score += 10;
    reasons.push('Hook line is clean prose.');
  } else {
    reasons.push('Hook line is missing or leads with a hashtag/markdown char.');
  }

  const body = stripTrailingHashtagBlock(caption);
  if (!body) {
    reasons.push('No body to host a CTA.');
    return score;
  }
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const closingBlock = blocks[blocks.length - 1] ?? '';
  const lower = closingBlock.toLowerCase();
  const hasCtaVerb = CTA_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(lower));
  if (hasCtaVerb) {
    score += 10;
    reasons.push('Closing block contains a CTA verb.');
  } else {
    reasons.push('Closing block has no clear CTA verb.');
  }

  const hashtagBlock = caption.slice(body.length).trim();
  if (hashtagBlock && /\n\s*\n/.test(caption.slice(0, caption.length).replace(body, ''))) {
    score += 10;
    reasons.push('Hashtags are separated from the body.');
  } else if (hashtagBlock) {
    score += 5;
    reasons.push('Hashtags are present but inline rather than blank-line separated.');
  } else if (blocks.length >= 2) {
    score += 10;
    reasons.push('Body uses multi-block structure.');
  } else {
    reasons.push('Body is a single block with no separation.');
  }

  return Math.min(score, 30);
}

function scoreHashtagRelevance(
  hashtags: string[],
  context: GeminiContext,
  brandKeywords: string[],
  reasons: string[],
): number {
  let score = 0;
  const normalized = hashtags.map((h) => h.toLowerCase().replace(/^#/, '').trim()).filter(Boolean);

  if (normalized.length >= 3 && normalized.length <= 12) {
    score += 8;
    reasons.push(`Hashtag count ${normalized.length} is in range (3-12).`);
  } else {
    reasons.push(`Hashtag count ${normalized.length} is out of range (3-12).`);
  }

  const themeWords = new Set<string>();
  for (const theme of context.visual_themes) {
    for (const word of tokenize(theme)) themeWords.add(word);
  }
  for (const word of tokenize(context.recommended_caption_angle)) themeWords.add(word);
  for (const word of tokenize(context.one_liner)) themeWords.add(word);

  const hashtagOverlapsTheme = normalized.some((tag) =>
    [...themeWords].some((tw) => tag.includes(tw) || tw.includes(tag)),
  );
  if (hashtagOverlapsTheme) {
    score += 9;
    reasons.push('At least one hashtag matches the video theme.');
  } else {
    reasons.push('Hashtags do not overlap with the video theme.');
  }

  const brandWords = new Set<string>();
  for (const kw of brandKeywords) {
    for (const word of tokenize(kw)) brandWords.add(word);
  }
  if (brandWords.size > 0) {
    const overlapsBrand = normalized.some((tag) =>
      [...brandWords].some((bw) => tag.includes(bw) || bw.includes(tag)),
    );
    if (overlapsBrand) {
      score += 8;
      reasons.push('At least one hashtag matches a brand keyword.');
    } else {
      reasons.push('No hashtag matches a brand keyword.');
    }
  } else {
    score += 4;
  }

  return Math.min(score, 25);
}

function scoreVoiceMatch(
  body: string,
  brandVoice: string,
  savedCaptions: { caption_text: string; hashtags?: string[] | null }[],
  reasons: string[],
): number {
  if (!body) {
    reasons.push('No body copy to evaluate voice against.');
    return 0;
  }

  const bodyWords = new Set(tokenize(body));
  let score = 0;

  if (brandVoice.trim()) {
    const voiceWords = new Set(tokenize(brandVoice));
    const overlap = [...voiceWords].filter((w) => bodyWords.has(w)).length;
    if (overlap >= 2) {
      score += 8;
      reasons.push(`Strong brand-voice overlap (${overlap} keywords matched).`);
    } else if (overlap === 1) {
      score += 4;
      reasons.push('Light brand-voice overlap (1 keyword matched).');
    } else {
      reasons.push('No brand-voice keyword overlap.');
    }
  } else {
    score += 4;
  }

  if (savedCaptions.length > 0) {
    const sampleWords = new Set<string>();
    for (const sc of savedCaptions.slice(0, 5)) {
      for (const w of tokenize(sc.caption_text)) sampleWords.add(w);
    }
    const overlap = [...sampleWords].filter((w) => bodyWords.has(w)).length;
    if (overlap >= 3) {
      score += 7;
      reasons.push(`Strong saved-caption tone overlap (${overlap} keywords).`);
    } else if (overlap >= 1) {
      score += 4;
      reasons.push(`Light saved-caption tone overlap (${overlap} keywords).`);
    } else {
      reasons.push('No saved-caption tone overlap.');
    }
  } else {
    score += 3;
  }

  return Math.min(score, 15);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}
