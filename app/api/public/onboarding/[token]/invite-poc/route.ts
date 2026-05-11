/**
 * /api/public/onboarding/[token]/invite-poc
 *
 * Client-triggered: forward the share-token onboarding link to a teammate
 * who needs to fill in pieces only they have visibility on. Powered by
 * the points_of_contact screen's "Send onboarding link" button.
 *
 * POST { to: string, name?: string, message?: string }
 *   - to: required, validated email
 *   - name: optional invitee first/full name (used for greeting)
 *   - message: optional free-text note from the sender
 *
 * Logs the send to onboarding_emails_log with kind 'poc_invite'.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingByToken, logEmail } from '@/lib/onboarding/api';
import { sendOnboardingPocInviteEmail } from '@/lib/onboarding/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InputSchema = z.object({
  to: z.string().email(),
  name: z.string().max(200).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await getOnboardingByToken(token);
  if (!row || row.status === 'abandoned') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const sent = await sendOnboardingPocInviteEmail({
      onboarding: row,
      to: parsed.data.to,
      invitee_name: parsed.data.name ?? null,
      message: parsed.data.message ?? undefined,
    });
    await logEmail({
      onboarding_id: row.id,
      kind: 'poc_invite',
      to_email: sent.to,
      subject: sent.subject,
      body_preview: sent.body_preview,
      resend_id: sent.resend_id,
      ok: sent.ok,
      error: sent.error,
      triggered_by: null,
    });
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
