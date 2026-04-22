/**
 * Email-template variable interpolation. Slice 2 supports a small,
 * explicit set of placeholders — admins write `{{var_name}}` in a
 * template's subject/body, and the editor renders them with live
 * values for the current tracker.
 *
 * Known variables:
 *   - {{client_name}}          → tracker.clients.name
 *   - {{service}}              → tracker.service
 *   - {{share_url}}            → /onboarding/[slug]?token=...
 *   - {{contact_first_name}}   → primary contact first name (fallback: "there")
 *
 * Unknown variables are left as-is so admins can spot them and fix by
 * hand before pasting. We never silently delete a placeholder.
 */
export type EmailContext = {
  clientName: string;
  service: string;
  shareUrl: string;
  contactFirstName?: string | null;
};

export function interpolateEmail(text: string, ctx: EmailContext): string {
  const firstName = ctx.contactFirstName?.trim() || 'there';
  return text
    .replace(/\{\{\s*client_name\s*\}\}/gi, ctx.clientName)
    .replace(/\{\{\s*service\s*\}\}/gi, ctx.service)
    .replace(/\{\{\s*share_url\s*\}\}/gi, ctx.shareUrl)
    .replace(/\{\{\s*contact_first_name\s*\}\}/gi, firstName);
}

/**
 * List of placeholders admins should see in the template editor so they
 * know what's available without digging into docs.
 */
export const EMAIL_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: '{{client_name}}', description: "The client's name (e.g. Goldback Inc)" },
  { key: '{{contact_first_name}}', description: 'Primary contact first name, or "there"' },
  { key: '{{service}}', description: 'The service this tracker is for (e.g. SMM)' },
  { key: '{{share_url}}', description: 'Public link to the onboarding timeline' },
];
