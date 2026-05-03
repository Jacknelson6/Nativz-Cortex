/**
 * Block-based composer for rich onboarding emails. Each OnboardingBlock
 * renders to inline-styled HTML that matches the .heading / .subtext /
 * .button / .features / .divider classes in layout() — same visual
 * language as the invite and reset emails.
 *
 * Historically the shape was a JSONB array on
 * `onboarding_email_templates.blocks`; that table is gone in the
 * unified onboarding rebuild, so callers now build the block array
 * inline and hand it to `renderBlocks` directly.
 *
 * Inline styles are required because many email clients strip <style>
 * blocks from the body; the <head> block in layout() survives in Gmail
 * but not uniformly elsewhere, so everything critical is mirrored inline.
 */

import { getEmailBrand } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';

export type OnboardingBlock =
  | { type: 'hero'; heading: string; subtext?: string }
  | { type: 'paragraph'; text: string }
  | { type: 'cta'; label: string; url: string }
  | { type: 'features'; items: string[] }
  | { type: 'callout'; label: string; text: string }
  | { type: 'divider' }
  | { type: 'signature'; text: string };

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text: string, accent: string): string {
  const escaped = esc(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label: string, url: string) =>
        `<a href="${url}" style="color:${accent};text-decoration:none;font-weight:600;">${label}</a>`,
    );
}

/** Best-effort: do any of the blocks still contain placeholders? */
export function findUnresolvedBlockPlaceholders(blocks: OnboardingBlock[]): string[] {
  const found = new Set<string>();
  for (const b of blocks) {
    const texts: string[] = [];
    if (b.type === 'hero') { texts.push(b.heading); if (b.subtext) texts.push(b.subtext); }
    else if (b.type === 'paragraph') texts.push(b.text);
    else if (b.type === 'cta') { texts.push(b.label); texts.push(b.url); }
    else if (b.type === 'features') texts.push(...b.items);
    else if (b.type === 'callout') { texts.push(b.label); texts.push(b.text); }
    else if (b.type === 'signature') texts.push(b.text);
    for (const s of texts) {
      for (const m of s.matchAll(PLACEHOLDER_RE)) found.add(m[1]);
    }
  }
  return Array.from(found);
}

/** Render the blocks inside a branded .card wrapper. */
export function buildOnboardingBlocksHtml(
  blocks: OnboardingBlock[],
  agency: AgencyBrand,
): string {
  const brand = getEmailBrand(agency);
  const accent = brand.blue;

  const parts = blocks.map((b) => renderBlock(b, brand, accent)).filter(Boolean);
  return `<div class="card" style="background:${brand.bgCard};border:1px solid ${brand.borderCard};border-radius:16px;padding:36px 32px;">${parts.join('\n')}</div>`;
}

function renderBlock(
  block: OnboardingBlock,
  brand: ReturnType<typeof getEmailBrand>,
  accent: string,
): string {
  switch (block.type) {
    case 'hero':
      return [
        `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:${brand.textPrimary};line-height:1.2;">${inline(block.heading, accent)}</h1>`,
        block.subtext
          ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:${brand.textBody};">${inline(block.subtext, accent)}</p>`
          : '',
      ]
        .filter(Boolean)
        .join('');

    case 'paragraph':
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${brand.textBody};">${inline(block.text, accent).replace(/\n/g, '<br/>')}</p>`;

    case 'cta':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${esc(block.url)}" style="display:inline-block;background:${brand.blueCta};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.02em;padding:14px 36px;border-radius:10px;">${esc(block.label)}</a></td></tr></table>`;

    case 'features': {
      const items = block.items
        .map(
          (li) => `<li style="margin:6px 0 6px 0;padding-left:22px;position:relative;color:${brand.textBody};font-size:14px;line-height:1.55;"><span style="position:absolute;left:0;top:7px;width:8px;height:8px;border-radius:50%;background:${brand.blue};opacity:0.55;"></span>${inline(li, accent)}</li>`,
        )
        .join('');
      return `<ul style="margin:0 0 20px;padding:0;list-style:none;">${items}</ul>`;
    }

    case 'callout':
      return `<div style="margin:16px 0 20px;padding:14px 16px;border-radius:10px;background:${brand.blueSurface};border:1px solid ${brand.borderCard};"><p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${brand.blue};">${esc(block.label)}</p><p style="margin:0;font-size:14px;line-height:1.55;color:${brand.textPrimary};">${inline(block.text, accent)}</p></div>`;

    case 'divider':
      return `<hr style="border:none;border-top:1px solid ${brand.borderCard};margin:28px 0;" />`;

    case 'signature':
      return `<p style="margin:24px 0 0;font-size:14px;color:${brand.textMuted};">${inline(block.text, accent)}</p>`;
  }
}

/** Apply placeholder substitution into every text field of the blocks. */
export function interpolateBlocks(
  blocks: OnboardingBlock[],
  ctx: Record<string, string>,
): OnboardingBlock[] {
  function sub(text: string): string {
    return text.replace(PLACEHOLDER_RE, (_m, key: string) => ctx[key] ?? `{{${key}}}`);
  }
  return blocks.map((b): OnboardingBlock => {
    switch (b.type) {
      case 'hero':
        return { type: 'hero', heading: sub(b.heading), subtext: b.subtext ? sub(b.subtext) : undefined };
      case 'paragraph':
        return { type: 'paragraph', text: sub(b.text) };
      case 'cta':
        return { type: 'cta', label: sub(b.label), url: sub(b.url) };
      case 'features':
        return { type: 'features', items: b.items.map(sub) };
      case 'callout':
        return { type: 'callout', label: sub(b.label), text: sub(b.text) };
      case 'divider':
        return { type: 'divider' };
      case 'signature':
        return { type: 'signature', text: sub(b.text) };
    }
  });
}

/** Minimal shape check so the API can accept untrusted input safely. */
export function isValidBlockArray(input: unknown): input is OnboardingBlock[] {
  if (!Array.isArray(input)) return false;
  return input.every(isValidBlock);
}

function isValidBlock(b: unknown): b is OnboardingBlock {
  if (!b || typeof b !== 'object') return false;
  const obj = b as Record<string, unknown>;
  switch (obj.type) {
    case 'hero':
      return typeof obj.heading === 'string' && (obj.subtext == null || typeof obj.subtext === 'string');
    case 'paragraph':
    case 'signature':
      return typeof obj.text === 'string';
    case 'cta':
      return typeof obj.label === 'string' && typeof obj.url === 'string';
    case 'features':
      return Array.isArray(obj.items) && obj.items.every((x) => typeof x === 'string');
    case 'callout':
      return typeof obj.label === 'string' && typeof obj.text === 'string';
    case 'divider':
      return true;
    default:
      return false;
  }
}

export const BLOCK_TYPE_LABELS: Record<OnboardingBlock['type'], string> = {
  hero: 'Hero heading',
  paragraph: 'Paragraph',
  cta: 'Button (CTA)',
  features: 'Bullet list',
  callout: 'Callout',
  divider: 'Divider',
  signature: 'Signature',
};

/**
 * Seeds a block array from an existing markdown body. Used by the "Start
 * from markdown" button so admins don't have to retype.
 */
export function seedBlocksFromMarkdown(markdown: string): OnboardingBlock[] {
  const out: OnboardingBlock[] = [];
  const chunks = markdown.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  for (const raw of chunks) {
    if (raw === '---' || raw === '***') {
      out.push({ type: 'divider' });
      continue;
    }
    if (/^#\s+/.test(raw)) {
      out.push({ type: 'hero', heading: raw.replace(/^#\s+/, '').trim() });
      continue;
    }
    const linkMatch = raw.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (linkMatch) {
      out.push({ type: 'cta', label: linkMatch[1], url: linkMatch[2] });
      continue;
    }
    const lines = raw.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      out.push({ type: 'features', items: lines.map((l) => l.replace(/^\s*[-*]\s+/, '')) });
      continue;
    }
    const sigMatch = raw.match(/^[\u2013\u2014-]\s+(.+)$/);
    if (sigMatch) {
      out.push({ type: 'signature', text: `\u2013 ${sigMatch[1]}` });
      continue;
    }
    out.push({ type: 'paragraph', text: raw });
  }
  return out;
}
