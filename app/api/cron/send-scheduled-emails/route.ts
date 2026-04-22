import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { detectAgencyFromHostname } from '@/lib/agency/detect';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

const BATCH_SIZE = 50;

function isAuthorisedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local dev — allow
  return auth === `Bearer ${secret}`;
}

async function handleGet(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from('scheduled_emails')
    .select(`
      id, recipient_id, template_id, subject, body_markdown, send_at, scheduled_by,
      recipient:recipient_id ( id, email, full_name ),
      scheduler:scheduled_by ( id, email, full_name )
    `)
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .order('send_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[cron send-scheduled-emails] select failed:', error);
    return NextResponse.json({ error: 'Select failed' }, { status: 500 });
  }

  const rows = due ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    const recipient = (Array.isArray(row.recipient) ? row.recipient[0] : row.recipient) as
      | { id: string; email: string | null; full_name: string | null }
      | null;
    const scheduler = (Array.isArray(row.scheduler) ? row.scheduler[0] : row.scheduler) as
      | { id: string; email: string | null; full_name: string | null }
      | null;

    if (!recipient || !recipient.email) {
      await admin
        .from('scheduled_emails')
        .update({ status: 'failed', failure_reason: 'recipient missing email' })
        .eq('id', row.id);
      results.push({ id: row.id, ok: false, error: 'recipient missing email' });
      continue;
    }

    // Subject + body are frozen (merge-resolved at schedule time). We still pass
    // the merge context because sendUserEmail's signature requires it — but the
    // resolver is a no-op because there are no tokens left to replace.
    const send = await sendUserEmail({
      to: recipient.email,
      subject: row.subject,
      bodyMarkdown: row.body_markdown,
      mergeContext: {
        recipient: { full_name: recipient.full_name, email: recipient.email },
        sender: { full_name: scheduler?.full_name ?? null, email: scheduler?.email ?? null },
        client: { name: null },
      },
      agency,
    });

    if (send.ok) {
      await admin
        .from('scheduled_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString(), resend_id: send.id })
        .eq('id', row.id);

      await admin.from('activity_log').insert({
        actor_id: row.scheduled_by,
        action: 'user_email_sent',
        entity_type: 'user',
        entity_id: row.recipient_id,
        metadata: {
          template_id: row.template_id,
          subject: row.subject,
          resend_id: send.id,
          scheduled_email_id: row.id,
        },
      });
      results.push({ id: row.id, ok: true });
    } else {
      await admin
        .from('scheduled_emails')
        .update({ status: 'failed', failure_reason: send.error })
        .eq('id', row.id);
      console.warn('[cron send-scheduled-emails] send failed', row.id, send.error);
      results.push({ id: row.id, ok: false, error: send.error });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export const GET = withCronTelemetry({ route: '/api/cron/send-scheduled-emails' }, handleGet);
