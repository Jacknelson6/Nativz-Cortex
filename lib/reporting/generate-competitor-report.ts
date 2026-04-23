import { createAdminClient } from '@/lib/supabase/admin';
import { sendCompetitorReportEmail } from '@/lib/email/resend';
import { buildCompetitorReportData, nextRunAt, periodStartFor } from './build-competitor-report';
import { renderCompetitorReportPdf } from './render-competitor-report-pdf';
import type { CompetitorReportCadence } from './competitor-report-types';

interface SubscriptionRow {
  id: string;
  client_id: string;
  organization_id: string | null;
  cadence: CompetitorReportCadence;
  recipients: string[];
  include_portal_users: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
}

export interface GenerateReportResult {
  ok: boolean;
  reportId?: string;
  resendId?: string | null;
  error?: string;
  skippedReason?: 'no_benchmarks' | 'no_recipients' | 'client_missing';
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

/**
 * Run one subscription end-to-end: build the report payload, email it,
 * write a row in `competitor_reports`, and advance `next_run_at`. Safe to
 * call from the daily cron or from the "Run now" admin action.
 */
export async function generateAndSendReport(
  subscription: SubscriptionRow,
  options: { bypassSchedule?: boolean; isTestOverride?: boolean } = {},
): Promise<GenerateReportResult> {
  const admin = createAdminClient();
  const now = new Date();
  const periodEnd = now;
  const periodStart = subscription.last_run_at
    ? new Date(subscription.last_run_at)
    : periodStartFor(now, subscription.cadence);

  // Always advance next_run_at on any terminal outcome (success, skip, or
  // failure) so the cron doesn't loop forever on a subscription whose
  // preconditions aren't met. Admin sees the state and can edit/retry.
  async function advanceSchedule() {
    await admin
      .from('competitor_report_subscriptions')
      .update({
        last_run_at: now.toISOString(),
        next_run_at: nextRunAt(now, subscription.cadence).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', subscription.id);
  }

  try {
    const data = await buildCompetitorReportData({
      subscriptionId: subscription.id,
      clientId: subscription.client_id,
      organizationId: subscription.organization_id,
      cadence: subscription.cadence,
      periodStart,
      periodEnd,
    });

    if (!data) {
      await advanceSchedule();
      return { ok: false, skippedReason: 'client_missing', error: 'Client not found' };
    }

    let recipients = [...(subscription.recipients ?? [])];
    if (subscription.include_portal_users) {
      const portalEmails = await resolvePortalRecipients(subscription.organization_id);
      recipients = Array.from(new Set([...recipients, ...portalEmails]));
    }

    if (recipients.length === 0) {
      await advanceSchedule();
      return { ok: false, skippedReason: 'no_recipients', error: 'No recipients configured' };
    }

    const analyticsUrl = `${appBaseUrl()}/admin/analytics?tab=benchmarking&client=${subscription.client_id}`;

    // Render the PDF alongside the email. Failures are tolerated — a null
    // buffer means we send the email without an attachment and the in-app
    // "Download PDF" link shows "PDF unavailable".
    const pdfBuffer = await renderCompetitorReportPdf(data);
    const pdfFilename = `competitor-report-${data.client_name.toLowerCase().replace(/\s+/g, '-')}-${new Date(data.period_end).toISOString().slice(0, 10)}.pdf`;

    const sendResult = await sendCompetitorReportEmail({
      to: recipients,
      data,
      analyticsUrl,
      pdfAttachment: pdfBuffer ? { filename: pdfFilename, content: pdfBuffer } : null,
      isTestOverride: options.isTestOverride,
    });

    const reportRow = {
      subscription_id: subscription.id,
      client_id: subscription.client_id,
      organization_id: subscription.organization_id,
      period_start: data.period_start,
      period_end: data.period_end,
      report_html: sendResult.html,
      report_json: data as unknown as Record<string, unknown>,
      pdf_storage_path: null,
      email_resend_id: sendResult.ok ? sendResult.id : null,
      email_status: sendResult.ok ? 'sent' : 'failed',
      email_error: sendResult.ok ? null : sendResult.error,
    };

    const insert = await admin.from('competitor_reports').insert(reportRow).select('id').single();
    const reportId = insert.data?.id ?? undefined;

    await advanceSchedule();

    if (!sendResult.ok) {
      return { ok: false, reportId, error: sendResult.error };
    }

    return { ok: true, reportId, resendId: sendResult.id };
  } catch (err) {
    // Unexpected throw — advance anyway so we don't thrash. Error bubbles to
    // the cron handler which logs it in cron_runs.
    await advanceSchedule().catch(() => {});
    throw err;
  }
}
