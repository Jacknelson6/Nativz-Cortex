/**
 * Turn verbose category names from the model into a short headline
 * plus an optional breakdown line (detail).
 */

function formatDetailLine(d: string): string {
  return d
    .replace(/\s*,\s*/g, ' · ')
    .replace(/\s*\/\s*/g, ' · ')
    .trim();
}

/** Split label into [primary, ...rest] using common model patterns. */
function splitPillarLabel(s: string): string[] {
  // Middle dot: "How-to · checklists" or "A · B · C"
  if (s.includes('·')) {
    return s.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  }
  // Ampersand: "How to & checklists"
  if (/\s+&\s+/.test(s)) {
    return s.split(/\s+&\s+/).map((p) => p.trim()).filter(Boolean);
  }
  // Spaced hyphen / en dash / em dash (keeps "News-style" as one segment)
  if (/\s+[-–—]\s+/.test(s)) {
    return s.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  }
  // Slash: "How-to / checklists"
  if (s.includes('/')) {
    const parts = s.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts;
  }
  return [s];
}

function normalizeHeadline(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Content';

  if (/^how-to$/i.test(t)) return 'How To';
  if (/^how to$/i.test(t)) return 'How To';
  if (/^news-style$/i.test(t)) return 'News style';

  return t;
}

export function formatPillarLabelForDisplay(raw: string): { headline: string; detail?: string } {
  const s = raw.trim();
  if (!s) return { headline: 'Content' };

  // Headline (detail in parentheses)
  const paren = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const headline = normalizeHeadline(paren[1].trim());
    const detail = formatDetailLine(paren[2].trim());
    return detail ? { headline, detail } : { headline };
  }

  const parts = splitPillarLabel(s);
  if (parts.length >= 2) {
    const headline = normalizeHeadline(parts[0]);
    const detail = formatDetailLine(parts.slice(1).join(' · '));
    return detail ? { headline, detail } : { headline };
  }

  return { headline: normalizeHeadline(parts[0] ?? s) };
}
