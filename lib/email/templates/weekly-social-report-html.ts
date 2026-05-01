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
 * Brand-tinted swatch shown when a top post has no thumbnail. Renders the
 * platform's first letter inside a soft rounded square so the row still feels
 * intentional instead of an empty grey block. Uses inline-only styles for
 * Outlook/Gmail compatibility.
 */
function platformSwatch(platform: string, brand: typeof NATIVZ | typeof AC): string {
  const letter = (prettyPlatform(platform).charAt(0) || '·').toUpperCase();
  return `
    <div style="
      width:64px;
      height:64px;
      border-radius:8px;
      background:linear-gradient(135deg, ${brand.blueSurface} 0%, ${brand.borderCard} 100%);
      color:${brand.blue};
      font-family:${brand.fontStack};
      font-size:24px;
      font-weight:700;
      letter-spacing:-0.02em;
      line-height:64px;
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

  // Per-platform followers breakdown
  const platformRows = report.followers.perPlatform.length
    ? report.followers.perPlatform
        .map(
          (p) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;">${prettyPlatform(p.platform)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textMuted};font-size:13px;text-align:right;">${fmtInt(p.current)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;text-align:right;font-weight:600;">${fmtDelta(p.delta)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="3" style="padding:12px 0;color:${BRAND.textMuted};font-size:13px;">No follower snapshots in range.</td></tr>`;

  // Top 3 posts. We render real thumbnails when available and fall back to a
  // platform-tinted swatch with the platform's first letter when not - empty
  // grey boxes were reading as "broken image" in inboxes.
  const topPostsRows = report.topPosts.length
    ? report.topPosts
        .map((p) => {
          const thumb = p.thumbnailUrl
            ? `<img src="${escapeHtml(p.thumbnailUrl)}" width="64" height="64" alt="" style="display:block;border-radius:8px;object-fit:cover;" />`
            : platformSwatch(p.platform, BRAND);
          const link = p.postUrl
            ? `<a href="${escapeHtml(p.postUrl)}" style="color:${BRAND.blue};text-decoration:none;font-weight:600;">View &rarr;</a>`
            : '';
          return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;width:76px;">${thumb}</td>
        <td style="padding:12px 0 12px 14px;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;">
          <p style="margin:0;color:${BRAND.textPrimary};font-size:13px;font-weight:600;letter-spacing:0.01em;">${prettyPlatform(p.platform)}</p>
          <p style="margin:4px 0 0 0;color:${BRAND.textBody};font-size:13px;line-height:1.5;">${escapeHtml(clip(p.caption, 110))}</p>
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

  // Upcoming shoots (only render block when there's at least one)
  const upcomingBlock = report.upcomingShoots.length
    ? `
        <hr class="divider" />
        <p class="detail-label">Upcoming shoots this week</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
          ${report.upcomingShoots
            .map((u) => {
              const dateStr = new Date(`${u.shootDate}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              return `<tr>
            <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textPrimary};font-size:13px;font-weight:600;width:140px;">${escapeHtml(dateStr)}</td>
            <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;">${escapeHtml(clip(u.notes, 120)) || '-'}</td>
          </tr>`;
            })
            .join('')}
        </table>`
    : '';

  return `
      <p class="subtext">${safeClient} &middot; ${safeRange}</p>
        ${kpiRow}

        <p class="detail-label">Followers by platform</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Platform</th>
              <th align="right" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Current</th>
              <th align="right" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Δ this week</th>
            </tr>
          </thead>
          <tbody>${platformRows}</tbody>
        </table>

        <hr class="divider" />
        <p class="detail-label">Top 3 posts (${fmtInt(report.aggregates.posts)} published)</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
          <tbody>${topPostsRows}</tbody>
        </table>

        ${upcomingBlock}`;
}
