import { layout } from '@/lib/email/resend';
import { getEmailBrand } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Convert a merge-resolved Markdown body into the HTML card Resend accepts.
 * Supports:
 *   # heading                       -> large branded heading (24px, tight tracking)
 *   ## subheading                   -> branded eyebrow (11px uppercase, accent color)
 *   **bold**, *italic*              -> <strong> / <em>
 *   - bullet                        -> <ul>/<li>
 *   **Label:**\n- item\n- item       -> panel card with eyebrow + bulleted items
 *   [text](url)                     -> inline branded link
 *   [text](url)  (on its own line)  -> full-width CTA button pill
 *   ---                             -> horizontal divider
 *   - Name (last block)              -> muted signoff line
 *   blank line                      -> paragraph break
 *
 * Everything else is HTML-escaped, admin-authored content can never inject
 * into the markup. Inline-style rendering because Gmail strips <style> blocks
 * for anything but the head.
 */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string, accent: string): string {
  const escaped = escape(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:inherit;">$1</strong>')
    .replace(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label: string, url: string) =>
        `<a href="${url}" style="color:${accent};text-decoration:none;font-weight:600;">${label}</a>`,
    );
}

function markdownToHtml(markdown: string, agency: AgencyBrand): string {
  const brand = getEmailBrand(agency);
  const accent = brand.blue;
  const textBody = brand.textBody;
  const textMuted = brand.textMuted;

  const blocks = markdown.split(/\n{2,}/).map((b) => b.replace(/\s+$/g, ''));
  const parts: string[] = [];

  // Regex for "this whole block is just one markdown link" -> promotes it
  // to a pill-button CTA. Matches [text](url) with surrounding whitespace.
  const standaloneLinkRe = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/;

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (block === '---' || block === '***') {
      parts.push(
        `<hr style="border:none;border-top:1px solid ${brand.borderCard};margin:24px 0;" />`,
      );
      continue;
    }

    if (/^#\s+/.test(block)) {
      const text = block.replace(/^#\s+/, '');
      parts.push(
        `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${brand.textPrimary};line-height:1.2;">${renderInline(text, accent)}</h1>`,
      );
      continue;
    }

    // ## headings render as a branded eyebrow (small caps, accent color),
    // which gives admin-authored emails an "AOL nostalgia"-free section
    // break that matches the eyebrow language used in the rest of the shell.
    if (/^##\s+/.test(block)) {
      const text = block.replace(/^##\s+/, '');
      parts.push(
        `<p style="margin:26px 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${brand.blue};line-height:1.4;">${renderInline(text, accent)}</p>`,
      );
      continue;
    }

    // Standalone link -> CTA button. Matches the inline styles the
    // invite/reset emails apply to .button (layout() in resend.ts).
    const ctaMatch = standaloneLinkRe.exec(block);
    if (ctaMatch) {
      const label = escape(ctaMatch[1]);
      const url = ctaMatch[2];
      parts.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${url}" style="display:inline-block;background:${brand.blueCta};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.02em;padding:14px 36px;border-radius:10px;">${label}</a></td></tr></table>`,
      );
      continue;
    }

    const lines = block.split('\n');

    // "**Heading:**\n- item\n- item" pattern -> branded panel card with the
    // heading rendered as a small uppercase eyebrow above the list. Lets
    // admin-authored emails call out outstanding items / next steps in a
    // visual block instead of a wall of bullets.
    const cardHeadRe = /^\*\*([^*]+?):?\*\*\s*$/;
    if (lines.length >= 2 && cardHeadRe.test(lines[0])) {
      const headingMatch = cardHeadRe.exec(lines[0])!;
      const rest = lines.slice(1);
      const allBullets = rest.every((l) => /^\s*[-*]\s+/.test(l));
      if (allBullets) {
        const items = rest
          .map((l) => l.replace(/^\s*[-*]\s+/, ''))
          .map(
            (li) =>
              `<li style="padding:4px 0 4px 6px;color:${textBody};font-size:14px;line-height:1.6;">${renderInline(li, accent)}</li>`,
          )
          .join('');
        parts.push(
          `<div style="margin:22px 0;padding:18px 22px;background:${brand.panelBg};border:1px solid ${brand.border};border-radius:12px;">` +
            `<div style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${textMuted};">${escape(headingMatch[1])}</div>` +
            `<ul style="margin:0;padding:0 0 0 20px;list-style:disc;">${items}</ul>` +
            `</div>`,
        );
        continue;
      }
    }

    const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isList) {
      const items = lines
        .map((l) => l.replace(/^\s*[-*]\s+/, ''))
        .map(
          (li) =>
            `<li style="padding:4px 0;color:${textBody};line-height:1.6;">${renderInline(li, accent)}</li>`,
        )
        .join('');
      parts.push(
        `<ul style="margin:0 0 16px 20px;padding:0;">${items}</ul>`,
      );
      continue;
    }

    // Trailing line that looks like a signoff: "- Name" / "- Team". ASCII
    // hyphen only, the em-dash variants are banned per the project style
    // guide so we never render U+2013 / U+2014 in admin-authored copy.
    const sigMatch = block.match(/^(-)\s+(.+)$/);
    if (sigMatch) {
      parts.push(
        `<p style="margin:24px 0 0;font-size:14px;color:${textMuted};">${escape(sigMatch[1])} ${renderInline(sigMatch[2], accent)}</p>`,
      );
      continue;
    }

    parts.push(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${textBody};">${renderInline(block, accent).replace(/\n/g, '<br/>')}</p>`,
    );
  }

  return parts.join('\n');
}

export function buildUserEmailHtml(bodyMarkdown: string, agency: AgencyBrand): string {
  const body = markdownToHtml(bodyMarkdown, agency);
  // Body is admin-composed markdown so we don't lift a heroTitle from it,
  // the `# heading` block in the body still renders on the white card. Eyebrow
  // falls back to the brand name through layout()'s default.
  return layout(body, agency);
}
