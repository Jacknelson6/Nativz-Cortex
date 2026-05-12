// Strip everything that breaks a hashtag on IG/TikTok/LinkedIn/etc.
// IG terminates a tag at the first non-alphanumeric/underscore char, so
// "vehicle-service-contracts" only renders #vehicle. We collapse those
// to "vehicleservicecontracts" rather than splitting them, since the
// strategist intent is one tag per phrase.
export function normalizeHashtag(raw: string): string | null {
  const cleaned = raw
    .normalize('NFKC')
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '');
  return cleaned ? cleaned : null;
}

export function normalizeHashtagList(raws: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raws) {
    const t = normalizeHashtag(r);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
