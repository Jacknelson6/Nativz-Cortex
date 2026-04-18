import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { logUsage } from '@/lib/ai/usage';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * Minimal, safe Markdown-ish → HTML for admin-authored product updates.
 * Supports paragraphs, `## headings`, and `- bullets`. Everything else is
 * escaped to prevent injection from admin-authored copy.
 */
function renderUpdateBody(markdown: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const parts: string[] = [];

  for (const block of blocks) {
    if (/^##\s+/.test(block)) {
      parts.push(
        `<h2 style="margin:24px 0 8px;font-size:16px;font-weight:700;letter-spacing:-0.01em;">${escape(
          block.replace(/^##\s+/, ''),
        )}</h2>`,
      );
      continue;
    }

    const lines = block.split('\n');
    const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
    if (isList) {
      const items = lines
        .map((l) => l.replace(/^\s*[-*]\s+/, ''))
        .map((li) => `<li style="padding:4px 0;">${escape(li)}</li>`)
        .join('');
      parts.push(`<ul style="margin:0 0 16px 18px;padding:0;line-height:1.6;">${items}</ul>`);
      continue;
    }

    parts.push(
      `<p style="margin:0 0 16px 0;line-height:1.65;">${escape(block).replace(/\n/g, '<br/>')}</p>`,
    );
  }

  return parts.join('\n');
}

export interface SendProductionUpdateInput {
  to: string;
  recipientName: string | null;
  title: string;
  bodyMarkdown: string;
  agency: AgencyBrand;
  ctaUrl?: string;
}

export async function sendProductionUpdateEmail(input: SendProductionUpdateInput) {
  const greeting = input.recipientName?.trim() || 'there';
  const body = renderUpdateBody(input.bodyMarkdown);
  const ctaBlock = input.ctaUrl
    ? `<div class="button-wrap"><a href="${input.ctaUrl}" class="button">Open Cortex &rarr;</a></div>`
    : '';

  const result = await client().emails.send({
    from: getFromAddress(input.agency),
    replyTo: getReplyTo(input.agency),
    to: input.to,
    subject: input.title,
    html: layout(
      `
        <div class="card">
          <p class="small" style="margin-bottom:16px;">Hey ${greeting
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')},</p>
          <h1 class="heading">${input.title
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</h1>
          ${body}
          ${ctaBlock}
          <hr class="divider" />
          <p class="small">You're receiving this because your portal account is active on Cortex.</p>
        </div>
      `,
      input.agency,
    ),
  });

  logUsage({
    service: 'resend',
    model: 'email-api',
    feature: 'email_delivery',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  }).catch(() => {});

  return result;
}
