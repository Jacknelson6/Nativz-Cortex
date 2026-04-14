import { layout } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Convert a Markdown body (already merge-resolved) to the HTML shell Resend accepts.
 * Minimal on purpose — double newlines become <p>, single newlines become <br>.
 * Escapes HTML special chars so admin-typed content can never inject into the markup.
 */
function markdownToHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;color:#0f172a;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

export function buildUserEmailHtml(bodyMarkdown: string, agency: AgencyBrand): string {
  return layout(markdownToHtml(bodyMarkdown), agency);
}
