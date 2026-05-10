/**
 * Caption ↔ hashtags merging.
 *
 * The publisher (Zernio) and the DB schema keep `caption` and
 * `hashtags` as two separate fields. Humans (admin editor + reviewers
 * on the share link) think of them as one editable blob, the way
 * captions read on TikTok / IG. This module is the bridge: a single
 * source of truth for both directions of the conversion so the share
 * route, the share-link UI, and the admin post editor all behave
 * identically.
 *
 * Merge direction (DB → UI):
 *   `mergeCaptionAndHashtags({ caption: "Hi", hashtags: ["a", "b"] })`
 *   → "Hi\n\n#a #b"
 *
 * Split direction (UI → DB):
 *   `splitMergedCaption("Hi\n\n#a #b")`
 *   → `{ captionText: "Hi", hashtags: ["a", "b"] }`
 *
 * The split only treats the *trailing* block of pure-hashtag lines as
 * the hashtag column. Any `#word` mid-sentence stays in the caption
 * body, so "Going #live tomorrow" doesn't lose the inline tag.
 */

export function mergeCaptionAndHashtags(opts: {
  caption: string | null | undefined;
  hashtags: string[] | null | undefined;
}): string {
  const caption = opts.caption ?? '';
  const hashtags = opts.hashtags ?? [];
  if (hashtags.length === 0) return caption;
  const sep = caption.trim().length > 0 ? '\n\n' : '';
  return caption + sep + hashtags.map((h) => `#${h}`).join(' ');
}

export function splitMergedCaption(merged: string): {
  captionText: string;
  hashtags: string[];
} {
  const lines = merged.split('\n');
  let cut = lines.length;
  let i = lines.length - 1;
  // Skip pure-blank trailing lines.
  while (i >= 0 && lines[i].trim() === '') i--;
  while (i >= 0) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      i--;
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    if (tokens.every((t) => /^#\w+$/.test(t))) {
      cut = i;
      i--;
    } else {
      break;
    }
  }
  const trailing = lines.slice(cut).join(' ');
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const m of trailing.matchAll(/#(\w+)/g)) {
    const key = m[1].toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      hashtags.push(m[1]);
    }
  }
  return {
    captionText: lines.slice(0, cut).join('\n').trimEnd(),
    hashtags,
  };
}
