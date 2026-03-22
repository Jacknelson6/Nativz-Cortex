/**
 * Heuristics to drop marketing badges, nutrition callouts, and hero copy
 * misclassified as “products” during HTML scraping.
 */

const JUNK_NAME_PATTERNS: RegExp[] = [
  /^\d+\s*mg\b/i,
  /^(gluten|vegan|non[-\s]?gmo|no sugar|100%\s*vegan)/i,
  /^(hero|cover)\s+image$/i,
  /^(five\s*star|rating|reviews?)$/i,
  /^covering\s+all\s+aspects/i,
  /^[a-z]+\s+[a-z]\.?$/i, // "Rachel A."
  /^(free shipping|add to cart|shop now|learn more|buy now)$/i,
  /^(subscribe|sign up|join us)$/i,
];

export function isJunkProductName(name: string): boolean {
  const n = name.trim();
  if (n.length < 4) return true;
  if (n.length <= 18 && /^(48|32|24|12)\s*mg\b/i.test(n)) return true;
  return JUNK_NAME_PATTERNS.some((re) => re.test(n));
}

/** Prefer these for default “selected” in the wizard when we have many noisy rows. */
export function isStrongProductCandidate(p: {
  name: string;
  imageUrl: string | null;
  description: string;
}): boolean {
  if (isJunkProductName(p.name)) return false;
  if (p.name.trim().length < 6) return false;
  if (!p.imageUrl) return false;
  try {
    const u = new URL(p.imageUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return true;
}
