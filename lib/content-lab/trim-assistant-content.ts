/**
 * Strip trailing follow-up questions from an assistant message before
 * exporting it as a deliverable. The Nerd habitually ends replies with a
 * "Want me to…?" / "Would you like me to…?" prompt, which reads fine in
 * chat but clutters a client-facing PDF.
 *
 * Heuristic — only trim if the tail is clearly a follow-up:
 *  - Consecutive trailing lines that start with one of the phrases below
 *  - Or a single final paragraph that is one short question ending in "?"
 *
 * We deliberately err on the side of *not* trimming: if the tail doesn't
 * match, the message is returned unchanged.
 */

const FOLLOW_UP_PREFIXES = [
  /^want me to\b/i,
  /^would you like( me)?\b/i,
  /^shall i\b/i,
  /^do you want\b/i,
  /^should i\b/i,
  /^let me know\b/i,
  /^need (anything|me)\b/i,
  /^ready for\b/i,
  /^happy to\b/i,
  /^i can also\b/i,
  /^next step\b/i,
];

function isFollowUp(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Strip a leading bullet marker so "- Want me to..." still matches.
  const stripped = trimmed.replace(/^[-*•]\s+/, '');
  return FOLLOW_UP_PREFIXES.some((re) => re.test(stripped));
}

export function stripTrailingFollowUps(content: string): string {
  const trimmedEnd = content.replace(/\s+$/, '');
  if (!trimmedEnd) return content;

  const lines = trimmedEnd.split('\n');

  // Walk backwards, dropping contiguous follow-up lines and the blank lines
  // that separate them from the prior deliverable content.
  let cutIndex = lines.length;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.trim()) {
      cutIndex = i;
      continue;
    }
    if (isFollowUp(line)) {
      cutIndex = i;
      continue;
    }
    break;
  }

  // Single trailing one-line question ("…ready?", "…should we?") — drop it too.
  if (cutIndex === lines.length) {
    const last = lines[lines.length - 1]?.trim() ?? '';
    if (last.endsWith('?') && last.split(/\s+/).length <= 14 && !last.startsWith('#')) {
      cutIndex = lines.length - 1;
    }
  }

  if (cutIndex === lines.length) return content;
  return lines.slice(0, cutIndex).join('\n').replace(/\s+$/, '');
}
