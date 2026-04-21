import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCampaignRecipients, sendCampaign } from '@/lib/email/send-campaign';
import { sendUserEmail } from '@/lib/email/send-user-email';
import type { AgencyBrand } from '@/lib/agency/detect';

export const maxDuration = 60;

function isAuthorisedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

/**
 * Drains two time-based queues for Email Hub:
 *   1. email_campaigns where status='scheduled' and scheduled_for <= now
 *   2. email_sequence_enrollments where status='active' and next_send_at <= now
 *
 * Designed to run every minute (see vercel.json crons entry).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const campaignResult = await drainCampaigns(admin, nowIso);
  const sequenceResult = await drainSequences(admin, nowIso);

  return NextResponse.json({
    ok: true,
    campaigns: campaignResult,
    sequences: sequenceResult,
  });
}

async function drainCampaigns(
  admin: ReturnType<typeof createAdminClient>,
  nowIso: string,
) {
  const { data: due } = await admin
    .from('email_campaigns')
    .select('id, subject, body_markdown, agency, client_id, audience_list_id, audience_portal_only, created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_for', nowIso)
    .limit(20);

  if (!due || due.length === 0) return { drained: 0 };

  let drained = 0;
  for (const c of due) {
    await admin
      .from('email_campaigns')
      .update({ status: 'sending', updated_at: nowIso })
      .eq('id', c.id);

    const { data: sender } = await admin
      .from('users')
      .select('id, full_name, email')
      .eq('id', c.created_by)
      .maybeSingle();

    const recipients = await resolveCampaignRecipients(admin, {
      listId: c.audience_list_id,
      portalOnly: c.audience_portal_only,
      agencyOverride: (c.agency as AgencyBrand | null) ?? null,
      clientId: c.client_id,
    });

    if (recipients.length === 0) {
      await admin
        .from('email_campaigns')
        .update({ status: 'failed', total_recipients: 0, updated_at: new Date().toISOString() })
        .eq('id', c.id);
      continue;
    }

    await sendCampaign({
      admin,
      campaignId: c.id,
      subject: c.subject ?? '',
      bodyMarkdown: c.body_markdown ?? '',
      recipients,
      sender: sender
        ? { id: sender.id, full_name: sender.full_name, email: sender.email }
        : { id: c.created_by, full_name: null, email: null },
    });
    drained += 1;
  }
  return { drained };
}

async function drainSequences(
  admin: ReturnType<typeof createAdminClient>,
  nowIso: string,
) {
  const { data: due } = await admin
    .from('email_sequence_enrollments')
    .select(`
      id, sequence_id, contact_id, current_step, created_by,
      sequence:sequence_id ( id, name, agency, active ),
      contact:contact_id ( id, email, full_name, subscribed, client_id, client:client_id ( id, name, agency ) )
    `)
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .limit(40);

  if (!due || due.length === 0) return { drained: 0 };

  let drained = 0;
  for (const e of due) {
    type SeqRel = { id: string; name: string; agency: string | null; active: boolean } | { id: string; name: string; agency: string | null; active: boolean }[] | null;
    type ContactRel =
      | {
          id: string;
          email: string | null;
          full_name: string | null;
          subscribed: boolean;
          client_id: string | null;
          client: { id: string; name: string; agency: string | null } | { id: string; name: string; agency: string | null }[] | null;
        }
      | {
          id: string;
          email: string | null;
          full_name: string | null;
          subscribed: boolean;
          client_id: string | null;
          client: { id: string; name: string; agency: string | null } | { id: string; name: string; agency: string | null }[] | null;
        }[]
      | null;

    const seqRel = e.sequence as SeqRel;
    const sequence = Array.isArray(seqRel) ? seqRel[0] : seqRel;
    const contactRel = e.contact as ContactRel;
    const contact = Array.isArray(contactRel) ? contactRel[0] : contactRel;

    if (!sequence?.active || !contact?.email || !contact.subscribed) {
      await admin
        .from('email_sequence_enrollments')
        .update({ status: 'stopped', stopped_reason: 'sequence inactive or contact unsubscribed' })
        .eq('id', e.id);
      continue;
    }

    const { data: step } = await admin
      .from('email_sequence_steps')
      .select('*')
      .eq('sequence_id', e.sequence_id)
      .eq('step_order', e.current_step)
      .maybeSingle();

    if (!step) {
      await admin
        .from('email_sequence_enrollments')
        .update({ status: 'completed', completed_at: nowIso })
        .eq('id', e.id);
      continue;
    }

    const clientRow = Array.isArray(contact.client) ? contact.client[0] : contact.client;
    const agency: AgencyBrand =
      (sequence.agency as AgencyBrand | null) ??
      (clientRow?.agency?.toLowerCase().includes('anderson') || clientRow?.agency?.toLowerCase() === 'ac'
        ? 'anderson'
        : 'nativz');

    if (step.stop_on_reply) {
      // Check if any earlier message in this enrollment has a reply
      const { data: prior } = await admin
        .from('email_messages')
        .select('id')
        .eq('sequence_enrollment_id', e.id)
        .not('replied_at', 'is', null)
        .limit(1);
      if (prior && prior.length > 0) {
        await admin
          .from('email_sequence_enrollments')
          .update({ status: 'stopped', stopped_reason: 'recipient replied' })
          .eq('id', e.id);
        continue;
      }
    }

    const { data: sender } = e.created_by
      ? await admin
          .from('users')
          .select('id, full_name, email')
          .eq('id', e.created_by)
          .maybeSingle()
      : { data: null };

    const { data: inserted } = await admin
      .from('email_messages')
      .insert({
        sequence_enrollment_id: e.id,
        sequence_step_id: step.id,
        contact_id: contact.id,
        recipient_email: contact.email,
        agency,
        subject: step.subject,
        body_markdown: step.body_markdown,
        status: 'sending',
        created_by: e.created_by,
      })
      .select('id')
      .single();

    const send = await sendUserEmail({
      to: contact.email,
      subject: step.subject,
      bodyMarkdown: step.body_markdown,
      mergeContext: {
        recipient: { full_name: contact.full_name, email: contact.email },
        sender: { full_name: sender?.full_name ?? null, email: sender?.email ?? null },
        client: { name: clientRow?.name ?? null },
      },
      agency,
    });

    if (inserted) {
      if (send.ok) {
        await admin
          .from('email_messages')
          .update({
            status: 'sent',
            resend_id: send.id,
            sent_at: nowIso,
            subject: send.resolvedSubject,
            updated_at: nowIso,
          })
          .eq('id', inserted.id);
      } else {
        await admin
          .from('email_messages')
          .update({
            status: 'failed',
            failed_at: nowIso,
            failure_reason: send.error,
            updated_at: nowIso,
          })
          .eq('id', inserted.id);
      }
    }

    // Advance enrollment to next step or complete
    const { data: nextStep } = await admin
      .from('email_sequence_steps')
      .select('delay_days')
      .eq('sequence_id', e.sequence_id)
      .eq('step_order', e.current_step + 1)
      .maybeSingle();

    if (nextStep) {
      const next = new Date(Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000);
      await admin
        .from('email_sequence_enrollments')
        .update({
          current_step: e.current_step + 1,
          next_send_at: next.toISOString(),
        })
        .eq('id', e.id);
    } else {
      await admin
        .from('email_sequence_enrollments')
        .update({ status: 'completed', completed_at: nowIso })
        .eq('id', e.id);
    }

    drained += 1;
  }
  return { drained };
}
