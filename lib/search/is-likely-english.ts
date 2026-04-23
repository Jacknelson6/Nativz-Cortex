/**
 * Heuristic language gate for short titles + captions. Returns true when the
 * text reads as primarily Latin-script (English and closely-related western
 * languages) so non-English sources can be filtered from the short-form
 * video grid without calling into a full language-detection service.
 *
 * Strategy: strip whitespace, digits, punctuation, symbols and emoji, then
 * measure the Latin-letter ratio on what remains. Returns true for very
 * short / empty strings so we don't accidentally drop sources with only
 * a numeric title or an image-only caption.
 */
export function isLikelyEnglish(
  text: string | null | undefined,
  options: { minLatinRatio?: number; minLength?: number } = {},
): boolean {
  const minLatinRatio = options.minLatinRatio ?? 0.6;
  const minLength = options.minLength ?? 4;
  if (!text) return true;

  // Drop whitespace, digits, punctuation, symbols and all extended pictographics
  // (emoji) so the ratio reflects actual script usage, not decorative characters.
  const stripped = text.replace(/[\s\d\p{P}\p{S}\p{Extended_Pictographic}]/gu, '');
  if (stripped.length < minLength) return true;

  const latinMatches = stripped.match(/[A-Za-z\u00C0-\u024F]/g);
  const latin = latinMatches ? latinMatches.length : 0;
  return latin / stripped.length >= minLatinRatio;
}

/** Convenience: returns true when the source's title+content is English. */
export function isSourceLikelyEnglish(source: {
  title?: string | null;
  content?: string | null;
}): boolean {
  const text = [source.title, source.content].filter(Boolean).join(' ');
  return isLikelyEnglish(text);
}
