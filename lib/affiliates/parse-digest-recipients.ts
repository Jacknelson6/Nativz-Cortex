/** Comma-separated emails for affiliate digest settings and cron. */
export function parseAffiliateDigestRecipients(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
