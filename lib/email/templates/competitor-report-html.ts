/**
 * HTML body (inner card only — wrapped by `layout()` in resend) for the
 * recurring competitor report. Pattern matches `affiliate-weekly-report-html.ts`.
 */
import { EMAIL_BRAND as NATIVZ, AC_EMAIL_BRAND as AC } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';
import type {
  CompetitorReportCompetitor,
  CompetitorReportData,
} from '@/lib/reporting/competitor-report-types';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compactNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function percent(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}

function delta(n: number | null | undefined, fractional = false): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '-';
  const sign = n > 0 ? '+' : '';
  return fractional
    ? `${sign}${(n * 100).toFixed(1)}%`
    : `${sign}${compactNumber(n)}`;
}

function deltaColor(n: number | null | undefined, brand: typeof NATIVZ | typeof AC): string {
  if (n == null || n === 0) return brand.textMuted;
  return n > 0 ? '#34d399' : '#f87171';
}

function dateLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function rangeLabel(startIso: string, endIso: string): string {
  return `${dateLabel(startIso)} to ${dateLabel(endIso)}`;
}

function renderCompetitor(
  c: CompetitorReportCompetitor,
  brand: typeof NATIVZ | typeof AC,
  analyticsUrl: string,
): string {
  const platformLabel = PLATFORM_LABEL[c.platform] ?? c.platform;

  const topPostsHtml = c.top_posts.length
    ? c.top_posts
        .map(
          (p) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${brand.borderCard};vertical-align:top;">
            <p style="margin:0;color:${brand.textBody};font-size:13px;line-height:1.45;">
              ${escapeHtml(p.description ?? '(no caption)')}
            </p>
            <p style="margin:4px 0 0;color:${brand.textMuted};font-size:11px;">
              ${compactNumber(p.views ?? null)} views · ${compactNumber(p.likes ?? null)} likes · ${compactNumber(p.comments ?? null)} comments
            </p>
          </td>
        </tr>`,
        )
        .join('')
    : `<tr><td style="padding:8px 0;color:${brand.textMuted};font-size:12px;">No new posts captured this period.</td></tr>`;

  const errorBlock = c.scrape_error
    ? `<p style="margin:8px 0 0;padding:8px 12px;background:${brand.blueSurface};border-radius:6px;color:${brand.textMuted};font-size:11px;line-height:1.4;">⚠ Last scrape warning: ${escapeHtml(c.scrape_error)}</p>`
    : '';

  // Header is rendered as a 2-cell `<table>` instead of flexbox so Outlook +
  // narrower clients stop colliding the platform pill into the @username
  // line. The pill stays right-aligned and vertically centered with the
  // display name; the @username drops to its own muted line below. We also
  // dropped the duplicate "@user · platform" rendering since the badge
  // already calls out the platform.
  return `
  <div style="margin-top:20px;padding:18px 20px;border:1px solid ${brand.borderCard};border-radius:12px;background:${brand.bgCard};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="vertical-align:middle;">
          <p style="margin:0;color:${brand.textPrimary};font-size:15px;font-weight:700;letter-spacing:-0.01em;">
            ${escapeHtml(c.display_name ?? c.username)}
          </p>
          <p style="margin:3px 0 0;color:${brand.textMuted};font-size:12px;">
            @${escapeHtml(c.username)}
          </p>
        </td>
        <td align="right" style="vertical-align:middle;width:1%;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${brand.blueSurface};color:${brand.blue};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">
            ${platformLabel}
          </span>
        </td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">
      <tr>
        <td style="padding:6px 12px 6px 0;vertical-align:top;">
          <p style="margin:0;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Followers</p>
          <p style="margin:2px 0 0;color:${brand.textPrimary};font-size:18px;font-weight:600;">${compactNumber(c.followers)}</p>
          <p style="margin:2px 0 0;color:${deltaColor(c.followers_delta, brand)};font-size:11px;">${delta(c.followers_delta)}</p>
        </td>
        <td style="padding:6px 12px;vertical-align:top;">
          <p style="margin:0;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Avg views</p>
          <p style="margin:2px 0 0;color:${brand.textPrimary};font-size:18px;font-weight:600;">${compactNumber(c.avg_views)}</p>
          <p style="margin:2px 0 0;color:${deltaColor(c.avg_views_delta, brand)};font-size:11px;">${delta(c.avg_views_delta)}</p>
        </td>
        <td style="padding:6px 12px;vertical-align:top;">
          <p style="margin:0;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Engagement</p>
          <p style="margin:2px 0 0;color:${brand.textPrimary};font-size:18px;font-weight:600;">${percent(c.engagement_rate)}</p>
          <p style="margin:2px 0 0;color:${deltaColor(c.engagement_rate_delta, brand)};font-size:11px;">${delta(c.engagement_rate_delta, true)}</p>
        </td>
        <td style="padding:6px 0 6px 12px;vertical-align:top;">
          <p style="margin:0;color:${brand.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:1px;">Posts</p>
          <p style="margin:2px 0 0;color:${brand.textPrimary};font-size:18px;font-weight:600;">${compactNumber(c.posts_count)}</p>
          <p style="margin:2px 0 0;color:${deltaColor(c.posts_count_delta, brand)};font-size:11px;">${delta(c.posts_count_delta)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 4px;color:${brand.textMuted};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Top posts this period</p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%">${topPostsHtml}</table>
    ${errorBlock}
  </div>`;
}

export function buildCompetitorReportCardHtml(opts: {
  data: CompetitorReportData;
  agency?: AgencyBrand;
  analyticsUrl: string;
}): string {
  const brand = opts.agency === 'anderson' ? AC : NATIVZ;
  const safeClient = escapeHtml(opts.data.client_name);
  const range = rangeLabel(opts.data.period_start, opts.data.period_end);

  const competitorsHtml = opts.data.competitors.length
    ? opts.data.competitors
        .map((c) => renderCompetitor(c, brand, opts.analyticsUrl))
        .join('')
    : `<p style="margin:20px 0;padding:16px;border:1px dashed ${brand.borderCard};border-radius:10px;color:${brand.textMuted};font-size:13px;text-align:center;">
        No competitor snapshots captured this period. Benchmark rows exist but the scraper
        hasn't refreshed yet, expect data on the next cron tick.
      </p>`;

  return `
      <p class="subtext">${safeClient} · ${escapeHtml(range)} · watching ${opts.data.competitors.length} competitor${opts.data.competitors.length === 1 ? '' : 's'}</p>
        ${competitorsHtml}
        <p style="margin-top:24px;text-align:center;">
          <a href="${escapeHtml(opts.analyticsUrl)}"
             style="display:inline-block;padding:10px 20px;border-radius:999px;background:${brand.blueCta};color:#fff;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:0.5px;">
            Open benchmarking &rarr;
          </a>
        </p>`;
}
