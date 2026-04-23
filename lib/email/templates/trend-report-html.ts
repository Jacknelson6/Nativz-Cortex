import { EMAIL_BRAND as NATIVZ, AC_EMAIL_BRAND as AC } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';
import type {
  TrendReportBrandBucket,
  TrendReportData,
  TrendReportKeywordBucket,
  TrendReportMention,
} from '@/lib/reporting/trend-report-types';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sentimentColour(
  sentiment: TrendReportMention['sentimentGuess'],
  brand: typeof NATIVZ | typeof AC,
): string {
  switch (sentiment) {
    case 'positive':
      return '#34d399';
    case 'negative':
      return '#f87171';
    case 'mixed':
      return '#fbbf24';
    case 'neutral':
      return brand.blue;
    default:
      return brand.textMuted;
  }
}

function dateLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function renderBrandBuckets(
  buckets: TrendReportBrandBucket[],
  brand: typeof NATIVZ | typeof AC,
): string {
  if (!buckets.length) return '';
  const rows = buckets
    .filter((b) => b.mention_count > 0)
    .map(
      (b) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${brand.borderCard};color:${brand.textBody};font-size:13px;">${escapeHtml(b.brand_name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${brand.borderCard};color:${brand.textPrimary};font-size:13px;text-align:right;font-weight:600;">${b.mention_count}</td>
      </tr>`,
    )
    .join('');
  if (!rows) return '';
  return `
    <p style="margin:20px 0 8px;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Brand mentions this period</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
}

function renderKeywordBuckets(
  buckets: TrendReportKeywordBucket[],
  brand: typeof NATIVZ | typeof AC,
): string {
  const nonZero = buckets.filter((b) => b.mention_count > 0);
  if (!nonZero.length) return '';
  const chips = nonZero
    .map(
      (b) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;border-radius:999px;background:${brand.blueSurface};color:${brand.blue};font-size:11px;">${escapeHtml(b.keyword)} · ${b.mention_count}</span>`,
    )
    .join('');
  return `
    <p style="margin:20px 0 8px;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Keywords spotted</p>
    <div>${chips}</div>`;
}

function renderThemes(themes: string[], brand: typeof NATIVZ | typeof AC): string {
  if (!themes.length) return '';
  const items = themes.map((t) => `<li style="margin:4px 0;color:${brand.textBody};">${escapeHtml(t)}</li>`).join('');
  return `
    <p style="margin:20px 0 4px;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Themes</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;">${items}</ul>`;
}

function renderTopMentions(
  mentions: TrendReportMention[],
  brand: typeof NATIVZ | typeof AC,
): string {
  if (!mentions.length) {
    return `<p style="margin:20px 0;padding:16px;border:1px dashed ${brand.borderCard};border-radius:10px;color:${brand.textMuted};font-size:13px;text-align:center;">
        No notable mentions captured this period. The monitor will keep listening.
      </p>`;
  }
  const rows = mentions
    .slice(0, 10)
    .map((m) => {
      const tags = [...m.matchedBrands, ...m.matchedKeywords]
        .map((t) => `<span style="display:inline-block;margin:0 4px 4px 0;padding:1px 6px;border-radius:4px;background:${brand.blueSurface};color:${brand.blue};font-size:10px;">${escapeHtml(t)}</span>`)
        .join('');
      const sentimentDot = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${sentimentColour(m.sentimentGuess, brand)};margin-right:8px;"></span>`;
      return `
        <div style="padding:12px 0;border-bottom:1px solid ${brand.borderCard};">
          <p style="margin:0;color:${brand.textPrimary};font-size:13px;font-weight:600;">${sentimentDot}<a href="${escapeHtml(m.url)}" style="color:${brand.textPrimary};text-decoration:none;">${escapeHtml(m.title)}</a></p>
          <p style="margin:4px 0 0;color:${brand.textMuted};font-size:11px;">${escapeHtml(m.source_domain)}${m.publishedDate ? ` · ${escapeHtml(dateLabel(m.publishedDate))}` : ''}</p>
          <p style="margin:4px 0 0;color:${brand.textBody};font-size:12px;line-height:1.5;">${escapeHtml(m.snippet)}</p>
          ${tags ? `<div style="margin-top:6px;">${tags}</div>` : ''}
        </div>`;
    })
    .join('');
  return `
    <p style="margin:24px 0 8px;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Top mentions</p>
    <div>${rows}</div>`;
}

export function buildTrendReportCardHtml(opts: {
  data: TrendReportData;
  agency?: AgencyBrand;
  dashboardUrl: string;
}): string {
  const brand = opts.agency === 'anderson' ? AC : NATIVZ;
  const range = `${dateLabel(opts.data.period_start)} – ${dateLabel(opts.data.period_end)}`;

  return `
      <div class="card">
        <h1 class="heading">${escapeHtml(opts.data.subscription_name)}</h1>
        <p class="subtext">${escapeHtml(opts.data.client_name)} · ${escapeHtml(range)} · ${opts.data.findings.total_mentions} mentions</p>

        <p style="margin:16px 0 0;padding:14px 16px;border-radius:8px;background:${brand.blueSurface};color:${brand.textBody};font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(opts.data.summary)}</p>

        ${renderThemes(opts.data.findings.themes, brand)}
        ${renderBrandBuckets(opts.data.findings.brand_buckets, brand)}
        ${renderKeywordBuckets(opts.data.findings.keyword_buckets, brand)}
        ${renderTopMentions(opts.data.findings.top_mentions, brand)}

        <p style="margin-top:24px;text-align:center;">
          <a href="${escapeHtml(opts.dashboardUrl)}"
             style="display:inline-block;padding:10px 20px;border-radius:999px;background:${brand.blueCta};color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.5px;">
            Open trend monitors →
          </a>
        </p>
      </div>`;
}
