/**
 * Weekly branded social report — inner card HTML (NAT-43).
 *
 * Wrapped by `layout()` in `lib/email/resend.ts` so the Nativz / Anderson
 * Collaborative skin gets applied automatically. Totals are raw numbers per
 * Jack's call — no percentage-change chrome.
 */
import { EMAIL_BRAND as NATIVZ, AC_EMAIL_BRAND as AC } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { WeeklySocialReport } from '@/lib/reporting/weekly-social-report';

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDelta(n: number): string {
  if (n === 0) return '0';
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${fmtInt(n)}`;
}

function escapeHtml(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettyPlatform(p: string): string {
  const map: Record<string, string> = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
    pinterest: 'Pinterest',
    twitter: 'X',
    threads: 'Threads',
    googlebusiness: 'Google Business',
  };
  return map[p.toLowerCase()] ?? p;
}

/**
 * Brand-tinted 9:16 swatch shown when a top post has no thumbnail. Matches
 * the portrait aspect of short-form video so the row reads as a natural
 * video preview slot, not a blank square. Uses inline-only styles for
 * Outlook/Gmail compatibility.
 */
function platformSwatch(platform: string, brand: typeof NATIVZ | typeof AC): string {
  const letter = (prettyPlatform(platform).charAt(0) || '·').toUpperCase();
  return `
    <div style="
      width:64px;
      height:114px;
      border-radius:8px;
      background:linear-gradient(135deg, ${brand.blueSurface} 0%, ${brand.borderCard} 100%);
      color:${brand.blue};
      font-family:${brand.fontStack};
      font-size:24px;
      font-weight:700;
      letter-spacing:-0.02em;
      line-height:114px;
      text-align:center;
    ">${letter}</div>`;
}

function clip(s: string | null, n: number): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= n) return trimmed;
  return `${trimmed.slice(0, n - 1)}…`;
}

export function buildWeeklySocialReportCardHtml(opts: {
  report: WeeklySocialReport;
  rangeLabel: string;
  agency: AgencyBrand;
}): string {
  const { report, rangeLabel, agency } = opts;
  const BRAND = agency === 'anderson' ? AC : NATIVZ;
  const safeClient = escapeHtml(report.clientName);
  const safeRange = escapeHtml(rangeLabel);

  // KPI tiles - 3 columns: followers delta, aggregate views, aggregate
  // engagement. Padding is generous so the tiles read like proper cards in
  // wide clients (Apple Mail, Gmail web), and the tile label sits inside its
  // own line with a consistent letter-spacing so the trio reads as a row of
  // KPIs rather than three random numbers.
  const followersDeltaColor =
    report.followers.delta > 0
      ? '#0a8a4a'
      : report.followers.delta < 0
      ? '#b42318'
      : BRAND.textPrimary;
  const tileBase =
    `padding:16px 18px;background:${BRAND.blueSurface};border:1px solid ${BRAND.border};border-radius:12px;width:33%;`;
  const labelBase =
    `margin:0;color:${BRAND.textMuted};font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;`;
  const valueBase =
    `margin:6px 0 0;font-size:24px;font-weight:700;letter-spacing:-0.01em;line-height:1.15;`;
  const kpiRow = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 22px;">
      <tr>
        <td style="${tileBase}">
          <p style="${labelBase}">Followers &Delta;</p>
          <p style="${valueBase}color:${followersDeltaColor};">${fmtDelta(report.followers.delta)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="${tileBase}">
          <p style="${labelBase}">Views this week</p>
          <p style="${valueBase}color:${BRAND.textPrimary};">${fmtInt(report.aggregates.views)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="${tileBase}">
          <p style="${labelBase}">Engagement</p>
          <p style="${valueBase}color:${BRAND.textPrimary};">${fmtInt(report.aggregates.engagement)}</p>
        </td>
      </tr>
    </table>`;

  // Top 3 posts. Thumbnails are rendered at 9:16 (short-form video aspect)
  // so the row reads as a video preview, not a generic 64x64 chip. We pull
  // the real platform thumbnail when available and fall back to a brand-
  // tinted portrait swatch when not - empty grey boxes read as "broken
  // image" in inboxes.
  // NOTE: per Jack's call, platform attribution is intentionally NOT shown
  // on individual posts - the per-platform breakdown was removed for the
  // same data-accuracy reason. Captions + metrics carry the row.
  const topPostsRows = report.topPosts.length
    ? report.topPosts
        .map((p) => {
          const thumb = p.thumbnailUrl
            ? `<img src="${escapeHtml(p.thumbnailUrl)}" width="64" height="114" alt="" style="display:block;border-radius:8px;object-fit:cover;" />`
            : platformSwatch(p.platform, BRAND);
          const link = p.postUrl
            ? `<a href="${escapeHtml(p.postUrl)}" style="color:${BRAND.blue};text-decoration:none;font-weight:600;">View &rarr;</a>`
            : '';
          return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;width:76px;">${thumb}</td>
        <td style="padding:12px 0 12px 14px;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;">
          <p style="margin:0;color:${BRAND.textBody};font-size:13px;line-height:1.5;">${escapeHtml(clip(p.caption, 110))}</p>
          <p style="margin:6px 0 0 0;color:${BRAND.textMuted};font-size:11px;">
            ${fmtInt(p.views)} views
            <span style="color:${BRAND.borderCard};">&nbsp;|&nbsp;</span>
            ${fmtInt(p.engagement)} engagement
            ${link ? `<span style="color:${BRAND.borderCard};">&nbsp;|&nbsp;</span> ${link}` : ''}
          </p>
        </td>
      </tr>`;
        })
        .join('')
    : `<tr><td style="padding:12px 0;color:${BRAND.textMuted};font-size:13px;">No published posts in range.</td></tr>`;

  return `
      <p class="subtext">${safeClient} &middot; ${safeRange}</p>
        ${kpiRow}

        <p class="detail-label">Top 3 posts (${fmtInt(report.aggregates.posts)} published)</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
          <tbody>${topPostsRows}</tbody>
        </table>`;
}
