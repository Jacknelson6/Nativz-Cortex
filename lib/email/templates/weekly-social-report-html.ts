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

  // KPI tiles — 3 columns: followers delta, aggregate views, aggregate engagement
  const kpiRow = `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 16px 0;">
      <tr>
        <td style="padding:12px;background:${BRAND.blueSurface};border-radius:12px;width:33%;">
          <p class="detail-label" style="margin:0;color:${BRAND.textMuted};">Followers Δ</p>
          <p class="detail-value" style="margin:4px 0 0 0;font-size:22px;color:${BRAND.textPrimary};">${fmtDelta(report.followers.delta)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:${BRAND.blueSurface};border-radius:12px;width:33%;">
          <p class="detail-label" style="margin:0;color:${BRAND.textMuted};">Views this week</p>
          <p class="detail-value" style="margin:4px 0 0 0;font-size:22px;color:${BRAND.textPrimary};">${fmtInt(report.aggregates.views)}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background:${BRAND.blueSurface};border-radius:12px;width:33%;">
          <p class="detail-label" style="margin:0;color:${BRAND.textMuted};">Engagement</p>
          <p class="detail-value" style="margin:4px 0 0 0;font-size:22px;color:${BRAND.textPrimary};">${fmtInt(report.aggregates.engagement)}</p>
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

  // Top 3 posts
  const topPostsRows = report.topPosts.length
    ? report.topPosts
        .map((p) => {
          const thumb = p.thumbnailUrl
            ? `<img src="${escapeHtml(p.thumbnailUrl)}" width="64" height="64" alt="" style="display:block;border-radius:8px;object-fit:cover;" />`
            : `<div style="width:64px;height:64px;border-radius:8px;background:${BRAND.borderCard};"></div>`;
          const link = p.postUrl
            ? `<a href="${escapeHtml(p.postUrl)}" style="color:${BRAND.blue};text-decoration:none;">View →</a>`
            : '';
          return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;width:72px;">${thumb}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.borderCard};vertical-align:top;">
          <p style="margin:0;color:${BRAND.textPrimary};font-size:13px;font-weight:600;">${prettyPlatform(p.platform)}</p>
          <p style="margin:2px 0 0 0;color:${BRAND.textBody};font-size:12px;line-height:1.4;">${escapeHtml(clip(p.caption, 90))}</p>
          <p style="margin:4px 0 0 0;color:${BRAND.textMuted};font-size:11px;">${fmtInt(p.views)} views &middot; ${fmtInt(p.engagement)} engagement &middot; ${link}</p>
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
            <td style="padding:8px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;">${escapeHtml(clip(u.notes, 120)) || '—'}</td>
          </tr>`;
            })
            .join('')}
        </table>`
    : '';

  return `
      <div class="card">
        <h1 class="heading">Weekly recap</h1>
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

        ${upcomingBlock}
      </div>`;
}
