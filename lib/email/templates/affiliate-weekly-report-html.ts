/**
 * Saved HTML for the weekly affiliate performance email (inner card only — wrapped by `layout()` in resend).
 *
 * Brand-swappable: accepts optional `agency` param ('nativz' | 'anderson') and
 * picks the right palette so Anderson Collaborative clients don't see Nativz
 * cyan in their affiliate digest. Defaults to Nativz for back-compat with
 * any existing caller that doesn't pass it.
 */
import { EMAIL_BRAND as NATIVZ, AC_EMAIL_BRAND as AC } from '@/lib/email/brand-tokens';
import type { AgencyBrand } from '@/lib/agency/detect';

export type AffiliateWeeklyReportKpis = {
  newAffiliates: number;
  totalAffiliates: number;
  activeAffiliates: number;
  referralsInPeriod: number;
  periodRevenue: number;
  totalClicks: number;
};

export type AffiliateWeeklyReportTopRow = { name: string; revenue: number; referrals: number };

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAffiliateWeeklyReportCardHtml(opts: {
  clientName: string;
  rangeLabel: string;
  kpis: AffiliateWeeklyReportKpis;
  topAffiliates: AffiliateWeeklyReportTopRow[];
  agency?: AgencyBrand;
}): string {
  const BRAND = opts.agency === 'anderson' ? AC : NATIVZ;
  const safeClient = escapeHtml(opts.clientName);
  const safeRange = escapeHtml(opts.rangeLabel);

  const topRows = opts.topAffiliates
    .slice(0, 8)
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;">${escapeHtml(a.name)}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textBody};font-size:13px;text-align:right;">${formatUsd(a.revenue)}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND.borderCard};color:${BRAND.textMuted};font-size:13px;text-align:right;">${a.referrals}</td>
      </tr>`,
    )
    .join('');

  return `
      <p class="subtext">${safeClient} &middot; ${safeRange}</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;">
          <tr>
            <td style="padding:8px 12px 8px 0;vertical-align:top;">
              <p class="detail-label">Referrals (period)</p>
              <p class="detail-value">${opts.kpis.referralsInPeriod}</p>
            </td>
            <td style="padding:8px 12px;vertical-align:top;">
              <p class="detail-label">Revenue (period)</p>
              <p class="detail-value">${formatUsd(opts.kpis.periodRevenue)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px 8px 0;vertical-align:top;">
              <p class="detail-label">Active affiliates</p>
              <p class="detail-value">${opts.kpis.activeAffiliates}</p>
            </td>
            <td style="padding:8px 12px;vertical-align:top;">
              <p class="detail-label">New affiliates</p>
              <p class="detail-value">${opts.kpis.newAffiliates}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px 8px 0;vertical-align:top;">
              <p class="detail-label">Total affiliates</p>
              <p class="detail-value">${opts.kpis.totalAffiliates}</p>
            </td>
            <td style="padding:8px 12px;vertical-align:top;">
              <p class="detail-label">Clicks (program total)</p>
              <p class="detail-value">${opts.kpis.totalClicks.toLocaleString('en-US')}</p>
            </td>
          </tr>
        </table>
        <hr class="divider" />
        <p class="detail-label">Top affiliates by period revenue</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
          <thead>
            <tr>
              <th align="left" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Affiliate</th>
              <th align="right" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Revenue</th>
              <th align="right" style="padding:8px 0;color:${BRAND.textMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Referrals</th>
            </tr>
          </thead>
          <tbody>${topRows || `<tr><td colspan="3" style="padding:16px 0;color:${BRAND.textMuted};font-size:13px;">No attributed sales in this range.</td></tr>`}</tbody>
        </table>`;
}
