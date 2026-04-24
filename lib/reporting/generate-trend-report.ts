import { createAdminClient } from '@/lib/supabase/admin';
import { sendTrendReportEmail } from '@/lib/email/resend';
import { buildTrendReportData, nextTrendRunAt, trendPeriodStartFor } from './build-trend-report';
import { renderTrendReportPdf } from './render-trend-report-pdf';
import type { TrendReportCadence } from './trend-report-types';

interface SubscriptionRow {
  id: string;
  client_id: string | null;
  organization_id: string | null;
  name: string;
  topic_query: string;
  keywords: string[];
  brand_names: string[];
  platforms: string[];
  cadence: TrendReportCadence;
  recipients: string[];
  include_portal_users: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
}

export interface GenerateTrendReportResult {
  ok: boolean;
  reportId?: string;
  resendId?: string | null;
  error?: string;
  skippedReason?: 'no_recipients' | 'client_missing';
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
}

async function resolvePortalRecipients(orgId: string | null): Promise<string[]> {
  if (!orgId) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('email')
    .eq('organization_id', orgId)
    .eq('role', 'viewer');
  return (data ?? []).map((r) => r.email).filter((e): e is string => !!e);
}

async function resolveClientInfo(
  clientId: string | null,
): Promise<{ name: string; agency: string }> {
  if (!clientId) return { name: 'All clients', agency: 'nativz' };
  const admin = createAdminClient();
  const { data } = await admin
    .from('clients')
    .select('name, agency')
    .eq('id', clientId)
    .maybeSingle();
  return {
    name: data?.name ?? 'Unknown client',
    agency: data?.agency ?? 'nativz',
  };
}

export async function generateAndSendTrendReport(
  subscription: SubscriptionRow,
  options: { isTestOverride?: boolean } = {},
): Promise<GenerateTrendReportResult> {
  const admin = createAdminClient();
  const now = new Date();
  const periodEnd = now;
  const periodStart = subscription.last_run_at
    ? new Date(subscription.last_run_at)
    : trendPeriodStartFor(now, subscription.cadence);

  async function advanceSchedule() {
    await admin
      .from('trend_report_subscriptions')
      .update({
        last_run_at: now.toISOString(),
        next_run_at: nextTrendRunAt(now, subscription.cadence).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', subscription.id);
  }

  try {
    const clientInfo = await resolveClientInfo(subscription.client_id);

    let recipients = [...(subscription.recipients ?? [])];
    if (subscription.include_portal_users) {
      const portalEmails = await resolvePortalRecipients(subscription.organization_id);
      recipients = Array.from(new Set([...recipients, ...portalEmails]));
    }
    if (recipients.length === 0) {
      await advanceSchedule();
      return { ok: false, skippedReason: 'no_recipients', error: 'No recipients configured' };
    }

    const data = await buildTrendReportData({
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      clientId: subscription.client_id,
      clientName: clientInfo.name,
      clientAgency: clientInfo.agency,
      organizationId: subscription.organization_id,
      topicQuery: subscription.topic_query,
      keywords: subscription.keywords ?? [],
      brandNames: subscription.brand_names ?? [],
      platforms: subscription.platforms ?? [],
      cadence: subscription.cadence,
      periodStart,
      periodEnd,
    });

    const dashboardUrl = `${appBaseUrl()}/finder/monitors`;

    const pdfBuffer = await renderTrendReportPdf(data);
    const pdfFilename = `trend-report-${data.subscription_name.toLowerCase().replace(/\s+/g, '-')}-${periodEnd.toISOString().slice(0, 10)}.pdf`;

    const sendResult = await sendTrendReportEmail({
      to: recipients,
      data,
      dashboardUrl,
      pdfAttachment: pdfBuffer ? { filename: pdfFilename, content: pdfBuffer } : null,
      isTestOverride: options.isTestOverride,
    });

    const insert = await admin
      .from('trend_reports')
      .insert({
        subscription_id: subscription.id,
        client_id: subscription.client_id,
        organization_id: subscription.organization_id,
        period_start: data.period_start,
        period_end: data.period_end,
        summary: data.summary,
        findings: data.findings as unknown as Record<string, unknown>,
        report_html: sendResult.html,
        report_json: data as unknown as Record<string, unknown>,
        email_resend_id: sendResult.ok ? sendResult.id : null,
        email_status: sendResult.ok ? 'sent' : 'failed',
        email_error: sendResult.ok ? null : sendResult.error,
      })
      .select('id')
      .single();

    const reportId = insert.data?.id ?? undefined;
    await advanceSchedule();

    if (!sendResult.ok) {
      return { ok: false, reportId, error: sendResult.error };
    }
    return { ok: true, reportId, resendId: sendResult.id };
  } catch (err) {
    await advanceSchedule().catch(() => {});
    throw err;
  }
}
