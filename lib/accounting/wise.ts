// The submit-payroll flow embeds the editor's Wise payout URL in each
// saved entry's description as `Wise: <url>` so we don't need a schema
// change on `payroll_entries`. The period-detail grid extracts it back
// out for the link icon. When we promote Wise URL to its own column
// (out of scope for this loop) these helpers go away.

const WISE_LINE_RE = /(?:^|\n)\s*Wise:\s*(\S+)/i;

export function extractWiseUrl(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(WISE_LINE_RE);
  if (!match) return null;
  const url = match[1].trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export function formatWiseSuffix(url: string): string {
  return `Wise: ${url.trim()}`;
}

export function appendWiseSuffix(description: string | null | undefined, url: string): string {
  const suffix = formatWiseSuffix(url);
  const base = (description ?? '').trim();
  if (!base) return suffix;
  if (extractWiseUrl(base)) return base; // already has one
  return `${base}\n\n${suffix}`;
}

export function isLikelyWiseUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^https?:\/\/(www\.)?wise\.com\//i.test(trimmed);
}
