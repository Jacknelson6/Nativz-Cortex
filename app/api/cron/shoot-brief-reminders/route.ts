import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { sendShootBriefReminderEmail } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

export const maxDuration = 300;

const LOOKAHEAD_LOWER_HOURS = 36; // 1.5 days
const LOOKAHEAD_UPPER_HOURS = 60; // 2.5 days

/**
 * GET /api/cron/shoot-brief-reminders
 *
 * Vercel cron (daily at 9 AM): scans shoot_events for shoots happening
 * roughly 48h from now (36-60h window so a single daily run always catches
 * each shoot exactly once), looks up team_members by attendee email, and
 * fires an internal Resend email prompting each matched team member to
 * write a brief in Content Lab. brief_reminder_sent_at guards against the
 * window-overlap re-send case. Requires CRON_SECRET bearer token.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ message: string, shoots_checked: number, emails_sent: number, shoots_skipped_no_attendees: number, shoots_skipped_no_matches: number, errors: number }}
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const now = new Date();
  const windowStart = new Date(now.getTime() + LOOKAHEAD_LOWER_HOURS * 3600 * 1000);
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_UPPER_HOURS * 3600 * 1000);

  const { data: shoots, error } = await adminClient
    .from('shoot_events')
    .select('id, title, shoot_date, location, attendee_emails, client_id, clients(name, agency)')
    .gte('shoot_date', windowStart.toISOString())
    .lte('shoot_date', windowEnd.toISOString())
    .is('brief_reminder_sent_at', null);

  if (error) {
    console.error('Cron shoot-brief-reminders: fetch shoots failed', error);
    return NextResponse.json({ error: 'Failed to fetch shoots' }, { status: 500 });
  }

  if (!shoots || shoots.length === 0) {
    return NextResponse.json({
      message: 'No shoots in the 48h window awaiting reminders',
      shoots_checked: 0,
      emails_sent: 0,
      shoots_skipped_no_attendees: 0,
      shoots_skipped_no_matches: 0,
      errors: 0,
    });
  }

  // Pre-fetch all active team members once. The shoot list is small (a few
  // per day at most) and the team list is small (~10), so loading both into
  // memory and matching client-side beats round-tripping per shoot.
  const { data: teamMembers } = await adminClient
    .from('team_members')
    .select('email, full_name')
    .eq('is_active', true)
    .not('email', 'is', null);

  const teamByEmail = new Map<string, { email: string; full_name: string | null }>();
  for (const m of teamMembers ?? []) {
    if (!m.email) continue;
    teamByEmail.set(m.email.toLowerCase(), m);
  }

  let emailsSent = 0;
  let skippedNoAttendees = 0;
  let skippedNoMatches = 0;
  let errors = 0;

  for (const shoot of shoots) {
    const attendees = (shoot.attendee_emails ?? []) as string[];
    if (attendees.length === 0) {
      skippedNoAttendees++;
      // Mark sent anyway so we don't re-check this row every day forever.
      await adminClient
        .from('shoot_events')
        .update({ brief_reminder_sent_at: new Date().toISOString() })
        .eq('id', shoot.id);
      continue;
    }

    const clientRow = Array.isArray(shoot.clients) ? shoot.clients[0] : shoot.clients;
    const clientName = (clientRow as { name?: string } | null)?.name ?? null;
    const clientAgency = (clientRow as { agency?: string | null } | null)?.agency ?? null;
    const agency: AgencyBrand = clientAgency === 'anderson' ? 'anderson' : 'nativz';
    // Resolve the link host per shoot from the agency, never NEXT_PUBLIC_APP_URL,
    // so a dev .env.local with localhost cannot leak into a transactional email.
    const contentLabUrl = `${getCortexAppUrl(agency)}/lab`;

    const matches = attendees
      .map((e) => teamByEmail.get(e.toLowerCase()))
      .filter((m): m is { email: string; full_name: string | null } => !!m);

    if (matches.length === 0) {
      skippedNoMatches++;
      await adminClient
        .from('shoot_events')
        .update({ brief_reminder_sent_at: new Date().toISOString() })
        .eq('id', shoot.id);
      continue;
    }

    let anySendOk = false;
    for (const member of matches) {
      try {
        const firstName = (member.full_name ?? '').split(' ')[0] ?? '';
        const result = await sendShootBriefReminderEmail({
          to: member.email,
          memberFirstName: firstName,
          clientName,
          shootTitle: shoot.title,
          shootDateISO: shoot.shoot_date,
          location: shoot.location,
          contentLabUrl,
          agency,
          clientId: shoot.client_id,
          shootId: shoot.id,
        });
        if (result.ok) {
          emailsSent++;
          anySendOk = true;
        } else {
          errors++;
          console.error(
            `Cron shoot-brief-reminders: send failed for ${member.email} on shoot ${shoot.id}`,
            result.error,
          );
        }
      } catch (err) {
        errors++;
        console.error(
          `Cron shoot-brief-reminders: send threw for ${member.email} on shoot ${shoot.id}`,
          err,
        );
      }
    }

    if (anySendOk) {
      await adminClient
        .from('shoot_events')
        .update({ brief_reminder_sent_at: new Date().toISOString() })
        .eq('id', shoot.id);
    }
  }

  return NextResponse.json({
    message: `Reminders processed: ${emailsSent} sent, ${errors} errors`,
    shoots_checked: shoots.length,
    emails_sent: emailsSent,
    shoots_skipped_no_attendees: skippedNoAttendees,
    shoots_skipped_no_matches: skippedNoMatches,
    errors,
  });
}

export const GET = withCronTelemetry({ route: '/api/cron/shoot-brief-reminders' }, handleGet);
