// SPY-10 T09: HTML + plain-text renderer for prospect digests.
//
// Wraps the structured payload + LLM-polished subject/opening in the shared
// `layout()` shell from lib/email/resend.ts so the digest visually matches
// every other Nativz email. Plain-text variant produced in parallel for
// clients that strip HTML.
//
// CTA + footer unsubscribe links must be passed in pre-tokenized (caller
// owns the `/r/d/<event_id>?to=...` event-id minting; here we just embed
// the URLs).
//
// READ docs/email-style.md before editing.

import { layout } from '@/lib/email/resend';
import type {
  DigestKind,
  WeeklyCompetitorPayload,
  MonthlyFormatPayload,
} from './types';

export interface RenderDigestInput {
  brandName: string;
  kind: DigestKind;
  subject: string;
  opening: string;
  payload: WeeklyCompetitorPayload | MonthlyFormatPayload;
  ctaUrl: string; // tracked /r/d/<event_id>?to=... URL
  ctaLabel: string;
  unsubscribePerTypeUrl: string;
  unsubscribeAllUrl: string;
  salesRepName: string;
  salesRepEmail: string;
}

export interface RenderedDigest {
  html: string;
  text: string;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isWeekly(
  payload: WeeklyCompetitorPayload | MonthlyFormatPayload,
  kind: DigestKind,
): payload is WeeklyCompetitorPayload {
  return kind === 'weekly_competitor';
}

function highlightsHtmlWeekly(p: WeeklyCompetitorPayload): string {
  return p.highlights
    .map(
      (h, i) => `
      <div style="margin: 0 0 18px 0;">
        <p class="small" style="margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.08em;">
          ${i + 1}. ${esc(h.competitor_platform)} / @${esc(h.competitor_handle)}
        </p>
        <p class="heading" style="font-size: 16px; margin: 0 0 6px 0;">${esc(h.headline)}</p>
        <p class="subtext" style="margin: 0;">${esc(h.body)}</p>
      </div>
    `,
    )
    .join('');
}

function highlightsHtmlMonthly(p: MonthlyFormatPayload): string {
  return p.formats
    .map(
      (f, i) => `
      <div style="margin: 0 0 20px 0;">
        <p class="small" style="margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.08em;">
          ${i + 1}. Format
        </p>
        <p class="heading" style="font-size: 16px; margin: 0 0 6px 0;">${esc(f.format_name)}</p>
        <p class="subtext" style="margin: 0 0 6px 0;">${esc(f.why_it_works)}</p>
        ${
          f.sample_post_urls.length > 0
            ? `<p class="small" style="margin: 0;">Examples: ${f.sample_post_urls
                .slice(0, 3)
                .map(
                  (u, j) =>
                    `<a href="${esc(u)}" style="color: inherit; text-decoration: underline;">post ${j + 1}</a>`,
                )
                .join(' &middot; ')}</p>`
            : ''
        }
      </div>
    `,
    )
    .join('');
}

export function renderDigest(input: RenderDigestInput): RenderedDigest {
  const body = isWeekly(input.payload, input.kind)
    ? highlightsHtmlWeekly(input.payload)
    : highlightsHtmlMonthly(input.payload);

  const eyebrowText =
    input.kind === 'weekly_competitor' ? 'Weekly competitor digest' : 'Monthly format report';

  const inner = `
      <p class="subtext">${esc(input.opening)}</p>
      ${body}
      <div class="button-wrap" style="margin: 24px 0 0 0;">
        <a href="${esc(input.ctaUrl)}" class="button">${esc(input.ctaLabel)}</a>
      </div>
      <hr class="divider" />
      <p class="small">
        Sent by ${esc(input.salesRepName)} at Nativz.
        Reply to this email or reach ${esc(input.salesRepName)} at
        <a href="mailto:${esc(input.salesRepEmail)}" style="color: inherit; text-decoration: underline;">${esc(input.salesRepEmail)}</a>.
      </p>
      <p class="small" style="margin-top: 10px;">
        Too much email?
        <a href="${esc(input.unsubscribePerTypeUrl)}" style="color: inherit; text-decoration: underline;">Unsubscribe from ${input.kind === 'weekly_competitor' ? 'this weekly digest' : 'this monthly report'}</a>
        &nbsp;or&nbsp;
        <a href="${esc(input.unsubscribeAllUrl)}" style="color: inherit; text-decoration: underline;">stop all digests</a>.
      </p>
    `;

  const html = layout(inner, 'nativz', {
    eyebrow: eyebrowText,
    heroTitle: input.subject,
  });

  const lines: string[] = [];
  lines.push(input.subject);
  lines.push('');
  lines.push(input.opening);
  lines.push('');
  if (isWeekly(input.payload, input.kind)) {
    for (let i = 0; i < input.payload.highlights.length; i++) {
      const h = input.payload.highlights[i];
      lines.push(`${i + 1}. ${h.competitor_platform} / @${h.competitor_handle}`);
      lines.push(`   ${h.headline}`);
      lines.push(`   ${h.body}`);
      lines.push('');
    }
  } else {
    for (let i = 0; i < input.payload.formats.length; i++) {
      const f = input.payload.formats[i];
      lines.push(`${i + 1}. ${f.format_name}`);
      lines.push(`   ${f.why_it_works}`);
      for (const u of f.sample_post_urls.slice(0, 3)) lines.push(`   ${u}`);
      lines.push('');
    }
  }
  lines.push(`${input.ctaLabel}: ${input.ctaUrl}`);
  lines.push('');
  lines.push(`Sent by ${input.salesRepName} (Nativz). Reply or email ${input.salesRepEmail}.`);
  lines.push(`Unsubscribe (this type): ${input.unsubscribePerTypeUrl}`);
  lines.push(`Stop all digests: ${input.unsubscribeAllUrl}`);

  return { html, text: lines.join('\n') };
}
